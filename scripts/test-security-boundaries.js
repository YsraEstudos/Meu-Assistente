'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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

assert.strictEqual(markdown.safeUrl('javascript:alert(1)'), null, 'unsafe Markdown URL schemes must be rejected');
assert.strictEqual(markdown.safeUrl('/etc/passwd'), null, 'local Markdown resource paths must be rejected');
assert.strictEqual(markdown.safeUrl('https://example.com'), 'https://example.com', 'HTTPS Markdown URLs must be preserved');
assert.doesNotMatch(
  markdown.toHTML('[run](javascript:alert(1))'),
  /<a\b[^>]*href=/i,
  'rejected Markdown links must render without an href attribute'
);
assert.doesNotMatch(
  markdown.toHTML('![local](/etc/passwd)'),
  /<img\b[^>]*src=/i,
  'rejected Markdown images must render without a src attribute'
);
assert.doesNotMatch(
  markdown.toHTML('[run][bad]\n\n[bad]: javascript:alert(1)'),
  /<a\b[^>]*href=/i,
  'rejected reference links must render without an href attribute'
);
assert.doesNotMatch(
  markdown.toHTML('![local][bad]\n\n[bad]: /etc/passwd'),
  /<img\b[^>]*src=/i,
  'rejected reference images must render without a src attribute'
);
assert.match(
  markdown.toHTML('[safe](https://example.com)'),
  /href="https:\/\/example\.com"/i,
  'markdown must preserve HTTPS links'
);
assert.doesNotMatch(
  markdown.toHTML('<ftp://evil.com>'),
  /<a\b[^>]*href="ftp:/i,
  'autolinks must not preserve unsupported FTP URLs'
);
assert.match(
  markdown.toHTML('<https://example.com>'),
  /href="https:\/\/example\.com"/i,
  'autolinks must preserve HTTPS URLs'
);

assert.strictEqual(typeof logger.redactMeta, 'function', 'logger must expose its redaction helper for boundary tests');
const metadata = {
  apiKey: 'secret-value',
  nested: { access_token: 'nested-secret', message: 'token=inline-secret' },
  safe: 'keep this value'
};
const redactedMetadata = logger.redactMeta(metadata);
assert.notStrictEqual(redactedMetadata, metadata, 'redaction must return a copy');
assert.strictEqual(metadata.apiKey, 'secret-value', 'redaction must not mutate caller metadata');
assert.strictEqual(metadata.nested.access_token, 'nested-secret', 'redaction must not mutate nested caller metadata');
assert.strictEqual(redactedMetadata.apiKey, '[REDACTED]', 'credential-shaped metadata keys must be redacted');
assert.strictEqual(redactedMetadata.nested.access_token, '[REDACTED]', 'nested credential metadata must be redacted');
assert.match(redactedMetadata.nested.message, /token=\[REDACTED\]/, 'credential-shaped values must be redacted');
assert.strictEqual(redactedMetadata.safe, 'keep this value', 'unrelated metadata must remain intact');

class CredentialEnvelope {
  constructor() {
    this.apiKey = 'class-secret';
  }
}
const classMetadata = { envelope: new CredentialEnvelope() };
const redactedClassMetadata = logger.redactMeta(classMetadata);
assert.notStrictEqual(redactedClassMetadata.envelope, classMetadata.envelope, 'class metadata must be copied');
assert.strictEqual(redactedClassMetadata.envelope.apiKey, '[REDACTED]', 'class metadata credentials must be redacted');

const circularMetadata = { secret: 'cycle-secret' };
circularMetadata.self = circularMetadata;
const redactedCircularMetadata = logger.redactMeta(circularMetadata);
assert.strictEqual(redactedCircularMetadata.self, redactedCircularMetadata, 'circular metadata must remain cycle-safe');
assert.strictEqual(circularMetadata.secret, 'cycle-secret', 'circular redaction must not mutate the source');
assert.strictEqual(
  logger.redactMeta({ message: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9==' }).message,
  'Authorization: Bearer [REDACTED]',
  'Bearer credentials with padding must be fully redacted'
);
const circularInfo = { level: 'info', message: 'circular metadata' };
circularInfo.details = { secret: 'cycle-secret' };
circularInfo.details.self = circularInfo.details;
circularInfo[Symbol.for('level')] = 'info';
let formattedCircularInfo;
assert.doesNotThrow(() => {
  formattedCircularInfo = logger.logger.format.transform(circularInfo);
}, 'Winston formatting must tolerate circular metadata');
assert.match(
  formattedCircularInfo[Symbol.for('message')],
  /\[Circular\]/,
  'circular metadata must be represented safely in formatted logs'
);

const chatWindowSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'chat-window.js'), 'utf8');
assert.match(
  chatWindowSource,
  /return this\.escapeHtmlForSnippet\(text\)\.replace\(\/\\n\/g, '<br>'\)/,
  'Electron chat Markdown fallback must escape text before inserting HTML'
);
assert.match(
  chatWindowSource,
  /const escapedLang = this\.escapeHtmlForSnippet\(\(language \|\| 'text'\)\.toUpperCase\(\)\);/,
  'Electron chat snippet language labels must be escaped'
);

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
assert.match(webappSource, /return parsed\.origin \+ parsed\.pathname;/, 'release links must strip query and fragment components');
assert.match(webappSource, /escapeHtml\(a\.name\)/, 'release asset names must be escaped');
assert.match(webappSource, /escapeHtml\(safeReleaseUrl\(a\.browser_download_url\)\)/, 'release URLs must be escaped and validated');
const releaseUrlFunction = webappSource.match(/function safeReleaseUrl\(value\) \{[\s\S]*?\n  \}/);
assert.ok(releaseUrlFunction, 'release URL helper must be extractable for boundary testing');
const safeReleaseUrl = vm.runInNewContext(`(${releaseUrlFunction[0]})`, {
  URL,
  window: { location: { href: 'https://github.com/TechyCSR/OpenCluely/' } }
});
assert.strictEqual(
  safeReleaseUrl('https://github.com/TechyCSR/OpenCluely/releases/download/v1/app.exe?xss=%22%3E%3Csvg#fragment'),
  'https://github.com/TechyCSR/OpenCluely/releases/download/v1/app.exe',
  'release URLs must discard query and fragment components'
);
assert.strictEqual(
  safeReleaseUrl('https://evil.example/releases/download/v1/app.exe'),
  '#',
  'release URLs outside the trusted origin must be rejected'
);

const loggerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'logger.js'), 'utf8');
assert.match(loggerSource, /exceptionHandlers:[\s\S]*?format: logFormat/, 'exception logs must use the redacting format');
assert.match(loggerSource, /rejectionHandlers:[\s\S]*?format: logFormat/, 'rejection logs must use the redacting format');

console.log('Security boundary tests: passed');
