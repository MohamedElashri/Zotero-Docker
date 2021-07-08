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

var expected = 0;
var actual = 0;

// Proxy chai access to add assertion counting
var assertOrig = require('chai').assert;
var assert = {};
for (let i in assertOrig) {
	if (typeof assertOrig[i] == 'function') {
		assert[i] = function () {
			actual++;
			assertOrig[i].apply(assertOrig, arguments);
			
			// If .done(done) is added to assertions, call passed done() automatically
			// when expected number of tests have been run
			return {
				done: function (done) {
					if (actual == expected) {
						done();
					}
				}
			};
		}
	}
}
module.exports.assert = assert;

module.exports.expect = function (n) {
	expected = n;
}

module.exports.check = function () {
	if (!expected || expected == actual) return;
	var err = new Error('expected ' + expected + ' assertions, got ' + actual);
	this.currentTest.emit('error', err);
}

module.exports.reset = function () {
	expected = 0;
	actual = 0;
}
