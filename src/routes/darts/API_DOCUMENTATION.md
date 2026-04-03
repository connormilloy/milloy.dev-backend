# Darts API Documentation

Base URL: `/api/darts`

This document describes the available endpoints implemented under `src/routes/darts`. It includes each endpoint's purpose, inputs (path/query/body), returned JSON, and common error responses. JSON examples are provided for request bodies and successful responses. Use this doc to drive front-end integration or to generate client code.

---

## Summary of available endpoints

- GET /players
- GET /players/:id
- POST /players
- PATCH /players/:id
- DELETE /players/:id
- GET /matches
- POST /matches/:id/result
- GET /standings
 - PATCH /matches/:id/result

---

## Database notes (from `database/init.js`)

- `players` table:
  - id INTEGER PK AUTOINCREMENT
  - name TEXT NOT NULL UNIQUE
  - created_at DATETIME DEFAULT CURRENT_TIMESTAMP

- `matches` table:
  - id INTEGER PK AUTOINCREMENT
  - player_a_id INTEGER NOT NULL (FK -> players.id, ON DELETE CASCADE)
  - player_b_id INTEGER NOT NULL (FK -> players.id, ON DELETE CASCADE)
  - player_a_legs INTEGER
  - player_b_legs INTEGER
  - winner_player_id INTEGER (FK -> players.id, ON DELETE SET NULL)
  - played INTEGER NOT NULL DEFAULT 0
  - played_at DATETIME
  - created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  - Constraints:
    - player_a_id != player_b_id
    - played is 0 or (player legs in {0,1,2} and one player has 2 legs and not both)

When a new player is added, the service automatically creates fixtures (two match records per existing opponent — one where the new player is player_a and one where player_b) so that every pair has two scheduled matches (A vs B and B vs A).

---

## Errors and conventions

- Service errors use a structure with `error` and `message`. Many errors include an HTTP status attached by the service. The route handler translates these to HTTP responses.
- Common error codes thrown by services include (but are not limited to):
  - `PLAYER_NAME_REQUIRED` (400)
  - `PLAYER_ALREADY_EXISTS` (409)
  - `INVALID_PLAYER_ID` (400)
  - `PLAYER_NOT_FOUND` (404)
  - `MATCH_NOT_FOUND` (404)
  - `MATCH_ALREADY_PLAYED` (409)
  - `INVALID_MATCH_RESULT` (400)
  - `INVALID_MATCH_FILTER` / `INVALID_LIMIT` / `INVALID_SORT` (400)
- For SQLite constraint errors (SQLITE_CONSTRAINT) the route returns 400 with `error: "INVALID_REQUEST"`.
- Unexpected server errors return 500 with `error: "INTERNAL_SERVER_ERROR"`.

Authentication / write-protection and rate limiting:

- Several endpoints that modify server state require an API key. The server uses a `requireApiKey` middleware on the following endpoints: `POST /players`, `PATCH /players/:id`, `DELETE /players/:id`, `POST /matches/:id/result`, and `PATCH /matches/:id/result`.
- Read-only endpoints (`GET /players`, `GET /players/:id`, `GET /matches`, `GET /standings`) do not require the API key.

Rate limiting (applied per-route):

- `relaxedRateLimiter` (window: 2000ms, max: 5 requests per window) is applied to non-destructive, read-only routes: `GET /players`, `GET /players/:id`, `GET /matches`, and `GET /standings`.
- `strictRateLimiter` (window: 2000ms, max: 1 request per window) is applied to destructive or state-changing routes: `POST /players`, `PATCH /players/:id`, `DELETE /players/:id`, `POST /matches/:id/result`, and `PATCH /matches/:id/result`.

Rate limit responses follow the express-rate-limit default structure and return a 429 status with a JSON message like:

```json
{
  "error": "Too many requests, please wait before trying again."
}
```

Example error response format (one of the patterns used by routes):

```json
{
  "error": "PLAYER_NOT_FOUND",
  "message": "Player not found"
}
```

---

# Endpoints

### 1) GET /players

- Description: Returns all players ordered by name.
- Request: no path or query parameters.
- Response: 200
- Rate limiting: `relaxedRateLimiter` (2s window, max 5)

Example response:

```json
{
  "count": 2,
  "players": [
    {
      "id": 1,
      "name": "Alice",
      "created_at": "2024-01-01 12:00:00"
    },
    {
      "id": 2,
      "name": "Bob",
      "created_at": "2024-01-02 12:00:00"
    }
  ]
}
```

---

### 2) GET /players/:id

- Description: Returns a player's basic info plus two lists: played matches and pending matches for that player.
- Path parameters:
  - `id` (integer) - player id
- Response: 200
- Rate limiting: `relaxedRateLimiter` (2s window, max 5)

Response structure (example):
```json
{
  "player": {
    "id": 1,
    "name": "Alice",
    "created_at": "2024-01-01 12:00:00"
  },
  "playedMatches": [],
  "pendingMatches": []
}
```

Example response:

