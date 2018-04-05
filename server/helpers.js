const _ = require('lodash');
const moment = require('moment');
const igdb = require('igdb-api-node').default;
const config = require('./config');
const client = igdb(config.KEYS.igdbKey);

function getFormattedByYear(year, type){
  let intYear = parseInt(year);
  let latest = new Date().getFullYear() + 1;

  // Backend validation
  if(year >= 1950 && year <= latest){
    return type === 'after' ?
    `${year}-01-01T04:00:00.000Z` :

    type === 'before' ?
    `${parseInt(year+1)}-01-01T04:00:00.000Z` :

    null;

  } else {
    return null;
  } 
}

function checkDateValid(year){
  let intYear = parseInt(year);
  let latest = new Date().getFullYear() + 1;

  return year >= 1950 && year <= latest;

}

function randPart(collection, n){
  let shuffled = _.shuffle(collection);
  return shuffled.slice(0,n);
}

function getPlatforms(offset = 0, platforms = null){
  return client.platforms({
          fields: 'id,name',
          limit: 50, // Max
          offset
      }).then((response) => {
          const seg = response.body;

          // Are we carrying over platforms from outer recursive call?
          if(!platforms){
              platforms = [];
          }

          // First, append concat these results with carried over
          platforms = platforms.concat(seg);

          if(seg.length === 50){
              // There may be more
              // Make another request
              return getPlatforms(offset += 50, platforms);
          } else {
              // Return
              return platforms;
          }
      });
}

function getRelatedGames(config, callState){

  let { baseOptions, otherFilters } = config;
  let { offset, cycle, cycleLimit, accumGames } = callState;
  config.baseOptions.offset = offset;
  const optionsMerged = {...config.baseOptions, ...config.otherFilters[cycle.inner]};

  return client.games(optionsMerged).then(response => {

    if(!accumGames){
      accumGames = [];
    }

    let list = response.body;
    accumGames = accumGames.concat(list);

    if(cycle.inner < cycleLimit){
      cycle.inner++;
      return getRelatedGames(config, { offset, cycle, cycleLimit, accumGames });
    }
    else {
      accumGames = mainPostFilter(
        accumGames,
        config.internals,
        config.controls,
        config.game
      );

      /* 
        We limit the outer cycling to 2 based on our strategy of relaxing the precision of our filtering. 
        If we wanted to, for the future, we can make the limit higher than 2 so we can try a different randomly selected genre and see if we can yield more results (that are still related!).
      */
      if(accumGames.length < 10 && cycle.outer < 2){

        /* 
          API BUG: having [platforms][any] and [genres][any] ignores platform filter for some reason.
        */

        let genresParsed;

        if(cycle.outer < 1) { 
          genresParsed = randPart(config.internals.genres, 2);
        } else {
          genresParsed = randPart(config.internals.genres, 1);
        }

        cycle.inner = 0;
        cycle.outer++;

        config.baseOptions['filter[genres][in]'] = genresParsed;
        return getRelatedGames(config, { offset, cycle, cycleLimit, accumGames });

      }
      return accumGames;
    }
    
  }).catch(error => {
      throw error;
  });
}



/*-----------------------------------------------------------
  Filter to be run after API returns initial list of games. Since we're creating separate API calls for certain individual filters (platforms, date), we'll get results that don't ALL meet the combined filter criteria. Also we'll have to worry about duplicate entries, so we need to remove those.
*/
function mainPostFilter(list, internals, controls, baseGame){

  // console.log('in mainPostFilter');
  
  // console.log('internals',internals);
  // console.log('controls',controls);

  // console.log('list.length',list.length);

  // console.log('list platforms',list.map(item => item.platforms));
  // console.log('baseGame',baseGame);


  if(controls.selectedPlatformIDs.length){
    list = filterPlatforms(list,controls.selectedPlatformIDs);
  }
  // console.log('list.length now',list.length);

  if(controls.dateRange[0]){
    list = filterDateAfter(list, controls.dateRange[0]);
  }

  // console.log('list.length now',list.length);

  if(controls.dateRange[1]){
    list = filterDateBefore(list, controls.dateRange[1]);
  }

  // console.log('list.length now',list.length);

  // Order matters here. The last unshift will take highest priority.

  // Themes sort
  if(internals.themes){
    list = sortByThemeMatch(list, internals.themes);
  }

  // Perspective sort
  if(internals.player_perspectives){
    list = sortByPerspectiveMatch(list, internals.player_perspectives);
  }

  // Genres sort
  if(internals.genres){
    list = sortByGenreMatch(list, internals.genres);
  }

  // Filter dups
  list = filterDupsByProp(list,'id');

  // Filter out base game, and return
  return filterById(list, baseGame.id);

}

// returns list of items where item.first_release_date >= date
function filterDateAfter(list, date){
  let after = moment(formatDate(date, 'after'));
  return list.filter((item) => item.first_release_date >= after);
}

// returns list of items where item.first_release_date <= date
function filterDateBefore(list, date){
  let before = moment(formatDate(date, 'before'));
  return list.filter((item) => item.first_release_date <= before);
}

// Converts 'YYYY' to 'YYYY-MM-DD'
function formatDate(year,type){
  
    return type === 'after' ? 
    `${year}-01-01` :
    `${parseInt(year)+1}-01-01`;
  }

