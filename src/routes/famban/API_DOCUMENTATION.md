# Famban API Documentation

Base URL: `/api/famban`

This document describes the available endpoints implemented under `src/routes/famban`. Famban is the umbrella for family-oriented tools; `users` and `tags` are shared across every module, and `kanban` (boards + cards) is the first module built on top of them. It includes each endpoint's purpose, inputs (path/query/body), returned JSON, and common error responses.

---

## Folder layout

```
src/routes/famban/
  index.js                 - mounts /auth, /users, /tags, /kanban
  database.js               - creates/updates collections + indexes at startup
  shared/                    - cross-cutting utilities used by every resource
    requireSession.js          middleware gating every route behind a login
    session.js                  signs/verifies the session JWT
    errors.js                  createAppError / sendRouteError
    ids.js                     parseObjectId
    rateLimiters.js            fambanRateLimiter
    collections.js             collection name constants
  auth/                       Google sign-in -> session issuance (shared across modules)
    auth.js, auth.service.js
  users/                      family members (shared across modules)
    users.js, users.service.js, users.schema.js
  tags/                        global label vocabulary (shared across modules)
    tags.js, tags.service.js, tags.schema.js
  kanban/                      first module built on users + tags
    index.js                     mounts /boards, /cards
    boards/
      boards.js, boards.service.js, boards.schema.js
    cards/
      cards.js, cards.service.js, cards.schema.js
```

Each resource folder is self-contained: `<resource>.js` is the Express router, `<resource>.service.js` holds the business logic and MongoDB operations, `<resource>.schema.js` (where applicable) is the MongoDB `$jsonSchema` validator that Mongo enforces server-side (see "Database notes" below). `auth` doesn't own a collection of its own - it reads from `famban-users` and issues stateless session JWTs. Future modules (e.g. shopping-lists) mount alongside `kanban` in `index.js` and can reuse `auth`/`users`/`tags`/`shared` as-is.

---

## Summary of available endpoints

- POST /auth/google
- GET /auth/me
- GET /users
- POST /users
- PATCH /users/:id
- GET /tags
- POST /tags
- PATCH /tags/:id
- DELETE /tags/:id
- GET /kanban/boards
- GET /kanban/boards/:id
- POST /kanban/boards
- PATCH /kanban/boards/:id
- POST /kanban/boards/:id/columns
- PATCH /kanban/boards/:id/columns/:columnId
- DELETE /kanban/boards/:id/columns/:columnId
- GET /kanban/cards
- GET /kanban/cards/:id
- POST /kanban/cards
- PATCH /kanban/cards/:id
- POST /kanban/cards/:id/status
- POST /kanban/cards/:id/assign
- POST /kanban/cards/:id/tags
- POST /kanban/cards/:id/comments

---

## Database notes

MongoDB (the shared client from `src/database/mongo.js`, database `milloy-dev`). Every collection has a `$jsonSchema` validator applied at startup (`database.js`, `validationLevel: 'strict'`), so documents that don't match the shape below are rejected by Mongo itself, not just by the service layer.

- `famban-users`:
  - `name` (string, required)
  - `email` (string or null) - sparse unique index; join key for Google sign-in (see "Authentication" below) - must be set and `active: true` for that email to be able to log in
  - `active` (bool, required)
  - `createdAt`, `updatedAt` (date, required)

- `famban-tags`:
  - `name` (string, required) - unique, case-insensitive (`collation: { locale: 'en', strength: 2 }`)
  - `color` (string, required) - hex code, e.g. `#94a3b8`
  - `createdAt`, `updatedAt` (date, required)

- `famban-boards`:
  - `name` (string, required)
  - `description` (string or null)
  - `columns` (array, required) - `[{ id, name, order }]`, ids are UUIDs generated server-side
  - `createdAt`, `updatedAt` (date, required)

