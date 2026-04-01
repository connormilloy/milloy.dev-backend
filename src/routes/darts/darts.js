const express = require('express');

const router = express.Router();
router.use(express.json());

// Players
router.get('/players', (req, res) => {
  res.json({ success: true, players: [] });
});

router.post('/players', (req, res) => {
  res.status(201).json({ success: true, message: 'Player added' });
});

router.patch('/players/:id', (req, res) => {
  res.json({ success: true, message: 'Player renamed' });
});

router.delete('/players/:id', (req, res) => {
  res.json({ success: true, message: 'Player removed' });
});

// Matches
router.get('/matches', (req, res) => {
  res.json({ success: true, matches: [] });
});

router.post('/matches/:id/result', (req, res) => {
  res.json({ success: true, match: {} });
});

// Standings
router.get('/standings', (req, res) => {
  res.json({ success: true, standings: [] });
});

// Match History
router.get('/players/:id/match-history', (req, res) => {
  res.json({ success: true, player: {}, history: [] });
});

module.exports = router;
