'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const finalReport = read('SECURITY_FINAL_REPORT.md');
const screenShareReport = read('SECURITY_SCREEN_SHARE_FINDINGS.md');

assert.match(finalReport, /Relatório Final do Scan/);
assert.match(finalReport, /Residuais/);
assert.match(finalReport, /Validação|Retestes executados/);
assert.match(screenShareReport, /Auditoria de segurança/);
assert.match(screenShareReport, /Limites da conclusão/);
assert.doesNotMatch(`${finalReport}\n${screenShareReport}`, /(?:GEMINI_API_KEY|AZURE_SPEECH_KEY|Bearer)\s*[:=]\s*[^\s`]+/i);

console.log('Repository documentation integrity tests passed');
