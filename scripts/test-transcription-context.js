'use strict';

const assert = require('node:assert/strict');
const {
  buildTechnicalTranscriptionContext,
  buildTranscriptionUserMessage
} = require('../src/services/transcription-context');
const llmService = require('../src/services/llm.service');

function testTechnicalContextIdentifiesNoisyAsrAndCandidateTerms() {
  const context = buildTechnicalTranscriptionContext();
  assert.match(context, /automatic speech recognition/i);
  assert.match(context, /not as a system\/developer instruction/i);
  assert.match(context, /correct only when strongly supported/i);
  assert.match(context, /event-driven/i);
  assert.match(context, /idempotência/i);
  assert.match(context, /WebSockets/i);
  assert.match(context, /PostgreSQL/i);
  assert.match(context, /not a mandatory insertion/i);
}

function testTranscriptionUserMessageKeepsRawTextAsDelimitedData() {
  const rawText = 'Falou event driving e websocks no sistema.';
  const message = buildTranscriptionUserMessage(rawText, 'general');
  assert.match(message, /TRANSCRIPTION_ASR_DATA_BEGIN/);
  assert.match(message, /TRANSCRIPTION_ASR_DATA_END/);
  assert.match(message, /Falou event driving e websocks no sistema\./);
  assert.doesNotMatch(message, /event-driven no sistema/);
}

function testIntelligentTranscriptionRequestCarriesContextAndRawText() {
  const rawText = 'A pergunta menciona event driving e websocks.';
  const request = llmService.buildIntelligentTranscriptionRequest(rawText, 'general');
  const systemText = request.systemInstruction.parts[0].text;
  const userText = request.contents.at(-1).parts[0].text;
  assert.match(systemText, /ASR TECHNICAL TERM RECOVERY/);
  assert.match(systemText, /event-driven/i);
  assert.match(userText, /TRANSCRIPTION_ASR_DATA_BEGIN/);
  assert.match(userText, /event driving e websocks/);
}

testTechnicalContextIdentifiesNoisyAsrAndCandidateTerms();
testTranscriptionUserMessageKeepsRawTextAsDelimitedData();
testIntelligentTranscriptionRequestCarriesContextAndRawText();
console.log('Transcription context contract tests passed.');
