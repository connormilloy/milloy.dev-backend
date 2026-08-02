require('dotenv').config();
const { MongoClient } = require('mongodb');
const { logWithTimestamp } = require('../utils/logwithTimestamp');

const DEFAULT_DB_NAME = 'milloy-dev';

let client;

async function connectMongo() {
  client = new MongoClient(process.env.DB_CONNECTION_STRING);
  await client.connect();
  logWithTimestamp('MongoDB connected successfully!');
}

function getMongoClient() {
  if (!client) {
    throw new Error('MongoDB client not initialized. Call connectMongo() first.');
  }
  return client;
}

function getDb(dbName = DEFAULT_DB_NAME) {
  return getMongoClient().db(dbName);
}

module.exports = { connectMongo, getMongoClient, getDb };
