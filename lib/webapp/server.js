
const path = require('path');

// third-party modules
const classer = require('classer');
const express = require('express');
const jsonld = require('jsonld'); require('express-negotiate');
const h_argv = require('minimist')(process.argv.slice(2));
const pg = require('pg');
const request = require('request');

// local classes / configs
const app_config = require('../../config.app.js');
const psql_config = require('../marmotta/psql-config.js');

const N_PORT = h_argv.p || h_argv.port || 80;

const P_BASE = app_config.data_uri;
const P_BASE_GNIS = `${P_BASE}/gnis`;

const P_ENDPOINT = app_config.sparql_endpoint;

const S_PREFIXES = `
	prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
	prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>
	prefix xsd: <http://www.w3.org/2001/XMLSchema#>
	prefix geo: <http://www.opengis.net/ont/geosparql#>
	prefix gnis: <${P_BASE_GNIS}/ontology/>
	prefix gnisf: <${P_BASE_GNIS}/feature/>
	prefix gnisp: <${P_BASE_GNIS}/place/>
`;

const _404 = (d_res) => {
	d_res.status(404).end('No such geometry');
};

const local = classer.logger('server');

// submit sparql query via HTTP
const sparql_query = (s_accept, s_query, fk_query) => {
	request.post(P_ENDPOINT, {
		headers: {
			accept: s_accept,
			'content-type': 'application/sparql-query;charset=UTF-8',
		},
		body: S_PREFIXES+'\n'+s_query,
	}, fk_query);
};

const k_app = express();


// adl-map
const P_ADL = path.join(__dirname, '../../../adl-map');

k_app.use('/explore/img', express.static(P_ADL+'/img'));
k_app.use('/explore/css', express.static(P_ADL+'/css'));
k_app.use('/explore/js', express.static(P_ADL+'/js'));
k_app.get('/explore/', (d_req, d_res) => {
	d_res.sendFile(P_ADL+'/index.html');
});


// views
k_app.set('views', __dirname+'/_layouts');
k_app.set('view engine', 'pug');

// static routing
k_app.use('/scripts', express.static(__dirname+'/../../dist/webapp/scripts'));
k_app.use('/styles', express.static(__dirname+'/../../dist/webapp/styles'));
k_app.use('/resource', express.static(__dirname+'/../../lib/webapp/_resources'));
k_app.use('/fonts', express.static(__dirname+'/../../node_modules/font-awesome/fonts'));

// landing page
k_app.get([
	'/lod/',
], (d_req, d_res) => {
	d_res.type('text/html');
	d_res.render('about');
});

// dereferencing a geometry
const y_pool = new pg.Pool(psql_config);
k_app.get([
	'/lod/geometry/*'], (d_req, d_res) => {

	let p_guri = P_BASE+d_req.url.substr('/lod'.length);

	// fetch pg client from pool
	y_pool.connect((e_connect, y_client, fk_client) => {
		if(e_connect) {
			local.error(e_connect);
			return d_res.status(500).send('failed to connect to database');
		}

		// CORS header
		d_res.set('Access-Control-Allow-Origin', '*');

		// select and send a geometry from postgres
		const select_and_send_geometry = (s_transform, s_media_type) => {
			d_res.type(s_media_type);
			y_client.query(`
				select ${s_transform}(gvalue) as format from nodes
				where svalue=$1
			`, [p_guri], (e_query, h_result) => {
				if(e_query) {
					local.error(e_query);
					d_res.status(500).send('encountered database error');
					return;
				}
				let a_rows = h_result.rows;
				if(!a_rows.length) return _404(d_res);
				d_res.send(a_rows[0].format);
				fk_client();
			});
		};

		// content negotiation
		d_req.negotiate({
			'text/html': () => {
				d_res.type('text/html');
				d_res.render('geometry');
			},

			// Well-Known Text
			'text/plain': () => select_and_send_geometry('ST_AsText', 'text/plain'),

			// GeoJSON
			'application/json': () => select_and_send_geometry('ST_AsGeoJSON', 'application/json'),

			// GML
			'application/gml+xml': () => select_and_send_geometry('ST_AsGML', 'application/gml+xml'),

			// Well-Known Binary
			'application/octet-stream': () => select_and_send_geometry('ST_AsEWKB', 'application/octet-stream'),
		});
	});
});

