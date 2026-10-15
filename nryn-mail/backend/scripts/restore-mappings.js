'use strict';

const mongoose = require('mongoose');
const env = require('../src/config/env');
const { EmailAccount, Email } = require('../src/models');

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log('Connected to MongoDB');

  const u1 = '6ad0ac09c6f8e11909c03ce3'; // namratakadam61102
  const u2 = '6ad0b65dc6f8e11909c040f8'; // namratakadam234

  const r1 = await EmailAccount.updateOne(
    { emailAddress: 'namratakadam61102@gmail.com' },
    { $set: { userId: u1 } }
  );
  const r2 = await Email.updateMany(
    { accountId: '6ad0ac09c6f8e11909c03ce4' },
    { $set: { userId: u1 } }
  );

  const r3 = await EmailAccount.updateOne(
    { emailAddress: 'namratakadam234@gmail.com' },
    { $set: { userId: u2 } }
  );
  const r4 = await Email.updateMany(
    { accountId: '6ad0b65dc6f8e11909c040f9' },
    { $set: { userId: u2 } }
  );

  console.log('Account 1 updated:', r1.modifiedCount, 'Emails 1:', r2.modifiedCount);
  console.log('Account 2 updated:', r3.modifiedCount, 'Emails 2:', r4.modifiedCount);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
