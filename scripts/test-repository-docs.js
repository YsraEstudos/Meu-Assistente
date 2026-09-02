'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const finalReport = read('SECURITY_FINAL_REPORT.md');
const screenShareReport = read('SECURITY_SCREEN_SHARE_FINDINGS.md');

const CREDENTIAL_PATTERNS = [
  /\b(?:GEMINI_API_KEY|AZURE_SPEECH_KEY|AZURE_SPEECH_TOKEN|OPENAI_API_KEY)\s*[:=]\s*[`"']?[a-z0-9][a-z0-9._~+\/-]{7,}/i,
  /\b(?:Authorization\s*:\s*)?Bearer\s+[`"']?[a-z0-9][a-z0-9._~+\/-]{7,}/i,
  /\b(?:access_token|token)\s*[:=]\s*[`"']?[a-z0-9][a-z0-9._~+\/-]{7,}/i,
];

const MACHINE_LOCAL_PATH = /\b[A-Z]:\\(?:Users\\|Temp\\|[^\r\n`]*\\Temp\\)/i;

function validateRepositoryDocs(finalContent, screenShareContent) {
  assert.match(finalContent, /^#\s+Relatório Final do Scan\b.*$/m, 'Cabeçalho principal do relatório final ausente');
  assert.match(finalContent, /^##\s+Resumo\s*$/m, 'Seção ## Resumo ausente no relatório final');
  assert.match(finalContent, /^##\s+Residuais\s*$/m, 'Seção ## Residuais ausente no relatório final');
  assert.match(finalContent, /^##\s+Retestes executados\s*$/m, 'Seção ## Retestes executados ausente no relatório final');
  assert.match(screenShareContent, /^#\s+Auditoria de segurança\b.*$/m, 'Cabeçalho principal da auditoria ausente');
  assert.match(screenShareContent, /^##\s+Limites da conclusão\s*$/m, 'Seção ## Limites da conclusão ausente');

  const combinedDocs = `${finalContent}\n${screenShareContent}`;
  for (const pattern of CREDENTIAL_PATTERNS) {
    assert.doesNotMatch(combinedDocs, pattern, `Sensitive credential pattern detected: ${pattern}`);
  }
  assert.doesNotMatch(combinedDocs, MACHINE_LOCAL_PATH, 'Machine-local path detected in published documentation');
}

if (require.main === module) {
  validateRepositoryDocs(finalReport, screenShareReport);
  console.log('Repository documentation integrity tests passed');
}

module.exports = { validateRepositoryDocs };
