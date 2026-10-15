'use strict';

/**
 * A quick look at what's actually in the database — the fastest way to check
 * each build step without a UI.
 *
 *   npm run db:stats
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const {
  User,
  EmailAccount,
  Email,
  EmailInsight,
  EmailSummary,
  EmailDraft,
} = require('../src/models');

(async () => {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });

  const [users, accounts, emails, untriaged, insights, summaries, drafts] = await Promise.all([
    User.countDocuments(),
    EmailAccount.countDocuments(),
    Email.countDocuments(),
    Email.countDocuments({ processedAt: null }),
    EmailInsight.countDocuments(),
    EmailSummary.countDocuments(),
    EmailDraft.countDocuments(),
  ]);

  console.log('\nNRYN Mail — database');
  console.log('─'.repeat(40));
  console.log(`users              ${users}`);
  console.log(`connected accounts ${accounts}`);
  console.log(`emails             ${emails}   (${untriaged} awaiting triage)`);
  console.log(`insights           ${insights}`);
  console.log(`summaries          ${summaries}`);
  console.log(`drafts             ${drafts}`);

  const byPriority = await EmailInsight.aggregate([
    { $group: { _id: '$priority', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  if (byPriority.length) {
    console.log('\npriority breakdown');
    byPriority.forEach((r) => console.log(`  ${String(r._id).padEnd(16)} ${r.n}`));
  }

  const recent = await EmailInsight.find().sort({ createdAt: -1 }).limit(8).lean();
  if (recent.length) {
    console.log('\nlatest insights');
    recent.forEach((r) => console.log(`  [${r.priority}] ${r.insight}`));
  }

  console.log('');
  process.exit(0);
})().catch((err) => {
  console.error('FAILED: ' + err.message);
  process.exit(1);
});
