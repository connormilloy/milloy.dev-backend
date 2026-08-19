// MongoDB $jsonSchema validator for famban-cards. See ../../database.js.
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
      status: { enum: ['open', 'in_progress', 'done', 'closed'] },
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

module.exports = { cardsValidator };
