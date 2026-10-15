'use strict';

const log = require('../utils/logger');
const llm = require('../ai/llm.client');
const { triageEmail } = require('../ai/triage.service');
const { Email, EmailInsight } = require('../models');
const { emitToUser } = require('../realtime/socket');

/**
 * Runs triage over every email that has processedAt === null.
 * Mirrors the role message-processor.service.js plays for WhatsApp.
 */
async function processPending(accountId, { limit = 50 } = {}) {
  if (!llm.isConfigured()) {
    log.warn('processor', 'no LLM key configured — skipping triage pass');
    return { processed: 0, skipped: 'no_llm_provider' };
  }

  const pending = await Email.find({ accountId, processedAt: null })
    .sort({ receivedAt: -1 })
    .limit(limit);

  if (!pending.length) return { processed: 0 };

  let processed = 0;
  let surfaced = 0;

  for (const email of pending) {
    try {
      const result = await triageEmail(email);

      await EmailInsight.findOneAndUpdate(
        { emailId: email._id },
        {
          $set: {
            userId: email.userId,
            priority: result.priority,
            category: result.category,
            insight: result.insight,
            needsReply: result.needsReply,
            deadlineAt: result.deadlineAt,
            confidence: result.confidence,
            modelUsed: result.modelUsed,
          },
        },
        { upsert: true }
      );

      await Email.updateOne({ _id: email._id }, { $set: { processedAt: new Date() } });
      processed += 1;

      if (result.priority === 'urgent' || result.priority === 'action_required') {
        surfaced += 1;
        emitToUser(email.userId, 'email:new_insight', {
          emailId: String(email._id),
          priority: result.priority,
          fromName: email.fromName || email.fromEmail,
          subject: email.subject,
          insight: result.insight,
        });
      }
    } catch (err) {
      // Leave processedAt null so the next tick retries this email.
      log.error('processor', `triage failed for ${email.gmailId}: ${err.message}`);
    }
  }

  log.info('processor', `triaged ${processed} email(s), ${surfaced} need attention`);
  return { processed, surfaced };
}

module.exports = { processPending };
