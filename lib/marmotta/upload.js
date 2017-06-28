
// native imports
const fs = require('fs');

// third-party includes
const async = require('async');
const classer = require('classer');
const filesize = require('filesize');
const request = require('request');

//
const local = classer.logger('gdb_ttl');

const P_URL_SPARQL = 'http://localhost:8080';
const S_URL_UPLOAD = '/import/upload';

async.eachSeries(process.argv.slice(2), (s_ttl_file, fk_file) => {
	//
	let h_ttl_info = fs.statSync(s_ttl_file);
	let n_ttl_bytes = h_ttl_info.size;
	local.info(`uploading ${s_ttl_file}; ${filesize(n_ttl_bytes, {standard: 'iec'})}`);
	console.time('upload');

	// pipe read stream from file to server over http
	fs.createReadStream(s_ttl_file)
		.pipe(request.post(P_URL_SPARQL+S_URL_UPLOAD, {
			headers: {
				'Content-Type': 'text/turtle',
			},
		}, (e_upload, d_response, s_body) => {
			console.timeEnd('upload');

			if(e_upload) {
				local.error(e_upload+' : '+s_body);
			}
			else if(200 === d_response.statusCode) {
				local.good(s_body);
			}
			else {
				local.warn(s_body);
			}

			// next file
			fk_file();
		}));
}, () => {
	local.good('all done');
});
