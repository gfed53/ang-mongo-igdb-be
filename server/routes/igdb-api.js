// jshint esversion: 6

const helpers = require('../helpers.js');

const _ = require('lodash');
const express = require('express');
const axios = require('axios');
const igdb = require('igdb-api-node').default;
const router = express.Router();

const config = require('../config');

const Record = require('../models/Record.js');

const client = igdb(config.KEYS.igdbKey);

/*----------------------------------------------------------- 
Initial search for individual game. This game will be used as a starting point to then retrieve more games related to this one.
*/

router.post('/search-game', function(req, res) {

    const q = req.body._q;

    const options = {
        fields: '*', // Return all fields
        limit: 5, // Limit to 5 results
        search: q
    }

    if(req.body._filters.selectedPlatform.id){
        options['filter[platforms][eq]'] = req.body._filters.selectedPlatform.id
    }

    if(req.body._filters.selectedGenre.id){
        options['filter[genres][eq]'] = req.body._filters.selectedGenre.id
    }

    client.games(options).then(response => {
        // response.body contains the parsed JSON response to this query
        res.json(response.body);
    }).catch(error => {
        throw error;
    });
    
});

// The search we make based on the game retrieved in our initial search.
router.post('/search-related', function(req,res) {
    
    const game = req.body._game;
    const controls = req.body._controls;

    const options = {
        fields: '*',
        limit: 50
    }

    // If user specified ordering, append to options obj here
    if(controls.order){options.order = `${controls.order}:desc`;}


    /*-----------------------------------------------------------
    'internals' is an object that contains certain properties of our base game that we may use for post-filtering/sorting, such as genres, player_perspectives, themes, and so on. This will be passed into our mainPostFilter function, more easily than a bunch of individual params.
    */
    const internals = {};

    // If game has more than 2 genres, randomly pluck out two genre ids of our base game.
    const genresParsed = game.genres && game.genres.length > 2 ? helpers.randPart(game.genres,2) : game.genres;
    const themesParsed = game.themes && game.themes.length > 2 ? helpers.randPart(game.themes,2) : game.themes;

    internals.genres = genresParsed;
    internals.themes = themesParsed;
    internals.player_perspectives = game.player_perspectives;

    /************************************************************/


    /*-----------------------------------------------------------
    'otherFilters' is an array that contains objects, each containing a specific extra filter (or in the case of date range, pair of filters). Point of this is to make separate API calls for each of these filters, then merge and purge, since API seems to have issues when you apply too many filters (more than 3 I think).
    */
    const otherFilters = [];

    // Genre filter.
    if(genresParsed){ options['filter[genres][in]'] = genresParsed; }

    // Platform filters (pushed to otherFilters)
    if(controls && controls.selectedPlatformIDs.length){ otherFilters.push({'filter[platforms][any]': controls.selectedPlatformIDs}); }

    // Date Range Filters
    // After range slider change, we're now expecting an array, where [0] = after and [1] = before
    // Backend validation won't be needed if we use range slider, which limits what user can actually select..
    if(controls && controls.dateRange){
        const dateRangeObj = {};
        if(controls.dateRange[0] > 1950 && helpers.checkDateValid(controls.dateRange[0])){
            let after = helpers.formatDate(controls.dateRange[0], 'after');
            dateRangeObj['filter[first_release_date][gte]'] = after;
            
        }
        // TODO: 2020 hardcoded for now while testing, dynamically generate year two years from now.
        if(controls.dateRange[1] < 2020 && helpers.checkDateValid(controls.dateRange[1])){
            let before = helpers.formatDate(controls.dateRange[1], 'before');
            dateRangeObj['filter[first_release_date][lte]'] = before;
        }
        otherFilters.push(dateRangeObj);
    }

    /************************************************************/


    /*-----------------------------------------------------------
    Our GET request
    */
    helpers.getRelatedGames(options, otherFilters, 0, 0, otherFilters.length-1)
    .then(list => {

        // TODO: still need to make sure the base game does not appear in the related results. 

        if(controls){
            list = helpers.mainPostFilter(
                list, 
                internals, 
                controls,
                game
            );
        }

        res.json(list);

    }).catch(error => {
        throw error;
    });

    /************************************************************/

});

router.get('/get-platforms', function(req, res) {

    Record.findOne({name: 'Platforms'}, function(err,item){
        let currentTime = Date.now();
        // Our first time making this request (or we need to update)
        if(!item){
            console.log('no item present');

            helpers.getPlatforms()
            .then(_data => {

                let record = new Record({
                    name: 'Platforms',
                    timestamp: Date.now(),
                    data: _data
                });

                record.save(function(err,data){
                    if (err) return console.error(err);
                    res.json(data);
                });
            });
        } else if(currentTime - item.timestamp > 60000000){
            console.log('item present, but needs update');

            helpers.getPlatforms()
            .then(_data => {

                const changes = {
                    timestamp: currentTime,
                    data: _data
                };

                Record.findOneAndUpdate({name: 'Platforms'}, {$set: changes}, function(err,item){
                    if (err) return console.error(err);
                    res.json(item);
                });
            });


        } else {
            console.log('item present and current, retrieving from db..');
            res.json(item);
        }

    });
    
    
});

router.get('/get-genres', function(req, res) {
    
        Record.findOne({name: 'Genres'}, function(err,item){
            let currentTime = Date.now();
            // Our first time making this request (or we need to update)
            if(!item){
                console.log('no item present');
                client.genres({
                    fields: 'id,name',
                    limit: 50 // Max Limit
                }).then(response => {
                    let record = new Record({
                        name: 'Genres',
                        timestamp: Date.now(),
                        data: response.body
                    });
    
                    record.save(function(err,data){
                        if (err) return console.error(err);
                        res.json(data);
                    });
    
                }).catch(error => {
                    throw error;
                });
    
            } else if(currentTime - item.timestamp > 60000000){
                console.log('item present, but needs update');
                client.genres({
                    fields: 'id,name',
                    limit: 50 // No Limit
                }).then(response => {
                    const changes = {
                        timestamp: currentTime,
                        data: response.body
                    };
    
                    Record.findOneAndUpdate({name: 'Genres'}, {$set: changes}, function(err,item){
                        if (err) return console.error(err);
                        res.json(item);
                    });
                }).catch(error => {
                    throw error;
                });   
    
            } else {
                console.log('item present and current, retrieving from db..');
                res.json(item);
            }
    
        });
        
        
    });

module.exports = router;