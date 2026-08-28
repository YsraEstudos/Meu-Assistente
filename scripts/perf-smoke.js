'use strict';

const assert = require('assert');
const contextBuilder = require('../src/services/context.builder');
const ResponseStream = require('../src/services/response-stream');

async function testContextBuilder() {
  const built = contextBuilder.build({
    text: 'Explain binary search',
    activeSkill: 'dsa',
    codingLanguage: 'javascript',
    historySnapshot: {
      conversation: [
        { role: 'user', content: 'Explain binary search' },
        { role: 'model', content: 'Use a sorted array.' },
        { role: 'user', content: 'What is its complexity?' }
      ],
      summary: {
        activities: { coding: 2 },
        focus: [{ skill: 'dsa' }]
      }
    }
  });
  assert.equal(built.contents.at(-1).role, 'user');
  assert(built.contents.at(-1).parts[0].text.includes('Explain binary search'));
  assert.equal(built.contents.filter((item) => item.parts[0].text.includes('Explain binary search')).length, 1);
  assert(built.systemInstruction?.parts[0].text.length > 0);
  assert(built.systemInstruction.parts[0].text.includes('COMPACT SESSION SUMMARY'));
  assert.equal(built.stats.hasSummary, true);
  assert(built.stats.contextTokens > 0);
}

async function testResponseStream() {
  const events = [];
  const stream = new ResponseStream({ intervalMs: 1 });
  stream.start({ messageId: 'smoke-1', sessionId: 'session-1', skill: 'general', emit: (type, data) => events.push({ type, data }) });
  stream.append('smoke-1', 'Hello');
  stream.append('smoke-1', ' world');
  await new Promise((resolve) => setTimeout(resolve, 5));
  stream.end('smoke-1', { response: 'Hello world' });
  assert.equal(events[0].type, 'start');
  assert.equal(events[0].data.sequence, 0);
  assert(events.some((event) => event.type === 'delta' && event.data.delta === 'Hello world'));
  const deltaEvents = events.filter((event) => event.type === 'delta');
  assert(deltaEvents.every((event) => event.data.messageId === 'smoke-1' && event.data.sessionId === 'session-1'));
  assert.equal(events.at(-1).type, 'end');
  assert.equal(events.at(-1).data.content, 'Hello world');
  assert.equal(stream.end('smoke-1', { response: 'duplicate' }), false);
}

Promise.all([testContextBuilder(), testResponseStream()])
  .then(() => console.log('Performance smoke tests: passed'))
  .catch((error) => {
    console.error('Performance smoke tests: failed', error);
    process.exitCode = 1;
  });
