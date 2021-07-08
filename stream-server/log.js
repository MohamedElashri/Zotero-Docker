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
var strftime = require('strftime');

module.exports = function () {
	var levels = ['trace', 'debug', 'info', 'warn', 'error'];
	var currentLevel = levelFromName(config.get('logLevel'));
	var utils;
	
	function log(level, msg, connectionOrRequest) {
		if (level < currentLevel) {
			return;
		}
		
		var date = "[" + strftime("%d/%b/%Y:%H:%M:%S %z") + "] ";
		
		if (connectionOrRequest) {
			// Request
			if (connectionOrRequest.socket) {
				// Work around a circular dependency. Without this, utils is an empty object
				if (!utils) {
					utils = require('./utils');
				}
				var addr = utils.getIPAddressFromRequest(connectionOrRequest);
			}
			// Connection (address stored in connections.registerConnection())
			else if (connectionOrRequest.remoteAddress) {
				var addr = connectionOrRequest.remoteAddress;
			}
		}
		
		// Hide keys from the log output
		if (msg) {
			msg = msg.toString().replace(/("apiKey":\s*")([^"]+)"/g, '$1********"');
		}
		
		if (addr) {
			console.log(date + "[" + addr + "] " + msg);
		}
		else {
			console.log(date + msg);
		}
	}
	
	function levelFromName(name) {
		var level = levels.indexOf(name);
		if (level == -1) {
			log(4, "Invaid log level '" + name + "'");
			return 0;
		}
		return level + 1;
	}
	
	var obj = {
		showing: function (level) {
			return currentLevel <= levelFromName(level)
		},
		
		setLevel: function (newLevel) {
			currentLevel = levelFromName(level);
		}
	};
	levels.forEach(function (level, index) {
		obj[level] = function (msg, connectionOrRequest) {
			log(index + 1, msg, connectionOrRequest);
		};
	});
	return obj
}()
