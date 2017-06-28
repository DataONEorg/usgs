const path = require('path');
const util = require('util');

module.exports = Object.assign(function(gulp, $, p_src, p_dest, cb) {
	const browser_sync = require('browser-sync');
	const k_browser = browser_sync.create();

	// watch targets
	this.deps.forEach((s_dep) => {

		// watch event emitter
		let p_watch = path.join(p_src, this.friend(s_dep).options.watch || '**/*');
		// $.util.log(util.inspect(this));
		// $.util.log($.util.colors.blue(util.inspect(this.friend(s_dep))));
		$.util.log($.util.colors.magenta(`watching ${p_watch}...`));
		let d_watch = gulp.watch(p_watch, [s_dep]);

		// after change
		d_watch.on('change', () => {
			$.util.log('reloading browser-sync...');

			// wait for dependencies to complete
			setTimeout(() => {
				$.util.log('reloaded');
				// then reload browser
				k_browser.reload();
			}, 800);
		});
	});

	// 
	if(this.deps.length) {
		$.util.log($.util.colors.green('initializing browser-sync'));
		k_browser.init(this.config.browser_sync || {});
	}

	cb();
}, {
	dependencies: [
		'browser-sync',
		'gulp-util',
	],
});