// For game item to pass, it has to match EVERY perspective that is passed into the second argument array
function filterPerspective(list, player_perspectives){
  return list.filter((item) => isExactMatch(item.player_perspectives, player_perspectives));
}

// Filter list, checking if item in list contains at least one platform in platforms array
function filterPlatforms(list, platforms){
  return list.filter((item) => isPartialMatch(item.platforms, platforms));
}

// Filter list, checking if item in list has genres array that exactly matches genres param
function filterGenresExact(list, genres){
  return list.filter((item) => isExactMatch(item.genres, genres));
}

// Return new list sorted by similarity of player_perspective values between related result and base game.
function sortByPerspectiveMatch(list, player_perspective){
  return list.sort((a,b) => numberOfMatches(player_perspective, b.player_perspective) - numberOfMatches(player_perspective, a.player_perspective));
}

// Return new list sorted by similarity of theme values between related result and base game.
function sortByThemeMatch(list, themes){
  return list.sort((a,b) => numberOfMatches(themes, b.themes) - numberOfMatches(themes, a.themes));
}

// Return new list sorted by similarity of genre values between related result and base game.
function sortByGenreMatch(list, genres){
  return list.sort((a,b) => numberOfMatches(genres, b.genres) - numberOfMatches(genres, a.genres));
}

function numberOfMatches(a, b){
  if(!a || !b){
    return 0;
  } else {
    // We want to return the number of matches between a[collection] and b[collection].
    let count = 0;
    
    let merged = _.uniq(
      a.concat(b)
       .sort((a,b) => a - b));
    
    // console.log('merged',merged);
    
    for(let i = 0; i < merged.length; i++){
      let currentValue = merged[i];
      if(a.indexOf(currentValue) > -1 && b.indexOf(currentValue) > -1){
        count++;
      } else {
        count--;
      }
    }
    
    return count;
    
  }
}

function unshiftGenresExact(list, genres){
  return unshiftFiltered(list, (item) => isExactMatch(item.genres, genres) );
}

function unshiftPerspectivesExact(list, player_perspectives){
  return unshiftFiltered(list, (item) => isExactMatch(item.player_perspectives, player_perspectives) );
}

function unshiftPerspectivesAny(list, player_perspectives){
  return unshiftFiltered(list, (item) => isPartialMatch(item.player_perspectives, player_perspectives) );
}

function unshiftThemesInclusive(list, themes){
  return unshiftFiltered(list, (item) => containsAll(item.themes, themes));
}

// Returns array where items of a that pass predicate appear in the front
function unshiftFiltered(a, predicate) {
  let passing = a.filter(item => predicate(item));
  let failing = a.filter(item => !predicate(item));
  
  return passing.concat(failing);
}

// Returns true if arrays a and b have the exact same values
function isExactMatch(a,b){
  
  // Some items don't have array to be used in comparison
  if(a){
    if(a.length !== b.length){
      return false;
    }

    a = a.sort();
    b = b.sort();

    for(let i = 0; i < a.length; i++){
      if(a[i] !== b[i]){
        return false;
      }
    } 
    return true;
  } else {
    return false;
  }
}

// Returns true if arrays a and b have at least 1 match
function isPartialMatch(a,b){
  // Some items don't have array to be used in comparison
  if(a){
    for(let i = 0; i < a.length; i++){
      for(let j = 0; j < b.length; j++){
        if(a[i] === b[j]){
          return true;
        }
      }   
    }
    return false;
  } else {
    return false;
  }
}

// Returns true if array a contains *at least* all items in array b
function containsAll(a,b){
  // Some items don't have array to be used in comparison
  if(a){
    for(let i = 0; i < b.length; i++){
      if(a.indexOf(b[i]) === -1){
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
}



function filterDupsByProp(a, prop){
  /*-----------------------------------------------------------
    Takes array a, and returns new array removing duplicate items of same property prop.

    e.g.

    const items = [
      {
        id: 1,
        name: 'Greg'
      },
      {
        id: 2,
        name: 'Kelvin'
      },
      {
        id: 1,
        name: 'Prometheus'
      },
      {
        id: 3,
        name: 'Matt'
      },
      {
        id: 4,
        name: 'Greg'
      }
      
      ];

      filterDupsByProp(items, 'id'); 

      => [ { id: 1, name: 'Greg' },
          { id: 2, name: 'Kelvin' },
          { id: 3, name: 'Matt' },
          { id: 4, name: 'Greg' } ]

  */
  const memo = {};
  const final = [];
  
  a.forEach((item) => {
    if(!memo[item[prop]]){
      final.push(item);
      memo[item[prop]] = true;
    }
  });
  return final;
}

function filterById(a, id){
  /*-----------------------------------------------------------
    Takes array a and returns filtered array where none of the items have an id of param id.
    Used to filter out base game from the related results.
  */

  return a.filter((item) => item.id !== id);

}

const helpers = {
  getFormattedByYear,
  checkDateValid,
  formatDate,
  randPart,
  getPlatforms,
  getRelatedGames,
  filterDateAfter,
  filterDateBefore,
  filterPerspective,
  filterPlatforms,
  filterGenresExact,
  unshiftGenresExact,
  mainPostFilter
};

module.exports = helpers;