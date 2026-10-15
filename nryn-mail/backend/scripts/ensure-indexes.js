'use strict';

/**
 * MongoDB needs no migration step — Mongoose creates collections on first write.
 * This script exists so you can prove the connection works and the indexes are
 * in place before you touch OAuth.
 *
 *   npm run db:indexes
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');

(async () => {
  try {
    console.log('connecting to ' + String(env.mongoUri).replace(/\/\/[^@/]+@/, '//***@'));
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
    console.log('connected\n');

    for (const M of models.all) {
      await M.syncIndexes();
      const idx = await M.collection.indexes();
      console.log(`${M.collection.collectionName}`);
      idx.forEach((i) => console.log(`   • ${i.name}  ${JSON.stringify(i.key)}`));
    }

    console.log('\nAll indexes in place.');
    process.exit(0);
  } catch (err) {
    console.error('\nFAILED: ' + err.message);
    console.error('Is mongod running? Try:  mongosh "' + env.mongoUri + '"');
    process.exit(1);
  }
})();
