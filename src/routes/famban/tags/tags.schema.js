// MongoDB $jsonSchema validator for famban-tags. See ../database.js.
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

module.exports = { tagsValidator };
