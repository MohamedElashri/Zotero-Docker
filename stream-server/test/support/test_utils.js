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
var Promise = require('bluebird');
var requestAsync = Promise.promisify(require('request'));
var randomstring = require('randomstring');

module.exports = {
	baseURL: 'http://127.0.0.1:' + config.get('httpPort') + '/',
	
	/**
	 * Parse an SSE and run a function if it matches the given event name
	 *
	 * @param {String} msg
	 * @param {String} event - Value of event property to accept. If null, all events will match.
	 * @param {Function} func - Function to run for matching events. Function will be passed
	 *                          an object with fields from the event.
	 */
	onEvent: function (msg, event, func) {
		try {
			var data = JSON.parse(msg);
			if (event && data.event != event) {
				return;
			}
			// Remove 'event' from passed fields
			delete data.event;
			func(data);
		}
		catch (e) {
			console.log(e);
			throw e;
		}
	},
	
	makeAPIKey: function () {
		var apiKey = randomstring.generate(24);
		var apiKeyID = Math.floor(Math.random() * 100000) + 1;
		return {
			apiKeyID: apiKeyID,
			apiKey: apiKey
		};
	},
	
	addSubscriptions: function (ws, apiKey, topics) {
		return ws.send({
			action: 'createSubscriptions',
			subscriptions: [{
				apiKey: apiKey,
				topics: topics
			}]
		}, 'subscriptionsCreated');
	},
	
	addSubscriptionsByKeys: function (ws, apiKeys) {
		return ws.send({
			action: 'createSubscriptions',
			subscriptions: apiKeys.map(function (apiKey) {
				return {
					apiKey: apiKey
				};
			})
		}, 'subscriptionsCreated');
	}
}
