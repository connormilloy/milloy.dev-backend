const { getDb } = require('../../database/mongo');
const { createAppError } = require('./errors');
const { parseObjectId } = require('./ids');
const { TAGS_COLLECTION, CARDS_COLLECTION } = require('./collections');

const DEFAULT_COLOR = '#94a3b8';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function tagsCollection() {
  return getDb().collection(TAGS_COLLECTION);
}

function cardsCollection() {
  return getDb().collection(CARDS_COLLECTION);
}

function normalizeColor(color) {
  if (color === undefined || color === null || color === '') {
    return DEFAULT_COLOR;
  }

  const trimmed = String(color).trim();

  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    throw createAppError(
      'Color must be a hex code like #94a3b8',
      'INVALID_TAG_COLOR',
      400
    );
  }

  return trimmed;
}

async function listTags() {
  return tagsCollection().find({}).sort({ name: 1 }).toArray();
}

async function getTagById(id) {
  const objectId = parseObjectId(id, 'tag id');
  const tag = await tagsCollection().findOne({ _id: objectId });

  if (!tag) {
    throw createAppError('Tag not found', 'TAG_NOT_FOUND', 404);
  }

  return tag;
}

async function createTag({ name, color }) {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError('Tag name is required', 'TAG_NAME_REQUIRED', 400);
  }

  const now = new Date();
  const doc = {
    name: trimmedName,
    color: normalizeColor(color),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await tagsCollection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
  } catch (err) {
    if (err && err.code === 11000) {
      throw createAppError(
        'A tag with that name already exists',
        'TAG_ALREADY_EXISTS',
        409
      );
    }

    throw err;
  }
}

async function updateTag(id, updates) {
  const objectId = parseObjectId(id, 'tag id');
  const set = { updatedAt: new Date() };

  if (updates.name !== undefined) {
    const trimmedName = String(updates.name || '').trim();

    if (!trimmedName) {
      throw createAppError('Tag name is required', 'TAG_NAME_REQUIRED', 400);
    }

    set.name = trimmedName;
  }

  if (updates.color !== undefined) {
    set.color = normalizeColor(updates.color);
  }

  try {
    const result = await tagsCollection().findOneAndUpdate(
      { _id: objectId },
      { $set: set },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw createAppError('Tag not found', 'TAG_NOT_FOUND', 404);
    }

    return result;
  } catch (err) {
    if (err && err.code === 11000) {
      throw createAppError(
        'A tag with that name already exists',
        'TAG_ALREADY_EXISTS',
        409
      );
    }

    throw err;
  }
}

// Deleting a tag removes it from every card that carries it, rather than
// blocking the delete - tags are freeform labels, not structural like
// columns, so silently untagging (GitHub label semantics) is the expected
// behavior rather than a 409.
async function deleteTag(id) {
  const tag = await getTagById(id);

  await cardsCollection().updateMany(
    { tags: tag._id },
    { $pull: { tags: tag._id } }
  );

  await tagsCollection().deleteOne({ _id: tag._id });
}

// Validates that every id in `ids` refers to an existing tag and returns
// the deduped list as ObjectIds. Used when tagging cards.
async function resolveTagIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const objectIds = [...new Set(ids)].map((id) => parseObjectId(id, 'tag id'));
  const found = await tagsCollection()
    .find({ _id: { $in: objectIds } })
    .toArray();

  if (found.length !== objectIds.length) {
    throw createAppError('One or more tags do not exist', 'INVALID_TAGS', 400);
  }

  return objectIds;
}

module.exports = {
  listTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
  resolveTagIds,
};
