# Famban API Documentation

Base URL: `/api/famban`

This document describes the available endpoints implemented under `src/routes/famban`. Famban is the umbrella for family-oriented tools; `users` and `tags` are shared across every module, and `kanban` (boards + cards) is the first module built on top of them. It includes each endpoint's purpose, inputs (path/query/body), returned JSON, and common error responses.

---

## Folder layout

```
src/routes/famban/
  index.js                 - mounts /users, /tags, /kanban
  database.js               - creates/updates collections + indexes at startup
  shared/                    - cross-cutting utilities used by every resource
    auth.js                    requireApiKey middleware
    errors.js                  createAppError / sendRouteError
    ids.js                     parseObjectId
    rateLimiters.js            fambanRateLimiter
    collections.js             collection name constants
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

Each resource folder is self-contained: `<resource>.js` is the Express router, `<resource>.service.js` holds the business logic and MongoDB operations, `<resource>.schema.js` is the MongoDB `$jsonSchema` validator that Mongo enforces server-side (see "Database notes" below). Future modules (e.g. shopping-lists) mount alongside `kanban` in `index.js` and can reuse `users`/`tags`/`shared` as-is.

---

## Summary of available endpoints

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
  - `email` (string or null) - sparse unique index; future join key for Google OAuth allowlisting
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
  - `SERVER_MISCONFIGURED` (500) - `FAMBAN_API_KEY` isn't set in the environment

Authentication:

- Write endpoints (`POST`/`PATCH`/`DELETE`) require an API key via the `x-api-key` header, checked against `FAMBAN_API_KEY`. Missing/incorrect key returns 401 `UNAUTHORIZED`.
- Read endpoints (`GET`) do not require the API key.
- There is no per-user identity yet - the API key is shared across all callers. `userId` on comments/assignees is caller-supplied and not verified against a logged-in session. This is a placeholder for a future Google OAuth + allowlist flow keyed on `famban-users.email`.

Rate limiting:

- All Famban routes use `fambanRateLimiter` (10s window, max 30 requests) - deliberately more lenient than the app's shared default limiter (2s window, max 5), since normal kanban usage (creating several cards, commenting back and forth) exceeds that quickly.
- 429 responses follow the express-rate-limit default shape: `{ "error": "Too many requests, please wait before trying again." }`.

---

# Endpoints

## Users

### 1) GET /users

- Description: List all family members, sorted by name.
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

### 2) POST /users

- Description: Create a family member.
- Authentication: Requires API key.
- Request body: `name` (string, required), `email` (string, optional)
- Successful response: 201

```json
{ "name": "Connor", "email": "connor@example.com" }
```

Errors: `USER_NAME_REQUIRED` (400), `USER_ALREADY_EXISTS` (409, duplicate email).

---

### 3) PATCH /users/:id

- Description: Update a family member's name, email, or active flag.
- Authentication: Requires API key.
- Request body (all optional): `name`, `email`, `active`

```json
{ "active": false }
```

Errors: `INVALID_ID`, `USER_NAME_REQUIRED` (400), `USER_NOT_FOUND` (404), `USER_ALREADY_EXISTS` (409).

---

## Tags

### 4) GET /tags

- Description: List all tags, sorted by name.
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

### 5) POST /tags

- Description: Create a tag. Names are unique, case-insensitively.
- Authentication: Requires API key.
- Request body: `name` (string, required), `color` (hex string, optional - defaults to `#94a3b8`)

```json
{ "name": "urgent", "color": "#ef4444" }
```

Errors: `TAG_NAME_REQUIRED` (400), `INVALID_TAG_COLOR` (400), `TAG_ALREADY_EXISTS` (409).

---

### 6) PATCH /tags/:id

- Description: Rename a tag or change its color.
- Authentication: Requires API key.
- Request body (all optional): `name`, `color`

Errors: `INVALID_ID`, `TAG_NAME_REQUIRED`, `INVALID_TAG_COLOR` (400), `TAG_NOT_FOUND` (404), `TAG_ALREADY_EXISTS` (409).

---

### 7) DELETE /tags/:id

- Description: Delete a tag. Any card carrying it is silently untagged (the tag id is pulled from `card.tags`) rather than blocking the delete - tags are freeform labels, not structural like columns.
- Authentication: Requires API key.
- Successful response: 200 `{ "message": "Tag deleted successfully" }`

Errors: `INVALID_ID` (400), `TAG_NOT_FOUND` (404).

---

## Kanban - Boards

### 8) GET /kanban/boards

- Description: List all boards.
- Rate limiting: `fambanRateLimiter`

---

### 9) GET /kanban/boards/:id

- Description: Get a single board, including its columns.

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

### 10) POST /kanban/boards

- Description: Create a board. If `columns` isn't provided, defaults to `["To Do", "In Progress", "Done"]`.
- Authentication: Requires API key.
- Request body: `name` (string, required), `description` (string, optional), `columns` (string[], optional - column names, ids are generated)

```json
{ "name": "Chores", "description": "Weekly household chores" }
```

Errors: `BOARD_NAME_REQUIRED`, `COLUMN_NAME_REQUIRED` (400).

