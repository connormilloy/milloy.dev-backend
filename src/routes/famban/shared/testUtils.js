// Test-only helpers for building fake MongoDB collections. Not required by
// any production code path - only imported from *.test.js files.

function createMockCursor(results = []) {
  return {
    sort: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue(results),
  };
}

function createMockCollection(overrides = {}) {
  return {
    find: jest.fn().mockReturnValue(createMockCursor([])),
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
    createIndex: jest.fn(),
    ...overrides,
  };
}

module.exports = { createMockCursor, createMockCollection };
