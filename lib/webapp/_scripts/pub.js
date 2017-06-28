/* eslint-env browser */

const $ = require('jquery-browserify');
const async = require('async');
const request = require('browser-request');
const L = require('leaflet');
const stream = require('stream');

const graphy = require('graphy');

const ace = require('brace');
require('../../ace/mode-turtle.js');
require('brace/theme/chrome');


// const geoface = require('geoface');



const N_SIMULTANEOUS_REQUESTS = 8;
const P_NS_PREFIX = 'http://data.usgs.gov/lod';
const H_ENDPOINT = {
	protocol: 'http',
	host: location.hostname, // 'localhost', // 'usgs-stko.geog.ucsb.edu',
	port: 8080,
	path: '/sparql/select',
};
const P_ENDPOINT = `${H_ENDPOINT.protocol}://${H_ENDPOINT.host}:${H_ENDPOINT.port}${H_ENDPOINT.path}`;

const H_PREFIXES = {
	rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
	rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
	xsd: 'http://www.w3.org/2001/XMLSchema#',
	geosparql: 'http://www.opengis.net/ont/geosparql#',
	ago: 'http://awesemantic-geo.link/ontology/',
	usgs: 'http://cegis.usgs.gov/Ontology/',
	owl: 'http://www.w3.org/2002/07/owl#',
	// usgeo: '${P_NS_PREFIX}/geometry/',
	'usgeo-point': `${P_NS_PREFIX}/geometry/point/`,
	'usgeo-multipoint': `${P_NS_PREFIX}/geometry/multipoint/`,
	'usgeo-linestring': `${P_NS_PREFIX}/geometry/linestring/`,
	'usgeo-mutlilinestring': `${P_NS_PREFIX}/geometry/multilinestring/`,
	'usgeo-polygon': `${P_NS_PREFIX}/geometry/polygon/`,
	'usgeo-multipolygon': `${P_NS_PREFIX}/geometry/multipolygon/`,
	// 'usgeo-multipolyline': `${P_NS_PREFIX}/geometry/multiline/`,
	// 'usgeo-multipolygon': `${P_NS_PREFIX}/geometry/multipolygon/`,
	cegis: `${P_NS_PREFIX}/cegis/ontology/`,
	cegisf: `${P_NS_PREFIX}/cegis/feature/`,
	gnis: `${P_NS_PREFIX}/gnis/ontology/`,
	gnisf: `${P_NS_PREFIX}/gnis/feature/`,
	nwis: `${P_NS_PREFIX}/nwis/ontology/`,
	nwisf: `${P_NS_PREFIX}/nwis/feature/`,

	// gnisp: `${P_NS_PREFIX}/gnis/place/`,
	dbr: 'http://dbpedia.org/resource/',
	qudt: 'http://qudt.org/schema/qudt#',
	unit: 'http://qudt.org/vocab/unit#',

	sosa: 'http://www.w3.org/ns/sosa#',
	cdt: 'http://w3id.org/lindt/custom_datatypes#',
	eg: 'http://ex.org/rdf#',
};

const S_PREFIXES = Object.keys(H_PREFIXES).map((s_prefix) => {
	return `prefix ${s_prefix}: <${H_PREFIXES[s_prefix]}>`;
}).join('\n')+'\n';

// sort values-list alphabetically
const F_SORT_TYPES_LABELS = (h_a, h_b) => {
	if(h_a.rdf_type === h_b.rdf_type) {
		return h_a.label > h_b.label? 1: -1;
	}
	else {
		return h_a.rdf_type > h_b.rdf_type? 1: -1;
	}
};


const plural = (s_singular, n_count) => {
	if(1 === n_count) return s_singular;
	else if(/([csx]|ch)$/.test(s_singular)) return s_singular+'es';
	else if(/[^aeiou]y$/.test(s_singular)) return s_singular.slice(0, -1)+'ies';
	return s_singular+'s';
};


// declare 'global' objects
let y_editor;
let y_map, q_map;
let k_serializer;
let k_writer_outgoing;
let k_writer_incoming;

// clear outgoing loading text from rdf-display
let s_outgoing_ttl = ''; // || '\n# loading normal relations...\n';
let s_incoming_ttl = '\n# loading inverse relations...\n';


