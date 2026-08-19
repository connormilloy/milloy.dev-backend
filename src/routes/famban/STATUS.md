# Famban - Project Status

Famban is a private family kanban/task app for a two-person household (Connor + spouse). This doc is a checkpoint: what's built, how to run it, and what's left - written at the point the backend was considered functionally done and work is shifting to a frontend. For the full endpoint contract (request/response shapes, error codes), see [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) in this same folder - that's the source of truth for building against; this doc is the narrative status/roadmap.

---

## What's done

**Backend is functionally complete for a first frontend pass.** All of it lives under `src/routes/famban/`, mounted at `/api/famban` in `src/index.js` (port 5555 locally), alongside the repo's other apps (darts, lorcana, trains) which are unrelated to Famban.

- **Auth**: Google Sign-In (Identity Services ID-token flow, not the Authorization Code flow - no client secret involved). Backend verifies the Google token, checks the email against an `active` `famban-users` record (no auto-provisioning), and issues its own stateless session JWT. Every route, reads included, requires that session via `Authorization: Bearer <token>` - see "Authentication" in `API_DOCUMENTATION.md` for the full model, including the double-allowlist (Google Testing consent screen + `famban-users.active`).
- **Kanban**: boards always seed three structurally managed columns (To Do/In Progress/Done, identified by a `kind: "todo"|"in_progress"|"done"` field, not by name), plus any number of additional plain (`kind: null`) columns owners add on top. Cards have title/description, drag-style ordering (`order` per column), a lifecycle `status` (`open`/`in_progress`/`done`/`closed`), assignees (multi-user), a global tag vocabulary with colors, and embedded comments attributed to the authenticated caller (not client-supplied). Setting `status` to `open`/`in_progress`/`done` also moves the card to the board's matching-kind column - that's the *only* way in or out of the `in_progress`/`done` columns (direct `columnId` targeting of those two is rejected). `closed` is orthogonal and untied to any column. Boards created before this model existed keep `kind: null` on every column (no backfill was run) and retain the original fully independent status/column behavior. See "Column kinds" in `API_DOCUMENTATION.md` for the full mechanism.
- **Users**: family members are their own resource (`famban-users`), shared across future modules, not just kanban - soft-deactivate only (`active: false`), no hard delete.
- **Data layer**: MongoDB via the repo's shared client (`src/database/mongo.js`), with `$jsonSchema` validators enforced server-side per collection (see `*.schema.js` files) - not just app-level validation.
- **Tests**: 100 Jest tests (`npm test`) across service logic, the session/auth middleware, and HTTP-level router wiring. MongoDB is fully mocked in tests (no live DB needed to run the suite); Google token verification is mocked too. Live end-to-end verification (real Mongo Atlas, real Google login) was done manually during development, not by the automated suite.
- **Docs**: `API_DOCUMENTATION.md` was audited against the actual router code (not just written once and left to drift) - endpoint list, request/response envelopes, and error codes should match reality.

## Running it locally

```
npm install
npm start                 # server on http://localhost:5555
npm test                  # full test suite, no live DB/network needed
```

Required `.env` vars (see `.env` - gitignored, not in the repo): `DB_CONNECTION_STRING`, `GOOGLE_CLIENT_ID`, `FAMBAN_SESSION_SECRET`. `GOOGLE_CLIENT_ID` is also needed **client-side** for the frontend (it's a public identifier, safe to embed - see `API_DOCUMENTATION.md`'s Authentication section for why).

Two dev-only scripts, not part of the app:

- `scripts/seedFambanUsers.js` - bootstraps the first `famban-users` record(s) directly against Mongo, bypassing the API. Needed because `POST /users` itself requires a session, which is a chicken-and-egg problem for the very first account. Usage: `node scripts/seedFambanUsers.js "Name" "email@example.com"`.
- `scripts/test-login.html` - a standalone page (no build step) exercising the real Google login flow end-to-end. Serve it with any static server on an origin registered in your OAuth client's Authorized JavaScript origins (e.g. `python3 -m http.server 8080 --directory scripts`) and open it in a browser. Useful as a working reference for exactly how the frontend should call `POST /auth/google` and carry the resulting token.

CORS is wide open (`cors()` with no options) - no CORS config needed from a frontend dev server during local development.

## Known gaps / deliberately deferred

Called out explicitly (not oversights) in `API_DOCUMENTATION.md`'s implementation notes too:

- No board delete endpoint (columns can be added/renamed/deleted, but not the board itself).
- No card delete endpoint - only status transitions (`close`/`reopen`), to preserve history.
- No hard user-delete - `PATCH /users/:id` with `{ active: false }` is the only removal path.
- `order` is a plain integer per column, not fractional - reordering N cards may mean PATCHing up to N of them.
- No column reordering endpoint (columns can be added/renamed/deleted, not reordered after creation).
- No migration for boards created before column `kind` existed - they keep `kind: null` on every column permanently, with no way to opt in to the managed-column behavior short of recreating the board.
- Sessions are stateless JWTs with a 7-day expiry and **no revocation** short of rotating `FAMBAN_SESSION_SECRET` (which invalidates every session at once). Acceptable for two known users; revisit if that changes.
- No shopping-lists module yet (the original vision beyond kanban) - the folder structure (`users`/`tags`/`shared` at the `famban/` root, `kanban/` as one module) was deliberately shaped to make this a straightforward addition later, not a rewrite.
- No due dates, priority, or attachments on cards.
- No pagination on any list endpoint (fine at household scale; would need revisiting for real growth).

## What's next

The natural next step is a **frontend**. Suggested starting points:

1. Read `API_DOCUMENTATION.md` fully before writing frontend code - it's meant to be usable as a standalone contract without needing to read the backend source.
2. Implement the Google Sign-In button (Google Identity Services) and the `POST /auth/google` -> store token -> `Authorization: Bearer` pattern first, since nothing else works without it. `scripts/test-login.html` is a working, minimal reference for this exact wiring.
3. Everything else is standard CRUD against the documented endpoints - boards/columns first (to have somewhere to put cards), then cards, then the assign/tag/comment/status actions.
4. Two Famban accounts exist already (seeded via `scripts/seedFambanUsers.js`); no need to rebuild user management UI as a priority - `POST /users` /`PATCH /users/:id` are simple enough to wire up later.
