// MongoDB $jsonSchema validators. These are the source of truth for the
// shape of each Famban collection and are enforced server-side by Mongo
// itself (see database.js) - the service layer still validates input
// up front so callers get clean 400s instead of raw Mongo validation errors.

const usersValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['name', 'active', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: {},
      name: { bsonType: 'string', minLength: 1 },
      email: { bsonType: ['string', 'null'] },
      active: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const boardsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['name', 'columns', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: {},
      name: { bsonType: 'string', minLength: 1 },
      description: { bsonType: ['string', 'null'] },
      columns: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['id', 'name', 'order'],
          additionalProperties: false,
          properties: {
            id: { bsonType: 'string' },
            name: { bsonType: 'string', minLength: 1 },
            order: { bsonType: 'int' },
          },
        },
      },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const tagsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['name', 'color', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: {},
      name: { bsonType: 'string', minLength: 1 },
      color: { bsonType: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

const cardsValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'boardId',
      'columnId',
      'title',
      'status',
      'assignees',
      'tags',
      'comments',
      'order',
      'createdAt',
      'updatedAt',
    ],
    additionalProperties: false,
    properties: {
      _id: {},
      boardId: { bsonType: 'objectId' },
      columnId: { bsonType: 'string' },
      title: { bsonType: 'string', minLength: 1 },
      description: { bsonType: ['string', 'null'] },
      status: { enum: ['open', 'done', 'closed'] },
      assignees: { bsonType: 'array', items: { bsonType: 'objectId' } },
      tags: { bsonType: 'array', items: { bsonType: 'objectId' } },
      order: { bsonType: 'int' },
      comments: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['id', 'text', 'createdAt'],
          additionalProperties: false,
          properties: {
            id: { bsonType: 'string' },
            userId: { bsonType: ['objectId', 'null'] },
            text: { bsonType: 'string', minLength: 1 },
            createdAt: { bsonType: 'date' },
          },
        },
      },
      doneAt: { bsonType: ['date', 'null'] },
      closedAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

module.exports = {
  usersValidator,
  boardsValidator,
  cardsValidator,
  tagsValidator,
};