// query basic graph pattern (subject more or object mode) and load into card
function query_bgp(s_bgp, h_options) {
	request.post({
		url: P_ENDPOINT,
		headers: {
			accept: 'application/sparql-results+json',
		},
		body: S_PREFIXES+`
			select * {
				${s_bgp}
			}
		`,
	}, (e_req, d_res, s_body) => {
		let h_json = JSON.parse(s_body);
		let a_bindings = h_json.results.bindings;

		// destructure options
		let {
			uri: p_feature,
			mode: s_mode,
			header: q_header,
			table: q_table,
		} = h_options;

		// set subject mode flag
		let b_subject_mode = 'subject' === s_mode;

		//
		if(!b_subject_mode) {
			// no prefixes
			s_incoming_ttl = '';
		}

		// clear loading status
		q_table.empty();

		// tn3 block for serialization
		let h_define = {};

		// no results
		if(!a_bindings.length) {
			q_table.append([
				$('<div class="status" />')
					.text(`--- no ${b_subject_mode? 'outgoing': 'incoming'} properties --`),
			]);

			// indicate writer is complete
			if(b_subject_mode) {
				q_map.hide();
				k_writer_outgoing = null;
			}
			else {
				k_writer_incoming = null;
			}
		}
		else {
			// pairs hash
			let h_pairs = {};

			// value key is opposite of mode
			let s_value_key = b_subject_mode? 'object': 'subject';

			let a_post_pairs = [];

			// each binding result row
			a_bindings.forEach((h_row) => {
				let p_predicate = h_row.predicate.value;
				let h_value = h_row[s_value_key];

				// set label
				if(h_row[s_value_key+'_label']) {
					h_value.label = h_row[s_value_key+'_label'].value;
				}

				// set type
				if(h_row[s_value_key+'_type']) {
					h_value.rdf_type = h_row[s_value_key+'_type'].value;
				}

				// set wkt
				if(h_row.object_wkt) {
					h_value.wkt = h_row.object_wkt.value;
				}

				// set bounding box
				if(h_row.object_bounding_box) {
					h_value.bounding_box = h_row.object_bounding_box.value;
				}

				// first encounter of predicate; create list
				if(!h_pairs[p_predicate]) {
					h_pairs[p_predicate] = [h_value];
				}
				// not first encounter; push to list
				else {
					h_pairs[p_predicate].push(h_value);
				}
			});

			a_post_pairs.forEach(f_post => f_post());

			// subject mode
			if(b_subject_mode) {
				// set header using rdfs:label (randomly select first result)
				if(n3i('rdfs:label') in h_pairs) {
					q_header.find('.text').text(h_pairs[n3i('rdfs:label')][0].value);
				}

				// geometry and bounding box do not exists; hide map
				if(!(n3i('ago:geometry') in h_pairs) && !(n3i('ago:boundingBox') in h_pairs)) {
					q_map.hide();
				}
			}

			// prep rows
			let a_rows = [];

			// each pair
			for(let p_predicate in h_pairs) {
				let a_values = h_pairs[p_predicate];

				// map each result term to terse form
				h_define[terse(p_predicate)] = a_values.map((h_term) => {
					// return graphy.fromSparqlResultTerm(h_term);
					switch(h_term.type) {
						case 'uri': return terse(h_term.value);
						case 'bnode': return h_term.value;
						case 'literal': {
							let s_literal = '';
							if(h_term['xml:lang']) s_literal = '@'+h_term['xml:lang'];
							else if(h_term.datatype) s_literal = '^'+terse(h_term.datatype);
							return s_literal+'"'+h_term.value;
						}
					}
				});

				// mk predicate cell
				let q_cell_predicate = $(`<span class="predicate ${b_subject_mode? '': 'inverse'}"/>`);
				let s_terse = linkify(p_predicate, q_cell_predicate);

				// predicate has long name
				if(s_terse.length > 17) {
					q_cell_predicate.addClass('shrink');
				}

				// mk value list
				let q_value_list = $(`<div class="value-list ${b_subject_mode? '': 'inverse'}" />`);

				// custom handler for predicate
				if(p_predicate in H_PREDICATES) {
					// forward objects to handler; each display it returns..
					H_PREDICATES[p_predicate](a_values, q_value_list);
				}
				// default handler
				else {
					// flag: conflate iri values
					let b_conflate_mode = false;
					let h_conflate = {};

					// multiple values
					if(a_values.length > 1) {
						// sort list alphabetically
						a_values.sort(F_SORT_TYPES_LABELS);

						// value list is of considerable length
						if(a_values.length > 5) {
							// set conflate mode flag
							b_conflate_mode = true;
						}
					}

					// each value
					a_values.forEach((h_term) => {
						let q_cell = $('<span class="value"/>');
						q_cell.attr('data-value', h_term.value);

						// value is a named node
						if('uri' === h_term.type) {
							let p_term = h_term.value;
							linkify(p_term, q_cell, h_term.label);

							// remote resource
							if(!p_term.startsWith(P_NS_PREFIX)) {
								q_cell.empty();
								let q_link = $(`<a target="_blank" class="icon fa fa-external-link" aria-hidden="true" href="${p_term}" style="margin-left:10pt;"></a>`);
								q_cell.append(q_link);
								let q_iri = $('<span class="uri"></span>').text(terse(p_term));
								q_cell.append(q_iri);
							}

							// conflation
							if(b_conflate_mode) {
								// term can be conflated by rdf:type from minted URI
								if(p_term.startsWith(P_NS_PREFIX)) {
									let s_conflate_key;
									if(!h_term.rdf_type) {
										s_conflate_key = 'Study Area Feature';
									}
									else {
										s_conflate_key = terse(h_term.rdf_type).replace(/^[^:]+:/, '');
									}
									let a_group = h_conflate[s_conflate_key] = h_conflate[s_conflate_key] || [];
									a_group.push(q_cell);
									q_cell.find('a').text(h_term.label);

									// let a_facets = p_term.replace(/^.+\/([^\/]+)$/, '$1').split('.');

									// // typed URI
									// if(a_facets.length >= 4) {
									// 	let s_conflate_key = a_facets[2];
									// 	let a_group = h_conflate[s_conflate_key] = h_conflate[s_conflate_key] || [];
									// 	a_group.push(q_cell);
									// 	q_cell.find('a').text(a_facets[3]);
									// }
									// // county
									// else if(2 === a_facets.length) {
									// 	let s_conflate_key = 'County';
									// 	let a_group = h_conflate[s_conflate_key] = h_conflate[s_conflate_key] || [];
									// 	a_group.push(q_cell);
									// 	q_cell.find('a').text(a_facets[1]);
									// }
									// // state
									// else if(1 === a_facets.length) {
									// 	let s_conflate_key = 'State';
									// 	let a_group = h_conflate[s_conflate_key] = h_conflate[s_conflate_key] || [];
									// 	a_group.push(q_cell);
									// 	q_cell.find('a').text(a_facets[0]);
									// }
								}
								// term cannot be conflated
								else {
									throw 'cannot conflate IRI term outside of namespace';
								}
							}
						}
						// value is a blank node; skip
						else if('bnode' === h_term.type) {
							// resolve_blanknode(p_object, q_cell, a_graph);
							return;
						}
						// value is a typed literal
						else if('literal' === h_term.type) {
							q_cell.addClass('literal');

							// add content
							let q_content = $('<span class="content" />')
								.text(h_term.value);

							// literal has language tag
							if(h_term['xml:lang']) {
								q_content.appendTo(q_cell);

								// add language tag
								$('<span class="language" />')
									.text(h_term['xml:lang'])
									.appendTo(q_cell);
							}
							// no language
							else {
								// fetch datatype
								let p_type = h_term.datatype || '';

								// mapping exists for datatype
								if(H_LITERALS[p_type]) {
									let s_class = H_LITERALS[p_type](h_term, q_cell);

									// function returned class to add
									if(s_class) {
										q_cell.addClass(s_class)
											.append(q_content);
									}
								}
								// no mapping exists
								else {
									throw 'no mapping for type '+p_type;
								}
							}
						}

						q_value_list.append(q_cell);
					});

					// conflation
					if(b_conflate_mode) {
						for(let s_conflate_key in h_conflate) {
							let s_type = s_conflate_key.replace(/([a-z])([A-Z])/, '$1 $2');
							let a_group = h_conflate[s_conflate_key];
							let nl_group = a_group.length;
							let q_group_list = $('<div class="list" />');
							let q_group = $('<div class="conflate-group" />')
								.append([
									$('<div class="header" />')
										.click(function() {
											$(this).parent().toggleClass('expand');
										})
										.append([
											$('<span class="count" />').text(nl_group),
											$('<span class="label" />').text(plural(s_type, nl_group)),
										]),
									q_group_list,
								])
								.appendTo(q_value_list);

							a_group.forEach((q_cell) => {
								q_cell.appendTo(q_group_list);
							});
						}
					}
				}

				let s_classes = '';
				if(p_predicate === n3i('owl:sameAs')) {
					s_classes += ' same-as';
					add_same_as_toggle();
				}

				// mk whole row
				a_rows.push({
					predicate: p_predicate,
					element: $(`<div class="row ${s_classes}" />`)
						.append(q_cell_predicate)
						.append(q_value_list),
				});
			}

			// sort rows then append in order
			a_rows.sort(A_SORT_PREDICATES).forEach(h => h.element.appendTo(q_table));

			// subject mode
			if(b_subject_mode) {
				// write all outgoing triples
				k_writer_outgoing.add({
					[terse(p_feature)]: h_define,
				});

				// singal end of outgoing serialization
				k_writer_outgoing = null;
			}
			// object mode
			else {
				// this needs to be done in a worker thread...
				{
					// // write all incoming triples
					// for(let s_terse_predicate in h_define) {
					// 	h_define[s_terse_predicate].forEach((s_subject) => {
					// 		k_writer_incoming.add({
					// 			[s_subject]: {
					// 				[s_terse_predicate]: terse(p_feature),
					// 			},
					// 		});
					// 	});
					// }
				}

				// singal end of incoming serialization
				k_writer_incoming = null;
			}
		}

		// no more serializations
		if(!k_writer_outgoing && k_serializer) {
			k_serializer.close();
			k_serializer = null;

			setTimeout(() => {
				// update output
				y_editor.setValue(s_outgoing_ttl);
				y_editor.clearSelection();
			}, 0);
		}
	});
}

