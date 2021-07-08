/*
 ***** BEGIN LICENSE BLOCK *****
 
 Copyright © 2017 Zotero
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

/*
 Runs stream-server and client. Makes 20k connections.
 Each connection has 5 topic subscriptions and a key.
 Creates 120k Redis channels. Sends around 1k messages per second.
 */

let mockery = require('mockery');
let sinon = require('sinon');

let config = require('config');
let Promise = require('bluebird');

let zoteroAPI = require('../../zotero_api');
let WebSocket = require('../support/websocket');
let testUtils = require('../support/test_utils');
let onEvent = testUtils.onEvent;
let makeAPIKey = testUtils.makeAPIKey;
let connections = require('../../connections');
let redis = require('redis');

let CONNECTIONS = 20000;
let SUBSCRIPTIONS_PER_CONNECTION = 5;
let MESSAGES_PER_SECOND = 1000;

// Start server
require('../../server')(function () {
	startTest();
});

function startTest() {
	let channels = [];
	let messages = 0;
	let users = 0;
	let keys = 0;
	
	let redisOptions = config.get('redis');
	redisOptions.retry_strategy = function (options) {
		return 100;
	};
	let redisClient = redis.createClient(redisOptions);
	redisClient.on('error', function (err) {
	});
	
	sinon.stub(zoteroAPI, 'getKeyInfo').callsFake(Promise.coroutine(function*(apiKey) {
		let topics = [];
		for (let i = 0; i < SUBSCRIPTIONS_PER_CONNECTION; i++) {
			let name = '/users/' + (++users);
			topics.push(name);
			channels.push(name);
		}
		
		return {
			topics: topics,
			apiKeyID: ++keys
		};
	}));
	
	function makeConnections(max) {
		let total = 0;
		(function fn() {
			for (let i = 0; i < 100 && total < max; i++, total++) {
				connect();
			}
			setTimeout(fn, 50);
		})();
		
		function connect() {
			let {apiKey} = makeAPIKey();
			let ws = new WebSocket({apiKey: apiKey});
			ws.on('error', function (err) {
				console.log(err);
			});
			
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
				});
				onEvent(data, 'topicUpdated', function (fields) {
					messages++;
				});
			});
		}
	}
	
	function generateMessages() {
		setInterval(function () {
			if (!channels.length) return;
			for (let i = 0; i < Math.floor(MESSAGES_PER_SECOND / 100); i++) {
				let n = Math.floor(Math.random() * channels.length);
				let message = {
					event: 'topicUpdated',
					topic: channels[n]
				};
				redisClient.publish((config.get('redis').prefix || '') + channels[n], JSON.stringify(message));
			}
		}, 10);
	}
	
	setInterval(function () {
		console.log(
			'connections: ' + connections.getNumConnections() +
			', channels: ' + connections.getSubscriptions().length +
			', messages: ' + messages + '/s'
		);
		messages = 0;
	}, 1000);
	
	makeConnections(CONNECTIONS);
	generateMessages();
}
