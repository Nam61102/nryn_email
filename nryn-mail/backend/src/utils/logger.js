'use strict';

/**
 * Deliberately tiny. The one rule that matters: never log an email body.
 * Log gmail ids and subjects at most.
 */

const stamp = () => new Date().toISOString().slice(11, 19);

function line(level, scope, msg) {
  return `${stamp()} ${level} [${scope}] ${msg}`;
}

module.exports = {
  info: (scope, msg) => console.log(line('INFO ', scope, msg)),
  warn: (scope, msg) => console.warn(line('WARN ', scope, msg)),
  error: (scope, msg) => console.error(line('ERROR', scope, msg)),
  debug: (scope, msg) => {
    if (process.env.NODE_ENV !== 'production') console.log(line('DEBUG', scope, msg));
  },
};
