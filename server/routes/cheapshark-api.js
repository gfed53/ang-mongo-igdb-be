const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/search-game-deal', (req, res) => {

  const title = req.body._title;
  const steamID = req.body._steamID;

  const params = {
    title,
    limit: 5,
    exact: 1
  }

  if(steamID){ params.steamAppID = steamID; }

  axios.get('http://www.cheapshark.com/api/1.0/games', {params})
  .then((response) => {
    res.json(response.data);
  })
  .catch((error) => {
    console.log('error',error);
    res.json({error});
  });
});


module.exports = router;

