var koa = require('koa');
var koaBody = require('koa-body');
var logger = require('koa-logger2');
var utils = require('./lib/utils');
var app = koa();

app.use(koaBody({
	multipart: false,
	urlencoded: false,
	json: false,
	textLimit: 250000
}));

if (process.env.TINYMCE_CLEAN_LOG) {
	var log_middleware = logger('ip [day/month/year:time zone] "method url protocol/httpVer" status size "referer" "userAgent" duration ms custom[unpacked]');
	app.use(log_middleware.gen);
}

app.use(function* (next) {
	var d = new Date();
	if (this.request.method == 'POST'
			&& this.request.headers['content-type'] == 'text/plain') {
		let body = utils.process(this.request.body);
		let suffix = ` in ${new Date() - d} ms`;
		if (body != this.request.body) {
			console.log("Note cleaned" + suffix);
		}
		else {
			console.log("Note unchanged" + suffix);
		}
		this.body = body;
		return;
	}
	this.status = 400;
});

var host = process.env.TINYMCE_CLEAN_HOST || undefined;
var port = process.env.TINYMCE_CLEAN_PORT || 16342;
console.log(`Listening on port ${port}`);
app.listen(port, host);
