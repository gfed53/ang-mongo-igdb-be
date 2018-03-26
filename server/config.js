exports.PORT = process.env.PORT || 3000;

exports.KEYS = {
	igdbKey: 'INSERT API KEY HERE'
};

exports.DATABASE_URL = process.env.DATABASE_URL ||
global.MONGO_URL ||
global.DATABASE_URL ||
(process.env.NODE_ENV === 'production' ?
	'mongodb://localhost/igdb' :
	'mongodb://localhost/igdb');