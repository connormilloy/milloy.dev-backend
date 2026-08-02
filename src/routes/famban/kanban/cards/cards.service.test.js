const { ObjectId } = require('mongodb');
const {
  createMockCollection,
  createMockCursor,
} = require('../../shared/testUtils');

jest.mock('../../../../database/mongo');
jest.mock('../../users/users.service');
jest.mock('../../tags/tags.service');
jest.mock('../boards/boards.service');

const { getDb } = require('../../../../database/mongo');
const { resolveUserIds } = require('../../users/users.service');
const { resolveTagIds } = require('../../tags/tags.service');
const { getBoardById, requireColumn } = require('../boards/boards.service');

const {
  listCards,
  getCardById,
  createCard,
  updateCard,
  setCardStatus,
  setCardAssignees,
  setCardTags,
  addComment,
} = require('./cards.service');

describe('cards.service', () => {
  let cardsCollection;

  beforeEach(() => {
    jest.clearAllMocks();
    cardsCollection = createMockCollection();
    getDb.mockReturnValue({
      collection: jest.fn().mockReturnValue(cardsCollection),
    });
    resolveUserIds.mockResolvedValue([]);
    resolveTagIds.mockResolvedValue([]);
  });

  describe('listCards', () => {
    test('builds an empty query with no filters', async () => {
      cardsCollection.find.mockReturnValue(createMockCursor([]));

      await listCards();

      expect(cardsCollection.find).toHaveBeenCalledWith({});
    });

    test('throws INVALID_STATUS for an unrecognized status filter', async () => {
      await expect(listCards({ status: 'archived' })).rejects.toMatchObject({
        code: 'INVALID_STATUS',
        status: 400,
      });
    });

    test('translates boardId/assignee/tag filters to ObjectIds', async () => {
      cardsCollection.find.mockReturnValue(createMockCursor([]));
      const boardId = new ObjectId();
      const userId = new ObjectId();
      const tagId = new ObjectId();

      await listCards({
        boardId: boardId.toHexString(),
        assignee: userId.toHexString(),
        tag: tagId.toHexString(),
        columnId: 'col-1',
        status: 'open',
      });

      expect(cardsCollection.find).toHaveBeenCalledWith({
        boardId,
        columnId: 'col-1',
        status: 'open',
        assignees: userId,
        tags: tagId,
      });
    });
  });

  describe('getCardById', () => {
    test('throws CARD_NOT_FOUND when missing', async () => {
      cardsCollection.findOne.mockResolvedValue(null);

      await expect(
        getCardById(new ObjectId().toHexString())
      ).rejects.toMatchObject({
        code: 'CARD_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('createCard', () => {
    const board = {
      _id: new ObjectId(),
      columns: [{ id: 'col-1', name: 'To Do', order: 0 }],
    };

    beforeEach(() => {
      getBoardById.mockResolvedValue(board);
      requireColumn.mockReturnValue(board.columns[0]);
    });

    test('throws CARD_TITLE_REQUIRED for a blank title', async () => {
      await expect(
        createCard({
          boardId: board._id.toHexString(),
          columnId: 'col-1',
          title: '  ',
        })
      ).rejects.toMatchObject({ code: 'CARD_TITLE_REQUIRED', status: 400 });
    });

    test('validates the column exists on the board', async () => {
      cardsCollection.countDocuments.mockResolvedValue(0);
      cardsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      await createCard({
        boardId: board._id.toHexString(),
        columnId: 'col-1',
        title: 'Take out bins',
      });

      expect(requireColumn).toHaveBeenCalledWith(board, 'col-1');
    });

    test('appends to the end of the column via countDocuments', async () => {
      cardsCollection.countDocuments.mockResolvedValue(3);
      cardsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      const card = await createCard({
        boardId: board._id.toHexString(),
        columnId: 'col-1',
        title: 'Take out bins',
      });

      expect(card.order).toBe(3);
      expect(card.status).toBe('open');
      expect(card.comments).toEqual([]);
    });

    test('resolves assignees and tags through their services', async () => {
      const userId = new ObjectId();
      const tagId = new ObjectId();
      resolveUserIds.mockResolvedValue([userId]);
      resolveTagIds.mockResolvedValue([tagId]);
      cardsCollection.countDocuments.mockResolvedValue(0);
      cardsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      const card = await createCard({
        boardId: board._id.toHexString(),
        columnId: 'col-1',
        title: 'Take out bins',
        assignees: ['x'],
        tags: ['y'],
      });

      expect(card.assignees).toEqual([userId]);
      expect(card.tags).toEqual([tagId]);
    });
  });

  describe('updateCard', () => {
    const board = {
      _id: new ObjectId(),
      columns: [
        { id: 'col-1', name: 'To Do', order: 0 },
        { id: 'col-2', name: 'Done', order: 1 },
      ],
    };
    const existingCard = {
      _id: new ObjectId(),
      boardId: board._id,
      columnId: 'col-1',
    };

    beforeEach(() => {
      cardsCollection.findOne.mockResolvedValue(existingCard);
      getBoardById.mockResolvedValue(board);
      requireColumn.mockReturnValue(board.columns[1]);
    });

    test('throws CARD_TITLE_REQUIRED when title is set to blank', async () => {
      await expect(
        updateCard(existingCard._id.toHexString(), { title: '   ' })
      ).rejects.toMatchObject({ code: 'CARD_TITLE_REQUIRED' });
    });

    test('moving to a new column without an explicit order appends to the end', async () => {
      cardsCollection.countDocuments.mockResolvedValue(2);
      cardsCollection.findOneAndUpdate.mockResolvedValue({
        ...existingCard,
        columnId: 'col-2',
        order: 2,
      });

      await updateCard(existingCard._id.toHexString(), { columnId: 'col-2' });

      expect(cardsCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: existingCard._id },
        { $set: expect.objectContaining({ columnId: 'col-2', order: 2 }) },
        { returnDocument: 'after' }
      );
    });

    test('moving to a new column with an explicit order uses it verbatim', async () => {
      cardsCollection.findOneAndUpdate.mockResolvedValue(existingCard);

      await updateCard(existingCard._id.toHexString(), {
        columnId: 'col-2',
        order: 5,
      });

      expect(cardsCollection.countDocuments).not.toHaveBeenCalled();
      expect(cardsCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: existingCard._id },
        { $set: expect.objectContaining({ columnId: 'col-2', order: 5 }) },
        { returnDocument: 'after' }
      );
    });

    test('throws INVALID_ORDER for a non-integer order', async () => {
      await expect(
        updateCard(existingCard._id.toHexString(), { order: 1.5 })
      ).rejects.toMatchObject({ code: 'INVALID_ORDER', status: 400 });
    });
  });

  describe('setCardStatus', () => {
    const card = { _id: new ObjectId() };

    beforeEach(() => {
      cardsCollection.findOne.mockResolvedValue(card);
    });

    test('throws INVALID_STATUS for an unrecognized value', async () => {
      await expect(
        setCardStatus(card._id.toHexString(), 'archived')
      ).rejects.toMatchObject({
        code: 'INVALID_STATUS',
        status: 400,
      });
    });

    test('stamps doneAt and clears closedAt when marking done', async () => {
      cardsCollection.findOneAndUpdate.mockResolvedValue(card);

      await setCardStatus(card._id.toHexString(), 'done');

      const [, update] = cardsCollection.findOneAndUpdate.mock.calls[0];
      expect(update.$set.status).toBe('done');
      expect(update.$set.doneAt).toBeInstanceOf(Date);
      expect(update.$set.closedAt).toBeNull();
    });

    test('clears both timestamps when reopening', async () => {
      cardsCollection.findOneAndUpdate.mockResolvedValue(card);

      await setCardStatus(card._id.toHexString(), 'open');

      const [, update] = cardsCollection.findOneAndUpdate.mock.calls[0];
      expect(update.$set.doneAt).toBeNull();
      expect(update.$set.closedAt).toBeNull();
    });
  });

  describe('setCardAssignees / setCardTags', () => {
    const card = { _id: new ObjectId() };

    beforeEach(() => {
      cardsCollection.findOne.mockResolvedValue(card);
      cardsCollection.findOneAndUpdate.mockResolvedValue(card);
    });

    test('setCardAssignees resolves ids and sets them', async () => {
      const userId = new ObjectId();
      resolveUserIds.mockResolvedValue([userId]);

      await setCardAssignees(card._id.toHexString(), ['x']);

      expect(cardsCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: card._id },
        { $set: expect.objectContaining({ assignees: [userId] }) },
        { returnDocument: 'after' }
      );
    });

    test('setCardTags resolves ids and sets them', async () => {
      const tagId = new ObjectId();
      resolveTagIds.mockResolvedValue([tagId]);

      await setCardTags(card._id.toHexString(), ['y']);

      expect(cardsCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: card._id },
        { $set: expect.objectContaining({ tags: [tagId] }) },
        { returnDocument: 'after' }
      );
    });
  });

  describe('addComment', () => {
    const card = { _id: new ObjectId() };

    beforeEach(() => {
      cardsCollection.findOne.mockResolvedValue(card);
      cardsCollection.findOneAndUpdate.mockResolvedValue(card);
    });

    test('throws COMMENT_TEXT_REQUIRED for blank text', async () => {
      await expect(
        addComment(card._id.toHexString(), { text: '  ' })
      ).rejects.toMatchObject({ code: 'COMMENT_TEXT_REQUIRED', status: 400 });
    });

    test('resolves userId when provided and pushes the comment', async () => {
      const userId = new ObjectId();
      resolveUserIds.mockResolvedValue([userId]);

      await addComment(card._id.toHexString(), { userId: 'x', text: 'On it' });

      const [, update] = cardsCollection.findOneAndUpdate.mock.calls[0];
      expect(update.$push.comments).toMatchObject({ userId, text: 'On it' });
      expect(typeof update.$push.comments.id).toBe('string');
    });

    test('leaves userId null when not provided', async () => {
      await addComment(card._id.toHexString(), { text: 'On it' });

      expect(resolveUserIds).not.toHaveBeenCalled();
      const [, update] = cardsCollection.findOneAndUpdate.mock.calls[0];
      expect(update.$push.comments.userId).toBeNull();
    });
  });
});
