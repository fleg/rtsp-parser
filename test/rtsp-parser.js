'use strict';

var expect = require('expect.js'),
	RTSPParser = require('../rtsp-parser').RTSPParser,
	_ = require('underscore');

describe('RTSPParser test', function() {
	describe('Common', function() {
		it('create RTSPParser with bad type', function() {
			expect(function() {
				new RTSPParser();
			}).to.throwException(/bad type/);
		});

		it('call RTSPParser without new', function() {
			var rtspParser = RTSPParser(RTSPParser.RESPONSE);
			expect(rtspParser).to.be.a(RTSPParser);
		});
	});

	describe('Parsing', function() {
		var checkHeaders = function(info, expected) {
			expect(info).to.an('object');
			expect(info.method).to.equal(expected.method);
			expect(info.url).to.equal(expected.url);
			expect(info.versionMajor).to.equal(expected.versionMajor);
			expect(info.versionMinor).to.equal(expected.versionMinor);
			expect(info.headers).to.be.an('array');
			_(info.headers).each(function(header, index) {
				expect(header).to.equal(expected.headers[index]);
			});
		};

		describe('Request', function() {
			it('simple case', function(done) {
				var headers = new Buffer(
					'444553435249424520727473703a2f2f3139322e3136382e312e343020525453' +
					'502f312e300d0a435365713a20320d0a4163636570743a206170706c69636174' +
					'696f6e2f7364700d0a557365722d4167656e743a204c6962564c432f322e302e' +
					'3620284c4956453535352053747265616d696e67204d65646961207632303132' +
					'2e31322e3138290d0a0d0a', 'hex'
				);

				var rtspParser = RTSPParser(RTSPParser.REQUEST);

				var errorFired, bodyFired, headersCompleteFired;

				rtspParser.on('error', function(err) {
					errorFired = true;
				});

				rtspParser.on('body', function(chunk) {
					bodyFired = true;
				});

				rtspParser.on('headersComplete', function(info) {
					headersCompleteFired = true;
					checkHeaders(info, {
						method: 'DESCRIBE',
						url: 'rtsp://192.168.1.40',
						versionMajor: 1,
						versionMinor: 0,
						headers: [
							'CSeq', '2',
							'Accept', 'application/sdp',
							'User-Agent', 'LibVLC/2.0.6 (LIVE555 Streaming Media v2012.12.18)'
						]
					});
				});

				rtspParser.on('messageComplete', function() {
					expect(errorFired).not.ok();
					expect(bodyFired).not.ok();
					expect(headersCompleteFired).to.be.ok();
					done();
				});

				rtspParser.write(headers);
			});
		});

		describe('Response', function() {
			it('simple case, headers only', function(done) {
				var headers = new Buffer(
					'525453502f312e3020323030204f4b0d0a435365713a20310d0a536572766572' +
					'3a2052747052747370466c7965720d0a5075626c69633a204f5054494f4e532c' +
					'2044455343524942452c205345545f504152414d455445522c2053455455502c' +
					'20504c41592c2050415553452c2054454152444f574e0d0a436f6e74656e742d' +
					'4c656e6774683a20300d0a43616368652d436f6e74726f6c3a206e6f2d636163' +
					'68650d0a0d0a', 'hex'
				);

				var rtspParser = RTSPParser(RTSPParser.RESPONSE);

				var errorFired, bodyFired, headersCompleteFired;

				rtspParser.on('error', function(err) {
					errorFired = true;
				});

				rtspParser.on('body', function(chunk) {
					bodyFired = true;
				});

				rtspParser.on('headersComplete', function(info) {
					headersCompleteFired = true;
					checkHeaders(info, {
						statusCode: 200,
						statusMessage: 'OK',
						versionMajor: 1,
						versionMinor: 0,
						headers: [
							'CSeq', '1',
							'Server', 'RtpRtspFlyer',
							'Public', 'OPTIONS, DESCRIBE, SET_PARAMETER, SETUP, PLAY, PAUSE, TEARDOWN',
							'Content-Length', '0',
							'Cache-Control', 'no-cache'
						]
					});
				});

				rtspParser.on('messageComplete', function() {
					expect(errorFired).not.ok();
					expect(bodyFired).not.ok();
					expect(headersCompleteFired).to.be.ok();
					done();
				});

				rtspParser.write(headers);
			});

			it('simple case, with body', function(done) {
				var headers = new Buffer(
					'525453502f312e3020323030204f4b0d0a435365713a20320d0a536572766572' +
					'3a2052747052747370466c7965720d0a436f6e74656e742d547970653a206170' +
					'706c69636174696f6e2f7364700d0a436f6e74656e742d4c656e6774683a2033' +
					'34310d0a43616368652d436f6e74726f6c3a206e6f2d63616368650d0a0d0a', 'hex'
				);

				var body = new Buffer(
					'763d300d0a6f3d52545350202d32383630313436393037363834303833353033' +
					'202d3238363031343639303736383338393838323020494e2049503420313932' +
					'2e3136382e312e34300d0a733d52545350205365727665720d0a743d3020300d' +
					'0a613d746f6f6c3a2052747052747370466c7965720d0a613d72616e67653a6e' +
					'70743d302d0d0a6d3d766964656f2030205254502f4156502039360d0a633d49' +
					'4e2049503420302e302e302e300d0a613d7274706d61703a393620483236342f' +
					'39303030300d0a613d666d74703a3936207061636b6574697a6174696f6e2d6d' +
					'6f64653d313b70726f66696c652d6c6576656c2d69643d3432303032383b7370' +
					'726f702d706172616d657465722d736574733d5a3049414b505143674333492c' +
					'614d343867413d3d0d0a613d636f6e74726f6c3a727473703a2f2f3139322e31' +
					'36382e312e34302f747261636b49443d300d0a0d0a', 'hex'
				);

				var rtspParser = RTSPParser(RTSPParser.RESPONSE);

				var errorFired, bodyFired, headersCompleteFired;

				rtspParser.on('error', function(err) {
					errorFired = true;
				});

				rtspParser.on('body', function(chunk) {
					bodyFired = true;

					expect(chunk.toString()).to.equal(
						'v=0\r\n' +
						'o=RTSP -2860146907684083503 -2860146907683898820 IN IP4 192.168.1.40\r\n' +
						's=RTSP Server\r\n' +
						't=0 0\r\n' +
						'a=tool: RtpRtspFlyer\r\n' +
						'a=range:npt=0-\r\n' +
						'm=video 0 RTP/AVP 96\r\n' +
						'c=IN IP4 0.0.0.0\r\n' +
						'a=rtpmap:96 H264/90000\r\n' +
						'a=fmtp:96 packetization-mode=1;profile-level-id=420028;sprop-parameter-sets=Z0IAKPQCgC3I,aM48gA==\r\n' +
						'a=control:rtsp://192.168.1.40/trackID=0\r\n' +
						'\r\n'
					);
				});

				rtspParser.on('headersComplete', function(info) {
					headersCompleteFired = true;
					checkHeaders(info, {
						statusCode: 200,
						statusMessage: 'OK',
						versionMajor: 1,
						versionMinor: 0,
						headers: [
							'CSeq', '2',
							'Server', 'RtpRtspFlyer',
							'Content-Type', 'application/sdp',
							'Content-Length', '341',
							'Cache-Control', 'no-cache'
						]
					});
				});

				rtspParser.on('messageComplete', function() {
					expect(errorFired).not.ok();
					expect(bodyFired).to.be.ok();
					expect(headersCompleteFired).to.be.ok();
					done();
				});

				rtspParser.write(headers);
				rtspParser.write(body);
			});
		});
	});
});
