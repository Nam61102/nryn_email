'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const log = require('../utils/logger');

mongoose.set('strictQuery', true);

async function connect() {
  mongoose.connection.on('connected', () => log.info('mongo', 'connected to ' + redact(env.mongoUri)));
  mongoose.connection.on('disconnected', () => log.warn('mongo', 'disconnected'));
  mongoose.connection.on('error', (err) => log.error('mongo', 'connection error: ' + err.message));

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
    });
  } catch (err) {
    log.error('mongo', 'could not connect: ' + err.message);
    log.error('mongo', 'Is mongod running?  Try:  mongosh "' + redact(env.mongoUri) + '"');
    throw err;
  }

  // Mongoose builds indexes lazily; do it up front so the first inbox query is fast.
  await require('../models').syncIndexes();
  log.info('mongo', 'indexes in place');
}

async function disconnect() {
  await mongoose.connection.close();
}

/** Never print credentials if the URI ever grows a user:pass. */
function redact(uri) {
  return String(uri).replace(/\/\/[^@/]+@/, '//***:***@');
}

module.exports = { connect, disconnect, redact };
