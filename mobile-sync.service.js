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
    this.logger?.info('Mobile sync server started', info);
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
      const isPrivate = (address) => /^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[0-1])\\.)/.test(address);
      return Number(isPrivate(right)) - Number(isPrivate(left));
    });

    const urls = addresses.map((address) => `http://${address}:${this.port}/?token=${this.token}`);
    return {
      port: this.port,
      urls,
      url: urls[0] || `http://127.0.0.1:${this.port}/?token=${this.token}`
    };
  }

  isAuthorized(requestUrl) {
    try {
      return new URL(requestUrl, `http://127.0.0.1:${this.port}`).searchParams.get('token') === this.token;
    } catch (_) {
      return false;
    }
  }

  handleRequest(request, response) {
    if (!this.isAuthorized(request.url)) {
      response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Unauthorized');
      return;
    }

    const pathname = new URL(request.url, `http://127.0.0.1:${this.port}`).pathname;
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
        'Cache-Control': 'no-store'
      });
      response.end(this.page.replace('__TOKEN__', this.token));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
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
