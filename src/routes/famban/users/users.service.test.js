const { ObjectId } = require('mongodb');
const {
  createMockCollection,
  createMockCursor,
} = require('../shared/testUtils');

jest.mock('../../../database/mongo');
const { getDb } = require('../../../database/mongo');

const {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  resolveUserIds,
} = require('./users.service');

describe('users.service', () => {
  let usersCollection;

  beforeEach(() => {
    jest.clearAllMocks();
    usersCollection = createMockCollection();
    getDb.mockReturnValue({
      collection: jest.fn().mockReturnValue(usersCollection),
    });
  });

  describe('listUsers', () => {
    test('sorts by name and returns the array', async () => {
      const docs = [{ name: 'Alice' }, { name: 'Bob' }];
      usersCollection.find.mockReturnValue(createMockCursor(docs));

      const result = await listUsers();

      expect(usersCollection.find).toHaveBeenCalledWith({});
      expect(result).toEqual(docs);
    });
  });

  describe('getUserById', () => {
    test('throws INVALID_ID for a malformed id', async () => {
      await expect(getUserById('not-an-id')).rejects.toMatchObject({
        code: 'INVALID_ID',
        status: 400,
      });
    });

    test('throws USER_NOT_FOUND when the doc is missing', async () => {
      usersCollection.findOne.mockResolvedValue(null);

      await expect(
        getUserById(new ObjectId().toHexString())
      ).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
        status: 404,
      });
    });

    test('returns the user when found', async () => {
      const doc = { _id: new ObjectId(), name: 'Alice' };
      usersCollection.findOne.mockResolvedValue(doc);

      await expect(getUserById(doc._id.toHexString())).resolves.toEqual(doc);
    });
  });

  describe('createUser', () => {
    test('throws USER_NAME_REQUIRED for a blank name', async () => {
      await expect(createUser({ name: '   ' })).rejects.toMatchObject({
        code: 'USER_NAME_REQUIRED',
        status: 400,
      });
    });

    test('trims the name and lowercases the email', async () => {
      usersCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      await createUser({ name: '  Connor  ', email: '  Connor@Example.com  ' });

      expect(usersCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Connor',
          email: 'connor@example.com',
          active: true,
        })
      );
    });

    test('treats a missing email as null', async () => {
      usersCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      await createUser({ name: 'Connor' });

      expect(usersCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ email: null })
      );
    });

    test('maps a duplicate-key error to USER_ALREADY_EXISTS', async () => {
      usersCollection.insertOne.mockRejectedValue({ code: 11000 });

      await expect(createUser({ name: 'Connor' })).rejects.toMatchObject({
        code: 'USER_ALREADY_EXISTS',
        status: 409,
      });
    });
  });

  describe('updateUser', () => {
    test('throws USER_NAME_REQUIRED when name is set to blank', async () => {
      await expect(
        updateUser(new ObjectId().toHexString(), { name: '  ' })
      ).rejects.toMatchObject({ code: 'USER_NAME_REQUIRED' });
    });

    test('throws USER_NOT_FOUND when the update matches nothing', async () => {
      usersCollection.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        updateUser(new ObjectId().toHexString(), { active: false })
      ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', status: 404 });
    });

    test('returns the updated document on success', async () => {
      const updated = { _id: new ObjectId(), name: 'Connor', active: false };
      usersCollection.findOneAndUpdate.mockResolvedValue(updated);

      await expect(
        updateUser(updated._id.toHexString(), { active: false })
      ).resolves.toEqual(updated);
    });

    test('maps a duplicate-key error to USER_ALREADY_EXISTS', async () => {
      usersCollection.findOneAndUpdate.mockRejectedValue({ code: 11000 });

      await expect(
        updateUser(new ObjectId().toHexString(), { email: 'taken@example.com' })
      ).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS', status: 409 });
    });
  });

  describe('resolveUserIds', () => {
    test('returns an empty array for undefined/empty input', async () => {
      await expect(resolveUserIds(undefined)).resolves.toEqual([]);
      await expect(resolveUserIds([])).resolves.toEqual([]);
    });

    test('dedupes ids and returns them as ObjectIds when all exist', async () => {
      const id = new ObjectId();
      usersCollection.find.mockReturnValue(createMockCursor([{ _id: id }]));

      const result = await resolveUserIds([id.toHexString(), id.toHexString()]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(id);
    });

    test('throws INVALID_ASSIGNEES when an id does not exist', async () => {
      const id = new ObjectId();
      usersCollection.find.mockReturnValue(createMockCursor([]));

      await expect(resolveUserIds([id.toHexString()])).rejects.toMatchObject({
        code: 'INVALID_ASSIGNEES',
        status: 400,
      });
    });
  });
});