- `famban-cards`:
  - `boardId` (ObjectId, required), `columnId` (string, required - references a `columns[].id` on the board)
  - `title` (string, required), `description` (string or null)
  - `status` (enum: `open` | `done` | `closed`, required)
  - `assignees` (ObjectId[], required) - references `famban-users`
  - `tags` (ObjectId[], required) - references `famban-tags`
  - `order` (int, required) - position within its column
  - `comments` (array, required) - `[{ id, userId, text, createdAt }]`, embedded
  - `doneAt`, `closedAt` (date or null) - set/cleared by status transitions
  - `createdAt`, `updatedAt` (date, required)

Indexes: `famban-users.email` (unique, sparse), `famban-tags.name` (unique, case-insensitive), `famban-cards.boardId+columnId`, `famban-cards.boardId+status`.

---

## Errors and conventions

- Errors use `{ "error": "<CODE>", "message": "<human readable>" }`. The service layer throws typed errors (`createAppError(message, code, status)`); the route handler translates these via `sendRouteError`.
- Unexpected server errors return 500 with `error: "INTERNAL_SERVER_ERROR"`.
- Common error codes:
  - `INVALID_ID` (400) - malformed ObjectId in a path/query param
  - `USER_NAME_REQUIRED` / `TAG_NAME_REQUIRED` / `BOARD_NAME_REQUIRED` / `CARD_TITLE_REQUIRED` / `COLUMN_NAME_REQUIRED` / `COMMENT_TEXT_REQUIRED` (400)
  - `USER_NOT_FOUND` / `TAG_NOT_FOUND` / `BOARD_NOT_FOUND` / `CARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404)
  - `USER_ALREADY_EXISTS` / `TAG_ALREADY_EXISTS` (409) - duplicate email/name
  - `INVALID_TAG_COLOR` (400) - color isn't a `#rrggbb` hex string
  - `INVALID_ASSIGNEES` / `INVALID_TAGS` (400) - one or more referenced ids don't exist
  - `INVALID_STATUS` (400) - status isn't `open`/`done`/`closed`
  - `INVALID_ORDER` (400) - `order` isn't an integer
  - `COLUMN_NOT_EMPTY` (409) - tried to delete a column that still has cards on it
  - `GOOGLE_CREDENTIAL_REQUIRED` (400) - `POST /auth/google` called without a `credential`
  - `INVALID_GOOGLE_CREDENTIAL` (401) - the Google ID token failed signature/audience verification
  - `GOOGLE_EMAIL_UNVERIFIED` (401) - the Google account's email isn't verified
  - `ACCOUNT_NOT_AUTHORIZED` (403) - the Google account's email doesn't match an active `famban-users` record
  - `SERVER_MISCONFIGURED` (500) - `GOOGLE_CLIENT_ID` or `FAMBAN_SESSION_SECRET` isn't set in the environment

Authentication:

- **Every** route - reads included - requires a session, via `requireSession`. This is a private family app, not a public read surface.
- Sessions are obtained by `POST /auth/google` (see below) and carried as `Authorization: Bearer <token>` on every subsequent request. There are no cookies involved.
- The session is a stateless JWT (`FAMBAN_SESSION_SECRET`, 7 day expiry) containing `{ userId, email, name }`. It can't be revoked before it expires short of rotating the secret (which invalidates every session at once) - acceptable for a two-person household app, revisit if that changes.
- Login itself is gated by two independent allowlists: Google's OAuth consent screen is left in **Testing** mode with an explicit test-user list (Google rejects anyone else before your code runs at all), and the backend separately requires the email to match an `active: true` `famban-users` record (no auto-provisioning from an arbitrary Google login). Adding a new family member means creating their `famban-users` row first (via `POST /users`, or `scripts/seedFambanUsers.js` for the very first account) _and_ adding them as a Google test user.
- Route handlers read the authenticated identity off `req.fambanUser` (set by `requireSession`) rather than trusting client-supplied ids - e.g. `POST /kanban/cards/:id/comments` ignores any `userId` in the request body and always attributes the comment to the logged-in caller.

Rate limiting:

- All Famban routes use `fambanRateLimiter` (10s window, max 30 requests) - deliberately more lenient than the app's shared default limiter (2s window, max 5), since normal kanban usage (creating several cards, commenting back and forth) exceeds that quickly.
- 429 responses follow the express-rate-limit default shape: `{ "error": "Too many requests, please wait before trying again." }`.

