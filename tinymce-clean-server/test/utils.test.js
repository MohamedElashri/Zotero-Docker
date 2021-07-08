"use strict";

const tinymce = require('tinymce.html');
const utils = require('../lib/utils');
const assert = require('assert');

describe("#process()", function () {
	it("should add newlines after <p> elements", function () {
		var input = "<p><strong>Foo</strong></p><p>Bar</p>";
		var output = "<p><strong>Foo</strong></p>\n<p>Bar</p>";
		assert.equal(utils.process(input), output);
	});
	
	it("should add newlines after list elements", function () {
		var input = "<ul><li><strong>Foo</strong></li><li>Bar</li></ul>";
		var output = "<ul>\n<li><strong>Foo</strong></li>\n<li>Bar</li>\n</ul>";
		assert.equal(utils.process(input), output);
	});
});
