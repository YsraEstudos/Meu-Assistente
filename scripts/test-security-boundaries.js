'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MobileSyncService = require('../src/services/mobile-sync.service');
const markdown = require('../lib/markdown');
const logger = require('../src/core/logger');

const mobileSync = new MobileSyncService({ port: 4317 });
mobileSync.token = 'expected-token';

assert.strictEqual(
  mobileSync.isAuthorized('/?token=expected-token'),
  true,
  'the exact mobile-sync token should authorize a request'
);
assert.strictEqual(
  mobileSync.isAuthorized('/?token=expected-token-extra'),
  false,
  'a token with an appended suffix must not authorize a request'
);
assert.strictEqual(
  mobileSync.isAuthorized('/?token=wrong-token&token=expected-token'),
  false,
  'duplicate token parameters must not bypass exact token validation'
);

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
assert.doesNotMatch(
  mainSource,
  /setCertificateVerifyProc[\s\S]*?callback\(0\)/,
  'the app must not disable TLS certificate verification for Google APIs'
);

assert.doesNotMatch(
  markdown.toHTML('[run](javascript:alert(1))'),
  /javascript:/i,
  'markdown links must not preserve executable URL schemes'
);
assert.doesNotMatch(
  markdown.toHTML('![local](/etc/passwd)'),
  /href="\/etc\/passwd"|src="\/etc\/passwd"/i,
  'markdown images must not preserve local resource paths'
);
assert.match(
  markdown.toHTML('[safe](https://example.com)'),
  /href="https:\/\/example\.com"/i,
  'markdown must preserve HTTPS links'
);

assert.strictEqual(typeof logger.redactMeta, 'function', 'logger must expose its redaction helper for boundary tests');
const metadata = {
  apiKey: 'secret-value',
  nested: { access_token: 'nested-secret', message: 'token=inline-secret' },
  safe: 'keep this value'
};
logger.redactMeta(metadata);
assert.strictEqual(metadata.apiKey, '[REDACTED]', 'credential-shaped metadata keys must be redacted');
assert.strictEqual(metadata.nested.access_token, '[REDACTED]', 'nested credential metadata must be redacted');
assert.match(metadata.nested.message, /token=\[REDACTED\]/, 'credential-shaped values must be redacted');
assert.strictEqual(metadata.safe, 'keep this value', 'unrelated metadata must remain intact');

const chatSource = fs.readFileSync(path.join(__dirname, '..', 'chat.html'), 'utf8');
assert.match(
  chatSource,
  /falling back to escaped text[\s\S]*?return escapeHtml\(text\)\.replace\(\/\\n\/g, '<br>'\)/,
  'chat fallback markdown rendering must escape text before inserting HTML'
);

const llmResponseSource = fs.readFileSync(path.join(__dirname, '..', 'llm-response.html'), 'utf8');
assert.match(
  llmResponseSource,
  /code-header">\$\{escapeHtml\(block\.language\.toUpperCase\(\)\)\}/,
  'LLM code headers must escape the language label'
);
assert.match(
  llmResponseSource,
  /language-\$\{escapeHtml\(block\.language\)\}/,
  'LLM code class names must escape the language value'
);

const webappSource = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'script.js'), 'utf8');
assert.match(webappSource, /function safeReleaseUrl\(/, 'release links must pass through URL validation');
assert.match(webappSource, /escapeHtml\(a\.name\)/, 'release asset names must be escaped');
assert.match(webappSource, /escapeHtml\(safeReleaseUrl\(a\.browser_download_url\)\)/, 'release URLs must be escaped and validated');

console.log('Security boundary tests: passed');