---

# Endpoints

## Auth

### 1) POST /auth/google

- Description: Exchange a Google ID token for a Famban session. Not gated by `requireSession` - this is how a session gets created in the first place.
- Request body: `credential` (string, required) - the ID token returned by Google Identity Services' "Sign in with Google" button on the frontend.
- Successful response: 200, returns `{ token, user }` - the client stores `token` and sends it as `Authorization: Bearer <token>` on every subsequent request.

```json
{ "credential": "<google-id-token-jwt>" }
```

```json
{
  "message": "Logged in successfully",
  "token": "<famban-session-jwt>",
  "user": {
    "_id": "6a6fb751f319991a0322aafb",
    "name": "Connor",
    "email": "connor@example.com"
  }
}
```

Errors: `GOOGLE_CREDENTIAL_REQUIRED` (400), `INVALID_GOOGLE_CREDENTIAL` / `GOOGLE_EMAIL_UNVERIFIED` (401), `ACCOUNT_NOT_AUTHORIZED` (403 - Google login succeeded but the email isn't an active `famban-users` record).

---

### 2) GET /auth/me

- Description: Returns the decoded session for the caller - useful for the frontend to validate a stored token on load without hitting a heavier endpoint.
- Authentication: Requires a session (`Authorization: Bearer <token>`).

```json
{
  "user": {
    "userId": "6a6fb751f319991a0322aafb",
    "email": "connor@example.com",
    "name": "Connor",
    "iat": 1234567890,
    "exp": 1235172690
  }
}
```

---

## Users

### 3) GET /users

- Description: List all family members, sorted by name.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Rate limiting: `fambanRateLimiter`

```json
{
  "count": 1,
  "users": [
    {
      "_id": "6a6fb751f319991a0322aafb",
      "name": "Connor",
      "email": "connor@example.com",
      "active": true,
      "createdAt": "2026-08-02T21:32:01.384Z",
      "updatedAt": "2026-08-02T21:32:01.384Z"
    }
  ]
}
```

---

### 4) POST /users

- Description: Create a family member.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required), `email` (string, optional)
- Successful response: 201

```json
{ "name": "Connor", "email": "connor@example.com" }
```

Errors: `USER_NAME_REQUIRED` (400), `USER_ALREADY_EXISTS` (409, duplicate email).

---

### 5) PATCH /users/:id

- Description: Update a family member's name, email, or active flag.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body (all optional): `name`, `email`, `active`

```json
{ "active": false }
```

Errors: `INVALID_ID`, `USER_NAME_REQUIRED` (400), `USER_NOT_FOUND` (404), `USER_ALREADY_EXISTS` (409).

---

## Tags

### 6) GET /tags

- Description: List all tags, sorted by name.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Rate limiting: `fambanRateLimiter`

```json
{
  "count": 1,
  "tags": [
    {
      "_id": "6a6fc8ac6fca7d389e5bdc1c",
      "name": "urgent",
      "color": "#ef4444",
      "createdAt": "2026-08-02T22:46:04.760Z",
      "updatedAt": "2026-08-02T22:46:04.760Z"
    }
  ]
}
```

---

### 7) POST /tags

- Description: Create a tag. Names are unique, case-insensitively.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required), `color` (hex string, optional - defaults to `#94a3b8`)

```json
{ "name": "urgent", "color": "#ef4444" }
```

Errors: `TAG_NAME_REQUIRED` (400), `INVALID_TAG_COLOR` (400), `TAG_ALREADY_EXISTS` (409).

---

### 8) PATCH /tags/:id

- Description: Rename a tag or change its color.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body (all optional): `name`, `color`

Errors: `INVALID_ID`, `TAG_NAME_REQUIRED`, `INVALID_TAG_COLOR` (400), `TAG_NOT_FOUND` (404), `TAG_ALREADY_EXISTS` (409).

---

### 9) DELETE /tags/:id

- Description: Delete a tag. Any card carrying it is silently untagged (the tag id is pulled from `card.tags`) rather than blocking the delete - tags are freeform labels, not structural like columns.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Successful response: 200 `{ "message": "Tag deleted successfully" }`

