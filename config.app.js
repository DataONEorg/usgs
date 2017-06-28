
const S_DATA_HOST = 'data.usgs.gov';
const S_DATA_PATH = '/lod';
const P_DATA_URI = `http://${S_DATA_HOST}${S_DATA_PATH}`;
const P_GEOM_URI = `${P_DATA_URI}/geometry`;

const P_SPARQL_ENDPOINT = 'http://usgs-stko.geog.ucsb.edu:8080/sparql/select';

module.exports = {
	data_uri: P_DATA_URI,
	geom_uri: P_GEOM_URI,
	sparql_endpoint: P_SPARQL_ENDPOINT,
	port: 3006,
	prefixes: {
		rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
		rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
		xsd: 'http://www.w3.org/2001/XMLSchema#',
		geosparql: 'http://www.opengis.net/ont/geosparql#',
		cegis: `${P_DATA_URI}/cegis/ontology/`,
		cegisf: `${P_DATA_URI}/cegis/feature/`,
		gnis: `${P_DATA_URI}/gnis/ontology/`,
		gnisf: `${P_DATA_URI}/gnis/feature/`,
		qudt: 'http://qudt.org/schema/qudt/',
		unit: 'http://qudt.org/vocab/unit/',
		ago: 'http://awesemantic-geo.link/ontology/',
		'usgeo-point': `${P_GEOM_URI}/point/`,
		'usgeo-multipoint': `${P_GEOM_URI}/multipoint/`,
		'usgeo-linestring': `${P_GEOM_URI}/linestring/`,
		'usgeo-multilinestring': `${P_GEOM_URI}/multilinestring/`,
		'usgeo-polygon': `${P_GEOM_URI}/polygon/`,
		'usgeo-multipolygon': `${P_GEOM_URI}/multipolygon/`,
	},
};
