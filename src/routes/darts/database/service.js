const db = require('./db');

function createAppError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

const insertPlayerStmt = db.prepare(`
  INSERT INTO players (name)
  VALUES (?)
`);

const getPlayerByIdStmt = db.prepare(`
  SELECT id, name, created_at
  FROM players
  WHERE id = ?
`);

const getOtherPlayersStmt = db.prepare(`
  SELECT id
  FROM players
  WHERE id != ?
  ORDER BY id ASC
`);

const insertMatchStmt = db.prepare(`
  INSERT INTO matches (player_a_id, player_b_id)
  VALUES (?, ?)
`);

const addPlayerWithFixturesTx = db.transaction((name) => {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError(
      'Player name is required',
      'PLAYER_NAME_REQUIRED',
      400
    );
  }

  const playerResult = insertPlayerStmt.run(trimmedName);
  const newPlayerId = playerResult.lastInsertRowid;

  const existingPlayers = getOtherPlayersStmt.all(newPlayerId);

  for (const opponent of existingPlayers) {
    insertMatchStmt.run(newPlayerId, opponent.id);
    insertMatchStmt.run(opponent.id, newPlayerId);
  }

  const player = getPlayerByIdStmt.get(newPlayerId);

  return {
    player,
    fixturesCreated: existingPlayers.length * 2,
  };
});

function addPlayer(name) {
  try {
    return addPlayerWithFixturesTx(name);
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw createAppError(
        'A player with that name already exists',
        'PLAYER_ALREADY_EXISTS',
        409
      );
    }

    throw error;
  }
}

const getMatchByIdStmt = db.prepare(`
  SELECT
    m.id,
    m.player_a_id,
    m.player_b_id,
    m.player_a_legs,
    m.player_b_legs,
    m.winner_player_id,
    m.played,
    m.played_at,
    pa.name AS player_a_name,
    pb.name AS player_b_name
  FROM matches m
  JOIN players pa ON pa.id = m.player_a_id
  JOIN players pb ON pb.id = m.player_b_id
  WHERE m.id = ?
`);