Errors: `INVALID_ID` (400), `TAG_NOT_FOUND` (404).

---

## Kanban - Boards

### 10) GET /kanban/boards

- Description: List all boards.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Rate limiting: `fambanRateLimiter`

---

### 11) GET /kanban/boards/:id

- Description: Get a single board, including its columns.
- Authentication: Requires a session (`Authorization: Bearer <token>`).

```json
{
  "_id": "6a6fb751f319991a0322aafc",
  "name": "Family Board",
  "description": null,
  "columns": [
    {
      "id": "589d7e78-bebf-4348-92e9-12d4f2e94f7e",
      "name": "To Do",
      "order": 0
    },
    {
      "id": "28ecc1ec-de41-4113-a250-7930ec4329f7",
      "name": "In Progress",
      "order": 1
    },
    { "id": "2b74979d-9983-4333-913e-a009a74ee7c4", "name": "Done", "order": 2 }
  ],
  "createdAt": "2026-08-02T21:32:01.497Z",
  "updatedAt": "2026-08-02T21:32:01.497Z"
}
```

Errors: `INVALID_ID` (400), `BOARD_NOT_FOUND` (404).

---

### 12) POST /kanban/boards

- Description: Create a board. If `columns` isn't provided, defaults to `["To Do", "In Progress", "Done"]`.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required), `description` (string, optional), `columns` (string[], optional - column names, ids are generated)

```json
{ "name": "Chores", "description": "Weekly household chores" }
```

Errors: `BOARD_NAME_REQUIRED`, `COLUMN_NAME_REQUIRED` (400).

---

### 13) PATCH /kanban/boards/:id

- Description: Update a board's name/description.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body (all optional): `name`, `description`

Errors: `INVALID_ID`, `BOARD_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` (404).

---

### 14) POST /kanban/boards/:id/columns

- Description: Add a column to a board (appended at the end).
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required)
- Successful response: 201, returns the new `{ id, name, order }`

Errors: `INVALID_ID`, `COLUMN_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` (404).

---

### 15) PATCH /kanban/boards/:id/columns/:columnId

- Description: Rename a column.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required)

Errors: `INVALID_ID`, `COLUMN_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404).

---

### 16) DELETE /kanban/boards/:id/columns/:columnId

- Description: Delete a column. Blocked if any card is still in that column.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Successful response: 200 `{ "message": "Column deleted successfully" }`

Errors: `INVALID_ID` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404), `COLUMN_NOT_EMPTY` (409).

---

## Kanban - Cards

### 17) GET /kanban/cards

- Description: List cards, sorted by board/column/order.
- Query parameters (all optional): `boardId`, `columnId`, `status` (`open`|`done`|`closed`), `assignee` (user id), `tag` (tag id)
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Rate limiting: `fambanRateLimiter`

Example: `/api/famban/kanban/cards?boardId=<id>&status=open&assignee=<userId>`

Errors: `INVALID_ID` (400, malformed `boardId`/`assignee`/`tag`), `INVALID_STATUS` (400).

---

### 18) GET /kanban/cards/:id

- Description: Get a single card, including embedded comments.
- Authentication: Requires a session (`Authorization: Bearer <token>`).

```json
{
  "_id": "6a6fb751f319991a0322aafd",
  "boardId": "6a6fb751f319991a0322aafc",
  "columnId": "589d7e78-bebf-4348-92e9-12d4f2e94f7e",
  "title": "Take out bins",
  "description": null,
  "status": "open",
  "assignees": ["6a6fb751f319991a0322aafb"],
  "tags": [],
  "order": 0,
  "comments": [
    {
      "id": "5a95f31b-a3e6-409c-99cf-42f70fcbc2b1",
      "userId": "6a6fb751f319991a0322aafb",
      "text": "On it",
      "createdAt": "2026-08-02T21:32:02.087Z"
    }
  ],
  "doneAt": null,
  "closedAt": null,
  "createdAt": "2026-08-02T21:32:01.792Z",
  "updatedAt": "2026-08-02T21:32:02.087Z"
}
```

Errors: `INVALID_ID` (400), `CARD_NOT_FOUND` (404).

---

### 19) POST /kanban/cards

- Description: Create a card in a board's column. `order` is computed automatically (appended to the end of the column). `status` always starts as `open`.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `boardId` (required), `columnId` (required), `title` (required), `description` (optional), `assignees` (user id[], optional), `tags` (tag id[], optional)
- Successful response: 201

```json
{
  "boardId": "6a6fb751f319991a0322aafc",
  "columnId": "589d7e78-bebf-4348-92e9-12d4f2e94f7e",
  "title": "Take out bins",
  "assignees": ["6a6fb751f319991a0322aafb"],
  "tags": ["6a6fc8ac6fca7d389e5bdc1c"]
}
```

Errors: `CARD_TITLE_REQUIRED` (400), `INVALID_ID` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404), `INVALID_ASSIGNEES` / `INVALID_TAGS` (400).

---

### 20) PATCH /kanban/cards/:id

- Description: General update - title, description, move to a different column, or set an explicit `order` (e.g. for drag-and-drop reordering within a column). Moving to a new column without an explicit `order` appends the card to the end of the destination column.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body (all optional): `title`, `description`, `columnId`, `order` (integer)

Errors: `CARD_TITLE_REQUIRED`, `INVALID_ORDER` (400), `CARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404).

