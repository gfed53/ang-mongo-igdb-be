// jshint esversion: 6

/*----------------------------------------------------------- 
  Records will be used to store data retrieved from the IGDB API that only needs to fetched initially, and updated once in a while, such as the site's list of genres and platforms (not likely to change that often.)
*/


var mongoose = require('mongoose');


// define schema
var recordSchema = mongoose.Schema({
	name: String,
  timestamp: Number,
  data: Object
});

// compile schema into model
var Record = mongoose.model('Record', recordSchema);

module.exports = Record;