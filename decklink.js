'use strict';

/* requires */

var http = require('http');
var net = require('net');




/* global variables */
var casparcg = new net.Socket();

var info_loaded = false;
var connected = false;
var initiated = false;

var videos;

var programme_live = false;
var next_programme = 0;

var decklink_device = 1;





/* functions */

function to_log(message) {
	var currentdate = new Date(); 
	var datetime = currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds();
    console.log(datetime + ": " + message);
}

function to_caspar(message) {
	//casparcg.write(message+'\r\n');
	to_log('TO CASPAR: '+message);
}

function update_information() {
	var fin_videos = false;
	var fin_infochannel = false; 

	http.get('http://text-tv.rtvslogo.nl/api/videos', function(res) {
		var body = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			body += chunk;
		})
		res.on('end', function(){
			if (info_loaded == false) videos = JSON.parse(body);
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
							var i_dur = new Date() - new Date(curtime.getFullYear()+'/'+(curtime.getMonth()+1)+'/'+curtime.getDate()+' '+i_start);
							var frames = Math.round(i_dur/1000*25); /* assuming 25 frames for PAL usage. */
							if (videos.programmering[i].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[i].source+' 1 "'+JSON.stringify(videos.programmering[i].keys)+'"');
							else to_caspar('PLAY 1-300 '+videos.programmering[i].host+'/'+videos.programmering[i].source+' SEEK '+frames);
							if (videos.programmering[i].audio == false) {
								to_caspar('MIXER 1-10 VOLUME 1 75');
								to_caspar('MIXER 1-300 VOLUME 0 0');
							}
							programme_live = true;
							to_log('Video Playlist was changed, and does not correspond to current programme. Next programme index: ' + next_programme);
						}
						videos = result;
						next_programme = _next_programme;
						break;
					}
					else {
						videos = result;
						next_programme = _next_programme;
						break;
					}
				}
			}
			info_loaded = true; 
			fin_infochannel = false;
			to_log('INFORMATION UPDATED');
		})
	});
}







/* main thread */

to_log('Slogo Automation is starting');

update_information();

var connect = setInterval(function(){
	if (info_loaded == false) return;
	clearInterval(connect);

	//casparcg.connect(5250, '127.0.0.1', function(){
		to_log('Succesfully connected to CasparCG');
		to_caspar('CLEAR 1');
		to_caspar('MIXER 1-100 VOLUME 0 0');
		to_caspar('PLAY 1-100 DECKLINK ' + decklink_device);
		connected = true;
	//});
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
			else to_caspar('PLAY 1-300 '+videos.programmering[i].host+'/'+videos.programmering[i].source+' SEEK '+frames);
			if (videos.programmering[i].audio == false) { 
				to_caspar('MIXER 1-100 VOLUME 1 75');
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
	if (programme_live == false) to_caspar('MIXER 1-10 VOLUME 1 75');
	to_log('next_programme is ' + videos.programmering[next_programme].source + ' @ ' + videos.programmering[next_programme].start);
	if (videos.programmering[i].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
	else to_caspar('LOADBG 1-300 '+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source);
},10)

var main = setInterval(function(){
	if (initiated == false ) return;
	var cur_date = new Date();
	var timestring = cur_date.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});
	//console.log(videos.programmering[next_programme-1].end);

	/* Scheduled programming */
	/* should background audio be muted? */
	var mute_time = new Date(cur_date.getTime() + 3*1000);
	var mute_timestring = mute_time.toLocaleTimeString({hour12:false, hour: '2-digit', minute:'2-digit', second:'2-digit'});
	if (videos.programmering[next_programme].start < mute_timestring && videos.programmering[next_programme].audio == 'true') {
		to_caspar('MIXER 1-100 VOLUME 0 75');
	}
	/* should current programme be ended? */
	if (programme_live == true && videos.programmering[next_programme-1].end < timestring) {
		to_caspar('STOP 1-300');
		/* if next video starts immediately, play immediately */
		if (videos.programmering[next_programme].start == videos.programmering[next_programme-1].end) {
			if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-300 PLAY 1');
			else to_caspar('PLAY 1-300');
			if (videos.programmering[next_programme].audio == 'false') { 
				to_caspar('MIXER 1-100 VOLUME 1 75');
				to_caspar('MIXER 1-300 VOLUME 0 0');
			} else {
				to_caspar('MIXER 1-300 VOLUME 1 0');
			}
			programme_live = true;
			next_programme += 1;
			if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
			else to_caspar('LOADBG 1-300 '+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source);
		} 
		/* if next video does NOT start reset variable and immediately fade in backgroundaudio */
		else {
			programme_live = false
			to_caspar('MIXER 1-100 VOLUME 1 75');
			to_caspar('MIXER 1-300 VOLUME 1 0');
		}
	} 
	/* should next programme be started? */
	else if (videos.programmering[next_programme].start < timestring) {
		if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-300 PLAY 1');
		else to_caspar('PLAY 1-300');
		if (videos.programmering[next_programme].audio == 'false') to_caspar('MIXER 1-300 VOLUME 0 0');
		programme_live = true;
		next_programme += 1;
		if (videos.programmering[next_programme].host == 'template') to_caspar('CG 1-300 ADD 1 slogo/'+videos.programmering[next_programme].source+' 0 "'+encodeURIComponent(JSON.stringify(videos.programmering[next_programme].keys))+'"');
		else to_caspar('LOADBG 1-300 '+videos.programmering[next_programme].host+'/'+videos.programmering[next_programme].source);
	}
}, 10);

var updater = setInterval(function(){ update_information() }, 60000);






/* TO DO LIST:
	
	x scheduled templates!
	x build solution for when playlist changes during playback
	x integrate vlc playback and audio muting
	x integrate caspar amcp controls
	x on start up, immediately play programme when needed.
	- integrate vlc controls via tcp
	- integrate realtime controls (WEBSITE)

*/



