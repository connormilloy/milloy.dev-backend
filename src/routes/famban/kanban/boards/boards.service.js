const crypto = require('crypto');
const { getDb } = require('../../../../database/mongo');
const { createAppError } = require('../../shared/errors');
const { parseObjectId } = require('../../shared/ids');
const {
  BOARDS_COLLECTION,
  CARDS_COLLECTION,
} = require('../../shared/collections');

const DEFAULT_COLUMN_NAMES = ['To Do', 'In Progress', 'Done'];

function boardsCollection() {
  return getDb().collection(BOARDS_COLLECTION);
}

function cardsCollection() {
  return getDb().collection(CARDS_COLLECTION);
}

function buildColumn(name, order) {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError(
      'Column name is required',
      'COLUMN_NAME_REQUIRED',
      400
    );
  }

  return { id: crypto.randomUUID(), name: trimmedName, order };
}

async function listBoards() {
  return boardsCollection().find({}).sort({ name: 1 }).toArray();
}

async function getBoardById(id) {
  const objectId = parseObjectId(id, 'board id');
  const board = await boardsCollection().findOne({ _id: objectId });

  if (!board) {
    throw createAppError('Board not found', 'BOARD_NOT_FOUND', 404);
  }

  return board;
}

// Throws if `columnId` isn't a real column on `board`. Returns the column.
function requireColumn(board, columnId) {
  const column = board.columns.find((c) => c.id === columnId);

  if (!column) {
    throw createAppError('Column not found', 'COLUMN_NOT_FOUND', 404);
  }

  return column;
}

async function createBoard({ name, description, columns }) {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError('Board name is required', 'BOARD_NAME_REQUIRED', 400);
  }

  const columnNames =
    Array.isArray(columns) && columns.length > 0
      ? columns
      : DEFAULT_COLUMN_NAMES;

  const now = new Date();
  const doc = {
    name: trimmedName,
    description: description ? String(description).trim() : null,
    columns: columnNames.map((columnName, index) =>
      buildColumn(columnName, index)
    ),
    createdAt: now,
    updatedAt: now,
  };

  const result = await boardsCollection().insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

async function updateBoard(id, updates) {
  await getBoardById(id);
  const objectId = parseObjectId(id, 'board id');
  const set = { updatedAt: new Date() };

  if (updates.name !== undefined) {
    const trimmedName = String(updates.name || '').trim();

    if (!trimmedName) {
      throw createAppError(
        'Board name is required',
        'BOARD_NAME_REQUIRED',
        400
      );
    }

    set.name = trimmedName;
  }

  if (updates.description !== undefined) {
    set.description = updates.description
      ? String(updates.description).trim()
      : null;
  }

  const result = await boardsCollection().findOneAndUpdate(
    { _id: objectId },
    { $set: set },
    { returnDocument: 'after' }
  );

  return result;
}

async function addColumn(boardId, name) {
  const board = await getBoardById(boardId);
  const nextOrder = board.columns.length;
  const column = buildColumn(name, nextOrder);

  await boardsCollection().updateOne(
    { _id: board._id },
    { $push: { columns: column }, $set: { updatedAt: new Date() } }
  );

  return column;
}

async function renameColumn(boardId, columnId, name) {
  const board = await getBoardById(boardId);
  requireColumn(board, columnId);

  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError(
      'Column name is required',
      'COLUMN_NAME_REQUIRED',
      400
    );
  }

  await boardsCollection().updateOne(
    { _id: board._id, 'columns.id': columnId },
    { $set: { 'columns.$.name': trimmedName, updatedAt: new Date() } }
  );

  return { id: columnId, name: trimmedName };
}

async function deleteColumn(boardId, columnId) {
  const board = await getBoardById(boardId);
  requireColumn(board, columnId);

  const cardCount = await cardsCollection().countDocuments({
    boardId: board._id,
    columnId,
  });

  if (cardCount > 0) {
    throw createAppError(
      'Column still has cards on it. Move or remove them first',
      'COLUMN_NOT_EMPTY',
      409
    );
  }

  await boardsCollection().updateOne(
    { _id: board._id },
    { $pull: { columns: { id: columnId } }, $set: { updatedAt: new Date() } }
  );
}

module.exports = {
  listBoards,
  getBoardById,
  requireColumn,
  createBoard,
  updateBoard,
  addColumn,
  renameColumn,
  deleteColumn,
};