const add_same_as_toggle = () => {
	setTimeout(() => {
		$('#same-as-toggle').show('slow').click(() => {
			let s_display = $('.same-as').css('display');
			if(s_display === 'none') {
				s_display = 'table-row';
			}
			else {
				s_display = 'none';
			}
			$('.same-as').css('display', s_display);
		});
	}, 500);
};

// expand n3 iri to full iri path
const R_N3_IRI = /^([^:]*):(.*)$/;
const n3i = (s_n3) => {
	let [, s_prefix, s_suffix] = R_N3_IRI.exec(s_n3);
	return H_PREFIXES[s_prefix]+s_suffix;
};


const A_SORT_PREDICATES = (a, b) => {
	let s_a=a.predicate, s_b=b.predicate;
	let i_a = A_PREDICATE_DISPLAY_ORDER.indexOf(s_a);
	let i_b = A_PREDICATE_DISPLAY_ORDER.indexOf(s_b);

	// a not prioritized
	if(i_a < 0) {
		// neither predicates are prioritized; sort alphabetically
		if(i_b < 0) return a < b? -1: 1;
		// b is prioritized
		else return 1;
	}
	// b not prioritized; a is prioritized
	else if(i_b < 0) {
		return -1;
	}

	// a and b are both prioritized, sort by highest priority
	return i_a - i_b;
};

