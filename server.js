'use strict';

/* requires */

var http = require('http');
var net = require('net');
var streamer = require('../streamer.js');
var fs = require('fs');
var osc = require('osc-min');
var udp = require('dgram');




/* global variables */
var casparcg = new net.Socket();

var info_loaded = false;
var connected = false;
var initiated = false;

var videos;
var nextvideo;
var next_videos;
var infochannel;
var new_infochannel;

var playlists;
var cur_stream = 0;

var programme_live = false;
var next_programme = 0;
var cur_infochannel = 0;
var next_infochannel = new Date();

var audio_playing = true;

var config;
var connecting = false;

var silence_vars = [ { 'silent': false, 'silent_since': new Date(), 'warned': false }, { 'silent': false, 'silent_since': new Date(), 'warned': false } ];

var loaded = { 'config': false, 'videos' : false, 'info_channel' : false, 'playlists' : false };





/* functions */

function to_log(message) {
	var currentdate = new Date(); 
	var datetime = currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds();
    console.log(datetime + ": " + message);
}

function to_caspar(message) {
	casparcg.write(message+'\r\n');
	//to_log('TO CASPAR: '+message);
}

function update_information() {
	var fin_videos = false;
	var fin_infochannel = false; 

	http.get(config.url+'/api/videos', function(res) {
		var body = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			body += chunk;
		})
		res.on('end', function(){
			if (loaded.videos == false) videos = JSON.parse(body);
			else  {
				var result = JSON.parse(body);
				var _next_programme = 0;

				for (var i in result.programmering) {
					var curtime = new Date();
					var timestring = curtime.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});

					var i_start = result.programmering[i].start;
					var i_end = result.programmering[i].end;
					
					if (i_end < timestring) {
						_next_programme += 1;
					}
					else if (i_start < timestring) {
						_next_programme += 1;
						if ((programme_live == true && !(videos.programmering[next_programme-1].source == result.programmering[i].source || videos.programmering[next_programme-1].start == result.programmering[i].start)) || programme_live == false) {
							/* TO DO: make programme start at right time using seek command */
							console.log('video should be started halfway because of update: '+result.programmering[i].source+' DEBUG: source same? '+(videos.programmering[next_programme-1].source == result.programmering[i].source)+' start same? '+(videos.programmering[next_programme-1].start == result.programmering[i].start))
							var i_dur = new Date() - new Date(curtime.getFullYear()+'/'+(curtime.getMonth()+1)+'/'+curtime.getDate()+' '+i_start);
							var frames = Math.round(i_dur/1000*25); /* assuming 25 frames for PAL usage. */
							if (result.programmering[i].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+result.programmering[i].source+' 1 "<templatedata>'+JSON.stringify(result.programmering[i].keys).replace(/"/gi, "\\\"")+'</templatedata>"');
							else if (result.programmering[i].host == 'live') to_caspar('PLAY 1-300 "'+result.programmering[i].source+'"');
							else to_caspar('PLAY 1-300 "'+result.programmering[i].host+'/'+result.programmering[i].source+'" SEEK '+frames);
							if (result.programmering[i].audio == false) {
								to_caspar('MIXER 1-10 VOLUME .5 75');
								to_caspar('MIXER 1-300 VOLUME 0 75');
							} else {
								to_caspar('MIXER 1-10 VOLUME 0 75');
								to_caspar('MIXER 1-300 VOLUME 1 75');
							}
							programme_live = true;

							if (result.programmering[_next_programme].host == 'template') to_caspar('CG 1-30 ADD 1 slogo/'+result.programmering[i].source+' 0 "<templatedata>'+JSON.stringify(result.programmering[i].keys).replace(/"/gi, "\\\"")+'</templatedata>"');
							else if (result.programmering[next_programme].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+result.programmering[next_programme].source+'"');
							else to_caspar('LOADBG 1-300 '+result.programmering[i].host+'/'+result.programmering[i].source);
						}
						videos = result;
						next_programme = _next_programme;
						break;
					}
					else {
						if (videos.programmering[next_programme].source != result.programmering[_next_programme].source) {
							videos = result;
							next_programme = _next_programme;
							if (videos.programmering[i].host == 'template') to_caspar('CG 1-30 ADD 1 slogo/'+videos.programmering[i].source+' 0 "'+JSON.stringify(videos.programmering[i].keys)+'"');
							else if (videos.programmering[next_programme].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+videos.programmering[next_programme].source+'"');
							else to_caspar('LOADBG 1-300 "'+videos.programmering[i].host+'/'+videos.programmering[i].source+'"');
						} else {
							videos = result;
							next_programme = _next_programme;
						}
						break;
					}
				}
			}
			loaded.videos = true;
		})
	});

	http.get(config.url+'/api/teksttv', function(res) {
		var body = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			body += chunk;
		})
		res.on('end', function(){
			if (loaded.info_channel == false) { infochannel = JSON.parse(body); }
			else new_infochannel = JSON.parse(body);
			loaded.info_channel = true;
		})
	});

	http.get(config.url+'/api/audiostreams', function(res) {
		var body = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			body += chunk;
		})
		res.on('end', function(){
			if (loaded.playlists == false) playlists = JSON.parse(body);

			var _playlists = JSON.parse(body);
			var _cur_stream = 0;
			var curtime = new Date();
			var timestring = curtime.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});

			for (var i in _playlists.streams) {
				if (playlists.streams[i].end < timestring) {
					_cur_stream += 1;
				}
				else if (_playlists.streams[i].start < timestring) {
					_cur_stream = Number(i);

					if (loaded.playlist == true && _playlists[i].source != playlists[cur_stream].source) {
						streamer.new(_playlists[i].source);
					}
					break;
				}
				else break;
			}
			playlists = _playlists;
			cur_stream = _cur_stream;
			loaded.playlists = true;
		})
	});
}

