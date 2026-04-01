const db = require('./db');
const { logWithTimestamp } = require('../../../utils/logwithTimestamp');

const initDartsDB = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_a_id INTEGER NOT NULL,
      player_b_id INTEGER NOT NULL,
      player_a_legs INTEGER,
      player_b_legs INTEGER,
      winner_player_id INTEGER,
      played INTEGER NOT NULL DEFAULT 0,
      played_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (player_a_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (player_b_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (winner_player_id) REFERENCES players(id) ON DELETE SET NULL,

      CHECK (player_a_id != player_b_id),
      CHECK (
        played = 0 OR (
          player_a_legs IN (0,1,2) AND
          player_b_legs IN (0,1,2) AND
          (player_a_legs = 2 OR player_b_legs = 2) AND
          NOT (player_a_legs = 2 AND player_b_legs = 2)
        )
      )
    );

    CREATE INDEX IF NOT EXISTS idx_matches_player_a ON matches(player_a_id);
    CREATE INDEX IF NOT EXISTS idx_matches_player_b ON matches(player_b_id);
    CREATE INDEX IF NOT EXISTS idx_matches_played ON matches(played);
    CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches(played_at);
  `);

  logWithTimestamp(`Darts database initialized successfully!`);
};

module.exports = { initDartsDB };
