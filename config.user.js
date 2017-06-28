const h_demo_config = require('./config.app.js');

module.exports = {
	browser_sync: {
		port: 3007,
		proxy: {
			target: 'http://localhost:'+h_demo_config.port,
			ws: true,
		},
		browser: 'google chrome',
	},
};
