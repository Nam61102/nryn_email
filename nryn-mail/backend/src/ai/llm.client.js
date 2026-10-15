'use strict';

const axios = require('axios');
const env = require('../config/env');
const log = require('../utils/logger');

/**
 * One function, three providers, in order: OpenRouter -> Groq -> OpenAI.
 * Same fallback shape as the WhatsApp agent's extraction service (copied
 * pattern, not a shared import).
 */

function providers() {
  const list = [];
  if (env.ai.openrouterKey) {
    list.push({
      name: 'openrouter:' + env.ai.openrouterModel,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: env.ai.openrouterKey,
      model: env.ai.openrouterModel,
      extraHeaders: { 'X-Title': 'NRYN Mail', 'HTTP-Referer': 'http://localhost:4100' },
    });
  }
  if (env.ai.groqKey) {
    list.push({
      name: 'groq:' + env.ai.groqModel,
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: env.ai.groqKey,
      model: env.ai.groqModel,
    });
  }
  if (env.ai.openaiKey) {
    list.push({
      name: 'openai:' + env.ai.openaiModel,
      url: 'https://api.openai.com/v1/chat/completions',
      key: env.ai.openaiKey,
      model: env.ai.openaiModel,
    });
  }
  return list;
}

class NoProviderError extends Error {
  constructor() {
    super('no_llm_provider_configured');
    this.code = 'NO_LLM_PROVIDER';
  }
}

async function callOne(p, messages, { maxTokens, temperature, jsonMode }) {
  const body = {
    model: p.model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const { data } = await axios.post(p.url, body, {
    timeout: 45000,
    headers: Object.assign(
      {
        Authorization: `Bearer ${p.key}`,
        'Content-Type': 'application/json',
      },
      p.extraHeaders || {}
    ),
  });

  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!text) throw new Error('empty completion');
  return text;
}

/** Plain text completion with provider fallback. */
async function callText({ system, user, maxTokens = 700, temperature = 0.6 }) {
  const list = providers();
  if (!list.length) throw new NoProviderError();

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  let lastErr;
  for (const p of list) {
    try {
      const text = await callOne(p, messages, { maxTokens, temperature, jsonMode: false });
      return { text: text.trim(), modelUsed: p.name };
    } catch (err) {
      lastErr = err;
      log.warn('llm', `${p.name} failed: ${describe(err)} — trying next provider`);
    }
  }
  throw lastErr || new Error('all providers failed');
}

/**
 * JSON completion. Every parse is guarded, with exactly one repair retry —
 * this is where these pipelines actually break in production.
 */
async function callJson({ system, user, maxTokens = 900, temperature = 0.2 }) {
  const list = providers();
  if (!list.length) throw new NoProviderError();

  let lastErr;
  for (const p of list) {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let text;
      try {
        text = await callOne(p, messages, { maxTokens, temperature, jsonMode: true });
      } catch (err) {
        lastErr = err;
        log.warn('llm', `${p.name} failed: ${describe(err)}`);
        break; // provider-level failure — move to the next provider
      }

      try {
        return { json: parseLoose(text), modelUsed: p.name };
      } catch (err) {
        lastErr = err;
        if (attempt === 0) {
          log.warn('llm', `${p.name} returned invalid JSON — asking once for a repair`);
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content:
              'Your last response was not valid JSON. Return only the JSON object, ' +
              'no prose, no markdown fences.',
          });
        }
      }
    }
  }
  throw lastErr || new Error('all providers failed');
}

/** Tolerates markdown fences and stray prose around the object. */
function parseLoose(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(s);
  } catch (err) {
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first !== -1 && last > first) return JSON.parse(s.slice(first, last + 1));
    throw err;
  }
}

function describe(err) {
  if (err.response) {
    const d = err.response.data;
    const m = d && (d.error && d.error.message ? d.error.message : JSON.stringify(d).slice(0, 160));
    return `HTTP ${err.response.status} ${m || ''}`.trim();
  }
  return err.message;
}

module.exports = {
  callText,
  callJson,
  providers,
  NoProviderError,
  isConfigured: () => providers().length > 0,
};
