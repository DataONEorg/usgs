
// native imports
const fs = require('fs');
const rl = require('readline');
const cp = require('child_process');

// third-party includes
const async = require('async');
const classer = require('classer');
const filesize = require('filesize');

// local classes
const psql_config = require('./psql-config');

//
const local = classer.logger('importer');

const S_DATABASE_URL = `jdbc:${psql_config.short_url}?prepareThreshold=3`;
const S_DATABASE_USER = psql_config.user;
const S_DATABASE_PWD = psql_config.password;

const P_MARMOTTA_LOADER_KIWI_WD = './ext/marmotta/loader/marmotta-loader-kiwi/';
const P_MARMOTTA_LOADER_KIWI_JAR = './target/marmotta-loader-kiwi-3.4.0-SNAPSHOT.jar';

const R_PROGRESS = /(imported \d+\.\d+ K triples);/;
const R_WARN = /^\s*[\d:.]*\s*WARN/;

async.eachSeries(process.argv.slice(2), (s_ttl_file, fk_file) => {
	//
	let h_ttl_info = fs.statSync(s_ttl_file);
	let n_ttl_bytes = h_ttl_info.size;
	local.info(`importing ${s_ttl_file}; ${filesize(n_ttl_bytes, {standard: 'iec'})}`);
	console.time('import');

	// encountering errors
	let b_errors = false;

	// pipe read stream from file to server over http
	let u_loader_kiwi = cp.spawn('java', [
		'-jar', P_MARMOTTA_LOADER_KIWI_WD+P_MARMOTTA_LOADER_KIWI_JAR,
		'-C', S_DATABASE_URL,
		'-U', S_DATABASE_USER,
		'-W', S_DATABASE_PWD,
		'-t', 'text/turtle',
		'-f', s_ttl_file,
		'-s', './scrap/statistics.png',
	]);

	// capture stderr
	u_loader_kiwi.stderr.setEncoding('utf8');
	u_loader_kiwi.stderr.on('data', (s_data) => {
		b_errors = true;
		local.warn(s_data);
	});

	// read from child process' stdout
	u_loader_kiwi.stdout.setEncoding('utf8');
	u_loader_kiwi.stdout.on('data', (s_data) => {
		// extract progress from statistics message
		let m_progress = R_PROGRESS.exec(s_data);
		if(m_progress) {
			rl.clearLine(process.stdout, 0);
			rl.cursorTo(process.stdout, 0);
			process.stdout.write('\t'+m_progress[1]+'...');
		}
		else if(R_WARN.test(s_data)) {
			local.warn(s_data);
		}
	});

	// once child process exits
	u_loader_kiwi.on('exit', () => {
		rl.clearLine(process.stdout, 0);
		rl.cursorTo(process.stdout, 0);

		if(b_errors) {
			local.error('encountered error while importing');
		}
		else {
			local.good('import of content successful');
		}

		// next file
		fk_file();
	});
}, () => {
	local.good('all done');
});
