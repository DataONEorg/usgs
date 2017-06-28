
const path = require('path');

const h_psql_config = require(path.join(__dirname, '../../postgres-config.json'));

module.exports = Object.assign(h_psql_config, {
	url: `postgres://${h_psql_config.user}:${h_psql_config.password}@localhost${h_psql_config.port? ':'+h_psql_config.port: ''}/${h_psql_config.database}`,
	short_url: `postgresql://localhost${h_psql_config.port? ':'+h_psql_config.port: ''}/${h_psql_config.database}`,
});
