// jshint esversion: 6

// Get dependencies
const express = require('express');
const path = require('path');
const http = require('http');
const bodyParser = require('body-parser');
var mongoose = require('mongoose');

const config = require('./server/config.js');

// Get our API routes
const igdb_api = require('./server/routes/igdb-api');
const cheapshark_api = require('./server/routes/cheapshark-api');

// Create express app
const app = express();

// Parsers for POST data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Point static path to dist
// app.use(express.static(path.join(__dirname, 'dist')));

// Set our api routes
// app.use('/api', api);
app.use('/igdb-api', igdb_api);
app.use('/cheapshark-api', cheapshark_api);


// Catch all other routes and return the index file
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'dist/index.html'));
// });

app.set('port', config.PORT);


// Create HTTP server.
const server = http.createServer(app);


//****** Mongoose

var runServer = function(callback) {
	// Must be running MongoDB if running locally!
    mongoose.connect(config.DATABASE_URL, function(err) {
        if (err && callback) {
            return callback(err);
        }

        server.listen(config.PORT, function() {
            console.log('Listening on localhost:' + config.PORT);
            if (callback) {
                callback();
            }
        });
    });
};

if (require.main === module) {
    runServer(function(err) {
        if (err) {
            console.error(err);
        }
    });
}


