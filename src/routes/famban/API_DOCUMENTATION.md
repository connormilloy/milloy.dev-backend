# Famban API Documentation

Base URL: `/api/famban` (local dev: `http://localhost:5555/api/famban`, server listens on port 5555 - see `src/index.js`)

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
- PATCH /kanban/cards/:id/comments/:commentId
- DELETE /kanban/cards/:id/comments/:commentId

---

## Database notes

MongoDB (the shared client from `src/database/mongo.js`, database `milloy-dev`). Every collection has a `$jsonSchema` validator applied at startup (`database.js`, `validationLevel: 'strict'`), so documents that don't match the shape below are rejected by Mongo itself, not just by the service layer.

- `famban-users`:
  - `name` (string, required)
  - `email` (string or null) - sparse unique index; join key for Google sign-in (see "Authentication" below) - must be set and `active: true` for that email to be able to log in
  - `avatarUrl` (string or null) - the account's Google profile photo URL, populated/refreshed from the ID token's `picture` claim on every `POST /auth/google` login (see "Authentication" below). `null` until the first login, and for family members created via `POST /users` who've never signed in.
  - `active` (bool, required)
  - `createdAt`, `updatedAt` (date, required)

- `famban-tags`:
  - `name` (string, required) - unique, case-insensitive (`collation: { locale: 'en', strength: 2 }`)
  - `color` (string, required) - hex code, e.g. `#94a3b8`
  - `createdAt`, `updatedAt` (date, required)

- `famban-boards`:
  - `name` (string, required)
  - `description` (string or null)
  - `columns` (array, required) - `[{ id, name, order, kind }]`, ids are UUIDs generated server-side
    - `kind` (enum: `todo` | `in_progress` | `done` | `null`, optional) - marks a column as structurally managed by card `status` (see "Column kinds" below). Boards created before this field existed have no `kind` on any column and are left as-is (see "Implementation notes").
  - `archived` (bool, required) - soft-delete flag (see "Archiving boards" below). Boards created before this field existed were backfilled to `archived: false` at startup (`database.js`), unlike the `kind` backfill gap above - there is no "legacy boards" caveat for this one.
  - `archivedAt` (date or null) - set/cleared alongside `archived`, same shape as `doneAt`/`closedAt` on cards
  - `createdAt`, `updatedAt` (date, required)

- `famban-cards`:
  - `boardId` (ObjectId, required), `columnId` (string, required - references a `columns[].id` on the board)
  - `title` (string, required), `description` (string or null)
  - `status` (enum: `open` | `in_progress` | `done` | `closed`, required)
  - `assignees` (ObjectId[], required) - references `famban-users`
  - `tags` (ObjectId[], required) - references `famban-tags`
  - `order` (int, required) - position within its column
  - `comments` (array, required) - `[{ id, userId, text, createdAt, editedAt }]`, embedded
    - `editedAt` (date or null, required) - set when the comment's author edits its `text` via `PATCH .../comments/:commentId`, `null` until then. Comments predating this field were backfilled to `editedAt: null` at startup (`database.js`), same approach as `archived` on boards.
  - `doneAt`, `closedAt` (date or null) - set/cleared by status transitions
  - `createdAt`, `updatedAt` (date, required)

Indexes: `famban-users.email` (unique, sparse), `famban-tags.name` (unique, case-insensitive), `famban-cards.boardId+columnId`, `famban-cards.boardId+status`.

---

## Errors and conventions