const A_PREDICATE_DISPLAY_ORDER = [
	// all
	'rdf:type',
	'rdfs:label',
	'gnis:featureId',

	// counties
	'gnis:countyCode',
	'gnis:countyName',

	// states
	'gnis:stateId',
	'gnis:stateCode',
	'gnis:stateName',

	// cegis
	'cegis:permanentId',
	'cegis:fragmentOf',
	'cegis:flowDirection',

	// features
	'gnis:state',
	'gnis:country',
	'gnis:county',
	'gnis:elevation',
	'ago:geometry',
	'ago:boundingBox',
	'geosparql:hasGeometry',
	'gnis:officialName',
	'gnis:alternativeName',
	'gnis:description',
	'gnis:dateNameCreated',
	'gnis:dateFeatureCreated',
	'gnis:dateFeatureEdited',
	'gnis:mapName',
	'gnis:citation',
	'gnis:history',
].map(n3i);


const A_DATE_LOCALES = [
	dt => dt.toLocaleString('en-US', {year:'numeric', month:'long', day:'numeric'}),

	dt => dt.toLocaleString('en-US', {year:'numeric', month:'2-digit', day:'2-digit'}),

	(dt) => [
		{year:'numeric'},
		{month:'2-digit'},
		{day:'2-digit'},
	].map(h => dt.toLocaleString('en-US', h)).join('-'),

	// (dt) => {
	// 	let t_unix = (dt.getTime() / 1000);
	// 	return (t_unix < 0? '-': '+')+t_unix+' seconds';
	// },
];

