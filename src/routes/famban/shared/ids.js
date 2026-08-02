const { ObjectId } = require('mongodb');
const { createAppError } = require('./errors');

function parseObjectId(id, label = 'id') {
  if (!id || !ObjectId.isValid(id)) {
    throw createAppError(`Invalid ${label}`, 'INVALID_ID', 400);
  }

  return new ObjectId(id);
}

module.exports = { parseObjectId };