- Errors use `{ "error": "<CODE>", "message": "<human readable>" }`. The service layer throws typed errors (`createAppError(message, code, status)`); the route handler translates these via `sendRouteError`.
- Unexpected server errors return 500 with `error: "INTERNAL_SERVER_ERROR"`.
- Successful response envelope: creates/updates return `{ message: "<description>", <resourceName>: {...} }` (e.g. `{ message, user }`, `{ message, card }`); lists return `{ count, <resourceName>s: [...] }`; deletes return just `{ message }`. `GET /:id` endpoints and `POST /auth/google` are the exceptions - see their entries below for exact shape.
- Common error codes:
  - `INVALID_ID` (400) - malformed ObjectId in a path/query param
  - `USER_NAME_REQUIRED` / `TAG_NAME_REQUIRED` / `BOARD_NAME_REQUIRED` / `CARD_TITLE_REQUIRED` / `COLUMN_NAME_REQUIRED` / `COMMENT_TEXT_REQUIRED` (400)
  - `USER_NOT_FOUND` / `TAG_NOT_FOUND` / `BOARD_NOT_FOUND` / `CARD_NOT_FOUND` / `COLUMN_NOT_FOUND` / `COMMENT_NOT_FOUND` (404)
  - `USER_ALREADY_EXISTS` / `TAG_ALREADY_EXISTS` (409) - duplicate email/name
  - `INVALID_TAG_COLOR` (400) - color isn't a `#rrggbb` hex string
  - `INVALID_ASSIGNEES` / `INVALID_TAGS` (400) - one or more referenced ids don't exist
  - `INVALID_STATUS` (400) - status isn't `open`/`in_progress`/`done`/`closed`
  - `INVALID_ORDER` (400) - `order` isn't an integer
  - `COMMENT_NOT_OWNER` (403) - tried to edit or delete a comment posted by a different family member (or one with no author at all)
  - `COLUMN_NOT_EMPTY` (409) - tried to delete a column that still has cards on it
  - `COLUMN_KIND_PROTECTED` (400) - tried to delete a `todo`/`in_progress`/`done` kinded column; only plain (`kind: null`) columns can be deleted
  - `COLUMN_STATUS_MANAGED` (400) - tried to create or move a card directly into an `in_progress` or `done` kinded column; those are only reachable via `POST /kanban/cards/:id/status`
  - `GOOGLE_CREDENTIAL_REQUIRED` (400) - `POST /auth/google` called without a `credential`
  - `INVALID_GOOGLE_CREDENTIAL` (401) - the Google ID token failed signature/audience verification
  - `GOOGLE_EMAIL_UNVERIFIED` (401) - the Google account's email isn't verified
  - `ACCOUNT_NOT_AUTHORIZED` (403) - the Google account's email doesn't match an active `famban-users` record
  - `SERVER_MISCONFIGURED` (500) - `GOOGLE_CLIENT_ID` or `FAMBAN_SESSION_SECRET` isn't set in the environment

Authentication:

- **Every** route - reads included - requires a session, via `requireSession`. This is a private family app, not a public read surface.
- Sessions are obtained by `POST /auth/google` (see below) and carried as `Authorization: Bearer <token>` on every subsequent request. There are no cookies involved.
- The session is a stateless JWT (`FAMBAN_SESSION_SECRET`, 7 day expiry) containing `{ userId, email, name, avatarUrl }`. It can't be revoked before it expires short of rotating the secret (which invalidates every session at once) - acceptable for a two-person household app, revisit if that changes. `avatarUrl` is a snapshot taken at login time - if it changes on Google's side mid-session, the session JWT won't reflect that until the next login (`GET /users` always has the current value, since it reads the database directly).
- Login itself is gated by two independent allowlists: Google's OAuth consent screen is left in **Testing** mode with an explicit test-user list (Google rejects anyone else before your code runs at all), and the backend separately requires the email to match an `active: true` `famban-users` record (no auto-provisioning from an arbitrary Google login). Adding a new family member means creating their `famban-users` row first (via `POST /users`, or `scripts/seedFambanUsers.js` for the very first account) _and_ adding them as a Google test user.
- Route handlers read the authenticated identity off `req.fambanUser` (set by `requireSession`) rather than trusting client-supplied ids - e.g. `POST /kanban/cards/:id/comments` ignores any `userId` in the request body and always attributes the comment to the logged-in caller. The same identity is used to authorize `PATCH`/`DELETE /kanban/cards/:id/comments/:commentId` - a caller can only edit or delete a comment whose stored `userId` matches their own session `userId`, never a value from the request body.