---

### 11) PATCH /kanban/boards/:id

- Description: Update a board's name/description.
- Authentication: Requires API key.
- Request body (all optional): `name`, `description`

Errors: `INVALID_ID`, `BOARD_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` (404).

---

### 12) POST /kanban/boards/:id/columns

- Description: Add a column to a board (appended at the end).
- Authentication: Requires API key.
- Request body: `name` (string, required)
- Successful response: 201, returns the new `{ id, name, order }`

Errors: `INVALID_ID`, `COLUMN_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` (404).

---

### 13) PATCH /kanban/boards/:id/columns/:columnId

- Description: Rename a column.
- Authentication: Requires API key.
- Request body: `name` (string, required)

Errors: `INVALID_ID`, `COLUMN_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404).

---

### 14) DELETE /kanban/boards/:id/columns/:columnId

- Description: Delete a column. Blocked if any card is still in that column.
- Authentication: Requires API key.
- Successful response: 200 `{ "message": "Column deleted successfully" }`

Errors: `INVALID_ID` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404), `COLUMN_NOT_EMPTY` (409).

---

## Kanban - Cards

### 15) GET /kanban/cards

- Description: List cards, sorted by board/column/order.
- Query parameters (all optional): `boardId`, `columnId`, `status` (`open`|`done`|`closed`), `assignee` (user id), `tag` (tag id)
- Rate limiting: `fambanRateLimiter`

Example: `/api/famban/kanban/cards?boardId=<id>&status=open&assignee=<userId>`

Errors: `INVALID_ID` (400, malformed `boardId`/`assignee`/`tag`), `INVALID_STATUS` (400).

---

### 16) GET /kanban/cards/:id

- Description: Get a single card, including embedded comments.

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

### 17) POST /kanban/cards

- Description: Create a card in a board's column. `order` is computed automatically (appended to the end of the column). `status` always starts as `open`.
- Authentication: Requires API key.
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

### 18) PATCH /kanban/cards/:id

- Description: General update - title, description, move to a different column, or set an explicit `order` (e.g. for drag-and-drop reordering within a column). Moving to a new column without an explicit `order` appends the card to the end of the destination column.
- Authentication: Requires API key.
- Request body (all optional): `title`, `description`, `columnId`, `order` (integer)

Errors: `CARD_TITLE_REQUIRED`, `INVALID_ORDER` (400), `CARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404).

---

### 19) POST /kanban/cards/:id/status

- Description: Transition a card's lifecycle status. Setting `done` stamps `doneAt`; setting `closed` stamps `closedAt`; setting `open` (reopen) clears both. `status` is independent of `columnId` - moving a card to a "Done" column does not itself change `status`.
- Authentication: Requires API key.
- Request body: `status` (`open` | `done` | `closed`, required)

```json
{ "status": "done" }
```

Errors: `INVALID_STATUS` (400), `CARD_NOT_FOUND` (404).

---

### 20) POST /kanban/cards/:id/assign

- Description: Replace a card's assignees wholesale.
- Authentication: Requires API key.
- Request body: `assigneeIds` (user id[], required - empty array clears assignees)

```json
{ "assigneeIds": ["6a6fb751f319991a0322aafb"] }
```

Errors: `INVALID_ASSIGNEES` (400), `CARD_NOT_FOUND` (404).

---

### 21) POST /kanban/cards/:id/tags

- Description: Replace a card's tags wholesale.
- Authentication: Requires API key.
- Request body: `tagIds` (tag id[], required - empty array clears tags)

```json
{ "tagIds": ["6a6fc8ac6fca7d389e5bdc1c"] }
```

Errors: `INVALID_TAGS` (400), `CARD_NOT_FOUND` (404).

---

### 22) POST /kanban/cards/:id/comments

- Description: Append a comment to a card.
- Authentication: Requires API key.
- Request body: `text` (string, required), `userId` (user id, optional)
- Successful response: 201, returns the full updated card

```json
{ "userId": "6a6fb751f319991a0322aafb", "text": "On it" }
```

Errors: `COMMENT_TEXT_REQUIRED` (400), `INVALID_ASSIGNEES` (400, if `userId` doesn't resolve to a real user - reuses the assignee-resolution error), `CARD_NOT_FOUND` (404).

---

# Implementation notes (useful for front-end integration)

- All ids are MongoDB ObjectIds serialized as hex strings (`_id`, `boardId`, entries in `assignees`/`tags`), except `columnId`, which is a UUID scoped to its board's `columns[]` array.
- Dates are ISO 8601 strings (`Date` serialized via `JSON.stringify`).
- `status` and `columnId` are independent concepts by design: `status` is the card's lifecycle (open/done/closed), `columnId` is its position in the board's workflow. A card can sit in a "Done" column while `status` is still `open` - nothing syncs them automatically.
- There's no card delete endpoint, only status transitions (`close`/`reopen`) - this preserves history. Revisit if that turns out to be wrong.
- `order` is a plain integer per column, not fractional - reordering N cards in a column means the client may need to PATCH up to N cards' `order` values.
