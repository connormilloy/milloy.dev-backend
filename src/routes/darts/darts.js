const express = require('express');
const {
  addPlayer,
  recordMatchResult,
  getMatches,
  getStandings,
  getPlayers,
  getPlayerDetails,
  renamePlayer,
  deletePlayer,
} = require('./database/service');

const router = express.Router();

router.use(express.json());

function sendRouteError(res, err, fallbackMessage = 'Something went wrong') {
  if (err && Number.isInteger(err.status)) {
    return res.status(err.status).json({
      error: err.code || 'REQUEST_FAILED',
      message: err.message || fallbackMessage,
    });
  }

  if (err && err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: err.message || fallbackMessage,
    });
  }

  console.error(err);

  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
  });
}

// Players
router.get('/players', (req, res) => {
  try {
    const players = getPlayers();

    return res.status(200).json({
      count: players.length,
      players,
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch players');
  }
});

router.get('/players/:id', (req, res) => {
  try {
    const result = getPlayerDetails(req.params.id);

    return res.status(200).json(result);
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch player');
  }
});

router.post('/players', (req, res) => {
  try {
    const { name } = req.body;
    const result = addPlayer(name);

    return res.status(201).json({
      message: 'Player added successfully',
      player: result.player,
      fixturesCreated: result.fixturesCreated,
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to add player');
  }
});

router.patch('/players/:id', (req, res) => {
  try {
    const { name } = req.body;
    const player = renamePlayer(req.params.id, name);

    return res.status(200).json({
      message: 'Player renamed successfully',
      player,
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to rename player');
  }
});

router.delete('/players/:id', (req, res) => {
  try {
    const result = deletePlayer(req.params.id);

    return res.status(200).json({
      message: 'Player deleted successfully',
      player: result.player,
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to delete player');
  }
});

// Matches
router.get('/matches', (req, res) => {
  try {
    const matches = getMatches({
      played: req.query.played,
      playerId: req.query.playerId,
      limit: req.query.limit,
      sort: req.query.sort,
    });

    return res.status(200).json({
      count: matches.length,
      matches,
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch matches');
  }
});

router.post('/matches/:id/result', (req, res) => {
  try {
    const { playerALegs, playerBLegs } = req.body;

    const match = recordMatchResult(
      Number(req.params.id),
      playerALegs,
      playerBLegs
    );

    return res.status(200).json({
      message: 'Match result recorded successfully',
      match,
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to record match result');
  }
});

// Standings
router.get('/standings', (req, res) => {
  try {
    const standings = getStandings();

    return res.status(200).json({
      count: standings.length,
      standings,
    });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch standings');
  }
});

module.exports = router;