---

### 21) POST /kanban/cards/:id/status

- Description: Transition a card's lifecycle status. Setting `done` stamps `doneAt`; setting `closed` stamps `closedAt`; setting `open` (reopen) clears both. `status` is independent of `columnId` - moving a card to a "Done" column does not itself change `status`.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `status` (`open` | `done` | `closed`, required)

```json
{ "status": "done" }
```

Errors: `INVALID_STATUS` (400), `CARD_NOT_FOUND` (404).

---

### 22) POST /kanban/cards/:id/assign

- Description: Replace a card's assignees wholesale.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `assigneeIds` (user id[], required - empty array clears assignees)

```json
{ "assigneeIds": ["6a6fb751f319991a0322aafb"] }
```

Errors: `INVALID_ASSIGNEES` (400), `CARD_NOT_FOUND` (404).

---

### 23) POST /kanban/cards/:id/tags

- Description: Replace a card's tags wholesale.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `tagIds` (tag id[], required - empty array clears tags)

```json
{ "tagIds": ["6a6fc8ac6fca7d389e5bdc1c"] }
```

Errors: `INVALID_TAGS` (400), `CARD_NOT_FOUND` (404).

---

### 24) POST /kanban/cards/:id/comments

- Description: Append a comment to a card. `userId` is taken from the caller's session, not the request body - you cannot attribute a comment to anyone but yourself.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `text` (string, required)
- Successful response: 201, returns the full updated card

```json
{ "text": "On it" }
```

Errors: `COMMENT_TEXT_REQUIRED` (400), `CARD_NOT_FOUND` (404).

---

# Implementation notes (useful for front-end integration)

- All ids are MongoDB ObjectIds serialized as hex strings (`_id`, `boardId`, entries in `assignees`/`tags`), except `columnId`, which is a UUID scoped to its board's `columns[]` array.
- Dates are ISO 8601 strings (`Date` serialized via `JSON.stringify`).
- `status` and `columnId` are independent concepts by design: `status` is the card's lifecycle (open/done/closed), `columnId` is its position in the board's workflow. A card can sit in a "Done" column while `status` is still `open` - nothing syncs them automatically.
- There's no card delete endpoint, only status transitions (`close`/`reopen`) - this preserves history. Revisit if that turns out to be wrong.
- `order` is a plain integer per column, not fractional - reordering N cards in a column means the client may need to PATCH up to N cards' `order` values.
- Frontend login flow: render Google Identity Services' "Sign in with Google" button with the `GOOGLE_CLIENT_ID`, POST the resulting `credential` to `POST /auth/google`, store the returned `token`, and attach it as `Authorization: Bearer <token>` on every request thereafter. A 401 on any request means the token is missing/expired/invalid - re-run the login flow.
