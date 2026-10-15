'use strict';

const cron = require('node-cron');
const env = require('../config/env');
const log = require('../utils/logger');
const { EmailAccount } = require('../models');
const sync = require('../gmail/gmail.sync.service');
const processor = require('../email/email.processor');
const { emitToUser } = require('../realtime/socket');

let task = null;

/**
 * The whole body is wrapped in try/catch. An unhandled rejection inside a
 * node-cron tick takes down the entire Node process — that is not a
 * hypothetical, it is the most common way these jobs kill an app.
 */
async function tick() {
  try {
    const accounts = await EmailAccount.find({ status: 'active' }).select('_id userId emailAddress');
    if (!accounts.length) return;

    for (const account of accounts) {
      try {
        const result = await sync.syncAccount(account._id);
        if (result && result.inserted) {
          emitToUser(account.userId, 'email:synced', { count: result.inserted });
        }
        await processor.processPending(account._id, { limit: 25 });
      } catch (err) {
        log.error('cron', `account ${account.emailAddress}: ${err.message}`);
      }
    }
  } catch (err) {
    log.error('cron', 'tick failed: ' + err.message);
  }
}

function start() {
  if (task) return task;
  if (!cron.validate(env.sync.cron)) {
    log.error('cron', `invalid SYNC_CRON "${env.sync.cron}" — sync job not started`);
    return null;
  }
  task = cron.schedule(env.sync.cron, tick);
  log.info('cron', `gmail sync scheduled (${env.sync.cron})`);
  return task;
}

function stop() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { start, stop, tick };
