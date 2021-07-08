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

let _listeners = [];
let _channels = [];

let Redis = function () {

};

module.exports = Redis;

Redis.createClient = function () {
	return this;
};

Redis.subscribe = function (channels) {
	if (!Array.isArray(channels)) {
		channels = [channels];
	}
	
	for (let i = 0; i < channels.length; i++) {
		let channel = channels[i].toString();
		if (_channels.indexOf(channel) < 0) {
			_channels.push(channel);
		}
	}
};

Redis.unsubscribe = function (channels) {
	if (!Array.isArray(channels)) {
		channels = [channels];
	}
	
	for (let i = 0; i < channels.length; i++) {
		let channel = channels[i].toString();
		let n = _channels.indexOf(channel);
		if (n >= 0) {
			_channels.splice(n, 1);
		}
	}
};

Redis.on = function (event, callback) {
	if (event == 'message') {
		_listeners.push(callback);
	}
};

Redis.postMessages = function (messages) {
	if (!Array.isArray(messages)) {
		messages = [messages];
	}
	
	for (let i = 0; i < messages.length; i++) {
		let message = messages[i];
		let channel;
		
		if (message.apiKeyID) {
			channel = 'api-key:' + message.apiKeyID.toString();
		} else {
			channel = message.topic.toString();
		}
		
		if (_channels.indexOf(channel) >= 0) {
			for (let j = 0; j < _listeners.length; j++) {
				let listener = _listeners[j];
				listener(channel, JSON.stringify(message));
			}
		}
	}
};
