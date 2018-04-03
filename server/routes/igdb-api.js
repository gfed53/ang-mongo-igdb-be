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

    const baseOptions = {
        fields: '*',
        limit: 50
    }

    // If user specified ordering, append to baseOptions obj here
    if(controls.order){baseOptions.order = `${controls.order}:desc`;}


    /*-----------------------------------------------------------
        'internals' is an object that contains certain properties of our base game that we may use for post-filtering/sorting, such as genres, player_perspectives, themes, and so on. This will be passed into our mainPostFilter function, more easily than a bunch of individual params.
    */
    const internals = {};

    // If game has more than 2 genres, randomly pluck out two genre ids of our base game.
    const genresParsed = game.genres && game.genres.length > 2 ? helpers.randPart(game.genres,2) : game.genres;
    const themesParsed = game.themes && game.themes.length > 2 ? helpers.randPart(game.themes,2) : game.themes;

    internals.genres = game.genres;
    internals.themes = themesParsed;
    internals.player_perspectives = game.player_perspectives;

    /*-----------------------------------------------------------
        'otherFilters' is an array that contains objects, each containing a specific extra filter (or in the case of date range, pair of filters). Point of this is to make separate API calls for each of these filters, then merge and purge, since API seems to have issues when you apply too many filters (more than 3 I think).
    */
    const otherFilters = [];

    // Genre filter.
    // if(genresParsed){ baseOptions['filter[genres][in]'] = genresParsed; }
    // Bring the WHOLE genres array into the recursive function, then parse the genres while in the function
    if(game.genres){ baseOptions['filter[genres][in]'] = game.genres; }

    // Platform filters (pushed to otherFilters)
    if(controls && controls.selectedPlatformIDs.length){ otherFilters.push({'filter[platforms][any]': controls.selectedPlatformIDs}); }

    /*-----------------------------------------------------------
        Date Range Filters
        After range slider change, we're now expecting an array, where [0] = after and [1] = before
        Backend validation won't be needed if we use range slider, which limits what user can actually select..
    */
    const maxYear = new Date().getFullYear() + 2;
    console.log('controls.dateRange',controls.dateRange);
    if(controls && controls.dateRange.length){
        const dateRangeObj = {};
        if(controls.dateRange[0] > 1950 && helpers.checkDateValid(controls.dateRange[0])){
            let after = helpers.formatDate(controls.dateRange[0], 'after');
            dateRangeObj['filter[first_release_date][gte]'] = after;
        }
        if(controls.dateRange[1] < maxYear && helpers.checkDateValid(controls.dateRange[1])){
            let before = helpers.formatDate(controls.dateRange[1], 'before');
            dateRangeObj['filter[first_release_date][lte]'] = before;
        }

        // Problem: this object is being pushed into otherFilters whether or not dateRanges are being added. The empty object is being counted as a filter which generates an unnecessary API call with no actual other filters added.

        console.log('Object.keys(dateRangeObj).length',Object.keys(dateRangeObj).length);

        if(Object.keys(dateRangeObj).length){
            otherFilters.push(dateRangeObj);
        }
        
    }

    const config = {
        baseOptions,
        otherFilters,
        game,
        internals,
        controls
    }

    const callState = {
        offset: 0,
        cycle: {
            // inner represents the cycle count based on calls per 'other filter' (platform, dates, etc).
            inner: 0,
            // outer represents the cycle count based on trying to yield more results by changing up the genres array.
            outer: 0
        },
        cycleLimit: config.otherFilters.length - 1,
        accumGames: null
        // genreSelectionMemo: []
    }

    /*-----------------------------------------------------------
    Our GET request
    */

    // while(callState.cycle.outer < 3){

    // }
    helpers.getRelatedGames(config, callState)
    .then(list => {

        // while(callState.cycle.outer < 3){

        // }
        /*----------- Moved this into recursive function */
        // if(controls){
        //     list = helpers.mainPostFilter(
        //         list, 
        //         internals, 
        //         controls,
        //         game
        //     );
        // }

        // if(list.length < 10){
        //     console.log('we found nothing, sooo');
        //     // Grab genresParsed
        //     // Parse genres

        //     config.baseOptions['filter[genres][in]'] = 
        //         baseOptions['filter[genres][in]'] && baseOptions['filter[genres][in]'].length > 2 ? 
        //         helpers.randPart(baseOptions['filter[genres][in]'],2) : 
        //         baseOptions['filter[genres][in]'];

        //     callState.cycle.outer++;
        // } else {
        //     res.json(list);
        // }

        res.json(list);

        

    }).catch(error => {
        throw error;
    });

    /*-------*/

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