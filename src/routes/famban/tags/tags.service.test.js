const { ObjectId } = require('mongodb');
const {
  createMockCollection,
  createMockCursor,
} = require('../shared/testUtils');

jest.mock('../../../database/mongo');
const { getDb } = require('../../../database/mongo');

const {
  listTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
  resolveTagIds,
} = require('./tags.service');

describe('tags.service', () => {
  let tagsCollection;
  let cardsCollection;

  beforeEach(() => {
    jest.clearAllMocks();
    tagsCollection = createMockCollection();
    cardsCollection = createMockCollection();

    getDb.mockReturnValue({
      collection: jest.fn((name) =>
        name === 'famban-tags' ? tagsCollection : cardsCollection
      ),
    });
  });

  describe('listTags', () => {
    test('sorts by name and returns the array', async () => {
      const docs = [{ name: 'urgent' }, { name: 'weekend' }];
      tagsCollection.find.mockReturnValue(createMockCursor(docs));

      await expect(listTags()).resolves.toEqual(docs);
      expect(tagsCollection.find).toHaveBeenCalledWith({});
    });
  });

  describe('getTagById', () => {
    test('throws TAG_NOT_FOUND when missing', async () => {
      tagsCollection.findOne.mockResolvedValue(null);

      await expect(
        getTagById(new ObjectId().toHexString())
      ).rejects.toMatchObject({
        code: 'TAG_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('createTag', () => {
    test('throws TAG_NAME_REQUIRED for a blank name', async () => {
      await expect(createTag({ name: '' })).rejects.toMatchObject({
        code: 'TAG_NAME_REQUIRED',
        status: 400,
      });
    });

    test('defaults the color when omitted', async () => {
      tagsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      await createTag({ name: 'urgent' });

      expect(tagsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'urgent', color: '#94a3b8' })
      );
    });

    test('throws INVALID_TAG_COLOR for a non-hex color', async () => {
      await expect(
        createTag({ name: 'urgent', color: 'blue' })
      ).rejects.toMatchObject({
        code: 'INVALID_TAG_COLOR',
        status: 400,
      });
    });

    test('accepts a valid hex color', async () => {
      tagsCollection.insertOne.mockResolvedValue({
        insertedId: new ObjectId(),
      });

      await createTag({ name: 'urgent', color: '#EF4444' });

      expect(tagsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ color: '#EF4444' })
      );
    });

    test('maps a duplicate-key error to TAG_ALREADY_EXISTS', async () => {
      tagsCollection.insertOne.mockRejectedValue({ code: 11000 });

      await expect(createTag({ name: 'urgent' })).rejects.toMatchObject({
        code: 'TAG_ALREADY_EXISTS',
        status: 409,
      });
    });
  });

  describe('updateTag', () => {
    test('throws TAG_NOT_FOUND when nothing matches', async () => {
      tagsCollection.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        updateTag(new ObjectId().toHexString(), { name: 'weekend' })
      ).rejects.toMatchObject({ code: 'TAG_NOT_FOUND', status: 404 });
    });

    test('maps a duplicate-key error to TAG_ALREADY_EXISTS', async () => {
      tagsCollection.findOneAndUpdate.mockRejectedValue({ code: 11000 });

      await expect(
        updateTag(new ObjectId().toHexString(), { name: 'urgent' })
      ).rejects.toMatchObject({ code: 'TAG_ALREADY_EXISTS', status: 409 });
    });
  });

  describe('deleteTag', () => {
    test('untags every card, then deletes the tag document', async () => {
      const tagDoc = { _id: new ObjectId(), name: 'urgent' };
      tagsCollection.findOne.mockResolvedValue(tagDoc);
      cardsCollection.updateMany.mockResolvedValue({ modifiedCount: 2 });
      tagsCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await deleteTag(tagDoc._id.toHexString());

      expect(cardsCollection.updateMany).toHaveBeenCalledWith(
        { tags: tagDoc._id },
        { $pull: { tags: tagDoc._id } }
      );
      expect(tagsCollection.deleteOne).toHaveBeenCalledWith({
        _id: tagDoc._id,
      });
    });
  });

  describe('resolveTagIds', () => {
    test('returns an empty array for undefined/empty input', async () => {
      await expect(resolveTagIds(undefined)).resolves.toEqual([]);
    });

    test('throws INVALID_TAGS when an id does not exist', async () => {
      const id = new ObjectId();
      tagsCollection.find.mockReturnValue(createMockCursor([]));

      await expect(resolveTagIds([id.toHexString()])).rejects.toMatchObject({
        code: 'INVALID_TAGS',
        status: 400,
      });
    });

    test('returns deduped ObjectIds when all exist', async () => {
      const id = new ObjectId();
      tagsCollection.find.mockReturnValue(createMockCursor([{ _id: id }]));

      const result = await resolveTagIds([id.toHexString(), id.toHexString()]);

      expect(result).toEqual([id]);
    });
  });
});
