const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/search-game-deal', (req, res) => {

  const title = req.body._title;

  axios.get('http://www.cheapshark.com/api/1.0/games', {
    params: {
      title,
      limit: 5
    }
  })
  .then((response) => {
    console.log('response.data',response.data);
    res.json(response.data);
  })
  .catch((error) => {
    console.log('error',error);
    res.json({error});
  });
});


module.exports = router;

