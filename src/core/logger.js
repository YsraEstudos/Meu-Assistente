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
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/ig, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret)=)[^&\s]+/ig, '$1[REDACTED]');
}

function redactMeta(meta, seen = new WeakSet()) {
  if (Array.isArray(meta)) {
    if (seen.has(meta)) return meta;
    seen.add(meta);
    meta.forEach((item, index) => { meta[index] = redactMeta(item, seen); });
    return meta;
  }

  if (!meta || typeof meta !== 'object') return redactString(meta);
  if (seen.has(meta)) return meta;
  seen.add(meta);

  for (const key of Object.keys(meta)) {
    const value = meta[key];
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      REDACT_KEYS.has(normalizedKey) ||
      normalizedKey.endsWith('apikey') ||
      normalizedKey.endsWith('token') ||
      normalizedKey.endsWith('secret')
    ) {
      meta[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      meta[key] = redactString(value);
    } else if (Array.isArray(value) || (value && typeof value === 'object')) {
      meta[key] = redactMeta(value, seen);
    }
  }

  return meta;
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
      winston.format((info) => {
        redactMeta(info);
        return info;
      })(),
      winston.format.printf(({ timestamp, level, message, stack, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
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
