const { getDb } = require('../../database/mongo');
const { createAppError } = require('./errors');
const { parseObjectId } = require('./ids');
const { USERS_COLLECTION } = require('./collections');

function usersCollection() {
  return getDb().collection(USERS_COLLECTION);
}

function normalizeEmail(email) {
  if (email === undefined || email === null || email === '') {
    return null;
  }

  return String(email).trim().toLowerCase();
}

async function listUsers() {
  return usersCollection().find({}).sort({ name: 1 }).toArray();
}

async function getUserById(id) {
  const objectId = parseObjectId(id, 'user id');
  const user = await usersCollection().findOne({ _id: objectId });

  if (!user) {
    throw createAppError('User not found', 'USER_NOT_FOUND', 404);
  }

  return user;
}

async function createUser({ name, email }) {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError('User name is required', 'USER_NAME_REQUIRED', 400);
  }

  const now = new Date();
  const doc = {
    name: trimmedName,
    email: normalizeEmail(email),
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await usersCollection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
  } catch (err) {
    if (err && err.code === 11000) {
      throw createAppError(
        'A user with that email already exists',
        'USER_ALREADY_EXISTS',
        409
      );
    }

    throw err;
  }
}

async function updateUser(id, updates) {
  const objectId = parseObjectId(id, 'user id');
  const set = { updatedAt: new Date() };

  if (updates.name !== undefined) {
    const trimmedName = String(updates.name || '').trim();

    if (!trimmedName) {
      throw createAppError('User name is required', 'USER_NAME_REQUIRED', 400);
    }

    set.name = trimmedName;
  }

  if (updates.email !== undefined) {
    set.email = normalizeEmail(updates.email);
  }

  if (updates.active !== undefined) {
    set.active = Boolean(updates.active);
  }

  try {
    const result = await usersCollection().findOneAndUpdate(
      { _id: objectId },
      { $set: set },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw createAppError('User not found', 'USER_NOT_FOUND', 404);
    }

    return result;
  } catch (err) {
    if (err && err.code === 11000) {
      throw createAppError(
        'A user with that email already exists',
        'USER_ALREADY_EXISTS',
        409
      );
    }

    throw err;
  }
}

// Validates that every id in `ids` refers to an existing user and returns
// the deduped list as ObjectIds. Used when assigning users to cards.
async function resolveUserIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const objectIds = [...new Set(ids)].map((id) =>
    parseObjectId(id, 'assignee id')
  );
  const found = await usersCollection()
    .find({ _id: { $in: objectIds } })
    .toArray();

  if (found.length !== objectIds.length) {
    throw createAppError(
      'One or more assignees do not exist',
      'INVALID_ASSIGNEES',
      400
    );
  }

  return objectIds;
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  resolveUserIds,
};
