'use strict';

const assert = require('node:assert/strict');
const { validateRepositoryDocs } = require('./test-repository-docs');

const validFinalReport = `# Relatório Final do Scan

## Resumo

## Residuais

## Retestes executados
`;

const validScreenShareReport = `# Auditoria de segurança

## Limites da conclusão
`;

assert.equal(typeof validateRepositoryDocs, 'function');
assert.doesNotThrow(() => validateRepositoryDocs(validFinalReport, validScreenShareReport));

for (const exposedCredential of [
  'GEMINI_API_KEY: `AIzaSyExample123`',
  'Authorization: Bearer secret-token-123456',
  'access_token=secret-token-123456',
  'https://example.test/callback?token=secret-token-123456',
]) {
  assert.throws(
    () => validateRepositoryDocs(`${validFinalReport}\n${exposedCredential}`, validScreenShareReport),
    /credential/i,
    `Expected credential fixture to be rejected: ${exposedCredential}`,
  );
}

for (const machineLocalPath of [
  String.raw`C:\Users\developer\project`,
  String.raw`D:\Temp\security-scan\artifacts`,
]) {
  assert.throws(
    () => validateRepositoryDocs(`${validFinalReport}\n${machineLocalPath}`, validScreenShareReport),
    /machine-local path/i,
    `Expected machine-local path to be rejected: ${machineLocalPath}`,
  );
}

assert.throws(
  () => validateRepositoryDocs(validFinalReport.replace('## Residuais', 'Residuais'), validScreenShareReport),
  /Residuais/,
);
assert.throws(
  () => validateRepositoryDocs(validFinalReport.replace('## Retestes executados', 'Validação'), validScreenShareReport),
  /Retestes executados/,
);

console.log('Repository documentation validator tests passed');
