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
var request = Promise.promisify(require('request'));
var cwait = require('cwait');

var utils = require('./utils');
var log = require('./log');

var API_CONCURRENCY_LIMIT = 50;
var queue = new (cwait.TaskQueue)(Promise, API_CONCURRENCY_LIMIT);

//
// Zotero API interaction
//

/**
 * @param {String} apiKey
 * @return {String[]} - All topics accessible by the key
 */
exports.getKeyInfo = queue.wrap(Promise.coroutine(function*(apiKey) {
	var topics = [];
	
	// Get userID and user topic if applicable
	var options = {
		url: config.get('apiURL') + 'keys/current?showid=1',
		headers: getAPIRequestHeaders(apiKey)
	}
	try {
		var body = yield request(options).spread(function (response, body) {
			if (response.statusCode != 200) {
				throw response;
			}
			return body;
		});
	}
	catch (e) {
		if (e.statusCode == 403) {
			throw new utils.WSError(403, "Invalid API key");
		}
		else if (e.statusCode) {
			throw new utils.WSError(e.statusCode, e.body ? e.body : "Error getting key info");
		}
		else {
			throw new Error("Error getting key info: " + e);
		}
	}
	
	var data = JSON.parse(body);
	if (data.access && data.access.user) {
		topics.push('/users/' + data.userID);
		topics.push('/users/' + data.userID + '/publications');
	}
	
	// Get groups
	var options = {
		url: config.get('apiURL') + 'users/' + data.userID + '/groups',
		headers: getAPIRequestHeaders(apiKey)
	}
	try {
		var body = yield request(options).get(1);
	}
	catch (e) {
		if (e.statusCode) {
			throw new utils.WSError(e.statusCode, e.body);
		}
		else {
			throw new Error("Error getting key groups: " + e);
		}
	}
	
	var groups = JSON.parse(body);
	for (let i = 0; i < groups.length; i++) {
		topics.push('/groups/' + groups[i].id);
	}
	
	var apiKeyID = data.id;
	if (!apiKeyID) {
		throw new Error('No API key ID in /keys/ response');
	}
	
	return {
		topics: topics,
		apiKeyID: apiKeyID
	};
}));

/**
 * Check to make sure the given topic is in the list of available topics
 */
exports.checkPublicTopicAccess = queue.wrap(Promise.coroutine(function* (topic) {
	try {
		// TODO: Use HEAD request once main API supports it
		// TODO: Don't use /items
		let url = config.get('apiURL') + topic.substr(1) + '/items';
		var options = {
			url: url,
			headers: getAPIRequestHeaders()
		}
		return request(options).spread(function (response, body) {
			if (response.statusCode == 200) {
				return true;
			}
			if (response.statusCode == 403 || response.statusCode == 404) {
				return false;
			}
			
			log.error("Got " + response.statusCode + " from API for " + url);
			
			// This shouldn't happen
			if (utils.isClientError(response.statusCode)) {
				response.statusCode = 500;
			}
			throw new utils.WSError(response.statusCode, response.body);
		});
	}
	catch (e) {
		if (e instanceof utils.WSError) {
			throw e;
		}
		throw new Error("Error getting key permissions: " + e);
	}
}));


function getAPIRequestHeaders(apiKey) {
	var headers = JSON.parse(JSON.stringify(config.get('apiRequestHeaders')));
	headers['Zotero-API-Version'] = config.get('apiVersion');
	if (apiKey) {
		headers['Zotero-API-Key'] = apiKey;
	}
	return headers;
}
