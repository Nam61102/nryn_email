'use strict';

const mongoose = require('mongoose');
const env = require('../src/config/env');
const { EmailAccount, Email, EmailInsight, CalendarEvent } = require('../src/models');

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log('Connected to MongoDB');

  const targetUserId = '6ad0b65dc6f8e11909c040f8'; // namratakadam234
  const oldUserId = '6ad0ac09c6f8e11909c03ce3';    // namratakadam61102

  const accRes = await EmailAccount.updateMany(
    { emailAddress: 'namratakadam61102@gmail.com' },
    { $set: { userId: targetUserId } }
  );

  const emailRes = await Email.updateMany(
    { accountId: '6ad0ac09c6f8e11909c03ce4' },
    { $set: { userId: targetUserId } }
  );

  const insightRes = await EmailInsight.updateMany(
    { userId: oldUserId },
    { $set: { userId: targetUserId } }
  );

  const calRes = await CalendarEvent.updateMany(
    { userId: oldUserId },
    { $set: { userId: targetUserId } }
  );

  console.log('Accounts updated:', accRes.modifiedCount);
  console.log('Emails updated:', emailRes.modifiedCount);
  console.log('Insights updated:', insightRes.modifiedCount);
  console.log('Calendar events updated:', calRes.modifiedCount);

  const accounts = await EmailAccount.find({ userId: targetUserId }).lean();
  console.log('Target user now owns accounts:', accounts.map(a => a.emailAddress));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