Rate limiting:

- All Famban routes use `fambanRateLimiter` (10s window, max 30 requests) - deliberately more lenient than the app's shared default limiter (2s window, max 5), since normal kanban usage (creating several cards, commenting back and forth) exceeds that quickly.
- 429 responses follow the express-rate-limit default shape: `{ "error": "Too many requests, please wait before trying again." }`.

---

# Endpoints

## Auth

### 1) POST /auth/google

- Description: Exchange a Google ID token for a Famban session. Not gated by `requireSession` - this is how a session gets created in the first place. Also refreshes the user's stored `avatarUrl` from the token's `picture` claim if it's changed since the last login (see "Authentication" below).
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
    "email": "connor@example.com",
    "avatarUrl": "https://lh3.googleusercontent.com/a/photo-url"
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
    "avatarUrl": "https://lh3.googleusercontent.com/a/photo-url",
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
      "avatarUrl": "https://lh3.googleusercontent.com/a/photo-url",
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

- Description: List boards. Archived boards are excluded by default.
- Query parameters (optional): `includeArchived` (`true` to include archived boards alongside active ones; anything else, or omitted, excludes them) - no separate "browse archived boards" surface exists, this is the same list with the filter lifted.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Rate limiting: `fambanRateLimiter`

---

### 11) GET /kanban/boards/:id

- Description: Get a single board, including its columns. Works the same whether the board is archived or not - archiving only affects `GET /kanban/boards` (the list). Anyone with a direct link to an archived board (a stale bookmark, a Slack link) can still open it; there's no separate "restricted" state.
- Authentication: Requires a session (`Authorization: Bearer <token>`).

```json
{
  "_id": "6a6fb751f319991a0322aafc",
  "name": "Family Board",
  "description": null,
  "archived": false,
  "archivedAt": null,
  "columns": [
    {
      "id": "589d7e78-bebf-4348-92e9-12d4f2e94f7e",
      "name": "To Do",
      "order": 0,
      "kind": "todo"
    },
    {
      "id": "28ecc1ec-de41-4113-a250-7930ec4329f7",
      "name": "In Progress",
      "order": 1,
      "kind": "in_progress"
    },
    {
      "id": "2b74979d-9983-4333-913e-a009a74ee7c4",
      "name": "Done",
      "order": 2,
      "kind": "done"
    }
  ],
  "createdAt": "2026-08-02T21:32:01.497Z",
  "updatedAt": "2026-08-02T21:32:01.497Z"
}
```

Errors: `INVALID_ID` (400), `BOARD_NOT_FOUND` (404).

---

### 12) POST /kanban/boards

- Description: Create a board. Every board always gets the three managed columns seeded first - To Do (`kind: "todo"`, order 0), In Progress (`kind: "in_progress"`, order 1), Done (`kind: "done"`, order 2) - regardless of what's passed. If `columns` is provided, those names are appended after the three managed columns as plain (`kind: null`) columns; if omitted, the board just has the three managed columns.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required), `description` (string, optional), `columns` (string[], optional - extra plain column names, appended after the managed defaults; ids are generated)

```json
{ "name": "Chores", "description": "Weekly household chores" }
```

Errors: `BOARD_NAME_REQUIRED`, `COLUMN_NAME_REQUIRED` (400).

---

### 13) PATCH /kanban/boards/:id

- Description: Update a board's name/description, or archive/unarchive it. This is also the only way to remove a board from the frontend's board list - there's no dedicated delete endpoint, matching how `PATCH /users/:id` with `{ active: false }` is the only way to remove a user. Cards on the board are completely untouched by archiving - no cascade, no bulk update; they remain fetchable via `GET /kanban/cards?boardId=...` same as before.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body (all optional): `name`, `description`, `archived` (bool - setting `true` stamps `archivedAt`; setting `false` un-archives and clears `archivedAt`. Reversible via the API in either direction - a destructive-feeling "type the board name to confirm" flow is a frontend-only affordance, not something the API enforces as one-way.)

```json
{ "archived": true }
```

