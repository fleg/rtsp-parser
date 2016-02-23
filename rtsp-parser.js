'use strict';

var inherits = require('util').inherits,
	Writable = require('stream').Writable;

exports.RTSPParser = RTSPParser;

function RTSPParser(type) {
	if (type !== RTSPParser.REQUEST && type !== RTSPParser.RESPONSE) {
		throw new Error('bad type');
	}

	Writable.call(this, {decodeStrings: false});

	this.type = type;
	this.state = type + '_LINE';
	this.info = {headers: []};
	this.line = '';
	this.headerLength = 0;
	this.contentLength = 0;
}
inherits(RTSPParser, Writable);

RTSPParser.REQUEST = 'REQUEST';
RTSPParser.RESPONSE = 'RESPONSE';

var methods = RTSPParser.methods = [
	'DESCRIBE',
	'ANNOUNCE',
	'GET_PARAMETER',
	'OPTIONS',
	'PAUSE',
	'PLAY',
	'RECORD',
	'REDIRECT',
	'SETUP',
	'SET_PARAMETER',
	'TEARDOWN'
];

var maxheaderLength = 80 * 1024;
var headerState = {
	REQUEST_LINE: true,
	RESPONSE_LINE: true,
	HEADER: true
};

var headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/,
	headerContinueExp = /^[ \t]+(.*[^ \t])/,
	requestExp = /^([A-Z-]+) ([^ ]+) RTSP\/(\d)\.(\d)$/,
	responseExp = /^RTSP\/(\d)\.(\d) (\d{3}) ?(.*)$/;

RTSPParser.prototype._write = function (chunk, encoding, callback) {
	this.chunk = chunk;
	this.offset = 0;
	this.end = chunk.length;

	try {
		while (this.offset < this.end) {
			this[this.state]();
		}
	} catch (err) {
		return callback(err);
	}

	this.chunk = null;

	if (headerState[this.state]) {
		this.headerLength += this.offset;
		if (this.headerLength > maxheaderLength) {
			return callback(new Error('max header size exceeded'));
		}
	}

	callback();
};

RTSPParser.prototype.consumeLine = function () {
	var end = this.end,
		chunk = this.chunk;

	for (var i = this.offset; i < end; i++) {
		if (chunk[i] === 0x0a) {
			var line = this.line + chunk.toString('ascii', this.offset, i);
			if (line.charAt(line.length - 1) === '\r') {
				line = line.substr(0, line.length - 1);
			}
			this.line = '';
			this.offset = i + 1;
			return line;
		}
	}

	this.line += chunk.toString('ascii', this.offset, this.end);
	this.offset = this.end;
};

RTSPParser.prototype.parseHeader = function (line, headers) {
	var match = headerExp.exec(line);
	var k = match && match[1];
	if (k) {
		headers.push(k);
		headers.push(match[2]);
	} else {
		var matchContinue = headerContinueExp.exec(line);
		if (matchContinue && headers.length) {
			if (headers[headers.length - 1]) {
				headers[headers.length - 1] += ' ';
			}
			headers[headers.length - 1] += matchContinue[1];
		}
	}
};

RTSPParser.prototype.REQUEST_LINE = function () {
	var line = this.consumeLine();
	if (!line) {
		return;
	}

	var match = requestExp.exec(line);
	if (match === null) {
		throw new Error('Parse Error');
	}

	this.info.method = methods.indexOf(match[1]);
	if (this.info.method === -1) {
		throw new Error('invalid request method');
	}

	this.info.url = match[2];
	this.info.versionMajor = +match[3];
	this.info.versionMinor = +match[4];
	this.contentLength = 0;
	this.state = 'HEADER';
};

RTSPParser.prototype.RESPONSE_LINE = function () {
	var line = this.consumeLine();
	if (!line) {
		return;
	}

	var match = responseExp.exec(line);
	if (match === null) {
		throw new Error('Parse Error');
	}

	this.info.versionMajor = +match[1];
	this.info.versionMinor = +match[2];
	var statusCode = this.info.statusCode = +match[3];
	this.info.statusMessage = match[4];

	if ((statusCode / 100 | 0) === 1 || statusCode === 204 || statusCode === 304) {
		this.contentLength = 0;
	}
	this.state = 'HEADER';
};

RTSPParser.prototype.HEADER = function () {
	var line = this.consumeLine();
	if (line === undefined) {
		return;
	}

	var info = this.info;
	if (line) {
		this.parseHeader(line, info.headers);
	} else {
		var headers = info.headers;
		for (var i = 0; i < headers.length; i += 2) {
			if (headers[i].toLowerCase() === 'content-length') {
				this.contentLength = +headers[i + 1];
			}
		}

		this.emit('headersComplete', info);

		if (this.contentLength > 0) {
			this.state = 'BODY';
		} else {
			this.emit('messageComplete');
		}
	}
};

RTSPParser.prototype.BODY = function () {
	var length = Math.min(this.end - this.offset, this.contentLength);
	this.emit('body', this.chunk.slice(this.offset, this.offset + length));
	this.offset += length;
	this.contentLength -= length;

	if (!this.contentLength) {
		this.emit('messageComplete');
	}
};
