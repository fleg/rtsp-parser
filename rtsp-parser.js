'use strict';

var assert = require('assert');

exports.RTSPParser = RTSPParser;

function RTSPParser(type) {
	assert.ok(type === RTSPParser.REQUEST || type === RTSPParser.RESPONSE);
	this.type = type;
	this.state = type + '_LINE';
	this.info = {
		headers: []
	};
	this.trailers = [];
	this.line = '';
	this.connection = '';
	this.headerSize = 0;
	this.body_bytes = null;
	this.isUserCall = false;
}
RTSPParser.REQUEST = 'REQUEST';
RTSPParser.RESPONSE = 'RESPONSE';
var kOnHeaders = RTSPParser.kOnHeaders = 0;
var kOnHeadersComplete = RTSPParser.kOnHeadersComplete = 1;
var kOnBody = RTSPParser.kOnBody = 2;
var kOnMessageComplete = RTSPParser.kOnMessageComplete = 3;
var kOnExecute = RTSPParser.kOnExecute = 4

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

RTSPParser.prototype.reinitialize = RTSPParser;

var maxHeaderSize = 80 * 1024;
var headerState = {
	REQUEST_LINE: true,
	RESPONSE_LINE: true,
	HEADER: true
};
RTSPParser.prototype.execute = function (chunk) {
	if (!(this instanceof RTSPParser)) {
		throw new TypeError('not a RTSPParser');
	}

	this.chunk = chunk;
	this.offset = 0;
	this.end = chunk.length;
	try {
		while (this.offset < this.end) {
			if (this[this.state]()) {
				break;
			}
		}
	} catch (err) {
		if (this.isUserCall) {
			throw err;
		}
		return err;
	}

	this.chunk = null;

	if (headerState[this.state]) {
		this.headerSize += this.offset;
		if (this.headerSize > maxHeaderSize) {
			return new Error('max header size exceeded');
		}
	}
	return this.offset;
};

var stateFinishAllowed = {
	REQUEST_LINE: true,
	RESPONSE_LINE: true,
	BODY_RAW: true
};

RTSPParser.prototype.finish = function () {
	if (!stateFinishAllowed[this.state]) {
		return new Error('invalid state for EOF');
	}
	if (this.state === 'BODY_RAW') {
		this.userCall()(this[kOnMessageComplete]());
	}
};


RTSPParser.prototype.userCall = function () {
	this.isUserCall = true;
	var self = this;
	return function (ret) {
		self.isUserCall = false;
		return ret;
	};
};

RTSPParser.prototype.nextRequest = function () {
	this.userCall()(this[kOnMessageComplete]());
	this.reinitialize(this.type);
};

RTSPParser.prototype.consumeLine = function () {
	var end = this.end,
			chunk = this.chunk;
	for (var i = this.offset; i < end; i++) {
		if (chunk[i] === 0x0a) { // \n
			var line = this.line + chunk.toString('ascii', this.offset, i);
			if (line.charAt(line.length - 1) === '\r') {
				line = line.substr(0, line.length - 1);
			}
			this.line = '';
			this.offset = i + 1;
			return line;
		}
	}
	//line split over multiple chunks
	this.line += chunk.toString('ascii', this.offset, this.end);
	this.offset = this.end;
};

var headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
var headerContinueExp = /^[ \t]+(.*[^ \t])/;
RTSPParser.prototype.parseHeader = function (line, headers) {
	var match = headerExp.exec(line);
	var k = match && match[1];
	if (k) { // skip empty string (malformed header)
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

var requestExp = /^([A-Z-]+) ([^ ]+) RTSP\/(\d)\.(\d)$/;
RTSPParser.prototype.REQUEST_LINE = function () {
	var line = this.consumeLine();
	if (!line) {
		return;
	}
	var match = requestExp.exec(line);
	if (match === null) {
		var err = new Error('Parse Error');
		err.code = 'HPE_INVALID_CONSTANT';
		throw err;
	}
	this.info.method = methods.indexOf(match[1]);
	if (this.info.method === -1) {
		throw new Error('invalid request method');
	}

	this.info.url = match[2];
	this.info.versionMajor = +match[3];
	this.info.versionMinor = +match[4];
	this.body_bytes = 0;
	this.state = 'HEADER';
};

var responseExp = /^RTSP\/(\d)\.(\d) (\d{3}) ?(.*)$/;
RTSPParser.prototype.RESPONSE_LINE = function () {
	var line = this.consumeLine();
	if (!line) {
		return;
	}
	var match = responseExp.exec(line);
	if (match === null) {
		var err = new Error('Parse Error');
		err.code = 'HPE_INVALID_CONSTANT';
		throw err;
	}
	this.info.versionMajor = +match[1];
	this.info.versionMinor = +match[2];
	var statusCode = this.info.statusCode = +match[3];
	this.info.statusMessage = match[4];
	// Implied zero length.
	if ((statusCode / 100 | 0) === 1 || statusCode === 204 || statusCode === 304) {
		this.body_bytes = 0;
	}
	this.state = 'HEADER';
};

// RTSPParser.prototype.shouldKeepAlive = function () {
// 	if (this.info.versionMajor > 0 && this.info.versionMinor > 0) {
// 		if (this.connection.indexOf('close') !== -1) {
// 			return false;
// 		}
// 	} else if (this.connection.indexOf('keep-alive') === -1) {
// 		return false;
// 	}

// 	return false;
// };

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
			switch (headers[i].toLowerCase()) {
				case 'content-length':
					this.body_bytes = +headers[i + 1];
					break;
				case 'connection':
					this.connection += headers[i + 1].toLowerCase();
					break;
			}
		}

		// info.shouldKeepAlive = this.shouldKeepAlive();
		this.body_bytes = this.body_bytes || 0;

		this.userCall()(this[kOnHeadersComplete](info.versionMajor,
				info.versionMinor, info.headers, info.method, info.url, info.statusCode,
				info.statusMessage));


		if (this.body_bytes === 0) {
			this.state = 'BODY_RAW';
		} else {
			this.state = 'BODY_SIZED';
		}
	}
};

RTSPParser.prototype.BODY_RAW = function () {
	var length = this.end - this.offset;
	this.userCall()(this[kOnBody](this.chunk, this.offset, length));
	this.offset = this.end;
};

RTSPParser.prototype.BODY_SIZED = function () {
	var length = Math.min(this.end - this.offset, this.body_bytes);
	this.userCall()(this[kOnBody](this.chunk, this.offset, length));
	this.offset += length;
	this.body_bytes -= length;
	if (!this.body_bytes) {
		this.nextRequest();
	}
};