const updateMatchResultStmt = db.prepare(`
  UPDATE matches
  SET
    player_a_legs = ?,
    player_b_legs = ?,
    winner_player_id = ?,
    played = 1,
    played_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

function validateBo3Result(playerALegs, playerBLegs) {
  const aLegs = Number(playerALegs);
  const bLegs = Number(playerBLegs);

  const valid =
    Number.isInteger(aLegs) &&
    Number.isInteger(bLegs) &&
    [0, 1, 2].includes(aLegs) &&
    [0, 1, 2].includes(bLegs) &&
    ((aLegs === 2 && bLegs < 2) || (bLegs === 2 && aLegs < 2));

  if (!valid) {
    throw createAppError(
      'Invalid BO3 result. Valid results are 2-0, 2-1, 1-2, or 0-2',
      'INVALID_MATCH_RESULT',
      400
    );
  }

  return { aLegs, bLegs };
}

const recordMatchResultTx = db.transaction(
  (matchId, playerALegs, playerBLegs) => {
    const match = getMatchByIdStmt.get(matchId);

    if (!match) {
      throw createAppError('Match not found', 'MATCH_NOT_FOUND', 404);
    }

    if (match.played) {
      throw createAppError(
        'Match result already recorded',
        'MATCH_ALREADY_PLAYED',
        409
      );
    }

    const { aLegs, bLegs } = validateBo3Result(playerALegs, playerBLegs);
    const winnerPlayerId =
      aLegs > bLegs ? match.player_a_id : match.player_b_id;

    updateMatchResultStmt.run(aLegs, bLegs, winnerPlayerId, match.id);

    return getMatchByIdStmt.get(match.id);
  }
);

function recordMatchResult(matchId, playerALegs, playerBLegs) {
  return recordMatchResultTx(matchId, playerALegs, playerBLegs);
}

function parsePlayedFilter(played) {
  if (played === undefined) {
    return undefined;
  }

  if (played === 'true') {
    return 1;
  }

  if (played === 'false') {
    return 0;
  }

  throw createAppError(
    'Invalid played filter. Use played=true or played=false',
    'INVALID_MATCH_FILTER',
    400
  );
}

function parsePlayerIdFilter(playerId) {
  if (playerId === undefined) {
    return undefined;
  }

  const parsed = Number(playerId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createAppError(
      'Invalid playerId. It must be a positive integer',
      'INVALID_PLAYER_ID',
      400
    );
  }

  return parsed;
}

function parseLimitFilter(limit) {
  if (limit === undefined) {
    return undefined;
  }

  const parsed = Number(limit);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createAppError(
      'Invalid limit. It must be a positive integer',
      'INVALID_LIMIT',
      400
    );
  }

  if (parsed > 100) {
    throw createAppError(
      'Invalid limit. Maximum allowed is 100',
      'INVALID_LIMIT',
      400
    );
  }

  return parsed;
}

function parseSortFilter(sort) {
  if (sort === undefined) {
    return 'default';
  }

  const allowed = ['default', 'id_asc', 'id_desc', 'played_desc', 'played_asc'];

  if (!allowed.includes(sort)) {
    throw createAppError(
      'Invalid sort. Use default, id_asc, id_desc, played_desc, or played_asc',
      'INVALID_SORT',
      400
    );
  }

  return sort;
}

function getMatches(filters = {}) {
  const played = parsePlayedFilter(filters.played);
  const playerId = parsePlayerIdFilter(filters.playerId);
  const limit = parseLimitFilter(filters.limit);
  const sort = parseSortFilter(filters.sort);

  let sql = `
    SELECT
      m.id,
      m.player_a_id,
      pa.name AS player_a_name,
      m.player_b_id,
      pb.name AS player_b_name,
      m.player_a_legs,
      m.player_b_legs,
      m.winner_player_id,
      m.played,
      m.played_at,
      m.created_at
    FROM matches m
    JOIN players pa ON pa.id = m.player_a_id
    JOIN players pb ON pb.id = m.player_b_id
  `;

  const conditions = [];
  const params = [];

  if (played !== undefined) {
    conditions.push('m.played = ?');
    params.push(played);
  }

  if (playerId !== undefined) {
    conditions.push('(m.player_a_id = ? OR m.player_b_id = ?)');
    params.push(playerId, playerId);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (sort === 'id_asc') {
    sql += ` ORDER BY m.id ASC`;
  } else if (sort === 'id_desc') {
    sql += ` ORDER BY m.id DESC`;
  } else if (sort === 'played_desc') {
    sql += `
      ORDER BY
        CASE WHEN m.played = 1 THEN datetime(m.played_at) END DESC,
        m.id DESC
    `;
  } else if (sort === 'played_asc') {
    sql += `
      ORDER BY
        CASE WHEN m.played = 1 THEN datetime(m.played_at) END ASC,
        m.id ASC
    `;
  } else {
    sql += `
      ORDER BY
        m.played ASC,
        CASE WHEN m.played = 1 THEN datetime(m.played_at) END DESC,
        m.id ASC
    `;
  }

  if (limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }

  return db.prepare(sql).all(...params);
}

function getStandings() {
  return db
    .prepare(
      `
    SELECT
      p.id,
      p.name,

      COALESCE(SUM(
        CASE
          WHEN m.played = 1 AND m.winner_player_id = p.id THEN 2
          ELSE 0
        END
      ), 0) AS points,

      COALESCE(SUM(
        CASE
          WHEN m.played = 1 AND m.player_a_id = p.id THEN m.player_a_legs
          WHEN m.played = 1 AND m.player_b_id = p.id THEN m.player_b_legs
          ELSE 0
        END
      ), 0) AS legs_won,

      COALESCE(SUM(
        CASE
          WHEN m.played = 1 AND m.player_a_id = p.id THEN m.player_b_legs
          WHEN m.played = 1 AND m.player_b_id = p.id THEN m.player_a_legs
          ELSE 0
        END
      ), 0) AS legs_against,

      COALESCE(SUM(
        CASE
          WHEN m.played = 1 AND (m.player_a_id = p.id OR m.player_b_id = p.id) THEN 1
          ELSE 0
        END
      ), 0) AS played,

      COALESCE(SUM(
        CASE
          WHEN m.played = 1 AND m.winner_player_id = p.id THEN 1
          ELSE 0
        END
      ), 0) AS wins,

      COALESCE(SUM(
        CASE
          WHEN m.played = 1
            AND (m.player_a_id = p.id OR m.player_b_id = p.id)
            AND m.winner_player_id IS NOT NULL
            AND m.winner_player_id != p.id THEN 1
          ELSE 0
        END
      ), 0) AS losses

    FROM players p
    LEFT JOIN matches m
      ON m.player_a_id = p.id OR m.player_b_id = p.id

    GROUP BY p.id, p.name

    ORDER BY
      points DESC,
      legs_won DESC,
      legs_against ASC,
      p.name ASC
  `
    )
    .all();
}

function getPlayers() {
  return db
    .prepare(
      `
    SELECT
      id,
      name,
      created_at
    FROM players
    ORDER BY name ASC
  `
    )
    .all();
}

function getPlayerById(playerId) {
  const parsed = Number(playerId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createAppError(
      'Invalid player id. It must be a positive integer',
      'INVALID_PLAYER_ID',
      400
    );
  }

  const player = db
    .prepare(
      `
    SELECT
      id,
      name,
      created_at
    FROM players
    WHERE id = ?
  `
    )
    .get(parsed);

  if (!player) {
    throw createAppError('Player not found', 'PLAYER_NOT_FOUND', 404);
  }

  return player;
}

const updatePlayerNameStmt = db.prepare(`
  UPDATE players
  SET name = ?
  WHERE id = ?
`);

const deletePlayerByIdStmt = db.prepare(`
  DELETE FROM players
  WHERE id = ?
`);

function renamePlayer(playerId, name) {
  const player = getPlayerById(playerId);
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError(
      'Player name is required',
      'PLAYER_NAME_REQUIRED',
      400
    );
  }

  try {
    updatePlayerNameStmt.run(trimmedName, player.id);
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw createAppError(
        'A player with that name already exists',
        'PLAYER_ALREADY_EXISTS',
        409
      );
    }

    throw error;
  }

  return getPlayerById(player.id);
}

function deletePlayer(playerId) {
  const player = getPlayerById(playerId);

  deletePlayerByIdStmt.run(player.id);

  return {
    player,
  };
}

function getPlayedMatchesForPlayer(playerId) {
  const parsed = Number(playerId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createAppError(
      'Invalid player id. It must be a positive integer',
      'INVALID_PLAYER_ID',
      400
    );
  }

  return db
    .prepare(
      `
    SELECT
      m.id,
      m.played,
      m.played_at,
      m.created_at,

      CASE
        WHEN m.player_a_id = ? THEN m.player_b_id
        ELSE m.player_a_id
      END AS opponent_id,

      CASE
        WHEN m.player_a_id = ? THEN pb.name
        ELSE pa.name
      END AS opponent_name,

      CASE
        WHEN m.player_a_id = ? THEN m.player_a_legs
        ELSE m.player_b_legs
      END AS legs_for,

      CASE
        WHEN m.player_a_id = ? THEN m.player_b_legs
        ELSE m.player_a_legs
      END AS legs_against,

      CASE
        WHEN m.winner_player_id = ? THEN 'W'
        WHEN m.winner_player_id IS NOT NULL THEN 'L'
        ELSE NULL
      END AS result

    FROM matches m
    JOIN players pa ON pa.id = m.player_a_id
    JOIN players pb ON pb.id = m.player_b_id

    WHERE (m.player_a_id = ? OR m.player_b_id = ?)
      AND m.played = 1

    ORDER BY datetime(m.played_at) DESC, m.id DESC
  `
    )
    .all(parsed, parsed, parsed, parsed, parsed, parsed, parsed);
}

function getPendingMatchesForPlayer(playerId) {
  const parsed = Number(playerId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createAppError(
      'Invalid player id. It must be a positive integer',
      'INVALID_PLAYER_ID',
      400
    );
  }

  return db
    .prepare(
      `
    SELECT
      m.id,
      m.played,
      m.created_at,

      CASE
        WHEN m.player_a_id = ? THEN m.player_b_id
        ELSE m.player_a_id
      END AS opponent_id,

      CASE
        WHEN m.player_a_id = ? THEN pb.name
        ELSE pa.name
      END AS opponent_name

    FROM matches m
    JOIN players pa ON pa.id = m.player_a_id
    JOIN players pb ON pb.id = m.player_b_id

    WHERE (m.player_a_id = ? OR m.player_b_id = ?)
      AND m.played = 0

    ORDER BY m.id ASC
  `
    )
    .all(parsed, parsed, parsed, parsed);
}

function getPlayerDetails(playerId) {
  const player = getPlayerById(playerId);
  const playedMatches = getPlayedMatchesForPlayer(playerId);
  const pendingMatches = getPendingMatchesForPlayer(playerId);

  return {
    player,
    playedMatches,
    pendingMatches,
  };
}

function updateMatchResult(matchId, playerALegs, playerBLegs) {
  const match = getMatchByIdStmt.get(Number(matchId));

  if (!match) {
    throw createAppError('Match not found', 'MATCH_NOT_FOUND', 404);
  }

  const { aLegs, bLegs } = validateBo3Result(playerALegs, playerBLegs);
  const winnerPlayerId = aLegs > bLegs ? match.player_a_id : match.player_b_id;

  updateMatchResultStmt.run(aLegs, bLegs, winnerPlayerId, match.id);

  return getMatchByIdStmt.get(match.id);
}

module.exports = {
  addPlayer,
  recordMatchResult,
  updateMatchResult,
  getMatches,
  getStandings,
  getPlayers,
  getPlayerById,
  getPlayerDetails,
  renamePlayer,
  deletePlayer,
};
