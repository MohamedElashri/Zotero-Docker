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

var config = require('config');
var log = require('./log');
var StatsD = require('node-statsd');

var c = config.get('statsD');
if (c.host) {
	let client = new StatsD(config.get('statsD'));
	client.socket.on('error', function (error) {
		return log.error("StatsD: " + error);
	});
	module.exports = client;
}
else {
	log.warn("StatsD host not configured");
	// Stub all function calls
	module.exports = new Proxy({}, {
		get: function (target, property, receiver) {
			return () => {};
		}
	});
}
