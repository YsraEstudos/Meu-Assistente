const path = require('path');
const os = require('os');

const DUAL_AUDIO_MODES = new Set(['legacy', 'shadow', 'active']);

function resolveDualAudioMode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DUAL_AUDIO_MODES.has(normalized) ? normalized : 'legacy';
}

class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.appDataDir = path.join(os.homedir(), '.OpenCluely');
    this.loadConfiguration();
  }

  loadConfiguration() {
    const supportedGeminiModels = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    const supportedThinkingLevels = ['minimal', 'low', 'medium', 'high'];
    const configuredGeminiModel = supportedGeminiModels.includes(process.env.GEMINI_MODEL)
      ? process.env.GEMINI_MODEL
      : 'gemini-3.6-flash';
    const defaultThinkingLevel = configuredGeminiModel === 'gemini-3.5-flash-lite'
      ? 'minimal'
      : 'medium';
    const configuredThinkingLevel = supportedThinkingLevels.includes(process.env.GEMINI_THINKING_LEVEL)
      ? process.env.GEMINI_THINKING_LEVEL
      : defaultThinkingLevel;

    this.config = {
      features: {
        dualAudioMode: resolveDualAudioMode(process.env.OPENCLUEY_DUAL_AUDIO_MODE)
      },

      app: {
        name: 'OpenCluely',
        version: '1.0.0',
        processTitle: 'OpenCluely',
        dataDir: this.appDataDir,
        isDevelopment: this.env === 'development',
        isProduction: this.env === 'production'
      },
      
      window: {
        defaultWidth: 400,
        defaultHeight: 600,
        minWidth: 300,
        minHeight: 400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../../preload.js')
        }
      },

      ocr: {
        language: 'eng',
        tempDir: os.tmpdir(),
        cleanupDelay: 5000
      },

      llm: {
        gemini: {
          model: configuredGeminiModel,
          supportedModels: supportedGeminiModels,
          supportedThinkingLevels,
          fallbackModels: supportedGeminiModels.filter((model) => model !== configuredGeminiModel),
          maxRetries: 3,
          timeout: 30000,
          fallbackEnabled: true,
          enableFallbackMethod: true,
          generation: {
            temperature: 0.7,
            topK: 32,
            topP: 0.9,
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingLevel: configuredThinkingLevel }
          }
        }
      },

      speech: {
        provider: 'azure',
        azure: {
          language: 'en-US',
          enableDictation: true,
          enableAudioLogging: false,
          outputFormat: 'detailed'
        },
        whisper: {
          model: 'turbo',
          language: 'pt',
          // segmentMs is the legacy fixed-window size used when VAD is disabled.
          segmentMs: 4000,
          // Backstop for long uninterrupted speech when VAD is enabled. The
          // audio capture continues while each completed block is transcribed.
          periodicFlushMs: 3000,
          // Voice-activity-detection driven segmentation. Instead of cutting
          // audio on a blind timer (which splits sentences mid-word), we flush
          // a segment when the speaker pauses. This makes transcription align
          // with natural utterance boundaries.
          vadEnabled: true,
          // Trailing silence (ms) that ends an utterance and triggers a flush.
          silenceHangoverMs: 600,
          // Minimum accumulated speech (ms) before a pause counts as an
          // utterance — guards against coughs/clicks producing empty flushes.
          minUtteranceMs: 350,
          // Hard cap (ms): force-flush a long monologue even without a pause.
          maxUtteranceMs: 30000,
          // Pre-roll (ms) of audio kept before speech onset so the first
          // syllable isn't clipped when we start capturing.
          preRollMs: 300,
          captureChunkSamples: 2048,
          // Absolute RMS energy floor (normalized 0..1). Energy below this is
          // always treated as silence regardless of the adaptive noise floor.
          vadEnergyFloor: 0.008,
          batchSize: 4,
          batchTimeoutMs: 2000,
          maxConcurrent: 4,
          beamSize: 5,
          cppBeamSize: 1,
          cppBestOf: 1,
          cppNoFallback: true,
          cppFlashAttention: true,
          cppThreads: os.cpus().length || 4,
          cppBlas: true,
          cppBackend: 'vulkan'
        }
      },

      session: {
        maxMemorySize: 1000,
        compressionThreshold: 500,
        clearOnRestart: false
      },

      performance: {
        enabled: process.env.OPENCLUEY_PERF === '1',
        streamBatchMs: 40,
        contextMaxTokens: 8192,
        audioTransport: 'message-port',
        audioBatchMs: 256,
        stealthWatchdogMs: 15000,
        screenshotMaxDimension: 2560
      },

      stealth: {
        hideFromDock: true,
        noAttachConsole: true,
        disguiseProcess: true
      }
    };
  }

  get(keyPath) {
    return keyPath.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  getApiKey(service) {
    const envKey = `${service.toUpperCase()}_API_KEY`;
    return process.env[envKey];
  }

  isFeatureEnabled(feature) {
    return this.get(`features.${feature}`) !== false;
  }
}

module.exports = new ConfigManager();
