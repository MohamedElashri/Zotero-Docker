"use strict";

var tinymce = require('tinymce.html');

module.exports = {
	process: function (str) {
		var schema = new tinymce.html.Schema({});
		var parser = new tinymce.html.Parser({
			forced_root_block: 'p'
		}, schema);
		var serializer = new tinymce.html.Serializer({
			indent: 'simple',
			indent_before: 'p,h1,h2,h3,h4,h5,h6,blockquote,div,title,style,pre,script,td,th,ul,ol,li,dl,dt,dd,area,table,thead,'
				+ 'tfoot,tbody,tr,section,article,hgroup,aside,figure,figcaption,option,optgroup,datalist',
			indent_after: 'p,h1,h2,h3,h4,h5,h6,blockquote,div,title,style,pre,script,td,th,ul,ol,li,dl,dt,dd,area,table,thead,'
				+ 'tfoot,tbody,tr,section,article,hgroup,aside,figure,figcaption,option,optgroup,datalist'
		}, schema);
		
		var root = parser.parse(str);
		return serializer.serialize(root);
	}
};
