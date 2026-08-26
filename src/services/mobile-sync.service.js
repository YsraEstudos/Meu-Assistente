const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

class MobileSyncService {
  constructor({ logger, port = 4317 } = {}) {
    this.logger = logger;
    this.port = port;
    this.server = null;
    this.token = null;
    this.clients = new Set();
    this.page = null;
  }

  async start() {
    // This zero-configuration pairing endpoint is intentionally HTTP and LAN-facing.
    // Treat the generated URL as a bearer secret and expose the port only on a
    // trusted network; deployments that require hostile-network protection need TLS.
    if (this.server) {
      return this.getConnectionInfo();
    }

    this.token = crypto.randomBytes(24).toString('hex');
    this.page = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile-sync.html'), 'utf8');

    const listen = (port) => new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => this.handleRequest(request, response));
      const onError = (error) => {
        server.removeListener('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        this.server = server;
        this.port = port;
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '0.0.0.0');
    });

    try {
      await listen(this.port);
    } catch (error) {
      if (error.code !== 'EADDRINUSE') {
        this.logger?.error('Mobile sync server failed to start', { error: error.message });
        throw error;
      }
      await listen(this.port + 1);
    }

    const info = this.getConnectionInfo();
    this.logger?.info('Mobile sync server started', {
      port: info.port,
      urlCount: info.urls.length
    });
    return info;
  }

  getConnectionInfo() {
    const addresses = [];
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const address of interfaces || []) {
        if (
          address.family === 'IPv4' &&
          !address.internal &&
          !address.address.startsWith('169.254.')
        ) {
          addresses.push(address.address);
        }
      }
    }

    addresses.sort((left, right) => {
      const isPrivate = (address) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(address);
      return Number(isPrivate(right)) - Number(isPrivate(left));
    });

    const urls = addresses.map((address) => `http://${address}:${this.port}/?token=${this.token}`);
    return {
      port: this.port,
      urls,
      url: urls[0] || `http://127.0.0.1:${this.port}/?token=${this.token}`
    };
  }

  isAuthorized(requestUrl, headers = {}, { allowQuery = true } = {}) {
    if (!this.token || typeof requestUrl !== 'string') return false;
    let url;
    try {
      url = new URL(requestUrl, `http://127.0.0.1:${this.port}`);
    } catch (_) {
      return false;
    }
    const queryTokens = allowQuery ? url.searchParams.getAll('token') : [];
    const hasQueryToken = queryTokens.length > 0;
    const queryToken = queryTokens.length === 1 ? queryTokens[0] : null;
    const cookieToken = String(headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('opencluely_mobile_token='))
      ?.slice('opencluely_mobile_token='.length) || null;
    const requestedToken = hasQueryToken ? queryToken : cookieToken;
    const expected = Buffer.from(this.token);
    const actual = Buffer.from(requestedToken || '');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  handleRequest(request, response) {
    let url;
    try {
      url = new URL(request.url, `http://127.0.0.1:${this.port}`);
    } catch (_) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Bad request');
      return;
    }

    const pathname = url.pathname;
    const isPage = pathname === '/' || pathname === '/mobile-sync.html';
    if (!isPage && pathname !== '/events') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    if (!this.isAuthorized(request.url, request.headers, { allowQuery: isPage })) {
      try {
        const requestedToken = isPage ? url.searchParams.get('token') || '' : '';
        this.logger?.warn('Mobile sync authorization rejected', {
          hasToken: requestedToken.length > 0 || /(?:^|;\s*)opencluely_mobile_token=/.test(String(request.headers.cookie || '')),
          tokenConfigured: Boolean(this.token)
        });
      } catch (_) { /* ignore diagnostic logging errors */ }
      response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Unauthorized');
      return;
    }

    if (pathname === '/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      response.write(': connected\n\n');
      this.clients.add(response);
      request.on('close', () => this.clients.delete(response));
      return;
    }

    if (pathname === '/' || pathname === '/mobile-sync.html') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': 'opencluely_mobile_token=' + this.token + '; HttpOnly; SameSite=Strict; Path=/'
      });
      response.end(this.page);
      return;
    }
  }

  publish(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch (_) {
        this.clients.delete(client);
      }
    }
  }

  stop() {
    for (const client of this.clients) {
      try { client.end(); } catch (_) { /* ignore */ }
    }
    this.clients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = MobileSyncService;
