/* eslint-env browser */

const $ = require('jquery-browserify');
const request = require('browser-request');
const L = require('leaflet');


const P_NS_PREFIX = 'http://data.usgs.gov/lod';
const H_ENDPOINT = {
	protocol: 'http',
	host: 'usgs-stko.geog.ucsb.edu',
	port: 8080,
	path: '/sparql/select',
};
const P_ENDPOINT = `${H_ENDPOINT.protocol}://${H_ENDPOINT.host}:${H_ENDPOINT.port}${H_ENDPOINT.path}`;

const H_PREFIXES = {
	rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
	rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
	xsd: 'http://www.w3.org/2001/XMLSchema#',
	// geo: 'http://www.opengis.net/ont/geosparql#',
	ago: 'http://awesemantic-geo.link/ontology/',
	usgs: 'http://cegis.usgs.gov/Ontology/',
	// usgeo: '${P_NS_PREFIX}/geometry/',
	'usgeo-point': `${P_NS_PREFIX}/geometry/point/`,
	'usgeo-polyline': `${P_NS_PREFIX}/geometry/polyline/`,
	'usgeo-polygon': `${P_NS_PREFIX}/geometry/polygon/`,
	// 'usgeo-multipolyline': `${P_NS_PREFIX}/geometry/multiline/`,
	// 'usgeo-multipolygon': `${P_NS_PREFIX}/geometry/multipolygon/`,
	// cegisf: `${P_NS_PREFIX}/cegis/feature/`,
	gnis: `${P_NS_PREFIX}/gnis/ontology/`,
	gnisf: `${P_NS_PREFIX}/gnis/feature/`,
	// gnisp: `${P_NS_PREFIX}/gnis/place/`,
};

let y_map;


let h_geometry_formats = {};

function download_geometry_format(p_dereference, s_media_type, fk_download) {
	request.get({
		url: p_dereference,
		headers: {
			accept: s_media_type,
		},
	}, (e_req, d_res, s_body) => {
		if(!e_req) (h_geometry_formats[p_dereference] || (h_geometry_formats[p_dereference] = {}))[s_media_type] = s_body;
		fk_download(e_req, d_res, s_body);
	});
}

function download(w_segment, s_media_type, s_extension) {
	let d_blob = new Blob([w_segment], {type:s_media_type});
	let p_url = URL.createObjectURL(d_blob);
	let d_a = Object.assign(document.createElement('a'), {
		href: p_url,
		download: window.location.pathname.substr(1).replace(/\//g, '-')+'.'+s_extension,
	});
	d_a.click();
}


function mk_geometry_formats_binary_text(p_dereference, q_formats, a_types) {
	let h_geometries = h_geometry_formats[p_dereference] = h_geometry_formats[p_dereference] || {};

	a_types.forEach((h_type) => {
		let {
			media: s_media_type,
			label: s_label,
			extension: s_extension,
		} = h_type;

		$('<div class="format" />').appendTo(q_formats)
			.append($('<span class="fa fa-download" />')
				.click(function() {
					// geometry already loaded in memory
					if(h_geometries[s_media_type]) {
						download(h_geometries[s_media_type], s_media_type, s_extension);
					}
					// need to download geometry from server
					else {
						download_geometry_format(p_dereference, s_media_type, (e_req, d_res, s_body) => {
							// http request error
							if(e_req) {
								$('<div class="error" />')
									.text(e_req.toString())
									.appendTo($(this).parent());
							}
							else {
								download(s_body, s_media_type, s_extension);
							}
						});
					}
				}))
			.append($('<span class="fa fa-file-text-o" />')
				.click(function() {
					let q_parent = $(this).parent();
					let q_text = q_parent.find('textarea');

					// format has been downloaded
					if(q_text.length) {
						// hide/show
						q_text.toggle();
					}
					// format has not been downloaded yet
					else {
						// create text area
						q_text = $('<textarea />')
							.val('loading...')
							.attr('disabled', true)
							.appendTo(q_parent);

						// geometry already loaded in memory
						if(h_geometries[s_media_type]) {
							q_text.val(h_geometries[s_media_type]);
						}
						// need to download geometry from server
						else {
							download_geometry_format(p_dereference, s_media_type, (e_req, d_res, s_body) => {
								// http request error
								if(e_req) {
									q_text.remove();
									$('<div class="error" />')
										.text(e_req.toString())
										.appendTo(q_parent);
								}
								else {
									// load well known text
									q_text.val(s_body);
								}
							});
						}
					}
				}))
			.append($('<span class="label" />').text(s_label));
	});
}

function mk_geometry_formats(q_formats, p_feature) {
	let p_dereference = p_feature.replace('/data.usgs.gov/', `/${H_ENDPOINT.host}/`);

	let h_geometries = h_geometry_formats[p_dereference];

	// well known binary
	{
		$('<div class="format" />').appendTo(q_formats)
			.append($('<span class="fa fa-download" />')
				.click(() => {
					let s_media_type = 'application/octet-stream';

					// geometry already loaded in memory
					if(h_geometries[s_media_type]) {
						download(h_geometries[s_media_type], s_media_type, '.wkb');
					}
					// need to download geometry from server
					else {
						download_geometry_format(p_dereference, s_media_type, (e_req, d_res, s_body) => {
							// http request error
							if(e_req) {
								$('<div class="error" />')
									.text(e_req.toString())
									.appendTo($(this).parent());
							}
							else {
								download(s_body, s_media_type, '.wkb');
							}
						});
					}
				}))
			.append($('<span class="label" />').text('Well Known Binary (WKB)'));
	}

	// formats
	mk_geometry_formats_binary_text(p_dereference, q_formats, [
		// well known text
		{
			media: 'text/plain',
			label: 'Well Known Text (WKT)',
			extension: 'wkt',
		},

		// gml
		{
			media: 'application/gml+xml',
			label: 'Geography Markup Language (GML)',
			extension: 'gml',
		},

		// geojson
		{
			media: 'application/json',
			label: 'GeoJSON',
			extension: 'json',
		},
	]);
}

// init leaflet
document.addEventListener('DOMContentLoaded', () => {
	let p_dereference = `http://${H_ENDPOINT.host}`+window.location.pathname;

	$('h1').text(
		window.location.pathname.split('/')
			.slice(2).map(s => s[0].toUpperCase()+s.slice(1))
			.join(' '));

	// load map
	{
		let q_map = $('#map').css('visibility', 'visible');
		y_map = L.map(q_map.get(0));

		L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
			maxNativeZoom: 19,
			maxZoom: 14,
			detectRetina: true,
		}).addTo(y_map);

		// download geojson
		request.get({
			url: p_dereference,
			headers: {
				accept: 'application/json',
			},
		}, (e_req, d_res, s_body) => {
			let y_geojson = L.geoJson(JSON.parse(s_body))
				.addTo(y_map);
			y_map.fitBounds(y_geojson.getBounds().pad(1.25));
		});
	}


	// load formats
	mk_geometry_formats($('#formats'), p_dereference);
});


// leaflet helper
if(L) {
	// deafult icon image path
	L.Icon.Default.imagePath = '/resource/leaflet-images/';
}
