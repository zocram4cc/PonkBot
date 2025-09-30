
// routes/betapi.js - API routes for the betting module

const express = require('express');

module.exports = (ponk) => {
  const router = express.Router();

  router.post('/start', (req, res) => {
    const { teamA, teamB } = req.body;
    if (!teamA || !teamB) {
      return res.status(400).json({ success: false, message: 'Missing teamA or teamB' });
    }
    const round = ponk.betting.startRound(teamA, teamB);
    res.json({ success: true, round });
  });

  router.post('/close', (req, res) => {
    const result = ponk.betting.closeBetting();
    res.json(result);
  });

  router.post('/result', (req, res) => {
    const { winner } = req.body;
    if (!winner) {
      return res.status(400).json({ success: false, message: 'Missing winner' });
    }
    const result = ponk.betting.resolveRound(winner);
    res.json(result);
  });

  router.get('/ledger', (req, res) => {
    res.json(ponk.betting.getLedger());
  });

  router.get('/bets', (req, res) => {
    res.json(ponk.betting.getCurrentBets());
  });

  return router;
};
