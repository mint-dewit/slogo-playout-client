var fs = require('fs');
var xml2js = require('xml2js');
var ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath('./ffmpeg/ffmpeg.exe');
ffmpeg.setFfprobePath('./ffmpeg/ffprobe.exe');

var cur_playlist;
var cur_playing = false;
var cur_end = new Date();
var cur_song = -1;
var cur_streaming = false;

var new_playlist;
var new_playlist_loaded = false;

function load(playlist) {
	console.log(playlist);

	if (cur_playing == false) {
		cur_playlist = playlist;
		cur_playing = true;
		if (!cur_playlist[0].hasOwnProperty('duration')) {
			cur_song = 0;
			cur_streaming = true;
			console.log('PLAY STREAM: ' + decodeURI(cur_playlist[cur_song].location[0]));
			var command = ffmpeg().input(cur_playlist[cur_song].location[0]).output('udp://127.0.0.1:1234').outputOptions('-f mpegts').run();
		}
	} else {
		new_playlist = playlist;
		new_playlist_loaded = true;
	}
}

exports.new = function(location) {
	var parser = new xml2js.Parser();
	fs.readFile(location, function(err, data) {
	    parser.parseString(data, function (err, result) {
	        load(result.playlist.trackList[0].track);
	        console.log('Done parsing');
	    });
	});
}


setInterval(function(){
	var cur_date = new Date();
	if (cur_playing == true) {
		/* IF PLAYLIST IS NOT A STREAM */
		if (cur_streaming == false) {
			if (cur_date > cur_end) {
				/* NO NEW PLAYLIST, PLAY NEXT SONG */
				if (new_playlist_loaded == false) {
					if (cur_song == cur_playlist.length-1) {
						cur_song = 0;
					} 
					else cur_song += 1;
					console.log('PLAY: ' + decodeURI(cur_playlist[cur_song].location[0].substr(8)) + ' NO'+cur_song);
					var command = ffmpeg().input(decodeURI(cur_playlist[cur_song].location[0].substr(8))).inputOptions('-re').output('udp://127.0.0.1:1234').outputOptions('-f mpegts').run();
					cur_end = new Date(cur_date.getTime() + Number(cur_playlist[cur_song].duration[0]));
				}
				/* IF THERE IS A NEW PLAYLIST */
				else {
					new_playlist_loaded = false;
					cur_playlist = new_playlist;
					/* PLYLIST CONSISTS OF SONGS */
					if (cur_playlist[0].hasOwnProperty('duration')) {
						cur_song = 0;
						console.log('PLAY: ' + decodeURI(cur_playlist[cur_song].location[0].substr(8)));
						var command = ffmpeg().input(decodeURI(cur_playlist[cur_song].location[0].substr(8))).inputOptions('-re').output('udp://127.0.0.1:1234').outputOptions('-f mpegts').run();
						cur_end = new Date(cur_date.getTime() + Number(cur_playlist[cur_song].duration[0]));
					}
					/* PLAYLIST IS A STREAM */
					else {
						cur_song = 0;
						cur_streaming = true;
						console.log('PLAY STREAM: ' + decodeURI(cur_playlist[cur_song].location[0]));
						var command = ffmpeg().input(cur_playlist[cur_song].location[0]).output('udp://127.0.0.1:1234').outputOptions('-f mpegts').run();
					}
				}
			}
		}
		/* PLAYLIST IS A STREAM */
		else if (new_playlist_loaded == true) {
			console.log('stop??');
			command.kill();
			new_playlist_loaded = false;
			cur_playlist = new_playlist;
			/* PLYLIST CONSISTS OF SONGS */
			if (cur_playlist[0].hasOwnProperty('duration') == true) {
				cur_song = 0;
				cur_streaming = false;
				console.log('PLAY: ' + decodeURI(cur_playlist[cur_song].location[0].substr(8)));
				var command = ffmpeg().input(decodeURI(cur_playlist[cur_song].location[0].substr(8))).inputOptions('-re').output('udp://127.0.0.1:1234').outputOptions('-f mpegts').run();
				cur_end = new Date(cur_date.getTime() + Number(cur_playlist[cur_song].duration[0]));
			}
			/* PLAYLIST IS A STREAM */
			else {
				console.log('PLAY: ' + decodeURI(cur_playlist[cur_song].location[0].substr(8)));
				var command = ffmpeg().input(cur_playlist[cur_song].location[0]).output('udp://127.0.0.1:1234').outputOptions('-f mpegts').run();
			}
}
	}
},5);