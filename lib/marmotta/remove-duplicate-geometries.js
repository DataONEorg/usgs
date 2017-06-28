const os = require('os');

const async = require('async');
const classer = require('classer');
const pg = require('pg');

const psql_config = require('./psql-config');

const local = classer.logger('de-duplicator');

const N_CPUS = os.cpus().length;

let y_pool = new pg.Pool(Object.assign(psql_config, {
	max: N_CPUS,
}));

y_pool.connect((e_connect, y_client, fk_client) => {
	if(e_connect) local.fail('could not connect to ${h_config.database} database: '+e_connect);

	// find geometries with duplicates
	y_client.query(`
		select distinct svalue from nodes
		where svalue in (
			select svalue from nodes where gvalue is not null
				group by svalue having count(*) > 1
		)
	`, (e_select_geoms, h_geoms) => {
		if(e_select_geoms) local.fail(e_select_geoms);

		// return client to pool
		fk_client();

		// debugging
		local.warn(h_geoms.rows.length+' unique geometries have duplicates');

		//
		deduplicate(h_geoms.rows, () => {
			y_pool.end(() => {
				local.good('all done :)');
			});
		});
	});

});

function deduplicate(a_rows, fk_done) {
	// each unique geometry (# cores at a time)
	async.eachLimit(a_rows, N_CPUS, (h_geom, fk_geom) => {
		// grab a client from the pool
		y_pool.connect((e_connect, y_client, fk_client) => {
			if(e_connect) local.fail('database connection interrupted');

			// fetch all node ids having this geometry
			y_client.query(`select id from nodes where svalue = $1`, [h_geom.svalue], (e_select_duplicates, h_duplicates) => {
				if(e_select_duplicates) local.fail(e_select_duplicates);

				// use first id as consolidation node
				let s_root = h_duplicates.rows[0].id;

				// extract duplicates from after beginning of list
				let a_duplicates = h_duplicates.rows.slice(1);

				// each duplicate node
				async.eachSeries(a_duplicates, (h_row, fk_duplicate) => {
					let s_duplicate = h_row.id;

					// update its triples
					y_client.query(`update triples set object = '${s_root}' where object = '${s_duplicate}'`, (e_update) => {
						if(e_update) local.fail(e_update);

						// then delete the duplicate node
						y_client.query(`delete from nodes where id = '${s_duplicate}'`, (e_delete) => {
							if(e_delete) local.fail(e_delete);

							// debugging
							local.info(`${s_duplicate} => ${s_root}`);

							// done with this duplicate
							fk_duplicate();
						});
					});
				}, () => {
					// debugging
					local.good('removed all duplicates from geometry: '+h_geom.svalue.substr(46, 30));

					// release client to pool
					fk_client();

					// done with this geometry literal
					fk_geom();
				});
			});
		});
	}, () => {
		fk_done();
	});
}