$('#update').click(function(e){
	e.preventDefault();
	config.url = $('#url_input').val();
	update_information();

	fs.writeFile('./config.json', JSON.stringify(config), function (err) {
	    if (err) {
	    	alert('There has been an error saving your configuration data.');
	    	console.log(err.message);
	    	return;
	    }
	    alert('Configuration saved successfully.')
	});
})

function readConfig() {
	var data = fs.readFileSync('./config.json');

	try {
		config = JSON.parse(data);
		$('#url_input').val(config.url);
		loaded.config = true;
	}
	catch (err) {
		console.log('There has been an error reading your config.')
		console.log(err);
	}
}

function load_next_day() {
	clearInterval(main);
	to_log('Last movie of the day was loaded');

	var int_1;
	var int_2;

	var next_day = new Date();
	next_day.setDate(next_day.getDate() + 1)
	next_day = next_day.toDateString();

	var finish_day = function(){
		var cur_date = new Date();
		var timestring = cur_date.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});
		//console.log(videos.programmering[next_programme-1].end);

		/* Scheduled programming */
		/* should current programme be ended? */
		if (programme_live == true && videos.programmering[next_programme-1].end < timestring) {
			to_caspar('STOP 1-300');
			to_log('video was stopped');
			if (videos.programmering.length == next_programme) {
				clearInterval(int_1);
				programme_live == false;
				if (videos.programmering[next_programme-1].audio == 'true') {
					to_caspar('MIXER 1-10 VOLUME .5 75');
					to_caspar('MIXER 1-300 VOLUME 0 0');
				}
				to_log('last video was stopped. live = false');
				int_2 = setInterval(function(){ wait_for_next_day() }, 10);
			} else {
				/* if next video starts immediately, play immediately */
				if (videos.programmering[next_programme].start == videos.programmering[next_programme-1].end) {
					to_log('playing last video');
					if (videos.programmering[next_programme].host == 'template') to_caspar('SWAP 1-30 1-300\r\nCG 1-300 PLAY 1');
					else if (videos.programmering[next_programme].host == 'live') to_caspar('SWAP 1-50 1-300\r\nMIXER 1-30 VOLUME 1 25');
					else to_caspar('PLAY 1-300');
					if (videos.programmering[next_programme].audio == 'false') { 
						to_caspar('MIXER 1-10 VOLUME .5 75');
						to_caspar('MIXER 1-300 VOLUME 0 0');
						audio_playing = true;
					} else {
						to_caspar('MIXER 1-300 VOLUME 1 0');
					}
					programme_live = true;
					next_programme += 1;
					to_log(next_programme + '(i) == (l)' + videos.programmering.length)
					if (next_videos.programmering[0].host == 'template') to_caspar('CG 1-30 ADD 1 templates/'+next_videos.programmering[0].source+' 0 "'+encodeURIComponent(JSON.stringify(next_videos.programmering[0].keys))+'"');
					if (next_videos.programmering[0].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+next_videos.programmering[0].source+'"');
					else to_caspar('LOADBG 1-300 "'+next_videos.programmering[0].host+'/'+next_videos.programmering[0].source+'"');
				} 
				/* if next video does NOT start reset variable and immediately fade in backgroundaudio */
				else {
					programme_live = false
					audio_playing = true;
					to_caspar('MIXER 1-10 VOLUME .5 75');
					to_caspar('MIXER 1-300 VOLUME 1 0');
				}
			}
		} 
		/* should next programme be started? */
		else if (videos.programmering.length > next_programme && videos.programmering[next_programme].start < timestring) {
			to_log('video was played unsequentially.')
			if (videos.programmering[next_programme].host == 'template') to_caspar('SWAP 1-30 1-300\r\nCG 1-30 PLAY 1');
			else if (videos.programmering[next_programme].host == 'live') to_caspar('SWAP 1-50 1-300\r\nMIXER 1-30 VOLUME 1 25');
			else to_caspar('PLAY 1-300');
			if (videos.programmering[next_programme].audio == 'false') to_caspar('MIXER 1-300 VOLUME 0 0');
			programme_live = true;
			next_programme += 1;
			if (next_videos.programmering[0].host == 'template') to_caspar('CG 1-30 ADD 1 templates/'+next_videos.programmering[0].source+' 0 "'+encodeURIComponent(JSON.stringify(next_videos.programmering[0].keys))+'"');
			else if (next_videos.programmering[0].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+next_videos.programmering[0].source+'"');
			else to_caspar('LOADBG 1-300 "'+next_videos.programmering[0].host+'/'+next_videos.programmering[0].source+'"');
		}
	}

	var wait_for_next_day = function() {
		var today = new Date();
		today = today.toDateString();

		if (today == next_day) {
			clearInterval(int_2);
			videos = next_videos;
			next_programme = 0;
			if (videos.programmering[0].start == "00:00:00") {
				to_caspar('PLAY 1-300');
				next_programme = 1;
				if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
				else if (videos.programmering[next_programme].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+videos.programmering[next_programme].source+'"');
				else to_caspar('LOADBG 1-300 "'+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source+'"');
			}
			setInterval(function() { scheduled_videos() }, 10);
		}
	}

	http.get(config.url+'/api/videos/next', function(res) {
		var body = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			body += chunk;
		})
		res.on('end', function(){
			next_videos = JSON.parse(body);

			int_1 = setInterval(function() { finish_day() }, 10);
		})
	});
}