```json
{
  "player": {
    "id": 1,
    "name": "Alice",
    "created_at": "2024-01-01 12:00:00"
  },
  "playedMatches": [
    {
      "id": 10,
      "played": 1,
      "played_at": "2024-02-01 18:00:00",
      "created_at": "2024-01-10 12:00:00",
      "opponent_id": 2,
      "opponent_name": "Bob",
      "legs_for": 2,
      "legs_against": 1,
      "result": "W"
    }
  ],
  "pendingMatches": [
    {
      "id": 11,
      "played": 0,
      "created_at": "2024-01-11 12:00:00",
      "opponent_id": 3,
      "opponent_name": "Charlie"
    }
  ]
}
```

Errors:
- 400 if `id` is invalid (non-positive integer) with `INVALID_PLAYER_ID`.
- 404 if player not found with `PLAYER_NOT_FOUND`.

---

### 3) POST /players

 - Description: Create a new player and automatically create fixtures (matches) between the new player and all existing players (two matches per opponent: one where new player is player_a and vice versa).
 - Authentication: Requires API key (send via whatever mechanism your app uses for the API key middleware).
- Request body (JSON):
  - `name` (string) - required
- Successful response: 201
- Rate limiting: `strictRateLimiter` (2s window, max 1)

Request example:

```json
{
  "name": "Charlie"
}
```

Successful response example:

```json
{
  "message": "Player added successfully",
  "player": {
    "id": 3,
    "name": "Charlie",
    "created_at": "2024-03-01 10:00:00"
  },
  "fixturesCreated": 4
}
```

Notes:
- `fixturesCreated` counts how many match rows were created for the new player (existingPlayers.length * 2).
- Errors:
  - 400 `PLAYER_NAME_REQUIRED` if name is empty or only whitespace.
  - 409 `PLAYER_ALREADY_EXISTS` if name is already present (unique constraint).
  - 400 `INVALID_REQUEST` for DB constraint errors related to provided input.

---

### 4) PATCH /players/:id

- Description: Rename a player.
 - Authentication: Requires API key.
- Path parameters:
  - `id` (integer) - player id
- Request body (JSON):
  - `name` (string) - required
- Successful response: 200
- Rate limiting: `strictRateLimiter` (2s window, max 1)

Request example:

```json
{
  "name": "Alice Cooper"
}
```

Response example:

```json
{
  "message": "Player renamed successfully",
  "player": {
    "id": 1,
    "name": "Alice Cooper",
    "created_at": "2024-01-01 12:00:00"
  }
}
```

Errors:
- 400 `PLAYER_NAME_REQUIRED` if name is empty.
- 400 `INVALID_PLAYER_ID` if id is invalid.
- 404 `PLAYER_NOT_FOUND` if the player does not exist.
- 409 `PLAYER_ALREADY_EXISTS` if new name conflicts with an existing player.

---

### 5) DELETE /players/:id

- Description: Delete a player. Matches referencing the player will cascade-delete because of FK ON DELETE CASCADE on `player_a_id` and `player_b_id`.
- Path parameters:
  - `id` (integer) - player id
- Successful response: 200
 - Authentication: Requires API key.
- Rate limiting: `strictRateLimiter` (2s window, max 1)

Response example:

```json
{
  "message": "Player deleted successfully",
  "player": {
    "id": 3,
    "name": "Charlie",
    "created_at": "2024-03-01 10:00:00"
  }
}
```

Errors:
- 400 `INVALID_PLAYER_ID` if id invalid.
- 404 `PLAYER_NOT_FOUND` if player doesn't exist.

---

### 6) GET /matches

- Description: List matches with optional filtering, sorting, and limit.
- Query parameters:
  - `played` (string) - optional. Accepts `true` or `false`. Filters matches by played state.
  - `playerId` (number) - optional. Filters matches where the given player is either player_a or player_b. Must be a positive integer.
  - `limit` (number) - optional. Positive integer maximum number of records to return (max 100).
  - `sort` (string) - optional. One of: `default`, `id_asc`, `id_desc`, `played_desc`, `played_asc`.

Default ordering (when `sort=default`) is: unplayed matches first (played ASC), then played matches ordered by played_at descending, then id ascending.

Response: 200
- Rate limiting: `relaxedRateLimiter` (2s window, max 5)

Example request URLs:
- `/api/darts/matches` (all matches)
- `/api/darts/matches?played=true&playerId=2&limit=50&sort=played_desc`

Response example:

```json
{
  "count": 2,
  "matches": [
    {
      "id": 10,
      "player_a_id": 1,
      "player_a_name": "Alice",
      "player_b_id": 2,
      "player_b_name": "Bob",
      "player_a_legs": 2,
      "player_b_legs": 1,
      "winner_player_id": 1,
      "played": 1,
      "played_at": "2024-02-01 18:00:00",
      "created_at": "2024-01-10 12:00:00"
    },
    {
      "id": 11,
      "player_a_id": 2,
      "player_a_name": "Bob",
      "player_b_id": 1,
      "player_b_name": "Alice",
      "player_a_legs": null,
      "player_b_legs": null,
      "winner_player_id": null,
      "played": 0,
      "played_at": null,
      "created_at": "2024-01-11 12:00:00"
    }
  ]
}
```

