// MongoDB $jsonSchema validator for famban-users. Source of truth for the
// collection's shape, enforced server-side by Mongo itself (see
// ../database.js) - the service layer still validates input up front so
// callers get clean 400s instead of raw Mongo validation errors.
const usersValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['name', 'active', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: {},
      name: { bsonType: 'string', minLength: 1 },
      email: { bsonType: ['string', 'null'] },
      avatarUrl: { bsonType: ['string', 'null'] },
      active: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

module.exports = { usersValidator };