const f_literals_date_time = (h_literal, q_cell) => {
	// set css class
	q_cell.addClass('date');

	// append calendar icon
	let q_icon = $('<span class="icon fa fa-calendar" title="cycle display format" />').appendTo(q_cell);

	// append date text
	let q_text = $('<span class="text" />').appendTo(q_cell);

	// track locale cycle index
	let i_locale = 0;

	// parse date
	let dt = new Date(Date.parse(h_literal.value));

	// in case toLocaleString doesn't support options
	try {
		// set locale string
		q_text.text(A_DATE_LOCALES[i_locale](dt));

		// bind click event
		q_icon.click(() => {
			// cycle next locale index
			i_locale = (++i_locale) % A_DATE_LOCALES.length;

			// set locale string
			q_text.text(A_DATE_LOCALES[i_locale](dt));
		});
	}
	// use default
	catch(e) {
		q_text.text(dt.toLocaleString());
	}
};

// for rendering literals in the tabular display
const H_LITERALS = {
	// date/time
	[n3i('xsd:date')]: f_literals_date_time,
	[n3i('xsd:dateTime')]: f_literals_date_time,

	// primitives
	[n3i('xsd:integer')]: () => 'number',
	[n3i('xsd:decimal')]: () => 'number',
	[n3i('xsd:double')]: () => 'number',
	[n3i('xsd:boolean')]: () => 'boolean',

	// geometry
	[n3i('geosparql:wktLiteral')]: (h_literal, q_cell) => {
		// set css class
		q_cell.addClass('wkt');

		// well-known text literal
		q_cell.text(h_literal.value.replace(/^<[^>]+>/, ''));
	},

	// custom datatype
	[n3i('cdt:area')]: () => 'number',
	[n3i('cdt:height')]: () => 'number',

	// no datatype
	'': () => 'simple',
};

