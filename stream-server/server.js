/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2015 Zotero
                     https://www.zotero.org
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

"use strict";

var config = require('config');
var Promise = require("bluebird");
if (config.get('longStackTraces')) {
	Promise.longStackTraces();
}

var fs = require('fs');
var url = require('url');
var domain = require('domain');
var path = require('path');
var Netmask = require('netmask').Netmask;
var util = require('util');

var utils = require('./utils');
var WSError = utils.WSError;
var log = require('./log');
var connections = require('./connections');
var zoteroAPI = require('./zotero_api');
var redis = require('./redis');

module.exports = function (onInit) {
	
	var server;
	var wss;
	var statusIntervalID;
	var stopping;
	var continuedTimeouts = {};
	
	/**
	 * Debounce notification sending if there is a 'continued' flag,
	 * otherwise pass through instantly
	 */
	function debounceContinued(topic, continued, fn) {
		var timeout = continuedTimeouts[topic];
		if (timeout) {
			clearTimeout(timeout);
			delete continuedTimeouts[topic];
		}
		
		continuedTimeouts[topic] = setTimeout(fn,
			continued ? config.get('continuedDelay') : config.get('continuedDelayDefault')
		);
	}
	
	/**
	 * Handle an SQS notification
	 */
	function handleNotification(message) {
		log.trace(message);
		try {
			var data = JSON.parse(message);
		}
		catch (e) {
			log.error("Error parsing message: " + message);
			return;
		}
		
		var apiKeyID = data.apiKeyID;
		var topic = data.topic;
		var event = data.event;
		var continued = data.continued;
		
		switch (data.event) {
		case 'topicUpdated':
			if (config.get('globalTopics').includes(topic)) {
				let min = config.get('globalTopicsMinDelay');
				let max = config.get('globalTopicsMinDelay') + config.get('globalTopicsDelayPeriod');
				connections.sendEventForTopic(topic, event, {
					topic: topic,
					delay: Math.floor(Math.random() * (max - min + 1)) + min
				});
			} else {
				debounceContinued(topic, continued, function () {
					connections.sendEventForTopic(topic, event, {
						topic: topic,
						version: data.version
					});
				});
			}
			break;
		
		case 'topicAdded':
			connections.handleTopicAdded(apiKeyID, topic);
			break;
			
		case 'topicRemoved':
			connections.handleTopicRemoved(apiKeyID, topic);
			break;
		
		case 'topicDeleted':
			connections.handleTopicDeleted(topic);
			break;
		}
	}
	
	
	/**
	 * Handle an HTTP incoming request
	 */
	function handleHTTPRequest(req, res) {
		log.info("Received HTTP request", req);
		
		var pathname = url.parse(req.url).pathname;
		
		// Health check
		if (pathname == '/health') {
			utils.end(req, res, 200);
		}
		else {
			utils.end(req, res, 400);
		}
	}
	
	
	function handleWebSocketConnection(ws) {
		log.info("Received WebSocket request", ws);
		var req = ws.upgradeReq;
		
		Promise.coroutine(function* () {
			var urlParts = url.parse(req.url, true);
			var pathname = urlParts.pathname;
			var query = urlParts.query;
			
			if (pathname != '/') {
				utils.wsEnd(ws, 404);
			}
			
			// If API key provided, subscribe to all available topics
			if (query && query.key) {
				var apiKey = query.key;
			}
			else if ('zotero-api-key' in req.headers) {
				var apiKey = req.headers['zotero-api-key'];
			}
			
			if (apiKey) {
				let {topics, apiKeyID} = yield zoteroAPI.getKeyInfo(apiKey);
				// Append global topics to key's allowed topic list
				topics = topics.concat(config.get('globalTopics'));
				var keyTopics = {
					apiKeyID: apiKeyID,
					apiKey: apiKey,
					topics: topics
				};
			}
			
			if (keyTopics) {
				var singleKeyRequest = true;
				var connectionAttributes = {
					singleKey: true
				};
			}
			
			var numSubscriptions = 0;
			var numTopics = 0;
			
			var connection = connections.registerConnection(ws, connectionAttributes);
			
			// Add a subscription for each topic
			if (keyTopics) {
				for (let i = 0; i < keyTopics.topics.length; i++) {
					let topic = keyTopics.topics[i];
					connections.addSubscription(connection, keyTopics.apiKeyID, keyTopics.apiKey, topic);
				}
			}
			
			var data = {
				retry: config.get('retryTime') * 1000
			};
			if (singleKeyRequest) {
				data.topics = keyTopics.topics;
			}
			connections.sendEvent(connection, 'connected', data);
			
			ws.on('message', function (message) {
				handleClientMessage(ws, message);
			});
			
			ws.on('close', function () {
				// Ignore 'close' event when stopping
				// to prevent triggering slow deregistration
				if (stopping) {
					return;
				}
				log.info("WebSocket connection was closed", ws);
				var closed = connections.deregisterConnectionByWebSocket(ws);
				if (!closed && !ws.zoteroClosed) {
					log.warn("Connection not found", ws);
				}
			});
			
			ws.on('pong', function () {
				connection.waitingForPong = false;
			});
		})()
		.catch(function (e) {
			handleError(ws, e);
		});

	}
	
	
	
	/**
	 * Handle a client request
	 */
	function handleClientMessage(ws, message) {
		var connection = connections.getConnectionByWebSocket(ws);
		
		Promise.coroutine(function* () {
			if (message.length > 1e6) {
				throw new WSError(1009);
			}
			
			message = message.trim();
			if (!message) {
				throw new WSError(400, "Message not provided");
			}
			log.debug("Receive: " + message, ws);
			try {
				var data = JSON.parse(message);
			}
			catch (e) {
				throw new WSError(400, "Error parsing JSON");
			}
			
			// Add subscriptions
			if (data.action == "createSubscriptions") {
				yield handleCreate(connection, data);
			}
			
			// Delete subscription
			else if (data.action == "deleteSubscriptions") {
				handleDelete(connection, data);
			}
			
			else if (!data.action) {
				throw new WSError(400, "'action' not provided");
			}
			
			else {
				throw new WSError(400, "Invalid action");
			}
		})()
		.catch(function (e) {
			handleError(ws, e);
		});
	}
	
	
	/**
	 * Handle a request to create new subscriptions on a connection
	 *
	 * Called from handleClientMessage
	 */
	var handleCreate = Promise.coroutine(function* (connection, data) {
		if (connection.attributes.singleKey) {
			throw new WSError(405, "Single-key connection cannot be modified");
		}
		if (data.subscriptions === undefined) {
			throw new WSError(400, "'subscriptions' array not provided");
		}
		if (!Array.isArray(data.subscriptions)) {
			throw new WSError(400, "'subscriptions' must be an array");
		}
		if (!data.subscriptions.length) {
			throw new WSError(400, "'subscriptions' array is empty");
		}
		
		let successful = {};
		let failed = [];
		
		// Verify subscriptions
		for (let i = 0; i < data.subscriptions.length; i++) {
			let sub = data.subscriptions[i];
			
			if (typeof sub != 'object') {
				throw new WSError(400, "Subscription must be an object (" + typeof sub + " given)");
			}
			
			let apiKey = sub.apiKey;
			let topics = sub.topics;
			
			if (topics && !Array.isArray(topics)) {
				throw new WSError(400, "'topics' must be an array (" + typeof topics + " given)");
			}
			
			if (apiKey) {
				var {topics: availableTopics, apiKeyID} = yield zoteroAPI.getKeyInfo(apiKey);
			}
			else if (!topics) {
				throw new WSError(400, "Either 'apiKey' or 'topics' must be provided");
			}
			
			// Check key's access to client-provided topics
			if (topics && topics.length) {
				for (let j = 0; j < topics.length; j++) {
					let topic = topics[j];
					// Allow global topics
					if (config.get('globalTopics').includes(topic)) {
						if (!successful.public) {
							successful.public = {
								accessTracking: false,
								topics: []
							};
						}
						successful.public.topics.push(topic);
						continue;
					}
					if (topic[0] != '/') {
						throw new WSError(400, "Topic must begin with a slash ('" + topic + "' provided)");
					}
					let err = null;
					if (apiKey) {
						var hasAccess = availableTopics.indexOf(topic) != -1;
						if (hasAccess) {
							if (!successful[apiKey]) {
								successful[apiKey] = {
									apiKeyID: apiKeyID,
									accessTracking: false,
									topics: []
								};
							}
							if (successful[apiKey].topics.indexOf(topic) == -1) {
								successful[apiKey].topics.push(topic);
							}
						}
						else {
							err = "Topic is not valid for provided API key";
						}
					}
					else {
						var hasAccess = yield zoteroAPI.checkPublicTopicAccess(topic);
						if (hasAccess) {
							if (!successful.public) {
								successful.public = {
									accessTracking: false,
									topics: []
								};
							}
							if (successful.public.topics.indexOf(topic) == -1) {
								successful.public.topics.push(topic);
							}
						}
						else {
							err = "Topic is not accessible without an API key";
						}
					}
					if (err) {
						log.warn(err, connection);
						failed.push({
							apiKey: apiKey,
							topic: topic,
							error: err
						});
					}
				}
			}
			// If no topics provided, use all of the key's available topics
			else {
				successful[apiKey] = {
					apiKeyID: apiKeyID,
					accessTracking: true,
					topics: availableTopics
				}
			}
		}
		
		// Create subscriptions
		for (let apiKey in successful) {
			let keySubs = successful[apiKey];
			if (keySubs.accessTracking) {
				connections.enableAccessTracking(connection, apiKey);
			}
			let topics = keySubs.topics;
			for (let j = 0; j < topics.length; j++) {
				connections.addSubscription(connection, keySubs.apiKeyID, apiKey, topics[j]);
			}
		}
		
		// Generate results report
		let results = {
			subscriptions: [],
			errors: []
		};
		
		for (let apiKey in successful) {
			results.subscriptions.push({
				apiKey: apiKey != 'public' ? apiKey : undefined,
				topics: connections.getTopicsByConnectionAndKey(connection, apiKey)
			});
		}
		for (let i = 0; i < failed.length; i++) {
			let f = failed[i];
			results.errors.push({
				apiKey: f.apiKey != 'public' ? f.apiKey : undefined,
				topic: f.topic,
				error: f.error
			});
		}
		
		connections.sendEvent(connection, 'subscriptionsCreated', results);
	});
	
	
	/**
	 * Handle a request to delete one or more subscriptions on a connection
	 *
	 * Called from handleClientMessage
	 */
	function handleDelete(connection, data) {
		if (connection.attributes.singleKey) {
			throw new WSError(405, "Single-key connection cannot be modified");
		}
		if (data.subscriptions === undefined) {
			throw new WSError(400, "'subscriptions' array not provided");
		}
		if (!Array.isArray(data.subscriptions)) {
			throw new WSError(400, "'subscriptions' must be an array");
		}
		if (!data.subscriptions.length) {
			throw new WSError(400, "'subscriptions' array is empty");
		}
		
		var removedSubscriptions = [];
		for (let i = 0; i < data.subscriptions.length; i++) {
			let sub = data.subscriptions[i];
			if (sub.topic && typeof sub.topic != 'string') {
				throw new WSError(400, "'topic' must be a string");
			}
			
			let topics = [];
			if (sub.apiKey) {
				topics = connections.removeConnectionSubscriptionsByKeyAndTopic(
					connection, sub.apiKey, sub.topic
				);
			} else {
				let removed = connections.removeConnectionSubscriptionByTopic(
					connection, sub.topic
				);
				if (removed) {
					topics = [sub.topic];
				}
			}
			
			if (topics.length) {
				removedSubscriptions.push({
					apiKey: sub.apiKey,
					topics
				});
			}
		}
		
		if (removedSubscriptions.length) {
			log.info("Deleted " + removedSubscriptions.length + " "
				+ utils.plural("subscription", removedSubscriptions.length), connection);
		}
		else {
			throw new WSError(409, "No matching subscription");
		}
		
		connections.sendEvent(connection, 'subscriptionsDeleted', { subscriptions: removedSubscriptions });
	}
	
	function handleError(ws, e) {
		if (e instanceof WSError) {
			utils.wsEnd(ws, e.code, e.message);
		}
		else {
			utils.wsEnd(ws, null, e);
		}
	}
	
	function shutdown(err) {
		if (stopping) {
			return;
		}
		stopping = true;
		
		if (statusIntervalID) {
			clearTimeout(statusIntervalID);
		}
		
		if (server) {
			server.close(function () {
				wss.clients.forEach((ws) => ws.close(1000));
				wss.close();
				log.info("All connections closed. Exiting");
				process.exit(err ? 1 : 0);
			});
		}
		else {
			log.info("Exiting");
			process.exit(err ? 1 : 0);
		}
	}
	
	//
	//
	//
	// Main code
	//
	//
	//
	return Promise.coroutine(function* () {
		log.info("Starting up [pid: " + process.pid + "]");
		
		if (process.env.NODE_ENV != 'test') {
			process.on('SIGTERM', function () {
				log.warn("Received SIGTERM -- shutting down")
				shutdown();
			});
			
			process.on('SIGINT', function () {
				log.warn("Received SIGINT -- shutting down")
				shutdown();
			});
			
			process.on('uncaughtException', function (e) {
				log.error("Uncaught exception -- shutting down");
				log.error(e.stack);
				shutdown();
			});
			
			process.on("unhandledRejection", function (reason, promise) {
				log.error("Unhandled Promise rejection -- shutting down");
				log.error(reason.stack);
				shutdown();
			});
		}
		
		// 'ready' event is emitted every time when Redis connects.
		// Each time we have to resubscribe to all topics and keys.
		redis.on('ready', function () {
			let channels = connections.getSubscriptions();
			if (!channels.length) return;
			
			// After reconnect, we resubscribe Redis connection to all channels (keys + topics),
			// but if the channel count is too big, the connection will be blocked
			// until the re-subscription process finishes and the messages coming from dataserver
			// will be buffered on the Redis side. If the buffer size will be exceeded, Redis kills
			// the connection, then stream-server reconnects and this cycle repeats indefinitely.
			// If this problem is encountered, increase
			// "client-output-buffer-limit pubsub 32mb 8mb 60"
			// memory limits in /etc/redis/redis.conf.
			// stream-server needs only one connection, therefore
			// 'client-output-buffer-limit' can be increased to a high number.
			// This problem is influenced by the dataserver generated
			// messages per second rate, and depends on how fast the huge subscription command
			// is sent to redis server and processed.
			// Another solution could be to subscribe in smaller chunks,
			// but this would create concurrency conditions with
			// 'unsubscribe' command used in connections.js.
			
			let prefix = config.get('redis').prefix;
			if (prefix) {
				for (let i = 0; i < channels.length; i++) {
					channels[i] = prefix + channels[i];
				}
			}
			
			log.info('Resubscribing to ' + channels.length + ' channel(s)');
			// There is a node_redis bug which is triggered when
			// the previously documented problem happens.
			// TODO: Keep track the state of this bug: https://github.com/NodeRedis/node_redis/issues/1230
			redis.subscribe(channels, function (err) {
				if (err) return log.error(err);
				log.info('Resubscribing done');
			});
		});
		
		//
		// Create the HTTP(S) server
		//
		var proxyProtocol = config.has('proxyProtocol') && config.get('proxyProtocol');
		if (config.has('https') && config.get('https')) {
			if (proxyProtocol) {
				var https = require('findhit-proxywrap').proxy(require('https'));
			}
			else {
				var https = require('https');
			}
			
			var options = {
				key: fs.readFileSync(config.get('certPath')),
				cert: fs.readFileSync(config.get('certPath'))
			};
			server = https.createServer(options, function (req, res) {
				handleHTTPRequest(req, res);
			})
		}
		else {
			if (proxyProtocol) {
				var http = require('findhit-proxywrap').proxy(require('http'));
			}
			else {
				var http = require('http');
			}
			server = http.createServer(function (req, res) {
				handleHTTPRequest(req, res);
			});
		}
		
		server.on('error', function (e) {
			log.error("Server threw error");
			log.error(e);
			shutdown(e);
		});
		
		// Give server WebSocket powers
		var WebSocketServer = require('uws').Server;
		wss = new WebSocketServer({
			server: server,
			verifyClient: function (info, cb) {
				var pathname = url.parse(info.req.url).pathname;
				if (pathname != '/') {
					cb(false, 404, "Not Found");
				}
				else {
					cb(true);
				}
			}
		});
		// The remote IP address is only available at connection time in the upgrade request
		wss.on('connection', function (ws) {
			var remoteAddress = ws._socket.remoteAddress;
			var xForwardedFor = ws.upgradeReq.headers['x-forwarded-for'];
			if (remoteAddress && xForwardedFor) {
				let proxies = config.get('trustedProxies');
				if (Array.isArray(proxies)
						&& proxies.some(cidr => new Netmask(cidr).contains(remoteAddress))) {
					remoteAddress = xForwardedFor;
				}
			}
			ws.remoteAddress = remoteAddress;
			handleWebSocketConnection(ws);
		});
		
		yield Promise.promisify(server.listen, server)(config.get('httpPort'), '0.0.0.0');
		
		log.info("Listening on port " + config.get('httpPort'));
		
		// Set status timer
		statusIntervalID = setInterval(function () {
			log.info(connections.status());
			if (log.showing('trace')) {
				let mem = process.memoryUsage();
				log.info(
					`RSS: ${Math.round(mem.rss / 1024 / 1024)} MB, `
					+ `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}`
						+ `/${Math.round(mem.heapTotal / 1024 / 1024)} MB`
				);
			}
		}, config.get('statusInterval') * 1000);
		
		setTimeout(function () {
			if (onInit) {
				onInit();
			}
		});
		
		// Listen for Redis messages
		redis.on('message', function (channel, message) {
			handleNotification(message);
		});
	})()
	.catch(function (e) {
		log.error("Caught error");
		console.log(e.stack);
		shutdown(e);
	});
};
