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

let redis = require('redis');
let config = require('config');
let log = require('./log');

let redisOptions = config.get('redis');

// No need to buffer if we resubscribe on reconnect
redisOptions.enable_offline_queue = false;

// We have a custom re-subscriber
redisOptions.disable_resubscribing = true;

// Exponential retry - 100ms, 200ms, .., 1000ms
redisOptions.retry_strategy = function (options) {
	if (options.error) {
		log.error(options.error);
	}
	return Math.min(options.attempt * 100, 1000);
};

let redisClient = redis.createClient(redisOptions);

redisClient.on('error', function (err) {
	// Ignore command abort error (AbortError) that happens because of an inactive connection.
	// We only use two Redis commands - 'subscribe' and 'unsubscribe'.
	// If a connection fails, we reconnect and resubscribe.
	// All the previous subscriptions die together with the previous connection
	if (err instanceof redis.AbortError && err.code === 'NR_CLOSED') return;
	log.error(err);
});

redisClient.on('reconnecting', function () {
	log.info('Redis is reconnecting');
});

module.exports = redisClient;
