'use strict';

function normalizeWhisperEngine(value) {
  const engine = String(value ?? '').trim().toLowerCase();
  if (engine === 'faster') return 'faster';
  if (['cpp', 'whisper.cpp', 'whispercpp', 'whisper-cpp'].includes(engine)) {
    return 'whisper-cpp';
  }
  return 'openai';
}

module.exports = { normalizeWhisperEngine };
