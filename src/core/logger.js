const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const os = require('os');

const REDACT_KEYS = new Set([
  'apikey',
  'azurekey',
  'azureregion',
  'geminikey',
  'subscriptionkey',
  'token',
  'azuresubscriptionkey',
  'password',
  'secret',
  'authorization'
]);

function redactString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/(token=)[^&\s]+/ig, '$1[REDACTED]')
    .replace(/(Bearer\s+)[^\s]+/ig, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret)=)[^&\s]+/ig, '$1[REDACTED]');
}

function isRedactedKey(key) {
  if (typeof key !== 'string') return false;
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return REDACT_KEYS.has(normalizedKey) ||
    normalizedKey.endsWith('apikey') ||
    normalizedKey.endsWith('token') ||
    normalizedKey.endsWith('secret');
}

function createRedactedContainer(meta) {
  if (Array.isArray(meta)) return [];
  if (meta instanceof Date) return new Date(meta.getTime());
  if (meta instanceof Map) return new Map();
  if (meta instanceof Set) return new Set();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(meta)) return Buffer.from(meta);
  return Object.create(Object.getPrototypeOf(meta));
}

function redactMeta(meta, seen = new WeakMap()) {
  if (typeof meta === 'string') return redactString(meta);
  if (!meta || typeof meta !== 'object') return meta;
  if (seen.has(meta)) return seen.get(meta);

  const redacted = createRedactedContainer(meta);
  seen.set(meta, redacted);

  if (meta instanceof Map) {
    for (const [key, value] of meta.entries()) {
      redacted.set(
        redactMeta(key, seen),
        isRedactedKey(key) ? '[REDACTED]' : redactMeta(value, seen)
      );
    }
  } else if (meta instanceof Set) {
    for (const value of meta.values()) {
      redacted.add(redactMeta(value, seen));
    }
  }

  for (const key of Reflect.ownKeys(meta)) {
    if (Array.isArray(meta) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(meta, key);
    if (!descriptor) continue;

    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      Object.defineProperty(redacted, key, descriptor);
      continue;
    }

    let value;
    if (isRedactedKey(key)) {
      value = '[REDACTED]';
    } else {
      value = redactMeta(descriptor.value, seen);
    }

    Object.defineProperty(redacted, key, { ...descriptor, value });
  }

  return redacted;
}

function safeStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, nested) => {
    if (nested && typeof nested === 'object') {
      if (seen.has(nested)) return '[Circular]';
      seen.add(nested);
    }
    return nested;
  }, 2);
}

class Logger {
  constructor() {
    this.logDir = path.join(os.homedir(), '.OpenCluely', 'logs');
    this.redactMeta = redactMeta;
    this.setupLogger();
  }

  setupLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format((info) => redactMeta(info))(),
      winston.format.printf(({ timestamp, level, message, stack, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? safeStringify(meta) : '';
        const serviceStr = service ? `[${service}]` : '';
        const stackStr = stack ? `\n${stack}` : '';
        return `${timestamp} ${level.toUpperCase()} ${serviceStr} ${message}${stackStr}${metaStr ? `\n${metaStr}` : ''}`;
      })
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { pid: process.pid },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            logFormat
          ),
          stderrLevels: ['error', 'warn']
        }),
        new DailyRotateFile({
          filename: path.join(this.logDir, 'application-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          level: 'info'
        }),
        new DailyRotateFile({
          filename: path.join(this.logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error'
        })
      ],
      exceptionHandlers: [
        new winston.transports.File({
          filename: path.join(this.logDir, 'exceptions.log'),
          format: logFormat
        })
      ],
      rejectionHandlers: [
        new winston.transports.File({
          filename: path.join(this.logDir, 'rejections.log'),
          format: logFormat
        })
      ]
    });
  }

  createServiceLogger(serviceName) {
    return {
      debug: (message, meta = {}) => this.logger.debug(message, { service: serviceName, ...meta }),
      info: (message, meta = {}) => this.logger.info(message, { service: serviceName, ...meta }),
      warn: (message, meta = {}) => this.logger.warn(message, { service: serviceName, ...meta }),
      error: (message, meta = {}) => this.logger.error(message, { service: serviceName, ...meta }),
      logPerformance: (operation, startTime, metadata = {}) => this.logPerformance(operation, startTime, { service: serviceName, ...metadata })
    };
  }

  getSystemMetrics() {
    return {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version
    };
  }

  logPerformance(operation, startTime, metadata = {}) {
    const duration = Date.now() - startTime;
    this.logger.info(`Performance: ${operation} completed`, {
      service: 'PERFORMANCE',
      duration: `${duration}ms`,
      ...metadata
    });
    return duration;
  }
}

Logger.prototype.redactMeta = redactMeta;

module.exports = new Logger();
