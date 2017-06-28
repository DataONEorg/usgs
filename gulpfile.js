//
const path = require('path');

// gulp & tasker
const gulp = require('gulp');
const soda = require('gulp-soda');

// gulp user-level config
let h_user_config = {};
try {
	h_user_config = require('./config.user.js');
} catch(e) {} // eslint-disable-line

// 
soda(gulp, {
	// pass user config
	config: h_user_config,

	// 
	inputs: {
		webapp: 'bundle',
	},

	// 
	targets: {

		// webapp development
		bundle: [
			'[all]: less pug browserify copy',
			'less',
			'pug',
			'browserify',
			'copy',
			'browser-sync: all',
			'develop: all',
		],
	},

	// task options
	options: {
		less: {
			watch: '**/*.less',
			rename: h => h.dirname = './styles',
		},
		pug: {
			watch: '**/*.pug',
			// rename: h => h.dirname = h.dirname.replace(/^src/, '.'),
		},
		browserify: {
			watch: '**/*.js',
			src: '_scripts',
			rename: h => h.dirname = path.join('scripts', h.dirname),
		},
		'copy-webapp': {
			src: 'source',
			rename: h => h.dirname = 'source',
		},
	},

	// //
	// aliases: {
	// 	serve: ['reload-proxy', 'develop-webapp', 'browser-sync'],
	// },
});
