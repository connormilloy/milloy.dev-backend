const crypto = require('crypto');
const { getDb } = require('../../../../database/mongo');
const { createAppError } = require('../../shared/errors');
const { parseObjectId } = require('../../shared/ids');
const { CARDS_COLLECTION } = require('../../shared/collections');
const { resolveUserIds } = require('../../users/users.service');
const { resolveTagIds } = require('../../tags/tags.service');
const { getBoardById, requireColumn } = require('../boards/boards.service');

const CARD_STATUSES = ['open', 'done', 'closed'];

function cardsCollection() {
  return getDb().collection(CARDS_COLLECTION);
}

function parseStatusFilter(status) {
  if (status === undefined) {
    return undefined;
  }

  if (!CARD_STATUSES.includes(status)) {
    throw createAppError(
      `Invalid status. Use one of: ${CARD_STATUSES.join(', ')}`,
      'INVALID_STATUS',
      400
    );
  }

  return status;
}

async function listCards(filters = {}) {
  const query = {};

  if (filters.boardId !== undefined) {
    query.boardId = parseObjectId(filters.boardId, 'boardId');
  }

  if (filters.columnId !== undefined) {
    query.columnId = filters.columnId;
  }

  const status = parseStatusFilter(filters.status);
  if (status !== undefined) {
    query.status = status;
  }

  if (filters.assignee !== undefined) {
    query.assignees = parseObjectId(filters.assignee, 'assignee');
  }

  if (filters.tag !== undefined) {
    query.tags = parseObjectId(filters.tag, 'tag');
  }

  return cardsCollection()
    .find(query)
    .sort({ boardId: 1, columnId: 1, order: 1 })
    .toArray();
}

async function getCardById(id) {
  const objectId = parseObjectId(id, 'card id');
  const card = await cardsCollection().findOne({ _id: objectId });

  if (!card) {
    throw createAppError('Card not found', 'CARD_NOT_FOUND', 404);
  }

  return card;
}

async function createCard({
  boardId,
  columnId,
  title,
  description,
  assignees,
  tags,
}) {
  const trimmedTitle = String(title || '').trim();

  if (!trimmedTitle) {
    throw createAppError('Card title is required', 'CARD_TITLE_REQUIRED', 400);
  }

  const board = await getBoardById(boardId);
  requireColumn(board, columnId);

  const assigneeIds = await resolveUserIds(assignees);
  const tagIds = await resolveTagIds(tags);
  const order = await cardsCollection().countDocuments({
    boardId: board._id,
    columnId,
  });

  const now = new Date();
  const doc = {
    boardId: board._id,
    columnId,
    title: trimmedTitle,
    description: description ? String(description).trim() : null,
    status: 'open',
    assignees: assigneeIds,
    tags: tagIds,
    order,
    comments: [],
    doneAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const result = await cardsCollection().insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

async function updateCard(id, updates) {
  const card = await getCardById(id);
  const board = await getBoardById(card.boardId);
  const set = { updatedAt: new Date() };

  if (updates.title !== undefined) {
    const trimmedTitle = String(updates.title || '').trim();

    if (!trimmedTitle) {
      throw createAppError(
        'Card title is required',
        'CARD_TITLE_REQUIRED',
        400
      );
    }

    set.title = trimmedTitle;
  }

  if (updates.description !== undefined) {
    set.description = updates.description
      ? String(updates.description).trim()
      : null;
  }

  if (updates.columnId !== undefined && updates.columnId !== card.columnId) {
    requireColumn(board, updates.columnId);
    set.columnId = updates.columnId;
    set.order =
      updates.order !== undefined
        ? Number(updates.order)
        : await cardsCollection().countDocuments({
            boardId: board._id,
            columnId: updates.columnId,
          });
  } else if (updates.order !== undefined) {
    set.order = Number(updates.order);
  }

  if (set.order !== undefined && !Number.isInteger(set.order)) {
    throw createAppError('order must be an integer', 'INVALID_ORDER', 400);
  }

  const result = await cardsCollection().findOneAndUpdate(
    { _id: card._id },
    { $set: set },
    { returnDocument: 'after' }
  );

  return result;
}

async function setCardStatus(id, status) {
  if (!CARD_STATUSES.includes(status)) {
    throw createAppError(
      `Invalid status. Use one of: ${CARD_STATUSES.join(', ')}`,
      'INVALID_STATUS',
      400
    );
  }

  const card = await getCardById(id);
  const now = new Date();

  const set = { status, updatedAt: now };
  set.doneAt = status === 'done' ? now : null;
  set.closedAt = status === 'closed' ? now : null;

  const result = await cardsCollection().findOneAndUpdate(
    { _id: card._id },
    { $set: set },
    { returnDocument: 'after' }
  );

  return result;
}

async function setCardAssignees(id, assigneeIds) {
  const card = await getCardById(id);
  const resolvedIds = await resolveUserIds(assigneeIds);

  const result = await cardsCollection().findOneAndUpdate(
    { _id: card._id },
    { $set: { assignees: resolvedIds, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return result;
}

async function setCardTags(id, tagIds) {
  const card = await getCardById(id);
  const resolvedIds = await resolveTagIds(tagIds);

  const result = await cardsCollection().findOneAndUpdate(
    { _id: card._id },
    { $set: { tags: resolvedIds, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return result;
}

async function addComment(id, { userId, text }) {
  const trimmedText = String(text || '').trim();

  if (!trimmedText) {
    throw createAppError(
      'Comment text is required',
      'COMMENT_TEXT_REQUIRED',
      400
    );
  }

  const card = await getCardById(id);
  const resolvedUserId = userId ? (await resolveUserIds([userId]))[0] : null;

  const comment = {
    id: crypto.randomUUID(),
    userId: resolvedUserId,
    text: trimmedText,
    createdAt: new Date(),
  };

  const result = await cardsCollection().findOneAndUpdate(
    { _id: card._id },
    { $push: { comments: comment }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return result;
}

module.exports = {
  CARD_STATUSES,
  listCards,
  getCardById,
  createCard,
  updateCard,
  setCardStatus,
  setCardAssignees,
  setCardTags,
  addComment,
};