$('#connect_bttn').click(function(e){
	e.preventDefault();

	if (connected == false) {
		casparcg.connect(5250, '127.0.0.1', function(){
			to_log('Succesfully connected to CasparCG');

			to_caspar('CLEAR 1');
			if (initiated == false) to_caspar('MIXER 1-10 VOLUME 0 0');

			connected = true;
			$('#connect_bttn').html('Disconnect');
		});
	} else {
		casparcg.end();
		$('#connect_bttn').html('Connect');
		connected = false;
	}
});

casparcg.on('data', function(data){
	var enc = data.toString('utf-8');
	var lines = enc.split('\r\n');
	var cls = false;
	var clips = [];

	for (var i in lines) {
		if (cls == false && lines[i] == "200 CLS OK") {
			cls = true;
		} else if (cls == true) {
			var parts = lines[i].split(' ');
			if (parts.length > 3 && parts[2] == "MOVIE") {
				var clip = {};
				if (parts[0].substring(0, 13) == '"GOOGLE_DRIVE') {
					var host = 'google_drive';
					var source = parts[0].substring(14,parts[0].length-1);
				} else if (parts[0].substring(0,6) == '"LOCAL') {
					var host = 'local';
					var source = parts[0].substring(7,parts[0].length-1);
				}
				clip['host'] = host;
				clip['source'] = source && source.replace('\\',"/");
				var seconds = Math.round(Number(parts[6])*Number(parts[7].split('/')[0])/Number(parts[7].split('/')[1]));
				var h = Math.floor(seconds / 3600);
				var m = Math.floor((seconds - h*3600)/60);
				var s = seconds - h*3600 - m*60;
				clip['duration'] = h+':'+m+':'+s;
				if (host != undefined) {
					clips.push(clip)
				}

				host = undefined;
				source = undefined;
			}
		}
	}

	if (cls) {
		$.post(config.url+'/api/update_sources',{ 'clips': clips});
	}
});

