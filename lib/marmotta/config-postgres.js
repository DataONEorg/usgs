
//
const async = require('async');
const classer = require('classer');
const request = require('request');

const P_HOST = 'http://localhost:8080';

const local = classer.logger('config-postgres');

function set_config(h_config, fk_config) {
	// each config item
	async.eachOfSeries(h_config, (s_value, s_key, fk_item) => {
		// set over http
		request.post(P_HOST+'/config/data/'+s_key, {
			json: [s_value],
		}, (e_config, d_response, s_body) => {
			// response bad
			if(e_config) {
				local.fail(e_config+' : '+s_body);
			}
			// response good
			else if(200 === d_response.statusCode) {
				local.good(`set ${s_key} = ${s_value}`);
			}
			// response not good
			else {
				local.warn(s_body);
			}

			// done with config item
			fk_item();
		});
	}, () => {
		// all done
		fk_config();
	});
}

function set_database(h_db_config, fk_config) {
	let h_data_config = {};
	for(let s_key in h_db_config) {
		h_data_config['database.'+s_key] = h_db_config[s_key];
	}

	set_database(h_data_config, fk_config);
}

set_database({
	type: 'postgres',
	url: 'jdbc:postgresql://localhost/kiwi?prepareThreshold=3',
	user: 'blake_script',
	password: 'pass',
}, () => {
	request.post(P_HOST+'/system/database/reinit', (e_reinit, d_response, s_body) => {
		// response bad
		if(e_reinit) {
			local.fail(e_reinit+' : '+s_body);
		}
		// response good
		else if(200 === d_response.statusCode) {
			local.good(s_body);
		}
		// response not good
		else {
			local.warn(s_body);
		}
	});
});
