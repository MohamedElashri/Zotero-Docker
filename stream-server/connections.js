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
var randomstring = require('randomstring');
var WebSocket = require('uws');
var utils = require('./utils');
var log = require('./log');
var statsD = require('./statsd');
var redis = require('./redis');

module.exports = function () {
	//
	// Subscription management
	//
	// A subscription is a connection, API key, and topic combination
	var keyMap = {};
	var connections = [];
	var topicSubscriptions = {};
	var keySubscriptions = {};
	var numConnections = 0;
	var numSubscriptions = 0; // This is only a topic subscriptions number, without keys
	
	return {
		
		getSubscriptions: function () {
			var topics = Object.keys(topicSubscriptions);
			var keys = Object.keys(keyMap);
			return topics.concat(keys);
		},
		
		getNumConnections: function () {
			return numConnections;
		},
		
		//
		// Key mappings
		//
		addKeyMapping: function (apiKeyID, apiKey) {
			keyMap[apiKeyID] = apiKey;
		},
		
		removeKeyMapping: function (apiKeyID) {
			delete keyMap[apiKeyID];
		},
		
		getKeyByID: function (apiKeyID) {
			return keyMap[apiKeyID];
		},
		
		//
		// Connection methods
		//
		registerConnection: function (ws, attributes) {
			attributes = attributes || {};
			
			var self = this;
			numConnections++;
			statsD.gauge('stream-server.' + config.get('hostname') + '.connections', numConnections);
			
			var connection = {
				ws: ws,
				remoteAddress: ws.remoteAddress,
				subscriptions: [],
				accessTracking: {},
				keepaliveID: setInterval(function () {
					self.keepalive(connection);
				}, config.get('keepaliveInterval') * 1000),
				attributes: attributes,
				waitingForPong: false
			};
			connections.push(connection);
			return connection;
		},
		
		//
		// Lookup
		//
		getConnectionByWebSocket: function (ws) {
			for (var i = 0; i < connections.length; i++) {
				if (connections[i].ws == ws) {
					return connections[i];
				}
			}
			return null;
		},
		
		/**
		 * Get subscribed topics for a given connection and key
		 */
		getTopicsByConnectionAndKey: function (connection, apiKey) {
			return connection.subscriptions.filter(function (sub) {
				return sub.apiKey == apiKey;
			})
			.map(function (sub) {
				return sub.topic;
			});
		},
		
		/**
		 * Get subscriptions with topics that match the given prefix, across all connections
		 */
		getSubscriptionsByTopicPrefix: function (prefix) {
			var subs = [];
			for (var topic in topicSubscriptions) {
				if (topic.indexOf(prefix) == 0) {
					subs = subs.concat(topicSubscriptions[topic]);
				}
			}
			return subs;
		},
		
		/**
		 * @param {String} apiKey
		 * @param {String} [topic] - If omitted, returns all subscriptions for the given API key
		 */
		getSubscriptionsByKeyAndTopic: function (apiKey, topic) {
			if (!keySubscriptions[apiKey]) return [];
			return keySubscriptions[apiKey].filter(function (sub) {
				return !topic || sub.topic == topic;
			});
		},
		
		countUniqueConnectionsInSubscriptions: function (subscriptions) {
			var connIDs = new Set;
			for (let i = 0; i < subscriptions.length; i++) {
				connIDs.add(subscriptions[i].connection);
			}
			return connIDs.size;
		},
		
		//
		// Key access tracking
		//
		enableAccessTracking: function (connection, apiKey) {
			connection.accessTracking[apiKey] = true;
		},
		
		getAccessTracking: function (connection, apiKey) {
			return connection.attributes.singleKey || apiKey in connection.accessTracking;
		},
		
		disableAccessTracking: function (connection, apiKey) {
			delete connection.accessTracking[apiKey];
		},
		
		/**
		 * Get connections for which key access tracking is enabled for a given API key
		 *
		 * @return {Object[]} - An array of connection objects
		 */
		getAccessTrackingConnections: function (apiKey) {
			if (!keySubscriptions[apiKey]) return [];
			
			let filteredConnections = [];
			for (let i = 0; i < keySubscriptions[apiKey].length; i++) {
				let connection = keySubscriptions[apiKey][i].connection;
				if (this.getAccessTracking(connection, apiKey)) {
					if (filteredConnections.indexOf(connection) < 0) {
						filteredConnections.push(connection);
					}
				}
			}
			return filteredConnections;
		},
		
		//
		// Subscription management
		//
		addSubscription: function (connection, apiKeyID, apiKey, topic) {
			if (!topicSubscriptions[topic]) {
				topicSubscriptions[topic] = [];
			}
			
			// Don't create duplicate subscriptions
			for (let i = 0; i < topicSubscriptions[topic].length; i++) {
				var sub = topicSubscriptions[topic][i];
				if (sub.connection == connection && sub.apiKey == apiKey) {
					log.info("Subscription for " + topic + " already exists");
					return;
				}
			}
			
			log.info("Adding subscription for " + topic, connection);
			
			var subscription = {
				connection: connection,
				apiKeyID: apiKeyID,
				apiKey: apiKey,
				topic: topic
			};
			
			connection.subscriptions.push(subscription);
			if (!topicSubscriptions[topic]) {
				topicSubscriptions[topic] = [];
			}
			// Subscribe to redis channel if this topic is new
			if (topicSubscriptions[topic].length == 0) {
				redis.subscribe((config.get('redis').prefix || '') + topic);
			}
			topicSubscriptions[topic].push(subscription);
			
			if (!keySubscriptions[apiKey]) {
				keySubscriptions[apiKey] = [];
			}
			// Subscribe to redis channel if this apiKey is new
			if (keySubscriptions[apiKey].length == 0) {
				this.addKeyMapping(apiKeyID, apiKey);
				redis.subscribe('api-key:' + (config.get('redis').prefix || '') + apiKeyID);
			}
			keySubscriptions[apiKey].push(subscription);
			
			numSubscriptions++;
		},
		
		removeSubscription: function (subscription) {
			var connection = subscription.connection;
			var apiKeyID = subscription.apiKeyID;
			var apiKey = subscription.apiKey;
			var topic = subscription.topic;
			
			log.info("Removing subscription for " + topic, connection);
			var removed = false;
			
			this.disableAccessTracking(connection, apiKey);
			
			for (let i = 0; i < connection.subscriptions.length; i++) {
				let sub = connection.subscriptions[i];
				if (sub.apiKey == apiKey && sub.topic == topic) {
					connection.subscriptions.splice(i, 1);
					removed = true;
					break;
				}
			}
			
			for (let i = 0; i < topicSubscriptions[topic].length; i++) {
				let sub = topicSubscriptions[topic][i];
				if (sub.connection == connection && sub.apiKey == apiKey) {
					topicSubscriptions[topic].splice(i, 1);
					if (!topicSubscriptions[topic].length) {
						delete topicSubscriptions[topic];
						redis.unsubscribe((config.get('redis').prefix || '') + topic);
					}
					break;
				}
			}
			
			for (let i = 0; i < keySubscriptions[apiKey].length; i++) {
				let sub = keySubscriptions[apiKey][i];
				if (sub.connection == connection && sub.topic == topic) {
					keySubscriptions[apiKey].splice(i, 1);
					if (!keySubscriptions[apiKey].length) {
						delete keySubscriptions[apiKey];
						this.removeKeyMapping(apiKeyID);
						redis.unsubscribe((config.get('redis').prefix || '') + apiKeyID);
					}
					break;
				}
			}
			
			if (removed) {
				numSubscriptions--;
			}
			return removed;
		},
		
		/**
		 * Handle a topicAdded notification
		 *
		 * This sends a topicAdded event to each connection where the API key
		 * is in access-tracking mode and then adds the subscription.
		 */
		handleTopicAdded: function (apiKeyID, topic) {
			var apiKey = this.getKeyByID(apiKeyID);
			var conns = this.getAccessTrackingConnections(apiKey);
			log.info("Sending topicAdded to " + conns.length + " "
				+ utils.plural("client", conns.length));
			for (let i = 0; i < conns.length; i++) {
				let conn = conns[i];
				this.sendEvent(conn, 'topicAdded', {
					// Don't include API key for single-key connections
					apiKey: conn.attributes.singleKey ? undefined : apiKey,
					topic: topic
				});
				this.addSubscription(conn, apiKeyID, apiKey, topic);
			}
		},
		
		/**
		 * Handle a topicRemoved notification
		 *
		 * Deletes the subscription with the given API key and topic and then
		 * sends out a topicRemoved for each one.
		 */
		handleTopicRemoved: function (apiKeyID, topic) {
			var apiKey = this.getKeyByID(apiKeyID);
			var subs = this.getSubscriptionsByKeyAndTopic(apiKey, topic);
			this.deleteAndNotifySubscriptions(subs);
		},
		
		/**
		 * Handle a topicDeleted notification
		 *
		 * Clients don't get topicDeleted notifications directly because they
		 * should know only if a key lost access to a topic, not if it was
		 * deleted, so this just finds all subscriptions with the given topic
		 * prefix and deletes them normally, including sending out a topicRemoved
		 * event for each one.
		 */
		handleTopicDeleted: function (topicPrefix) {
			var subs = this.getSubscriptionsByTopicPrefix(topicPrefix);
			this.deleteAndNotifySubscriptions(subs);
		},
		
		/**
		 * Delete each subscription and send out a topicRemoved event for it
		 */
		deleteAndNotifySubscriptions: function (subscriptions) {
			var numConns = this.countUniqueConnectionsInSubscriptions(subscriptions);
			if (!numConns) return;
			
			log.info("Sending topicRemoved for "
				+ subscriptions.length + " " + utils.plural("subscription", subscriptions.length)
				+ " to " + numConns + " " + utils.plural("connection", numConns));
			
			for (let i = 0; i < subscriptions.length; i++) {
				let sub = subscriptions[i];
				let conn = sub.connection;
				// Don't include API key for single-key connections or public topics
				let skipKey = conn.attributes.singleKey || sub.apiKey == 'public';
				this.removeSubscription(sub);
				this.sendEvent(conn, 'topicRemoved', {
					apiKey: skipKey ? undefined : sub.apiKey,
					topic: sub.topic
				});
			}
		},
		
		/**
		 * Delete subscriptions with the given API key and an optional topic for a given
		 * connection
		 *
		 * If a topic isn't provided, all subscriptions for the given API key are deleted
		 *
		 * @param {String} apiKey
		 * @param {String} [topic=false]
		 * @return {String[]} - An array of removed topics
		 */
		removeConnectionSubscriptionsByKeyAndTopic: function (connection, apiKey, topic) {
			if (!keySubscriptions.hasOwnProperty(apiKey)) {
				return [];
			}
			var subs = this.getSubscriptionsByKeyAndTopic(apiKey, topic).filter(function (sub) {
				return sub.connection == connection;
			});
			for (var i = 0; i < subs.length; i++) {
				this.removeSubscription(subs[i]);
			}
			return subs.map(sub => sub.topic);
		},
		
		/**
		 * Delete a subscription with the given topic for a given connection
		 *
		 * @param {Object} connection
		 * @param {String} topic
		 * @return {boolean}
		 */
		removeConnectionSubscriptionByTopic: function (connection, topic) {
			if (topicSubscriptions.hasOwnProperty(topic)) {
				var sub = topicSubscriptions[topic].find(function (sub) {
					return sub.connection == connection;
				});
				this.removeSubscription(sub);
				return true;
			}
			return false;
		},
		
		deregisterConnection: function (conn) {
			conn.subscriptions.concat().forEach(this.removeSubscription.bind(this));
			this.closeConnection(conn);
		},
		
		closeConnection: function (conn) {
			log.info("Closing connection", conn);
			clearInterval(conn.keepaliveID);
			conn.ws.close();
			numConnections--;
			statsD.gauge('stream-server.' + config.get('hostname') + '.connections', numConnections);
			var i = connections.indexOf(conn);
			connections.splice(i, 1);
		},
		
		deregisterConnectionByWebSocket: function (ws) {
			var conn = this.getConnectionByWebSocket(ws);
			if (conn) {
				this.deregisterConnection(conn);
				return true;
			}
			return false
		},
		
		
		//
		// Event methods
		//
		sendEvent: function (connection, event, data) {
			var json = {
				event: event
			};
			for (let i in data) {
				json[i] = data[i];
			}
			json = JSON.stringify(json);
			log.debug("Send: " + json, connection);
			if (connection.ws.readyState === WebSocket.OPEN) {
				connection.ws.send(json);
			}
		},
		
		/**
		 * Send an event to all matching topics
		 *
		 * @param {String} topic
		 * @param {String} event - Event name. Can be null to send data-only event
		 * @param {Object} data - Data to send. Will be JSONified.
		 */
		sendEventForTopic: function (topic, event, data) {
			if (!topicSubscriptions[topic] || !topicSubscriptions[topic].length) return;
			
			var logEventName = (event + " event") || "data";
			var numSubs = topicSubscriptions[topic].length;
			log.info("Sending " + logEventName + " for topic " + topic + " to "
				+ numSubs + " " + utils.plural("client", numSubs));
			
			for (let i = 0; i < topicSubscriptions[topic].length; i++) {
				let sub = topicSubscriptions[topic][i];
				this.sendEvent(sub.connection, event, data);
			}
		},
		
		/**
		 * Send an event to all matching topics
		 *
		 * TODO: delete?
		 *
		 * @param {String} topic
		 * @param {String} event - Event name. Can be null to send data-only event.
		 * @param {Object} data - Data to send. Will be JSONified. 'apiKey' will be removed
		 *                        for single-key requests.
		 */
		sendEventForKeyAndTopic: function (apiKey, topic, event, data) {
			if (!keySubscriptions[apiKey]) return;
			
			var logEventName = (event + " event") || "data";
			
			var subs = keySubscriptions[apiKey].filter(function (sub) {
				return sub.topic == topic;
			});
			if (!subs.length) {
				return;
			}
			
			log.info("Sending " + logEventName + " to "
				+ subs.length + " " + utils.plural("client", subs.length));
			
			for (let i = 0; i < subs.length; i++) {
				let sub = subs[i];
				// If single-key request, remove API key from data
				if (sub.connection.attributes.singleKey) {
					delete data.apiKey;
				}
				this.sendEvent(sub.connection, event, data);
			}
		},
		
		keepalive: function (connection) {
			// Close connection if we failed to get a pong response
			if (connection.waitingForPong) {
				log.info("Pong not received", connection.ws);
				// Terminate the connection immediately to make sure
				// that we aren't waiting for any graceful closing procedures,
				// because the connection is already dead
				connection.ws.terminate();
				// Avoid warning in ws.on('close') in server.js
				connection.ws.zoteroClosed = true;
				this.deregisterConnection(connection);
				return;
			}
			connection.ws.ping();
			connection.waitingForPong = true;
		},
		
		status: function () {
			return "["
				+ numConnections + " " + utils.plural("connection", numConnections)
				+ ", "
				+ numSubscriptions + " " + utils.plural("subscription", numSubscriptions)
				+ "]";
		}
	}
}();