var sock = udp.createSocket("udp4", function(msg, rinfo) {
  var bundle = osc.fromBuffer(msg);

  for (var i in bundle.elements) {
  	var cur_date = new Date();

  	for (var chan in silence_vars) {
  		var act_chan = Number(chan) + 1;
  		if (bundle.elements[i].address == '/channel/1/mixer/audio/'+act_chan+'/dBFS') {
	  		if (bundle.elements[i].args[0].value < -192) {
	  			if (silence_vars[chan].silent == true) {
	  				if (cur_date - 10000 > silence_vars[chan].silent_since && silence_vars[chan].warned == false) {
	  					console.log('WARNING: SILENT FOR 10 SECS ON CHANNEL ' + act_chan);
	  					$.get('http://igoadmin.nl/teksttv/silence/'+act_chan+'/stopped/518A1C4E1CBB13FADD56C3ADC1916');
	  					silence_vars[chan].warned = true;
	  					to_caspar('PLAY 1-10 udp://@127.0.0.1:1234');
	  				}
	  			} else {
	  				silence_vars[chan].silent = true;
	  				silence_vars[chan].silent_since = new Date();
	  			}
	  		} else {
	  			if (silence_vars[chan].silent == true) {
	  				silence_vars[chan].silent = false;
	  				if (silence_vars[chan].warned == true) {
	  					silence_vars[chan].warned = false;
	  					console.log('AUDIO ON CHANNEL '+act_chan+' RESUMED AFTER ' + ((cur_date - silence_vars[chan].silent_since)/1000) )
	  					$.get('http://igoadmin.nl/teksttv/silence/'+act_chan+'/started/518A1C4E1CBB13FADD56C3ADC1916');
	  				}
	  			}
	  		} 
	  	} else if (bundle.elements[i].address == '/channel/1/output/consume_time') {
	  		if (bundle.elements[i].args[0].value > 0.044) {
	  			$.get('http://igoadmin.nl/teksttv/late_frame/'+(parseInt(bundle.elements[i].args[0].value*1000))+'/518A1C4E1CBB13FADD56C3ADC1916');
	  		}
	  	}
  	}
  }
});







/* main thread */

to_log('Slogo Automation is starting');

readConfig();

var update_info = setInterval(function(){
	if (loaded['config'] == false) return;

	update_information();
	clearInterval(update_info);
})

var connect = setInterval(function(){
	for (var i in loaded) {
		if (loaded[i] == false) return;
	}

	clearInterval(connect);
	
	$('#connect_bttn').removeClass('disabled');


	casparcg.connect(5250, '127.0.0.1', function(){
		to_log('Succesfully connected to CasparCG');

		if (playlists.streams.length > 0) { streamer.new(playlists.streams[cur_stream].source); }

		to_caspar('CLEAR 1');
		if (initiated == false) to_caspar('MIXER 1-10 VOLUME 0 0');
		to_caspar('PLAY 1-10 udp://@127.0.0.1:1234');
		to_caspar('CG 1-20 ADD 1 slogo/'+infochannel.platen[1].type+' 0 "<templatedata>'+JSON.stringify(infochannel.platen[1]).replace(/"/gi, "\\\"")+'</templatedata>"');

		sock.bind(6250);

		connected = true;
		$('#connect_bttn').html('Disconnect');
	});	
})

casparcg.on('error',function(){
	console.log('error connecting.. reconnecting');
	connected = false;
	$('#connect_bttn').html('Connect');

	casparcg.connect(5250, '127.0.0.1', function(){
		to_log('Succesfully connected to CasparCG');

		if (playlists.streams.length > 0) { streamer.new(playlists.streams[cur_stream].source); }

		to_caspar('CLEAR 1');
		if (initiated == false) to_caspar('MIXER 1-10 VOLUME 0 0');
		to_caspar('PLAY 1-10 udp://@127.0.0.1:1234');
		to_caspar('CG 1-20 ADD 1 slogo/'+infochannel.platen[1].type+' 0 "<templatedata>'+JSON.stringify(infochannel.platen[1]).replace(/"/gi, "\\\"")+'</templatedata>"');

		connected = true;
		$('#connect_bttn').html('Disconnect');
	});
})