Errors: `INVALID_ID`, `BOARD_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` (404).

---

### 14) POST /kanban/boards/:id/columns

- Description: Add a plain column to a board (appended at the end, always `kind: null`). There's no way to add another managed (`todo`/`in_progress`/`done`) column - every board gets exactly one of each, seeded at creation.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required)
- Successful response: 201, returns the new `{ id, name, order, kind: null }`

Errors: `INVALID_ID`, `COLUMN_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` (404).

---

### 15) PATCH /kanban/boards/:id/columns/:columnId

- Description: Rename a column. Managed columns (`kind: "todo"`/`"in_progress"`/`"done"`) can be renamed like any other - only their `kind` is protected, not their label.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `name` (string, required)

Errors: `INVALID_ID`, `COLUMN_NAME_REQUIRED` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404).

---

### 16) DELETE /kanban/boards/:id/columns/:columnId

- Description: Delete a column. Blocked if any card is still in that column, or if the column is one of the three managed columns (`kind` is not `null`) - those can't be removed, only renamed.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Successful response: 200 `{ "message": "Column deleted successfully" }`

Errors: `INVALID_ID` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404), `COLUMN_KIND_PROTECTED` (400), `COLUMN_NOT_EMPTY` (409).

---

## Kanban - Cards

### 17) GET /kanban/cards

- Description: List cards, sorted by board/column/order.
- Query parameters (all optional): `boardId`, `columnId`, `status` (`open`|`in_progress`|`done`|`closed`), `assignee` (user id), `tag` (tag id)
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
      "createdAt": "2026-08-02T21:32:02.087Z",
      "editedAt": null
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

- Description: Create a card in a board's column. `order` is computed automatically (appended to the end of the column). `status` always starts as `open`. `columnId` must target a `todo`-kind or plain (`kind: null`) column - the `in_progress` and `done` kinded columns can't be targeted directly, only reached via `POST /kanban/cards/:id/status` (see below).
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

