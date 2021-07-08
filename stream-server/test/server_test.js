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

var mockery = require('mockery');
var sinon = require('sinon');

var config = require('config');
var Promise = require('bluebird');
var fs = require('fs');
var requestAsync = Promise.promisify(require('request'));

mockery.registerSubstitute('redis', './test/support/redis_mock');
mockery.enable();
mockery.warnOnUnregistered(false);

var zoteroAPI = require('../zotero_api');
var connections = require('../connections');
var redis = require('./support/redis_mock');
var WebSocket = require('./support/websocket');
var assertionCount = require('./support/assertion_count');
var assert = assertionCount.assert;
var expect = assertionCount.expect;
var testUtils = require('./support/test_utils');
var baseURL = testUtils.baseURL;
var onEvent = testUtils.onEvent;
var makeAPIKey = testUtils.makeAPIKey;

// Start server
var defer = Promise.defer();
require('../server')(function () {
	defer.resolve();
});


describe("Streamer Tests:", function () {
	// Wait for server initialization
	// TODO: Emit an event for this
	before(function (done) {
		defer.promise.then(function () {
			done();
		});
	});
	
	beforeEach(assertionCount.reset);
	afterEach(assertionCount.check);
	
	beforeEach(function () {
		console.log((new Array(63)).join("="));
	});
	afterEach(function () {
		console.log((new Array(63)).join("=") + "\n");
	});
	
	describe("Health check", function () {
		it('should return 200', function () {
			return requestAsync(baseURL + 'health')
			.spread(function (response, body) {
				assert.equal(body, '');
			});
		})
	})
	
	describe("Notification handler", function () {
		it('should ignore a topicAdded for an unregistered API key', function () {
			redis.postMessages({
				event: "topicAdded",
				apiKeyID: makeAPIKey().apiKeyID,
				topic: '/users/123456'
			});
		})
	})
	
	//
	//
	// Single-key requests
	//
	//
	describe("Single-key event stream", function () {
		it('should connect', function (done) {
			var ws = new WebSocket;
			ws.on('open', function (message) {
				ws.end();
				done();
			});
		});
		
		it('should include a retry value', function (done) {
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
					ws.end();
					if (fields.retry) {
						assert.equal(fields.retry, config.get('retryTime') * 1000);
						done();
					}
				});
			});
		});
		
		it('should reject unknown API keys', function (done) {
			var apiKey = "INVALID" + makeAPIKey().apiKey.substr(7);
			var ws = new WebSocket({ apiKey: apiKey });
			ws.on('close', function (code, reason) {
				assert.equal(code, 4403);
				assert.equal(reason, "Invalid API key");
				done();
			});
		});
		
		it('should include all accessible topics', function (done) {
			var {apiKey, apiKeyID} = makeAPIKey();
			var topics = ['/users/123456', '/users/123456/publications', '/groups/234567'];
			var globalTopics = ['styles', 'translators'];
			var allTopics = topics.concat(globalTopics);
			
			sinon.stub(zoteroAPI, 'getKeyInfo')
				.withArgs(apiKey)
				.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
			
			var ws = new WebSocket({ apiKey: apiKey });
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
					ws.end();
					zoteroAPI.getKeyInfo.restore();
					
					assert.typeOf(fields.topics, 'array');
					assert.lengthOf(fields.topics, allTopics.length);
					assert.sameMembers(fields.topics, allTopics);
					done();
				});
			});
		});
		
		it('should accept keys via Zotero-API-Key', function (done) {
			var {apiKey, apiKeyID} = makeAPIKey();
			var topics = ['/users/123456', '/users/123456/publications', '/groups/234567'];
			var globalTopics = ['styles', 'translators'];
			var allTopics = topics.concat(globalTopics);
			
			sinon.stub(zoteroAPI, 'getKeyInfo')
				.withArgs(apiKey)
				.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
			
			var ws = new WebSocket({ apiKey: apiKey, useHeaders: true });
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
					ws.end();
					zoteroAPI.getKeyInfo.restore();
					
					assert.typeOf(fields.topics, 'array');
					assert.lengthOf(fields.topics, allTopics.length);
					assert.sameMembers(fields.topics, allTopics);
					done();
				});
			});
		})
		
		it('should add a topic on topicAdded for key', function (done) {
			var {apiKey, apiKeyID} = makeAPIKey();
			var topics = ['/users/123456', '/users/123456/publications'];
			var newTopic = '/groups/234567';
			
			sinon.stub(zoteroAPI, 'getKeyInfo')
				.withArgs(apiKey)
				.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
			
			var ws = new WebSocket({ apiKey: apiKey });
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicAdded', function (fields) {
							// API key shouldn't be passed to single-key request
							assert.isUndefined(fields.apiKey);
							assert.equal(fields.topic, newTopic);
							assert.lengthOf(Object.keys(fields), 1);
							
							var allTopics = topics.concat([newTopic]);
							
							var topicUpdatedCalled = 0;
							ws.on('message', function (data) {
								onEvent(data, 'topicUpdated', function (fields) {
									assert.equal(fields.topic, allTopics[topicUpdatedCalled]);
									topicUpdatedCalled++;
									if (topicUpdatedCalled == allTopics.length) {
										ws.end();
										done();
									}
								});
							});
							
							// Send topicUpdated to old and new topics
							redis.postMessages(allTopics.map(function (topic) {
								return {
									event: "topicUpdated",
									topic: topic
								};
							}));
						});
					});
					
					// Send topicAdded
					redis.postMessages({
						event: "topicAdded",
						apiKeyID: apiKeyID,
						topic: newTopic
					});
				});
			});
		});
		
		it('should delay continued and pass through other requests', function (done) {
			var {apiKey, apiKeyID} = makeAPIKey();
			var topic = '/users/123456';
			
			sinon.stub(zoteroAPI, 'getKeyInfo')
				.withArgs(apiKey)
				.returns(Promise.resolve({topics: [topic], apiKeyID: apiKeyID}));
			
			var clock = sinon.useFakeTimers();
			var start = 0;
			
			var ws = new WebSocket({apiKey: apiKey});
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							var delta = Date.now() - start;
							assert.equal(delta, config.get('continuedDelay'));
							clock.restore();
							ws.end();
							done();
						});
					});
					
					start = Date.now();
					redis.postMessages({
						event: "topicUpdated",
						topic: topic,
						continued: true
					});
					
					clock.tick(config.get('continuedDelay'));
				});
			});
		});
		
		it('should delete a topic on topicRemoved', function (done) {
			var {apiKey, apiKeyID} = makeAPIKey();
			var topics = ['/users/123456', '/users/123456/publications', '/groups/234567'];
			var topicToRemove = '/groups/234567';
			
			expect(3 + topics.length - 1);
			
			sinon.stub(zoteroAPI, 'getKeyInfo')
				.withArgs(apiKey)
				.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
			
			var ws = new WebSocket({ apiKey: apiKey });
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicRemoved', Promise.coroutine(function* (fields) {
							// API key shouldn't be passed to single-key request
							assert.isUndefined(fields.apiKey);
							assert.equal(fields.topic, topicToRemove);
							assert.lengthOf(Object.keys(fields), 1);
							
							var remainingTopics = topics.slice(0, -1);
							
							var topicUpdatedCalled = 0;
							ws.on('message', function (data) {
								onEvent(data, 'topicUpdated', function (fields) {
									assert.equal(fields.topic, remainingTopics[topicUpdatedCalled]);
									topicUpdatedCalled++;
								});
							});
							
							// Send topicUpdated to all topics
							redis.postMessages(topics.map(function (topic) {
								return {
									event: "topicUpdated",
									topic: topic
								};
							}));
							
							// Give topicUpdated time to be erroneously called
							yield Promise.delay(100);
							ws.end();
							done();
						}));
					});
					
					// Send topicRemoved
					redis.postMessages({
						event: "topicRemoved",
						apiKeyID: apiKeyID,
						topic: topicToRemove
					});
				});
			});
		});
		
		it('should reject subscription changes', function (done) {
			var {apiKey, apiKeyID} = makeAPIKey();
			var topics = ['/users/123456', '/users/123456/publications', '/groups/234567'];
			
			sinon.stub(zoteroAPI, 'getKeyInfo')
				.withArgs(apiKey)
				.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
			
			var ws = new WebSocket({ apiKey: apiKey });
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('close', function (code, reason) {
						assert.equal(code, 4405);
						assert.equal(reason, "Single-key connection cannot be modified");
						ws.end();
						done();
					});
					
					var response = yield ws.send({
						action: 'deleteSubscriptions',
						subscriptions: [{
							apiKey: apiKey,
							topic: topics[0]
						}]
					});
				}));
			});
		});
	})
	
	
	//
	//
	// Multi-key requests
	//
	//
	describe("Multi-key event stream", function () {
		it('should connection', function (done) {
			var ws = new WebSocket;
			ws.on('open', function () {
				ws.end();
				done();
			});
		});
		
		it('should include a retry value', function (done) {
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', function (fields) {
					ws.end();
					if (fields.retry) {
						assert.equal(fields.retry, config.get('retryTime') * 1000);
						done();
					}
				});
			});
		});
		
		it("should add subscriptions for all of an API key's topics", function (done) {
			expect(6);
			
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey, apiKeyID} = makeAPIKey();
					var topics = ['/users/123456', '/groups/234567'];
					var ignoredTopics = ['/groups/345678'];
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey)
						.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
					
					// Add a subscription
					var response = yield ws.send({
						action: 'createSubscriptions',
						subscriptions: [{
							apiKey: apiKey
						}]
					}, 'subscriptionsCreated');
					
					zoteroAPI.getKeyInfo.restore();
					
					assert.typeOf(response.subscriptions, 'array');
					assert.lengthOf(response.subscriptions, 1);
					assert.equal(response.subscriptions[0].apiKey, apiKey);
					assert.sameMembers(response.subscriptions[0].topics, topics);
					
					// Listen for subscription creation and update notifications
					var topicUpdatedCalled = 0;
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							assert.equal(fields.topic, topics[topicUpdatedCalled]).done(function () {
								ws.end();
								done();
							});
							topicUpdatedCalled++;
						});
					});
					
					// Trigger notification on subscribed topics, which should trigger
					// topicUpdated above
					redis.postMessages(topics.concat(ignoredTopics).map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
				}));
			})
		});
		
		it("should add specific provided subscriptions", function (done) {
			expect(7);
			
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					let connectionID = fields.connectionID;
					
					var {apiKey, apiKeyID} = makeAPIKey();
					var topics = ['/users/123456', '/users/123456/publications', '/groups/234567'];
					var ignoredTopics = ['/groups/345678'];
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey)
						.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
					
					// Add a subscription
					var response = yield ws.send({
						action: 'createSubscriptions',
						subscriptions: [{
							apiKey: apiKey,
							topics: topics
						}]
					}, 'subscriptionsCreated');
					
					zoteroAPI.getKeyInfo.restore();
					
					assert.typeOf(response.subscriptions, 'array');
					assert.lengthOf(response.subscriptions, 1);
					assert.equal(response.subscriptions[0].apiKey, apiKey);
					assert.sameMembers(response.subscriptions[0].topics, topics);
					
					// Listen for subscription creation and update notifications
					var topicUpdatedCalled = 0;
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							assert.equal(fields.topic, topics[topicUpdatedCalled]).done(function () {
								ws.end();
								done();
							});
							topicUpdatedCalled++;
						});
					});
					
					// Trigger notification on subscribed topic, which should trigger
					// topicUpdated above
					redis.postMessages(topics.concat(ignoredTopics).map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
				}));
			})
		});
		

		it("should add provided public subscriptions", function (done) {
			expect(6);
			
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var topics = ['/groups/123456', '/groups/234567'];
					var ignoredTopics = ['/groups/345678'];
					
					var stub = sinon.stub(zoteroAPI, 'checkPublicTopicAccess');
					for (let i = 0; i < topics.length; i++) {
						stub.withArgs(topics[i]).returns(Promise.resolve(true));
					}
					stub.returns(Promise.resolve(false));
					
					// Add a subscription
					var response = yield ws.send({
						action: 'createSubscriptions',
						subscriptions: [
							// No reason client should do this, but separate subscriptions
							// should be merged together
							{
								topics: [
									topics[0]
								]
							},
							{
								topics: [
									topics[1]
								]
							}
						]
					}, 'subscriptionsCreated');
					
					stub.restore();
					
					assert.typeOf(response.subscriptions, 'array');
					assert.lengthOf(response.subscriptions, 1);
					assert.isUndefined(response.subscriptions[0].apiKey);
					assert.sameMembers(response.subscriptions[0].topics, topics);
					
					// Listen for update notifications
					var topicUpdatedCalled = 0;
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							assert.equal(fields.topic, topics[topicUpdatedCalled]).done(function () {
								ws.end();
								done();
							});
							topicUpdatedCalled++;
						});
					});

					
					// Trigger notification on subscribed topics, which should trigger
					// topicUpdated above
					redis.postMessages(topics.concat(ignoredTopics).map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
				}));
			})
		});
		
		it("should add provided global subscriptions", function (done) {
			expect(6);
			
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function*(fields) {
					var topics = ['styles', 'translators'];
					
					// Add a subscription
					var response = yield ws.send({
						action: 'createSubscriptions',
						subscriptions: [
							{
								topics: topics
							}
						]
					}, 'subscriptionsCreated');
					
					assert.typeOf(response.subscriptions, 'array');
					assert.lengthOf(response.subscriptions, 1);
					assert.isUndefined(response.subscriptions[0].apiKey);
					assert.sameMembers(response.subscriptions[0].topics, topics);
					
					// Listen for update notifications
					var topicUpdatedCalled = 0;
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							assert.equal(fields.topic, topics[topicUpdatedCalled]).done(function () {
								ws.end();
								done();
							});
							topicUpdatedCalled++;
						});
					});
					
					// Trigger notification on subscribed topics, which should trigger
					// topicUpdated above
					redis.postMessages(topics.map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
					
				}));
			})
		});
		
		it("should ignore inaccessible subscriptions in add requests", function (done) {
			expect(13);
			
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey, apiKeyID} = makeAPIKey();
					var topics = ['/groups/234567'];
					var inaccessibleKeyTopics = ['/groups/345678'];
					var inaccessiblePublicTopics = ['/groups/456789'];
					var inaccessibleTopics = inaccessibleKeyTopics.concat(inaccessiblePublicTopics);
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey)
						.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
					
					var stub = sinon.stub(zoteroAPI, 'checkPublicTopicAccess');
					for (let i = 0; i < topics.length; i++) {
						stub.withArgs(topics[i]).returns(Promise.resolve(true));
					}
					stub.returns(Promise.resolve(false));
					
					// Add a subscription
					var response = yield ws.send({
						action: 'createSubscriptions',
						subscriptions: [
							{
								apiKey: apiKey,
								topics: topics.concat(inaccessibleKeyTopics)
							},
							{
								topics: inaccessiblePublicTopics
							},
						]
					}, 'subscriptionsCreated');
					
					zoteroAPI.getKeyInfo.restore();
					zoteroAPI.checkPublicTopicAccess.restore();
					
					assert.typeOf(response.subscriptions, 'array');
					assert.lengthOf(response.subscriptions, 1);
					assert.equal(response.subscriptions[0].apiKey, apiKey);
					assert.sameMembers(response.subscriptions[0].topics, topics);
					
					assert.typeOf(response.errors, 'array');
					assert.lengthOf(response.errors, inaccessibleTopics.length);
					assert.equal(response.errors[0].apiKey, apiKey);
					assert.equal(response.errors[0].topic, inaccessibleKeyTopics[0]);
					assert.equal(response.errors[0].error, "Topic is not valid for provided API key");
					assert.isUndefined(response.errors[1].apiKey);
					assert.equal(response.errors[1].topic, inaccessiblePublicTopics[0]);
					assert.equal(response.errors[1].error, "Topic is not accessible without an API key");
					
					// Listen for update notifications
					var topicUpdatedCalled = 0;
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							assert.equal(fields.topic, topics[topicUpdatedCalled]).done(function () {
								ws.end();
								done();
							});
							topicUpdatedCalled++;
						});
					});
					
					redis.postMessages(topics.concat(inaccessibleTopics).map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
				}));
			})
		});
		
		it("should delete all topics of a provided API key", function (done) {
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey, apiKeyID} = makeAPIKey();
					var topics = ['/users/123456', '/users/123456/publications', '/groups/234567'];
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey)
						.returns(Promise.resolve({topics: topics, apiKeyID: apiKeyID}));
					
					// Add subscriptions
					yield ws.send({
						action: 'createSubscriptions',
						subscriptions: [{
							apiKey: apiKey
						}]
					}, 'subscriptionsCreated');
					
					zoteroAPI.getKeyInfo.restore();
					
					var response = yield ws.send({
						action: 'deleteSubscriptions',
						subscriptions: [{
							apiKey: apiKey
						}]
					}, 'subscriptionsDeleted');
					
					assert.property(response, 'subscriptions');
					assert.lengthOf(response.subscriptions, 1);
					assert.propertyVal(response.subscriptions[0], 'apiKey', apiKey);
					assert.lengthOf(response.subscriptions[0].topics, topics.length);
					
					ws.on('message', function (data) {
						// Listen for update notifications
						onEvent(data, 'topicUpdated', function (fields) {
							assert.fail(fields.topic, "",
								"topicUpdated shouldn't be called after deletion");
						});
					});
					
					// Trigger notification on subscribed topics, which should NOT trigger
					// topicUpdated above
					redis.postMessages(topics.map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
					
					// Give topicUpdated time to be erroneously called
					yield Promise.delay(100);
					ws.end();
					done();
				}));
			})
		});
		
		it("should delete a specific API key/topic pair ", function (done) {
			expect(3);
			
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey: apiKey1, apiKeyID: apiKeyID1} = makeAPIKey();
					var {apiKey: apiKey2, apiKeyID: apiKeyID2} = makeAPIKey();
					var topics1 = ['/users/123456', '/groups/234567'];
					var topics2 = ['/users/234567', '/groups/234567'];
					// Should receive notifications for all topics, since the deleted topic
					// exists for both API keys
					var allTopics = ['/users/123456', '/users/234567', '/groups/234567'];
					var topicToDelete = '/groups/234567';
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey1)
						.returns(Promise.resolve({topics: topics1, apiKeyID: apiKeyID1}))
						.withArgs(apiKey2)
						.returns(Promise.resolve({topics: topics2, apiKeyID: apiKeyID2}));
					
					// Add subscriptions
					yield testUtils.addSubscriptionsByKeys(ws, [apiKey1, apiKey2]);
					
					zoteroAPI.getKeyInfo.restore();
					
					// Delete subscriptions
					var response = yield ws.send({
						action: 'deleteSubscriptions',
						subscriptions: [{
							apiKey: apiKey1,
							topic: topicToDelete
						}]
					}, 'subscriptionsDeleted');
					
					// Listen for update notifications
					var topicUpdatedCalled = 0;
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							assert.equal(fields.topic, allTopics[topicUpdatedCalled]).done(function () {
								ws.end();
								done();
							});
							topicUpdatedCalled++;
						});
					});
					
					// Trigger notification on all topics
					redis.postMessages(allTopics.map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
				}));
			})
		})
		
		it("should delete public and global topics", function (done) {
			expect(3);
			
			var ws = new WebSocket;
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function*(fields) {
					var topicsToKeep = ['/users/234567'];
					var topicsToDelete = ['/users/123456', 'translators'];
					var allTopics = topicsToKeep.concat(topicsToDelete);
					
					var stub = sinon.stub(zoteroAPI, 'checkPublicTopicAccess');
					for (let i = 0; i < allTopics.length; i++) {
						stub.withArgs(allTopics[i]).returns(Promise.resolve(true));
					}
					
					// Add subscriptions
					yield testUtils.addSubscriptions(ws, null, allTopics);
					
					stub.restore();
					
					// Delete subscriptions
					var response = yield ws.send({
						action: 'deleteSubscriptions',
						subscriptions: [
							{
								topic: topicsToDelete[0]
							},
							{
								topic: topicsToDelete[1]
							}
						]
					}, 'subscriptionsDeleted');
					
					assert.equal(response.subscriptions[0].topics[0], topicsToDelete[0]);
					assert.equal(response.subscriptions[1].topics[0], topicsToDelete[1]);
					
					// Listen for update notifications
					var topicUpdatedCalled = 0;
					ws.on('message', function (data) {
						onEvent(data, 'topicUpdated', function (fields) {
							assert.equal(fields.topic, topicsToKeep[topicUpdatedCalled]).done(function () {
								ws.end();
								done();
							});
							topicUpdatedCalled++;
						});
					});
					
					// Trigger notification on all topics
					redis.postMessages(allTopics.map(function (topic) {
						return {
							event: "topicUpdated",
							topic: topic
						};
					}));
				}));
			})
		})
		
		it('should add a topic on topicAdded for key', function (done) {
			expect(7);
			
			var ws = new WebSocket();
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey: apiKey1, apiKeyID: apiKeyID1} = makeAPIKey();
					var {apiKey: apiKey2, apiKeyID: apiKeyID2} = makeAPIKey();
					var topics1 = ['/users/123456', '/groups/345678'];
					var topics2 = ['/users/234567'];
					var newTopic = '/groups/456789';
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey1)
						.returns(Promise.resolve({topics: topics1, apiKeyID: apiKeyID1}))
						.withArgs(apiKey2)
						.returns(Promise.resolve({topics: topics2, apiKeyID: apiKeyID2}));
					
					// Add subscriptions
					yield testUtils.addSubscriptionsByKeys(ws, [apiKey1, apiKey2]);
					
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicAdded', function (fields) {
							// API key shouldn't be passed to single-key request
							assert.equal(fields.apiKey, apiKey1);
							assert.equal(fields.topic, newTopic);
							assert.lengthOf(Object.keys(fields), 2);
							
							var allTopics = topics1.concat(topics2).concat([newTopic]);
							
							var topicUpdatedCalled = 0;
							ws.on('message', function (data) {
								onEvent(data, 'topicUpdated', function (fields) {
									assert.equal(fields.topic, allTopics[topicUpdatedCalled]);
									topicUpdatedCalled++;
									if (topicUpdatedCalled == allTopics.length) {
										ws.end();
										done();
									}
								});
							});
							
							// Send topicUpdated to old and new topics
							redis.postMessages(allTopics.map(function (topic) {
								return {
									event: "topicUpdated",
									topic: topic
								};
							}));
						});
					});
					
					// Send topicAdded
					redis.postMessages({
						event: "topicAdded",
						apiKeyID: apiKeyID1,
						topic: newTopic
					});
				}));
			});
		})
		
		it('should delete a topic on topicRemoved', function (done) {
			expect(5);
			
			var ws = new WebSocket();
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey: apiKey1, apiKeyID: apiKeyID1} = makeAPIKey();
					var {apiKey: apiKey2, apiKeyID: apiKeyID2} = makeAPIKey();
					var topics1 = ['/users/123456', '/groups/345678'];
					var topics2 = ['/users/234567'];
					var topicToRemove = '/groups/345678';
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey1)
						.returns(Promise.resolve({topics: topics1, apiKeyID: apiKeyID1}))
						.withArgs(apiKey2)
						.returns(Promise.resolve({topics: topics2, apiKeyID: apiKeyID2}));
					
					// Add subscriptions
					yield testUtils.addSubscriptionsByKeys(ws, [apiKey1, apiKey2]);
					
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicRemoved', Promise.coroutine(function* (fields) {
							assert.equal(fields.apiKey, apiKey1);
							assert.equal(fields.topic, topicToRemove);
							assert.lengthOf(Object.keys(fields), 2);
							
							var remainingTopics = topics1.slice(0, -1).concat(topics2);
							
							var topicUpdatedCalled = 0;
							ws.on('message', function (data) {
								onEvent(data, 'topicUpdated', function (fields) {
									assert.equal(fields.topic, remainingTopics[topicUpdatedCalled]);
									topicUpdatedCalled++;
								});
							});
							
							// Send topicUpdated to all topics
							redis.postMessages(topics1.concat(topics2).map(function (topic) {
								return {
									event: "topicUpdated",
									topic: topic
								};
							}));
							
							// Give topicUpdated time to be erroneously called
							yield Promise.delay(100);
							ws.end();
							done();
						}));
					});
					
					// Send topicRemoved
					redis.postMessages({
						event: "topicRemoved",
						apiKeyID: apiKeyID1,
						topic: topicToRemove
					});
				}));
			});
		})
		
		it('should ignore a topicRemoved for a different API key', function (done) {
			var ws = new WebSocket();
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey: apiKey1, apiKeyID: apiKeyID1} = makeAPIKey();
					var {apiKey: apiKey2, apiKeyID: apiKeyID2} = makeAPIKey();
					var topics1 = ['/users/123456', '/groups/345678'];
					var topics2 = ['/users/234567'];
					var topicToRemove = '/groups/345678';
					var allTopics = topics1.concat(topics2);
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey1)
						.returns(Promise.resolve({topics: topics1, apiKeyID: apiKeyID1}))
						.withArgs(apiKey2)
						.returns(Promise.resolve({topics: topics2, apiKeyID: apiKeyID2}));
					
					// Add subscriptions
					yield testUtils.addSubscriptions(ws, apiKey1);
					yield testUtils.addSubscriptions(ws, apiKey2);
					
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicRemoved', Promise.coroutine(function* (fields) {
							throw new Error("topicRemoved shouldn't be received for non-matching API key");
						}));
					});
					
					// Send topicRemoved on wrong API key
					redis.postMessages({
						event: "topicRemoved",
						apiKeyID: apiKeyID2,
						topic: topicToRemove
					});
					
					// Give topicRemoved time to be erroneously called
					yield Promise.delay(100);
					ws.end();
					done();
				}));
			});
		})
		
		it('should delete key-based topics on topicDeleted', function (done) {
			expect(5);
			
			var ws = new WebSocket();
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var {apiKey: apiKey1, apiKeyID: apiKeyID1} = makeAPIKey();
					var {apiKey: apiKey2, apiKeyID: apiKeyID2} = makeAPIKey();
					var topics1 = ['/users/123456', '/groups/345678'];
					var topics2 = ['/users/234567'];
					var topicToRemove = '/groups/345678';
					
					sinon.stub(zoteroAPI, 'getKeyInfo')
						.withArgs(apiKey1)
						.returns(Promise.resolve({topics: topics1, apiKeyID: apiKeyID1}))
						.withArgs(apiKey2)
						.returns(Promise.resolve({topics: topics2, apiKeyID: apiKeyID2}));
					
					// Add subscriptions
					yield testUtils.addSubscriptionsByKeys(ws, [apiKey1, apiKey2]);
					
					zoteroAPI.getKeyInfo.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicRemoved', Promise.coroutine(function* (fields) {
							assert.equal(fields.apiKey, apiKey1);
							assert.equal(fields.topic, topicToRemove);
							assert.lengthOf(Object.keys(fields), 2);
							
							var remainingTopics = topics1.slice(0, -1).concat(topics2);
							
							var topicUpdatedCalled = 0;
							ws.on('message', function (data) {
								onEvent(data, 'topicUpdated', function (fields) {
									assert.equal(fields.topic, remainingTopics[topicUpdatedCalled]);
									topicUpdatedCalled++;
								});
							});
							
							// Send topicUpdated to all topics
							redis.postMessages(topics1.concat(topics2).map(function (topic) {
								return {
									event: "topicUpdated",
									topic: topic
								};
							}));
							
							// Give topicUpdated time to be erroneously called
							yield Promise.delay(100);
							ws.end();
							done();
						}));
					});
					
					// Send topicRemoved
					redis.postMessages({
						event: "topicDeleted",
						topic: topicToRemove
					});
				}));
			});
		})
		
		it('should delete a public topic on topicDeleted', function (done) {
			expect(4);
			
			var ws = new WebSocket();
			ws.on('message', function (data) {
				onEvent(data, 'connected', Promise.coroutine(function* (fields) {
					var topics = ['/groups/234567', '/groups/345678'];
					var topicToRemove = '/groups/345678';
					
					var stub = sinon.stub(zoteroAPI, 'checkPublicTopicAccess');
					for (let i = 0; i < topics.length; i++) {
						stub.withArgs(topics[i]).returns(Promise.resolve(true));
					}
					stub.returns(Promise.resolve(false));
					
					// Add subscriptions
					yield testUtils.addSubscriptions(ws, undefined, topics);
					
					stub.restore();
					
					ws.on('message', function (data) {
						onEvent(data, 'topicRemoved', Promise.coroutine(function* (fields) {
							assert.isUndefined(fields.apiKey);
							assert.equal(fields.topic, topicToRemove);
							assert.lengthOf(Object.keys(fields), 1);
							
							var remainingTopics = topics.slice(0, -1);
							
							var topicUpdatedCalled = 0;
							ws.on('message', function (data) {
								onEvent(data, 'topicUpdated', function (fields) {
									assert.equal(fields.topic, remainingTopics[topicUpdatedCalled]);
									topicUpdatedCalled++;
								});
							});
							
							// Send topicUpdated to all topics
							redis.postMessages(topics.map(function (topic) {
								return {
									event: "topicUpdated",
									topic: topic
								};
							}));
							
							// Give topicUpdated time to be erroneously called
							yield Promise.delay(100);
							ws.end();
							done();
						}));
					});
					
					// Send topicRemoved
					redis.postMessages({
						event: "topicDeleted",
						topic: topicToRemove
					});
				}));
			});
		})
	})
})