Errors:
- 400 `INVALID_MATCH_FILTER` if `played` query is not `true`/`false`.
- 400 `INVALID_PLAYER_ID` if `playerId` is not a positive integer.
- 400 `INVALID_LIMIT` if `limit` is not a positive integer or > 100.
- 400 `INVALID_SORT` if `sort` is not one of allowed values.

---

### 7) POST /matches/:id/result

- Description: Record a BO3 match result for the match with id `:id`. Validates match existence, that it has not already been played, and that the provided legs represent a valid BO3 result.
 - Authentication: Requires API key.
- Path parameters:
  - `id` (integer) - match id
- Request body (JSON):
  - `playerALegs` (integer) - required, one of 0,1,2
  - `playerBLegs` (integer) - required, one of 0,1,2

Valid match results: 2-0, 2-1, 1-2, 0-2. The service enforces that exactly one player has 2 legs and the other has 0 or 1.

Request example:

```json
{
  "playerALegs": 2,
  "playerBLegs": 1
}
```

Successful response: 200

- Rate limiting: `strictRateLimiter` (2s window, max 1)

Response example:

```json
{
  "message": "Match result recorded successfully",
  "match": {
    "id": 10,
    "player_a_id": 1,
    "player_b_id": 2,
    "player_a_legs": 2,
    "player_b_legs": 1,
    "winner_player_id": 1,
    "played": 1,
    "played_at": "2024-04-01 20:00:00",
    "player_a_name": "Alice",
    "player_b_name": "Bob"
  }
}
```

Errors:
- 400 `INVALID_MATCH_RESULT` if the result is not a valid BO3.
- 404 `MATCH_NOT_FOUND` if the match id doesn't exist.
- 409 `MATCH_ALREADY_PLAYED` if the match already has been recorded.
- 400 `INVALID_PLAYER_ID` if the path id is invalid.

---

### 7b) PATCH /matches/:id/result

 - Description: Update or correct the recorded BO3 match result for a given match id. Unlike the `POST /matches/:id/result` endpoint, this route does not fail if a result already exists — it will overwrite the stored legs/winner for the match. It still validates the BO3 legs format and that the match exists.
 - Path parameters:
   - `id` (integer) - match id
 - Request body (JSON):
   - `playerALegs` (integer) - required, one of 0,1,2
   - `playerBLegs` (integer) - required, one of 0,1,2
 - Authentication: Requires API key.

Request example:

```json
{
  "playerALegs": 2,
  "playerBLegs": 1
}
```

Successful response: 200

- Rate limiting: `strictRateLimiter` (2s window, max 1)

Response example:

```json
{
  "message": "Match result updated successfully",
  "match": {
    "id": 10,
    "player_a_id": 1,
    "player_b_id": 2,
    "player_a_legs": 2,
    "player_b_legs": 1,
    "winner_player_id": 1,
    "played": 1,
    "played_at": "2024-04-01 20:00:00",
    "player_a_name": "Alice",
    "player_b_name": "Bob"
  }
}
```

Errors:
- 400 `INVALID_MATCH_RESULT` if the result is not a valid BO3.
- 404 `MATCH_NOT_FOUND` if the match id doesn't exist.
- 400 `INVALID_PLAYER_ID` if the path id is invalid.

---

### 8) GET /standings

- Description: Returns computed standings for all players. Each row includes id, name and computed stats.
- Response: 200
- Rate limiting: `relaxedRateLimiter` (2s window, max 5)

Response fields (per row):
- `id`, `name`
- `points` (1 point for a win)
- `legs_won`
- `legs_against`
- `played` (number of matches played)
- `wins`
- `losses`

Example response:

```json
{
  "count": 2,
  "standings": [
    {
      "id": 1,
      "name": "Alice",
      "points": 4,
      "legs_won": 6,
      "legs_against": 2,
      "played": 3,
      "wins": 2,
      "losses": 1
    },
    {
      "id": 2,
      "name": "Bob",
      "points": 2,
      "legs_won": 3,
      "legs_against": 5,
      "played": 3,
      "wins": 1,
      "losses": 2
    }
  ]
}
```

Ordering is by points DESC, legs_won DESC, legs_against ASC, name ASC.

---

# Implementation notes (useful for front-end integration)

- Dates are returned as strings in the DB's default datetime format (e.g. "YYYY-MM-DD HH:MM:SS").
- `played` is returned as 0 or 1 (integers). Treat `played === 1` as true and `0` as false.
- Match objects include both `player_*_id` and `player_*_name` for convenience.
- When creating players, front-end should expect that many new match rows may be created; `fixturesCreated` in the response indicates the number.
- When recording results, send integer legs (not strings). The service coerces inputs to Number and validates.

---
