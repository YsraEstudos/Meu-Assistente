'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MobileSyncService = require('../src/services/mobile-sync.service');

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

console.log('Security boundary tests: passed');