var set_programme_index = setInterval(function(){
	if (connected == false) return;
	clearInterval(set_programme_index);

	for (var i in videos.programmering) {
		var curtime = new Date();
		var timestring = curtime.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});

		var i_start = videos.programmering[i].start;
		var i_end = videos.programmering[i].end;
		
		if (i_end < timestring) {
			next_programme += 1;
		}
		else if (i_start < timestring) {
			next_programme += 1;

			var i_dur = new Date() - new Date(curtime.getFullYear()+'/'+(curtime.getMonth()+1)+'/'+curtime.getDate()+' '+i_start);
			var frames = Math.round(i_dur/1000*25); /* assuming 25 frames for PAL usage. */

			if (videos.programmering[i].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[i].source+' 1 "'+JSON.stringify(videos.programmering[i].keys)+'"');
			else if (videos.programmering[i].host == 'live') to_caspar('PLAY 1-300 "'+videos.programmering[i].source+'"');
			else to_caspar('PLAY 1-300 "'+videos.programmering[i].host+'/'+videos.programmering[i].source+'" SEEK '+frames);
			if (videos.programmering[i].audio == false) { 
				to_caspar('MIXER 1-10 VOLUME .5 75');
				to_caspar('MIXER 1-300 VOLUME 0 0');
			}
			programme_live = true;
			initiated = true;
			break;
		}
		else {
			initiated = true;
			break;
		}
	}
	if (programme_live == false) to_caspar('MIXER 1-10 VOLUME .5 75');
	to_log('next_programme is ' + videos.programmering[next_programme].source + ' @ ' + videos.programmering[next_programme].start);
	if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-30 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
	else if (videos.programmering[next_programme].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+videos.programmering[next_programme].source+'"');
	else to_caspar('LOADBG 1-300 "'+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source+'"');
},10)

function scheduled_videos() {
	if (initiated == false || connected == false) return;
	var cur_date = new Date();
	var timestring = cur_date.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});
	//console.log(videos.programmering[next_programme-1].end);

	if (next_programme == 0) {
		if (videos.programmering[next_programme].start < timestring) {
			if (videos.programmering[next_programme].host == 'template') to_caspar('SWAP 1-30 1-300\r\nCG 1-30 PLAY 1');
			else if (videos.programmering[next_programme].host == 'live') to_caspar('SWAP 1-50 1-300\r\nMIXER 1-30 VOLUME 1 25');
			else to_caspar('PLAY 1-300');
			if (videos.programmering[next_programme].audio == 'false') to_caspar('MIXER 1-300 VOLUME 0 0');
			programme_live = true;
			next_programme += 1;
			if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
			else if (videos.programmering[next_programme].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+videos.programmering[next_programme].source+'"');
			else to_caspar('LOADBG 1-300 "'+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source+'"');
			if (next_programme+1 == videos.programmering.length) load_next_day();
		}
		/* prevent execution of logic for when next programme > 0 */
		return;	
	}

	/* Scheduled programming */
	/* should background audio be muted? */
	var mute_time = new Date(cur_date.getTime() + 3*1000);
	var mute_timestring = mute_time.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});
	if (videos.programmering[next_programme].start < mute_timestring && videos.programmering[next_programme].audio == 'true' && audio_playing == true) {
		to_caspar('MIXER 1-10 VOLUME 0 75');
		audio_playing = false;
	}
	/* should current programme be ended? */
	if (programme_live == true && videos.programmering[next_programme-1].end < timestring) {
		to_caspar('STOP 1-300');
		/* if next video starts immediately, play immediately */
		if (videos.programmering[next_programme].start == videos.programmering[next_programme-1].end) {
			if (videos.programmering[next_programme].host == 'template') to_caspar('SWAP 1-30 1-300\r\nCG 1-300 PLAY 1');
			else if (videos.programmering[next_programme].host == 'live') to_caspar('SWAP 1-50 1-300\r\nMIXER 1-30 VOLUME 1 25');
			else to_caspar('PLAY 1-300');
			if (videos.programmering[next_programme].audio == 'false') { 
				to_caspar('MIXER 1-10 VOLUME .5 75');
				to_caspar('MIXER 1-300 VOLUME 0 0');
				audio_playing = true;
			} else {
				to_caspar('MIXER 1-300 VOLUME 1 0');
			}
			programme_live = true;
			next_programme += 1;
			if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-30 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
			else if (videos.programmering[next_programme].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+videos.programmering[next_programme].source+'"');
			else to_caspar('LOADBG 1-300 "'+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source+'"');
			if (next_programme+1 == videos.programmering.length) load_next_day();
		} 
		/* if next video does NOT start reset variable and immediately fade in backgroundaudio */
		else {
			programme_live = false
			audio_playing = true;
			to_caspar('MIXER 1-10 VOLUME .5 75');
			to_caspar('MIXER 1-300 VOLUME 1 0');
		}
	} 
	/* should next programme be started? */
	else if (videos.programmering[next_programme].start < timestring) {
		if (videos.programmering[next_programme].host == 'template') to_caspar('SWAP 1-30 1-300\r\nCG 1-30 PLAY 1');
		else if (videos.programmering[next_programme].host == 'live') to_caspar('SWAP 1-50 1-300\r\nMIXER 1-30 VOLUME 1 25');
		else to_caspar('PLAY 1-300');
		if (videos.programmering[next_programme].audio == 'false') to_caspar('MIXER 1-300 VOLUME 0 0');
		programme_live = true;
		next_programme += 1;
		if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
		else if (videos.programmering[next_programme].host == 'live') to_caspar('MIXER 1-50 VOLUME 0 0\r\nPLAY 1-50 "'+videos.programmering[next_programme].source+'"');
		else to_caspar('LOADBG 1-300 "'+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source+'"');
		if (next_programme+1 == videos.programmering.length) load_next_day();
	}
}