// request for the page about the resource
k_app.get([
	'/lod/gnis/page/:id',
	'/lod/cegis/page/:id',
	'/lod/nwis/page/:id',
	'/lod/gnis-ontology/page/:type',
	'/lod/cegis-ontology/page/:id',
	'/lod/nwis-ontology/page/:type',
], (d_req, d_res) => {
	d_res.sendFile(path.resolve(__dirname+'/../../dist/webapp/_layouts/pub.html'));
});

// request for usgs ontology
k_app.get([
	'/lod/cegis/ontology/:type',
], (d_req, d_res) => {
	d_res.redirect('/lod/cegis-ontology/page/'+d_req.params.type);
});

// request for gnis ontology
k_app.get([
	'/lod/gnis/ontology/:type',
], (d_req, d_res) => {
	d_res.redirect('/lod/gnis-ontology/page/'+d_req.params.type);
});

// request for gnis ontology
k_app.get([
	'/lod/nwis/ontology/:type',
], (d_req, d_res) => {
	d_res.redirect('/lod/nwis-ontology/page/'+d_req.params.type);
});

const negotiate_feature = (d_req, d_res, p_redirect) => {
	let p_entity = P_BASE.replace(/\/[^\/]*$/, '')+d_req.url;

	// default is to redirect to page
	let f_redirect = () => {
		d_res.redirect(p_redirect);
	};

	// application/rdf+xml
	let f_rdf_xml = () => {
		sparql_query('application/rdf+xml', `describe <${p_entity}>`, (e_query, d_sparql_res, s_res_body) => {
			d_res.type('application/rdf+xml');
			d_res.statusCode = e_query? 500: d_sparql_res.statusCode;
			d_res.send(s_res_body);
		});
	};

	// content negotiation
	d_req.negotiate({
		'application/rdf+xml': f_rdf_xml,

		'text/turtle': () => {
			sparql_query('application/json', `describe <${p_entity}>`, (e_query, d_sparql_res, s_res_body) => {
				d_res.type('text/turtle');
				d_res.statusCode = e_query? 500: d_sparql_res.statusCode;
				jsonld.toRDF(JSON.parse(s_res_body), {format:'application/nquads'}, (e_parse, s_nquads) => {
					d_res.send(s_nquads);
				});
			});
		},

		'application/nquads': () => {
			sparql_query('application/json', `describe <${p_entity}>`, (e_query, d_sparql_res, s_res_body) => {
				d_res.type('application/nquads');
				d_res.statusCode = e_query? 500: d_sparql_res.statusCode;
				jsonld.toRDF(JSON.parse(s_res_body), {format:'application/nquads'}, (e_parse, s_nquads) => {
					d_res.send(s_nquads);
				});
			});
		},

		html: f_redirect,
		default: f_rdf_xml,
	});
};

k_app.head([
	'/lod/*',
], (d_req, d_res) => {
	d_res.set('Content-Type', 'application/rdf+xml');
	d_res.end();
});

// request for cegis feature
k_app.get([
	'/lod/cegis/feature/:id',
], (d_req, d_res) => {
	negotiate_feature(d_req, d_res, '/lod/cegis/page/'+d_req.params.id);
});

// request for the resource
k_app.get([
	'/lod/gnis/feature/:id',
], (d_req, d_res) => {
	negotiate_feature(d_req, d_res, '/lod/gnis/page/'+d_req.params.id);
});

// request for the resource
k_app.get([
	'/lod/nwis/feature/:id',
], (d_req, d_res) => {
	negotiate_feature(d_req, d_res, '/lod/nwis/page/'+d_req.params.id);
});

// bind to port
k_app.listen(N_PORT, () => {
	local.good('running on port '+N_PORT);
});
