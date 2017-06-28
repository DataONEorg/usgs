const fs = require('fs');
const readline = require('readline');

const async = require('async');
const pg = require('pg');
const classer = require('classer');

// local classes
const psql_config = require('../marmotta/psql-config.js');

//
const local = classer.logger('import-geom');

let y_client = new pg.Client(psql_config);

y_client.connect(function(e_connect) {
	if(e_connect) {
		console.dir(psql_config);
		local.fail(`could not connect to database: `+e_connect);
	}

	async.eachSeries(process.argv.slice(2), (s_ttl_file, fk_file) => {
		local.info(s_ttl_file);

		let dr_input = readline.createInterface({
			input: fs.createReadStream(s_ttl_file),
		});

		let c_geoms = 0;
		let k_queue = async.queue((s_sql, fk_task) => {
			debugger;
			y_client.query(s_sql, (e_query) => {
				if(e_query) local.fail(e_query);
				c_geoms += 1;
				fk_task();
			});
		}, 10);

		dr_input.on('line', (s_line) => {
			let [p_iri, s_wkt] = s_line.split('\t');
			k_queue.push(`
				update nodes set gvalue=ST_GeomFromEWKT('${s_wkt}')
				where ntype='uri' and svalue='${p_iri}'
			`);
		});

		dr_input.on('close', () => {
			if(!k_queue.length()) {
				local.warn('no geometries');
				fk_file();
			}
			else {
				k_queue.drain = () => {
					local.good(`imported ${c_geoms} geometries from ${s_ttl_file}`);
					fk_file();
				};
			}
		});
	}, () => {
		y_client.end();
	});
});