function info_channel() {
	if (connected == true && programme_live == false) {
		var cur_date = new Date();

		if (cur_date > next_infochannel) {
			/* displaying next slide */
			to_caspar('SWAP 1-20 1-100');
			to_caspar('CG 1-100 PLAY 1');
			next_infochannel = new Date(Date.now() + 1000*infochannel.platen[cur_infochannel].dur);
			if (cur_infochannel == infochannel.platen.length-1) { infochannel = new_infochannel; cur_infochannel = 0; }
			else cur_infochannel += 1;
			/* loading new slide */
			to_caspar('CLEAR 1-20');
			to_caspar('CG 1-20 ADD 1 slogo/'+infochannel.platen[cur_infochannel].type+' 0 "<templatedata>'+JSON.stringify(infochannel.platen[cur_infochannel]).replace(/"/gi, "\\\"")+'</templatedata>"');
			//to_log('next template at ' + next_infochannel);
		}
	}
}

function streams() {
	var cur_date = new Date();
	var timestring = cur_date.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});
	
	if (initiated == true && playlists.streams.length > 0 && timestring > playlists.streams[cur_stream].end) {
		cur_stream += 1;
		console.log('next playlist: ' + cur_stream);
		streamer.new(playlists.streams[cur_stream].source);
		if (cur_stream == playlists.streams.length-1) {
			clearInterval(stream_interval);

			http.get(config.url+'/api/audiostreams/next', function(res) {
				var body = '';
				res.setEncoding('utf8');
				res.on('data', function(chunk) {
					body += chunk;
				})
				res.on('end', function(){
					next_videos = JSON.parse(body);

					int_1 = setInterval(function() { finish_day() }, 10);
				})
			});
		}
	}
}

function upstream() {
	$.get('https://api.streamup.com/v1/channels/slogo', function(data){
		if (data['channel']['live'] == false) {
			to_caspar('REMOVE 1 STREAM');
			to_caspar('ADD 1 STREAM "rtmp://live.streamup.com/app/qZ6GY6S-kEzzN8Pc4AYV" -vcodec libx264 -preset veryfast -vf yadif=0:-1:0,format=pix_fmts=yuv420p -tune zerolatency bitrate=1500:vbv-maxrate=2000 -strict -2 -acodec aac -b:a 96k -af aresample=44100 -f flv')
			$.get('http://igoadmin.nl/teksttv/restart_stream/started/518A1C4E1CBB13FADD56C3ADC1916');
		}	
	})
}

var main = setInterval(function(){ scheduled_videos() }, 10);

setInterval(function(){ info_channel(); }, 10);

//var stream_interval = setInterval(function(){ streams(); }, 100);

setInterval(function(){ upstream(); }, 60*1000);

var updater = setInterval(function(){ update_information() }, 60000);

//var source_updater = setInterval(function(){ if (connected == true) casparcg.write('CLS\r\n') }, 2000);