Errors: `CARD_TITLE_REQUIRED` (400), `INVALID_ID` (400), `BOARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404), `COLUMN_STATUS_MANAGED` (400), `INVALID_ASSIGNEES` / `INVALID_TAGS` (400).

---

### 20) PATCH /kanban/cards/:id

- Description: General update - title, description, move to a different column, or set an explicit `order` (e.g. for drag-and-drop reordering within a column). Moving to a new column without an explicit `order` appends the card to the end of the destination column. Same `columnId` restriction as card creation applies: you can't move a card directly into an `in_progress` or `done` kinded column, only via a status change.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body (all optional): `title`, `description`, `columnId`, `order` (integer)

Errors: `CARD_TITLE_REQUIRED`, `INVALID_ORDER` (400), `CARD_NOT_FOUND` / `COLUMN_NOT_FOUND` (404), `COLUMN_STATUS_MANAGED` (400).

---

### 21) POST /kanban/cards/:id/status

- Description: Transition a card's lifecycle status. `open`, `in_progress`, and `done` each map to a column kind (`todo`, `in_progress`, `done` respectively) - setting one of these statuses also moves the card to the board's column of that kind (looked up by `boardId`), so this is the only way to get a card into or out of the `in_progress`/`done` columns. `closed` is orthogonal and doesn't touch `columnId` - a card can be closed while sitting anywhere. Setting `done` stamps `doneAt`; setting `closed` stamps `closedAt`; any other status clears both.
  - On a board created before the `kind` field existed (all columns `kind: null`), there's no matching-kind column to move to, so `columnId` is simply left untouched and only `status`/`doneAt`/`closedAt` change - the pre-existing fully-independent behavior, preserved for those boards.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `status` (`open` | `in_progress` | `done` | `closed`, required)

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

- Description: Append a comment to a card. `userId` is taken from the caller's session, not the request body - you cannot attribute a comment to anyone but yourself. `createdAt` is stamped server-side; `editedAt` starts `null`.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `text` (string, required)
- Successful response: 201, returns the full updated card

```json
{ "text": "On it" }
```

Errors: `COMMENT_TEXT_REQUIRED` (400), `CARD_NOT_FOUND` (404).

---

### 25) PATCH /kanban/cards/:id/comments/:commentId

- Description: Edit a comment's text. Only the family member who originally posted it can edit it - the caller's session identity is compared against the comment's stored `userId` (there's no `userId` in the request body to spoof). Stamps `editedAt` on the comment and bumps the card's `updatedAt`.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Request body: `text` (string, required)
- Successful response: 200, returns the full updated card

```json
{ "text": "Updated text" }
```

Errors: `COMMENT_TEXT_REQUIRED` (400), `CARD_NOT_FOUND` / `COMMENT_NOT_FOUND` (404), `COMMENT_NOT_OWNER` (403).

---

### 26) DELETE /kanban/cards/:id/comments/:commentId

- Description: Delete a comment. Same ownership rule as editing - only the original author can delete their own comment. Unlike cards themselves (no delete, only status transitions), comments do support a real delete: they're throwaway remarks, not the thing the "preserve history" design note is protecting.
- Authentication: Requires a session (`Authorization: Bearer <token>`).
- Successful response: 200, returns the full updated card

Errors: `CARD_NOT_FOUND` / `COMMENT_NOT_FOUND` (404), `COMMENT_NOT_OWNER` (403).

---

# Implementation notes (useful for front-end integration)

- All ids are MongoDB ObjectIds serialized as hex strings (`_id`, `boardId`, entries in `assignees`/`tags`), except `columnId`, which is a UUID scoped to its board's `columns[]` array.
- Dates are ISO 8601 strings (`Date` serialized via `JSON.stringify`).

## Column kinds

Every board created via `POST /kanban/boards` always has exactly three managed columns, seeded first and identified by `kind` rather than by name:

- `kind: "todo"` - To Do
- `kind: "in_progress"` - In Progress
- `kind: "done"` - Done

Any additional columns (from the `columns` request body on creation, or added later via `POST /kanban/boards/:id/columns`) are plain organizational columns with `kind: null` - they carry no status meaning at all; a card in one keeps whatever `status` it already had, and moving it there or away doesn't change `status`.

**Do not detect "the Done column" by name-matching `column.name`** (this was the fragile pattern the `kind` field replaces) - check `column.kind === "done"` instead. Labels are just display text: managed columns can be renamed (`PATCH /kanban/boards/:id/columns/:columnId`) freely, so a renamed "Done" column is still `kind: "done"`.

The coupling only runs one direction, and only for the two managed non-todo kinds:

- **Card status → column**: `POST /kanban/cards/:id/status` with `open`/`in_progress`/`done` moves the card to the board's column of the matching kind. This is the *only* way a card ends up in the `in_progress` or `done` column.
- **Column → card status**: none. Directly setting `columnId` (via create or `PATCH /kanban/cards/:id`) to the `todo` column or any plain column is allowed and does **not** change `status` - e.g. a card can be `status: "done"` while sitting in a plain column, or dragged between plain columns without affecting status. Only the `in_progress`/`done` columns are locked out of direct `columnId` targeting (`COLUMN_STATUS_MANAGED`), specifically because there'd be no way to represent "in this column but status doesn't match" for those two.
- `closed` has no column at all - it's an orthogonal "abandoned/cancelled" flag on top of whatever column the card happens to be sitting in.
- Reopening a card (any status back to `open`) always sends it to the `todo` column, not back to wherever it was before it advanced - there's no position history kept.

**Legacy boards**: boards created before this field existed have `kind: null` on every column (no migration was run - see `boards.schema.js` history if you need the exact cutover point). For those boards, `POST /kanban/cards/:id/status` still updates `status`/`doneAt`/`closedAt` normally, but since there's no `in_progress`/`done`-kind column to move a card *to*, `columnId` is left untouched - i.e. `status` and `columnId` remain fully independent on those boards, exactly like before this feature. Frontend code that still wants a "Done" grouping for a legacy board has no structural signal to key off (`kind` is `null` everywhere) and must keep whatever it was doing before.
- There's no card delete endpoint, only status transitions (`close`/`reopen`) - this preserves history. Revisit if that turns out to be wrong. Comments are the one exception - see "Comments" below.
- There's still no hard-delete board endpoint, and none is planned - "deleting" a board from the frontend means `PATCH /kanban/boards/:id` with `{ archived: true }` (see "Archiving boards" below). Column add/rename/delete within a board is unaffected by this and unrelated to it.
- There's no hard-delete for users - `PATCH /users/:id` with `{ active: false }` is the only removal mechanism, and an inactive user can no longer log in (see `loginWithGoogle`) but their historical assignments/comments remain intact.

## Archiving boards

`PATCH /kanban/boards/:id` with `{ archived: true }` is the frontend's "delete a board" - it's how the product's board-removal flow (a destructive-looking "type the board name to confirm" UI) is implemented under the hood, deliberately extending this API's existing soft-delete convention (cards use status transitions, users use `active: false`) rather than introducing the system's first hard delete.

- Setting `archived: true` stamps `archivedAt`; setting `archived: false` clears it. Both directions are valid at the API level - the flow is only "one-way" as a matter of frontend UX (no unarchive button is currently planned), not an API restriction. A future admin surface could unarchive a board with the exact same `PATCH` call.
- `GET /kanban/boards` excludes archived boards by default. Pass `?includeArchived=true` to get the full list including archived ones - there's no separate endpoint or way to list *only* archived boards; a caller wanting that filters client-side.
- `GET /kanban/boards/:id` does **not** change behavior for an archived board - it returns normally, same as any other board. Archiving only affects whether a board shows up in the list; a board's direct URL/id keeps working exactly as before. This also means nothing needed to change in `getBoardById`, which every other board/card operation is built on.
- Cards are completely unaffected by archiving a board - no cascade, no bulk status change, nothing in `famban-cards` reads or writes `archived` at all. `POST /kanban/cards` and `PATCH /kanban/cards/:id` against an archived board's `boardId` still succeed; there is no `COLUMN`/`BOARD`-archived error code. If blocking new cards on an archived board turns out to matter later, that's a deliberate follow-up, not an oversight.

## Comments

Comments carry a real `createdAt` timestamp (stamped on `POST /kanban/cards/:id/comments`) and support a genuine edit/delete, unlike everything else in this API:

- **Edit**: `PATCH /kanban/cards/:id/comments/:commentId` with `{ text }` updates the comment's text and stamps `editedAt`. A comment that's never been edited has `editedAt: null` - the frontend can use that to decide whether to render an "(edited)" marker.
- **Delete**: `DELETE /kanban/cards/:id/comments/:commentId` removes the comment from the card entirely (`$pull`, not a status flag) - there is no soft-delete, no tombstone, nothing left behind. This is a deliberate exception to the "nothing hard-deletes" convention elsewhere in this API (cards use status transitions, users use `active: false`, boards use `archived`): a comment is a throwaway remark, not the kind of record those other "preserve history" decisions exist to protect.
- **Ownership**: both endpoints require the caller's session `userId` to match the comment's stored `userId` exactly - you can only edit or delete your own comments, never a family member's. A comment with `userId: null` (possible if authored before session-based attribution, or via direct API access without a resolvable user) can't be edited or deleted by anyone through these endpoints, since there's no author to match against.
- Both endpoints return the full updated card (same convention as `POST /kanban/cards/:id/comments`), and both bump the card's own `updatedAt`.

- `order` is a plain integer per column, not fractional - reordering N cards in a column means the client may need to PATCH up to N cards' `order` values.
- Frontend login flow: render Google Identity Services' "Sign in with Google" button with the `GOOGLE_CLIENT_ID`, POST the resulting `credential` to `POST /auth/google`, store the returned `token`, and attach it as `Authorization: Bearer <token>` on every request thereafter. A 401 on any request means the token is missing/expired/invalid - re-run the login flow.