// handling of SPARQL results based on predicates
const H_PREDICATES = {
	// geometry
	[n3i('ago:geometry')]: (a_objects, q_object_list) => {
		let y_features = L.featureGroup();
		let a_displays = [];

		async.eachLimit(a_objects, N_SIMULTANEOUS_REQUESTS, (h_object, fk_feature) => {
			if('uri' !== h_object.type) throw new Error('expected IRI for geometry');
			let p_feature = h_object.value;

			// parse URI text
			let [, s_type, s_id] = /\/geometry\/(\w+)\/([^#]+)$/.exec(p_feature);

			//
			let q_cell = $('<div class="value geometry" />').appendTo(q_object_list);

			// display format icon
			$('<span class="geometry-format icon fa fa-globe" title="show/hide geometry formats" />')
				.click(() => {
					q_formats.toggle();
				})
				.appendTo(q_cell);

			// geometry uri
			let q_uri = $('<span class="geometry-uri shrink" />').appendTo(q_cell);

			// geometry formats
			let q_formats = $('<div class="geometry-formats" />').hide().appendTo(q_cell);
			mk_geometry_formats(q_formats, p_feature);

			// append geometry icon
			linkify(p_feature, q_uri);

			// point
			if('point' === s_type) {
				// q_cell.addClass('geometry').append([
				// 	$('<a class="geometry-type" />')
				// 		.attr('href', p_feature)
				// 		.text(s_type+'/'+s_id),
				// 	$('<span class="geometry-coordinates" />').text(s_crds),
				// ]);

				if(h_object.wkt) {
					let [, s_lng, s_lat] = /POINT\(\s*([\d\.-]+)\s+([\d\.-]+)\)/.exec(h_object.wkt);

					y_features.addLayer(
						L.marker(L.latLng(+s_lat, +s_lng), {
							// icon: L.Icons.Cross(),
						})
					);
				}

				fk_feature();
			}
			// complex geometry
			else {

				// let [s_lo, s_hi] = s_crds.split('/');
				// let [s_lo_lng, s_lo_lat] = s_lo.split(',');
				// let [s_hi_lng, s_hi_lat] = s_hi.split(',');


				let p_local = p_feature.replace(/data.usgs.gov/, location.host);

				// download as GeoJSON
				request.get({
					url: p_local,
					headers: {
						accept: 'application/json',
					},
				}, (e_req, d_res, s_body) => {
					let h_json = JSON.parse(s_body);
					y_features.addLayer(L.geoJson(h_json));
					fk_feature();
				});
			}
		}, () => {
			y_features.addTo(y_map);
			if(y_features.getLayers().length) {
				y_map.fitBounds(y_features.getBounds().pad(1.25));
			}
		});

		// callback displays
		return a_displays;
	},

	[n3i('gnis:elevation')]: (a_objects, q_object_list) => {
		a_objects.forEach((h_object) => {
			let p_elevation = h_object.value;

			// parse URI text
			let [, s_value, s_unit] = /\.([0-9.+-]+)(\w+)$/.exec(p_elevation);

			let q_cell = $('<div class="value quantity" />').appendTo(q_object_list);

			request.post({
				url: P_ENDPOINT,
				headers: {
					accept: 'application/sparql-results+json',
				},
				body: S_PREFIXES+`
					select * {
						unit:Foot a ?unit_type .
						?unit a ?unit_type ;
							rdfs:label ?label ;
							qudt:abbreviation ?abbr ;
							qudt:conversionOffset ?offset ;
							qudt:conversionMultiplier ?multiplier .

						filter(?unit_type != qudt:NotUsedWithSIUnit)
						
						optional {
							?unit a ?base_unit .
							filter(?base_unit = qudt:SIBaseUnit)
						}
					}
				`,
			}, (e_req, d_res, s_body) => {
				let h_json = JSON.parse(s_body);
				let a_bindings = h_json.results.bindings;
				let h_units = {};
				let h_from = {};
				let h_base;
				a_bindings.forEach((h) => {
					h_units[h.unit.value] = h;
					if(h.base_unit) h_base = h;
					if(h.unit.value === n3i('unit:Foot')) h_from = h;
				});

				let q_convert = $(`
						<div class="convert">
							<select>
								${a_bindings.map(h => {
									return `
										<option value="${h.unit.value}" ${h.unit.value === h_base.unit.value? 'selected': ''}>
											${h.label.value}
										</option>
									`;
								})}
							</select>
							<input type="text" class="convert-value" />
						</div>
					`).appendTo(q_cell);

				q_convert.hide();
				let x_from = +h_object.value.replace(/^.*\.(\d+)ft$/, '$1');
				let x_base = x_from * parseFloat(h_from.multiplier.value);
				let q_output = q_convert.find('.convert-value');
				q_output.val(x_base.toFixed(3));
				q_convert.find('select').on('change', function() {
					let x_out = x_base / parseFloat(h_units[this.value].multiplier.value);
					q_output.val(x_out.toFixed(3));
				});
			});

			// display format icon
			$('<span class="elevation-convert icon fa fa-calculator" title="convert quantity" />')
				.click(() => {
					$('.convert').toggle('slow');
				})
				.appendTo(q_cell);

			let q_uri = $('<span class="elevation-uri" />').appendTo(q_cell);
			linkify(p_elevation, q_uri);

			// $('<div class="object quantity" />').append([
			// 	$('<span class="uri-link fa fa-link" />'),
			// 	$('<span class="quantity-convert icon fa fa-exchange" title="convert quantity" />'),
			// 	$('<span class="quantity-value" />').text(s_value),
			// 	$('<span class="quantity-unit" />').text(s_unit),
			// ]).appendTo(q_object_list);
		});
	},

	[n3i('cegis:fcode')]: (a_objects, q_object_list) => {
		a_objects.forEach((h_object) => {
			let s_fcode = h_object.value;
			let p_fcode = 'http://data.usgs.gov/lod/cegis/ontology/FCode.'+s_fcode;

			let q_uri = $('<span class="fcode-uri" />').appendTo(q_object_list);
			linkify(p_fcode, q_uri);
		});
	},
};

function terse(p_uri) {
	for(let s_prefix in H_PREFIXES) {
		let p_prefix_iri = H_PREFIXES[s_prefix];

		if(p_uri.startsWith(p_prefix_iri)) {
			return s_prefix+':'+p_uri.substr(p_prefix_iri.length);
		}
	}

	return `<${p_uri}>`;
}


function linkify(p_uri, q_cell, s_label='') {
	let s_text = s_label || terse(p_uri);
	if(p_uri.startsWith(P_NS_PREFIX)) {
		let s_path = p_uri.replace(/^[^:]+:\/\/[^\/]+(.+)$/, '$1');
		let q_link = $(`<a href="${s_path}" />`);
		q_link.text(s_text);
		q_cell.append(q_link);
	}
	else if(p_uri.startsWith('http://cegis.usgs.gov/Ontology/')) {
		let s_path = p_uri.replace(/^[^:]+:\/\/[^\/]+(.+)$/, '$1');
		let q_link = $(`<a href="/lod/cegis${s_path}" />`);
		q_link.text(s_text);
		q_cell.append(q_link);
	}
	else {
		q_cell.text(s_text);
	}
	q_cell.addClass('iri');

	return s_text;
}


function load_resource(p_feature) {
	y_editor = ace.edit('rdf-display');
	y_editor.setTheme('ace/theme/chrome');
	y_editor.setFontSize(10);
	// y_editor.setReadOnly(true);
	y_editor.renderer.$fontMetrics.setPolling(false);
	y_editor.$blockScrolling = Infinity;

global.editor = y_editor;

	let y_session = y_editor.getSession();
	y_session.setMode('ace/mode/turtle');
	y_session.setUseWrapMode(true);
	y_session.setTabSize(3);

	let q_space = $('.card-space');

	let q_human = q_space.find('.human');
	let q_machine = q_space.find('.machine');

	// w3id.org
	// debugger;
	$('.purl-link').attr('href', p_feature.replace(/^http:\/\/[^\/]+\/lod\//, 'https://w3id.org/usgs/'));

	// human header
	q_human.find('.header')
		.append([
			$('<span class="text" />').text(terse(p_feature)),
			$('<span class="icon fa fa-code" title="show RDF"/>')
				.click(() => {
					q_space.toggleClass('flip');
				}),
		]);

	// machine header
	q_machine.find('.header')
		.append([
			$('<span class="text" />').text(terse(p_feature)),
			$('<span class="icon fa fa-list-alt" title="show list"/>')
				.click(() => {
					q_space.toggleClass('flip');
				}),
		]);

	// rdf serializer outgoing
	{
		k_serializer = graphy.ttl.serializer({
			prefixes: H_PREFIXES,
		});

		k_serializer.pipe(new stream.Writable({
			write(s_chunk, s_encdoing, fk_chunk) {
				s_outgoing_ttl += s_chunk;
				y_editor.setValue(s_outgoing_ttl);
				y_editor.clearSelection();
				fk_chunk();
			},
		}));

		k_writer_outgoing = k_serializer.writer;
	}

	// rdf serializer incoming
	{
		// k_serializer = graphy.ttl.serializer({
		// 	prefixes: H_PREFIXES,
		// });

		// k_serializer.pipe(new stream.Writable({
		// 	write(s_chunk, s_encdoing, fk_chunk) {
		// 		s_incoming_ttl += s_chunk;
		// 		y_editor.setValue(s_outgoing_ttl);
		// 		y_editor.clearSelection();
		// 		fk_chunk();
		// 	},
		// }));

		// k_writer_incoming = k_serializer.writer;
	}

	// triples of outgoing properties
	query_bgp(`<${p_feature}> ?predicate ?object .
		optional { ?object rdfs:label ?object_label }
		optional { ?object geosparql:asWKT ?object_wkt }
		optional { ?object ago:boundingBox ?object_bounding_box }
		`, {
			uri: p_feature,
			mode: 'subject',
			header: q_human.find('.header'),
			table: q_human.find('.outgoing'),
		});

	// triples in incoming properties
	query_bgp(`?subject ?predicate <${p_feature}>
		optional { ?subject rdfs:label ?subject_label }
		optional { ?subject rdf:type ?subject_type  }`, {
			uri: p_feature,
			mode: 'object',
			table: q_human.find('.incoming'),
		});
}

// init leaflet
document.addEventListener('DOMContentLoaded', () => {
	// load map
	{
		q_map = $('#map');
		y_map = L.map(q_map.get(0));

		// L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		// L.tileLayer('http://{s}.tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=af36210de0934f6d827f7642c93c9c03', {
		L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
			maxNativeZoom: 19,
			maxZoom: 14,
			detectRetina: true,
		}).addTo(y_map);
	}

	// set title(s)
	{
		const H_NAMES = {
			gnis: 'GNIS',
		};

		// // set header
		// let s_title = 'USGS > '+window.location.pathname.substr(1).split(/\//g)
		// 	.map(s => s in H_NAMES? H_NAMES[s]: s[0].toUpperCase()+s.substr(1))
		// 	.join(' > ');
		let s_title = 'USGS Linked Data';
		$('h1.title').text(s_title);
	}

	// load resource
	let p_resource = '';
	if(window.location.pathname.startsWith('/lod/gnis/page/')) {
		p_resource = `http://data.usgs.gov/lod/gnis/feature/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
	}
	else if(window.location.pathname.startsWith('/lod/cegis/page/')) {
		// p_resource = `http://cegis.usgs.gov/Ontology/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
		// p_resource = `http://cegis.usgs.gov/rdf/cegis/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
		p_resource = `http://data.usgs.gov/lod/cegis/feature/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
	}
	else if(window.location.pathname.startsWith('/lod/cegis-ontology/page/')) {
		p_resource = `http://data.usgs.gov/lod/cegis/ontology/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
	}
	else if(window.location.pathname.startsWith('/lod/gnis-ontology/page/')) {
		p_resource = `http://data.usgs.gov/lod/gnis/ontology/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
	}
	else if(window.location.pathname.startsWith('/lod/nwis/page/')) {
		p_resource = `http://data.usgs.gov/lod/nwis/feature/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
	}
	else if(window.location.pathname.startsWith('/lod/nwis-ontology/page/')) {
		p_resource = `http://data.usgs.gov/lod/nwis/ontology/${location.pathname.replace(/^.*\/([^\/]+)$/, '$1')}`;
	}

	load_resource(p_resource);
});


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
	let p_dereference = p_feature.replace('data.usgs.gov', location.host);

	// well known binary
	{
		$('<div class="format" />').appendTo(q_formats)
			.append($('<span class="fa fa-download" />')
				.click(() => {
					download_wkb((ab_wkb) => {
						let d_blob = new Blob([ab_wkb], {type:'application/octet-stream'});
						let p_url = URL.createObjectURL(d_blob);
						let d_a = Object.assign(document.createElement('a'), {
							href: p_url,
							download: window.location.pathname.substr(1).replace(/\//g, '-')+'.wkb',
						});
						d_a.click();
					});
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

// leaflet helper
if(L) {
	// deafult icon image path
	let p_icon_base = L.Icon.Default.imagePath = '/resource/leaflet-images/';

	// custom icons
	{
		// sizes
		const H_SIZES = {sml:12, med:18, lrg:24};

		// helper function
		const icon = (s_size, s_name, a_dim, a_anchor) => {
			debugger;
			if(s_size) {
				if(H_SIZES[s_size]) s_size = H_SIZES[s_size];
			}
			else s_size = 24;
			if(!a_anchor) a_anchor = [Math.floor(a_dim[0]*0.5), Math.floor(a_dim[1]*0.5)];

			let p_icon = `${p_icon_base}${s_name}-${s_size}`;
			return new L.Icon({
				iconUrl: p_icon+'.png',
				iconRetinaUrl: p_icon+'@2x.png',
				iconSize: a_dim,
				iconAnchor: a_anchor,
				color: '#ff0',
			});
		};

		// icon table
		L.Icons = {
			Cross: () => icon('lrg', 'cross', [11, 11]),
			Tick: function(s_color) {
				return new L.DivIcon({
					className: 'Ldi-cross med',
					html: '<div style="color:'+s_color+';">&#735;</div>',
				});
			},
			Dot: function(s_color) {
				return new L.DivIcon({
					className: 'Ldi-dot med',
					html: '<div style="color:'+s_color+';">&#8226;</div>',
					popupAnchor: [0, -3],
				});
			},
		};
	}
}
