// MongoDB $jsonSchema validator for famban-boards. See ../../database.js.
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
            kind: { enum: ['todo', 'in_progress', 'done', null] },
          },
        },
      },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

module.exports = { boardsValidator };
