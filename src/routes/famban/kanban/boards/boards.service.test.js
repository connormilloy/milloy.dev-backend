const { ObjectId } = require('mongodb');
const {
  createMockCollection,
  createMockCursor,
} = require('../../shared/testUtils');

jest.mock('../../../../database/mongo');
const { getDb } = require('../../../../database/mongo');

const {
  listBoards,
  getBoardById,
  requireColumn,
  findColumnByKind,
  createBoard,
  updateBoard,
  addColumn,
  renameColumn,
  deleteColumn,
} = require('./boards.service');

describe('boards.service', () => {
  let boardsCollection;
  let cardsCollection;

  beforeEach(() => {
    jest.clearAllMocks();
    boardsCollection = createMockCollection();
    cardsCollection = createMockCollection();

    getDb.mockReturnValue({
      collection: jest.fn((name) =>
        name === 'famban-boards' ? boardsCollection : cardsCollection
      ),
    });
  });

  describe('listBoards', () => {
    test('sorts by name and returns the array', async () => {
      const docs = [{ name: 'Chores' }];
      boardsCollection.find.mockReturnValue(createMockCursor(docs));

      await expect(listBoards()).resolves.toEqual(docs);
    });

    test('excludes archived boards by default', async () => {
      boardsCollection.find.mockReturnValue(createMockCursor([]));

      await listBoards();

      expect(boardsCollection.find).toHaveBeenCalledWith({
        archived: { $ne: true },
      });
    });

    test('includes archived boards when includeArchived is true', async () => {
      boardsCollection.find.mockReturnValue(createMockCursor([]));

      await listBoards({ includeArchived: true });

      expect(boardsCollection.find).toHaveBeenCalledWith({});
    });
  });

  describe('getBoardById / requireColumn', () => {
    test('throws BOARD_NOT_FOUND when missing', async () => {
      boardsCollection.findOne.mockResolvedValue(null);

      await expect(
        getBoardById(new ObjectId().toHexString())
      ).rejects.toMatchObject({
        code: 'BOARD_NOT_FOUND',
        status: 404,
      });
    });

    test('requireColumn throws COLUMN_NOT_FOUND when the column is not on the board', () => {
      const board = { columns: [{ id: 'a', name: 'To Do', order: 0 }] };

      expect(() => requireColumn(board, 'missing')).toThrow(
        expect.objectContaining({ code: 'COLUMN_NOT_FOUND', status: 404 })
      );
    });

    test('requireColumn returns the column when present', () => {
      const column = { id: 'a', name: 'To Do', order: 0 };
      const board = { columns: [column] };

      expect(requireColumn(board, 'a')).toEqual(column);
    });
  });

  describe('findColumnByKind', () => {
    test('returns the column with the matching kind', () => {
      const done = { id: 'c', name: 'Done', order: 2, kind: 'done' };
      const board = {
        columns: [{ id: 'a', name: 'To Do', order: 0, kind: 'todo' }, done],
      };

      expect(findColumnByKind(board, 'done')).toEqual(done);
    });

    test('returns null when the board has no column of that kind', () => {
      const board = { columns: [{ id: 'a', name: 'Backlog', order: 0, kind: null }] };

      expect(findColumnByKind(board, 'done')).toBeNull();
    });
  });

  describe('createBoard', () => {
    test('throws BOARD_NAME_REQUIRED for a blank name', async () => {
      await expect(createBoard({ name: '  ' })).rejects.toMatchObject({
        code: 'BOARD_NAME_REQUIRED',
        status: 400,
      });
    });

    test('starts unarchived', async () => {
      boardsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      const board = await createBoard({ name: 'Chores' });

      expect(board.archived).toBe(false);
      expect(board.archivedAt).toBeNull();
    });

    test('always seeds To Do / In Progress / Done with matching kinds', async () => {
      boardsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      const board = await createBoard({ name: 'Chores' });

      expect(board.columns.map((c) => c.name)).toEqual([
        'To Do',
        'In Progress',
        'Done',
      ]);
      expect(board.columns.map((c) => c.order)).toEqual([0, 1, 2]);
      expect(board.columns.map((c) => c.kind)).toEqual([
        'todo',
        'in_progress',
        'done',
      ]);
      board.columns.forEach((c) => expect(typeof c.id).toBe('string'));
    });

    test('appends caller-supplied custom columns after the kinded defaults', async () => {
      boardsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      const board = await createBoard({
        name: 'Chores',
        columns: ['Backlog', 'Live'],
      });

      expect(board.columns.map((c) => c.name)).toEqual([
        'To Do',
        'In Progress',
        'Done',
        'Backlog',
        'Live',
      ]);
      expect(board.columns.map((c) => c.order)).toEqual([0, 1, 2, 3, 4]);
      expect(board.columns.map((c) => c.kind)).toEqual([
        'todo',
        'in_progress',
        'done',
        null,
        null,
      ]);
    });
  });

  describe('updateBoard', () => {
    test('throws BOARD_NOT_FOUND before attempting the update when the board is missing', async () => {
      boardsCollection.findOne.mockResolvedValue(null);

      await expect(
        updateBoard(new ObjectId().toHexString(), { name: 'New name' })
      ).rejects.toMatchObject({ code: 'BOARD_NOT_FOUND' });
      expect(boardsCollection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('throws BOARD_NAME_REQUIRED when name is set to blank', async () => {
      boardsCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        name: 'Chores',
      });

      await expect(
        updateBoard(new ObjectId().toHexString(), { name: '  ' })
      ).rejects.toMatchObject({ code: 'BOARD_NAME_REQUIRED' });
    });

    test('sets archived and stamps archivedAt when archived: true', async () => {
      const board = { _id: new ObjectId(), name: 'Chores' };
      boardsCollection.findOne.mockResolvedValue(board);
      boardsCollection.findOneAndUpdate.mockResolvedValue({
        ...board,
        archived: true,
      });

      await updateBoard(board._id.toHexString(), { archived: true });

      expect(boardsCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: board._id },
        {
          $set: expect.objectContaining({
            archived: true,
            archivedAt: expect.any(Date),
          }),
        },
        { returnDocument: 'after' }
      );
    });

    test('clears archivedAt when archived: false', async () => {
      const board = { _id: new ObjectId(), name: 'Chores', archived: true };
      boardsCollection.findOne.mockResolvedValue(board);
      boardsCollection.findOneAndUpdate.mockResolvedValue({
        ...board,
        archived: false,
      });

      await updateBoard(board._id.toHexString(), { archived: false });

      expect(boardsCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: board._id },
        { $set: expect.objectContaining({ archived: false, archivedAt: null }) },
        { returnDocument: 'after' }
      );
    });
  });

  describe('addColumn', () => {
    test('appends the column with the next order index', async () => {
      const board = {
        _id: new ObjectId(),
        columns: [{ id: 'a', name: 'To Do', order: 0 }],
      };
      boardsCollection.findOne.mockResolvedValue(board);

      const column = await addColumn(board._id.toHexString(), 'Done');

      expect(column).toMatchObject({ name: 'Done', order: 1, kind: null });
      expect(boardsCollection.updateOne).toHaveBeenCalledWith(
        { _id: board._id },
        expect.objectContaining({ $push: { columns: column } })
      );
    });

    test('throws COLUMN_NAME_REQUIRED for a blank name', async () => {
      const board = { _id: new ObjectId(), columns: [] };
      boardsCollection.findOne.mockResolvedValue(board);

      await expect(
        addColumn(board._id.toHexString(), '')
      ).rejects.toMatchObject({
        code: 'COLUMN_NAME_REQUIRED',
      });
    });
  });

  describe('renameColumn', () => {
    test('throws COLUMN_NOT_FOUND when the column does not exist on the board', async () => {
      const board = { _id: new ObjectId(), columns: [] };
      boardsCollection.findOne.mockResolvedValue(board);

      await expect(
        renameColumn(board._id.toHexString(), 'missing', 'New name')
      ).rejects.toMatchObject({ code: 'COLUMN_NOT_FOUND' });
    });
  });

  describe('deleteColumn', () => {
    test('throws COLUMN_NOT_EMPTY when cards still reference the column', async () => {
      const board = {
        _id: new ObjectId(),
        columns: [{ id: 'a', name: 'To Do', order: 0 }],
      };
      boardsCollection.findOne.mockResolvedValue(board);
      cardsCollection.countDocuments.mockResolvedValue(2);

      await expect(
        deleteColumn(board._id.toHexString(), 'a')
      ).rejects.toMatchObject({ code: 'COLUMN_NOT_EMPTY', status: 409 });
      expect(boardsCollection.updateOne).not.toHaveBeenCalled();
    });

    test('pulls the column when no cards reference it', async () => {
      const board = {
        _id: new ObjectId(),
        columns: [{ id: 'a', name: 'To Do', order: 0 }],
      };
      boardsCollection.findOne.mockResolvedValue(board);
      cardsCollection.countDocuments.mockResolvedValue(0);

      await deleteColumn(board._id.toHexString(), 'a');

      expect(boardsCollection.updateOne).toHaveBeenCalledWith(
        { _id: board._id },
        expect.objectContaining({ $pull: { columns: { id: 'a' } } })
      );
    });

    test('throws COLUMN_KIND_PROTECTED for a kinded column', async () => {
      const board = {
        _id: new ObjectId(),
        columns: [{ id: 'a', name: 'Done', order: 2, kind: 'done' }],
      };
      boardsCollection.findOne.mockResolvedValue(board);

      await expect(
        deleteColumn(board._id.toHexString(), 'a')
      ).rejects.toMatchObject({ code: 'COLUMN_KIND_PROTECTED', status: 400 });
      expect(boardsCollection.updateOne).not.toHaveBeenCalled();
    });
  });
});
