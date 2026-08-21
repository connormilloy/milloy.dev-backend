const crypto = require('crypto');
const { getDb } = require('../../../../database/mongo');
const { createAppError } = require('../../shared/errors');
const { parseObjectId } = require('../../shared/ids');
const {
  BOARDS_COLLECTION,
  CARDS_COLLECTION,
} = require('../../shared/collections');

function boardsCollection() {
  return getDb().collection(BOARDS_COLLECTION);
}

function cardsCollection() {
  return getDb().collection(CARDS_COLLECTION);
}

function buildColumn(name, order, kind = null) {
  const trimmedName = String(name || '').trim();

  if (!trimmedName) {
    throw createAppError(
      'Column name is required',
      'COLUMN_NAME_REQUIRED',
      400
    );
  }

  return { id: crypto.randomUUID(), name: trimmedName, order, kind };
}

// Returns the board's column of the given kind ('todo' | 'in_progress' |
// 'done'), or null if the board has none (e.g. a pre-kind legacy board).
function findColumnByKind(board, kind) {
  return board.columns.find((c) => c.kind === kind) || null;
}

async function listBoards({ includeArchived = false } = {}) {
  const query = includeArchived ? {} : { archived: { $ne: true } };

  return boardsCollection().find(query).sort({ name: 1 }).toArray();
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

  const defaultColumns = [
    buildColumn('To Do', 0, 'todo'),
    buildColumn('In Progress', 1, 'in_progress'),
    buildColumn('Done', 2, 'done'),
  ];
  const customColumnNames = Array.isArray(columns) ? columns : [];
  const customColumns = customColumnNames.map((columnName, index) =>
    buildColumn(columnName, defaultColumns.length + index)
  );

  const now = new Date();
  const doc = {
    name: trimmedName,
    description: description ? String(description).trim() : null,
    columns: [...defaultColumns, ...customColumns],
    archived: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const result = await boardsCollection().insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

async function updateBoard(id, updates) {
  await getBoardById(id);
  const objectId = parseObjectId(id, 'board id');
  const now = new Date();
  const set = { updatedAt: now };

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

  if (updates.archived !== undefined) {
    const archived = Boolean(updates.archived);
    set.archived = archived;
    set.archivedAt = archived ? now : null;
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
  const column = requireColumn(board, columnId);

  if (column.kind) {
    throw createAppError(
      'Cannot delete a managed column (To Do / In Progress / Done)',
      'COLUMN_KIND_PROTECTED',
      400
    );
  }

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
  findColumnByKind,
  createBoard,
  updateBoard,
  addColumn,
  renameColumn,
  deleteColumn,
};
