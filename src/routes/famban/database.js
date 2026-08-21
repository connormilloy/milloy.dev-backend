const { getDb } = require('../../database/mongo');
const { logWithTimestamp } = require('../../utils/logwithTimestamp');
const {
  USERS_COLLECTION,
  BOARDS_COLLECTION,
  CARDS_COLLECTION,
  TAGS_COLLECTION,
} = require('./shared/collections');
const { usersValidator } = require('./users/users.schema');
const { boardsValidator } = require('./kanban/boards/boards.schema');
const { cardsValidator } = require('./kanban/cards/cards.schema');
const { tagsValidator } = require('./tags/tags.schema');

// Creates the collection with its validator if it doesn't exist yet, or
// updates the validator in place (collMod) if it does. Keeps startup
// idempotent across restarts and schema changes.
async function applyValidator(db, name, validator) {
  try {
    await db.createCollection(name, { validator, validationLevel: 'strict' });
  } catch (err) {
    if (err.codeName === 'NamespaceExists' || err.code === 48) {
      await db.command({ collMod: name, validator, validationLevel: 'strict' });
      return;
    }

    throw err;
  }
}

// One-time backfill for boards created before `archived`/`archivedAt`
// existed, so a later update to one of them doesn't fail validation by
// omitting a now-required field. Unlike `kind` on columns, which was left
// permanently optional for legacy boards, this field is small and cheap
// enough to backfill outright rather than carry a legacy caveat forever.
//
// Must run AFTER the new validator is applied, not before: the old
// validator still active beforehand has `additionalProperties: false` and
// doesn't know about `archived`/`archivedAt`, so it would reject this very
// $set as an unrecognized property and crash startup.
async function backfillBoardArchivedFields(db) {
  await db
    .collection(BOARDS_COLLECTION)
    .updateMany(
      { archived: { $exists: false } },
      { $set: { archived: false, archivedAt: null } }
    );
}

// One-time backfill for comments created before `editedAt` existed. Same
// ordering requirement as backfillBoardArchivedFields above - must run
// AFTER the new validator is applied, or the still-active old validator's
// `additionalProperties: false` on each comment subdocument rejects this
// $set outright.
async function backfillCommentEditedAtFields(db) {
  await db.collection(CARDS_COLLECTION).updateMany(
    { 'comments.editedAt': { $exists: false } },
    { $set: { 'comments.$[c].editedAt': null } },
    { arrayFilters: [{ 'c.editedAt': { $exists: false } }] }
  );
}

async function initFambanCollections() {
  const db = getDb();

  await applyValidator(db, USERS_COLLECTION, usersValidator);
  await applyValidator(db, BOARDS_COLLECTION, boardsValidator);
  await backfillBoardArchivedFields(db);
  await applyValidator(db, CARDS_COLLECTION, cardsValidator);
  await backfillCommentEditedAtFields(db);
  await applyValidator(db, TAGS_COLLECTION, tagsValidator);

  await db
    .collection(USERS_COLLECTION)
    .createIndex({ email: 1 }, { unique: true, sparse: true });
  await db
    .collection(CARDS_COLLECTION)
    .createIndex({ boardId: 1, columnId: 1 });
  await db.collection(CARDS_COLLECTION).createIndex({ boardId: 1, status: 1 });
  // Case-insensitive uniqueness so "urgent" and "Urgent" can't both exist.
  await db
    .collection(TAGS_COLLECTION)
    .createIndex(
      { name: 1 },
      { unique: true, collation: { locale: 'en', strength: 2 } }
    );

  logWithTimestamp('Famban collections & indexes ready');
}

module.exports = { initFambanCollections };
