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

var Promise = require('bluebird');
// 'ws' is used because 'uws' doesn't support more than one event listener, and
// tests use multiple "ws.on('message', function() {})" listeners.
var WebSocket = require('ws');
var config = require('config');
var testUtils = require('./test_utils');
var onEvent = testUtils.onEvent;

var baseURL = 'ws://127.0.0.1:' + config.get('httpPort') + '/';

/**
 * Wrapper around an event stream HTTP request
 */
function WebSocketClient(params, cb) {
	let url = baseURL;
	var options = {};
	if (params && params.apiKey) {
		if (params.useHeaders) {
			options.headers = {
				'Zotero-API-Key': params.apiKey
			};
		}
		else {
			 url += "?key=" + params.apiKey;
		}
	}
	this._ws = new WebSocket(url, options);
}

WebSocketClient.prototype.send = function (data, expectedEvent) {
	if (typeof data != 'string') {
		data = JSON.stringify(data);
	}
	
	if (expectedEvent) {
		var defer = Promise.defer();
		this.on('message', function (data) {
			onEvent(data, expectedEvent, function (fields) {
				defer.resolve(fields);
			});
		});
		
		Promise.delay(1000)
		.then(function () {
			defer.reject("Timeout waiting for " + expectedEvent);
		});
		
		Promise.promisify(this._ws.send, this._ws).call(this._ws, data).catch(defer.reject);
		return defer.promise;
	}
	else {
		return Promise.promisify(this._ws.send, this._ws).call(this._ws, data);
	}
}

WebSocketClient.prototype.on = function () {
	this._ws.on.apply(this._ws, arguments);
}

WebSocketClient.prototype.end = function () {
	this._ws.close();
}

module.exports = WebSocketClient;
