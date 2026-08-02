const { getDb } = require('../../database/mongo');
const { logWithTimestamp } = require('../../utils/logwithTimestamp');
const {
  USERS_COLLECTION,
  BOARDS_COLLECTION,
  CARDS_COLLECTION,
  TAGS_COLLECTION,
} = require('./collections');
const {
  usersValidator,
  boardsValidator,
  cardsValidator,
  tagsValidator,
} = require('./schemas');

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

async function initFambanCollections() {
  const db = getDb();

  await applyValidator(db, USERS_COLLECTION, usersValidator);
  await applyValidator(db, BOARDS_COLLECTION, boardsValidator);
  await applyValidator(db, CARDS_COLLECTION, cardsValidator);
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
