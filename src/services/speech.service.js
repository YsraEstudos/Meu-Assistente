// Enhanced polyfills for Azure Speech SDK in Node.js environment
if (typeof window === 'undefined') {
  global.window = {
    navigator: {
      userAgent: 'Node.js',
      platform: 'node',
      mediaDevices: {
        getUserMedia: () => Promise.resolve({
          getAudioTracks: () => [],
          getTracks: () => [],
          stop: () => {}
        }),
        getSupportedConstraints: () => ({
          audio: true,
          video: false,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: true,
          sampleSize: true,
          channelCount: true
        }),
        enumerateDevices: () => Promise.resolve([
          {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default - Microphone',
            groupId: 'default'
          }
        ])
      }
    },
    document: {
      createElement: (tagName) => {
        const element = {
          addEventListener: () => {},
          removeEventListener: () => {},
          setAttribute: () => {},
          getAttribute: () => null,
          style: {},
          tagName: tagName.toUpperCase(),
          nodeType: 1,
          nodeName: tagName.toUpperCase(),
          appendChild: () => {},
          removeChild: () => {},
          insertBefore: () => {},
          cloneNode: () => element,
          hasAttribute: () => false,
          removeAttribute: () => {},
          click: () => {},
          focus: () => {},
          blur: () => {}
        };

        if (tagName.toLowerCase() === 'audio') {
          Object.assign(element, {
            play: () => Promise.resolve(),
            pause: () => {},
            load: () => {},
            canPlayType: () => 'probably',
            volume: 1,
            muted: false,
            paused: true,
            ended: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            defaultPlaybackRate: 1,
            readyState: 4,
            networkState: 1,
            autoplay: false,
            loop: false,
            controls: false,
            crossOrigin: null,
            preload: 'metadata',
            src: '',
            currentSrc: ''
          });
        }

        return element;
      },
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      },
      head: {
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        style: {}
      }
    },
    location: {
      href: 'file:///',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'file://'
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (callback) => global.setTimeout(callback, 16),
    cancelAnimationFrame: global.clearTimeout,
    console: global.console || {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    },
    AudioContext: class AudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    webkitAudioContext: class webkitAudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => {},
          setOrientation: () => {}
        };
        this.destination = {
          connect: () => {},
          disconnect: () => {},
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => {},
          disconnect: () => {},
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {}
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => {},
          disconnect: () => {},
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => {},
          disconnect: () => {},
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => {},
          getByteTimeDomainData: () => {},
          getFloatFrequencyData: () => {},
          getFloatTimeDomainData: () => {}
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    URL: class URL {
      constructor(url) {
        this.href = url;
        this.protocol = 'https:';
        this.host = 'localhost';
        this.hostname = 'localhost';
        this.port = '';
        this.pathname = '/';
        this.search = '';
        this.hash = '';
        this.origin = 'https://localhost';
      }
      toString() {
        return this.href;
      }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() {
        return new Blob();
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() {
        return new File([], this.name);
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    }
  };
  global.document = global.window.document;
  global.navigator = global.window.navigator;
  global.AudioContext = global.window.AudioContext;
  global.webkitAudioContext = global.window.webkitAudioContext;
  global.URL = global.window.URL;
  global.Blob = global.window.Blob;
  global.File = global.window.File;

  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      mark: () => {},
      measure: () => {},
      clearMarks: () => {},
      clearMeasures: () => {},
      getEntriesByName: () => [],
      getEntriesByType: () => []
    };
  }

  if (!global.crypto) {
    global.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    };
  }
}

const fs = require('fs');
const fsPromises = fs.promises;
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execFile } = require('child_process');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');
const { normalizeWhisperEngine } = require('../core/whisper-engine');
const WHISPER_WORKER_REQUEST_TIMEOUT_MS = 210000;
const WHISPER_WORKER_SHUTDOWN_TIMEOUT_MS = 5000;
const performanceTracker = require('../core/performance');

let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logger.warn('Azure Speech SDK unavailable', { error: error.message });
}

let recorder = null;
try {
  recorder = require('node-record-lpcm16');
} catch (error) {
  logger.warn('Local audio recorder dependency unavailable', { error: error.message });
}

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.isFinalizing = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.pushStream = null;
    this.recording = null;
    this.available = false;
    this.provider = 'disabled';
    this.runtimeSettings = {};
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.segmentTimer = null;
    this.transcriptionInFlight = false;
    this.activeTranscriptionCount = 0;
    this.recordingSessionId = 0;
    this._whisperFlushQueue = Promise.resolve();
    this._activeWhisperFlushes = new Set();
    this._whisperPendingSegments = [];
    this._whisperBatchPending = [];
    this._whisperBatchTimer = null;
    this._whisperBatchFlushScheduled = false;
    this._whisperBatchRunning = false;
    this._whisperRunningSegment = null;
    this._whisperSegmentSequence = 0;
    this._whisperFinalizationPromise = null;
    this._rendererCaptureDrainPromise = null;
    this._rendererCaptureDrainResolve = null;
    this._rendererCaptureDrainTimer = null;
    this._rendererAudioStats = null;
    this._vadChunkCount = 0;
    this._lastVadLogAt = 0;
    this._transcriptionProgress = null;
    this._whisperWorker = null;
    this._whisperWorkerReady = false;
    this._whisperWorkerStartPromise = null;
    this._whisperWorkerRequests = new Map();
    this._whisperWorkerRequestSeq = 0;
    this._whisperWorkerStdoutBuffer = '';
    this._whisperWorkerStderr = '';
    this._whisperWorkerStart = null;
    this._whisperWorkerFallbackLogged = false;
    this._whisperWorkerRetryAfter = 0;
    this.audioProgram = null;
    this.whisperCommand = null;
    this.whisperEngine = null;
    this.effectiveWhisperEngine = null;
    this.fasterWhisperLaunch = null;
    this.whisperCppLaunch = null;
    this._lastWhisperRuntime = null;
    this._latencySession = null;
    this._resetVadState();

    // Client probing can spawn Python/Whisper synchronously. The main process
    // explicitly initializes us after the first window has painted so startup
    // and second-instance activation stay responsive.
  }

  initializeClient() {
    this._shutdownWhisperWorker();
    this._cleanup();
    this.provider = 'disabled';
    this.available = false;
    this.speechConfig = null;
    this.whisperCommand = null;
    this.whisperEngine = null;
    this.effectiveWhisperEngine = null;
    this.fasterWhisperLaunch = null;
    this.whisperCppLaunch = null;
    this._lastWhisperRuntime = null;

    const provider = this._getConfiguredProvider();
    this.provider = provider;
    this.whisperEngine = this._getConfiguredWhisperEngine();

    if (provider === 'azure') {
      this._initializeAzureClient();
      return;
    }

    if (provider === 'whisper') {
      this._initializeWhisperClient();
      return;
    }

    const reason = 'Speech recognition disabled. Configure Azure or local Whisper.';
    logger.warn(reason);
    this.emit('status', reason);
  }

  _initializeAzureClient() {
    try {
      if (!sdk) {
        throw new Error('Azure Speech SDK dependency is not installed');
      }

      if (!recorder || typeof recorder.record !== 'function') {
        throw new Error('Local microphone recorder dependency is not installed');
      }

      const subscriptionKey = this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY;
      const region = this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION;

      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing Azure credentials)');
        this.emit('status', reason);
        return;
      }

      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);

      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '5000');
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '2000');

      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }

      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }

      this.available = true;
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      this.emit('status', 'Azure Speech Services ready');
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Azure speech unavailable');
    }
  }

  _initializeWhisperClient() {
    try {
      const engine = this._getConfiguredWhisperEngine();
      if (engine === 'faster') {
        const fasterReady = this._initializeFasterWhisperClient();
        if (fasterReady) {
          return;
        }
        this._initializeOpenAiWhisperClient('Faster Whisper unavailable; falling back to OpenAI Whisper backend');
        return;
      }
      if (engine === 'whisper-cpp') {
        const cppReady = this._initializeWhisperCppClient();
        if (cppReady) {
          return;
        }
        if (this._initializeFasterWhisperClient()) {
          logger.warn('whisper.cpp unavailable; using Faster Whisper CPU/GPU fallback');
          return;
        }
        this._initializeOpenAiWhisperClient('whisper.cpp unavailable; falling back to OpenAI Whisper backend');
        return;
      }

      this._initializeOpenAiWhisperClient();
    } catch (error) {
      logger.error('Failed to initialize local Whisper client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Local Whisper unavailable');
    }
  }

  startRecording() {
    try {
      if (!this.available) {
        const errorMsg = `Speech provider "${this.provider}" is not available`;
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }

      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      if (this.isFinalizing) {
        this.emit('status', 'Transcription still in progress. Please wait.');
        return;
      }

      this.sessionStartTime = Date.now();
      this.retryCount = 0;
      performanceTracker.mark('speech-start', { provider: this.provider });

      if (this.provider === 'azure') {
        this._startAzureRecording();
        return;
      }

      if (this.provider === 'whisper') {
        this._startWhisperRecording();
        return;
      }

      throw new Error(`Unsupported speech provider: ${this.provider}`);
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _startAzureRecording() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    this._cleanup();
    this.isRecording = true;
    this.emit('recording-started', { sessionId: this.recordingSessionId });
    this.emit('status', 'Azure recording started');

    try {
      this.pushStream = sdk.AudioInputStream.createPushStream();
      this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
      this._startMicrophoneCapture();
      this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
    } catch (error) {
      logger.error('Failed to start Azure recording session', { error: error.message });
      this.emit('error', `Audio configuration failed: ${error.message}`);
      this.isRecording = false;
      return;
    }

    this.recognizer.recognizing = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          this.emit('interim-transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognizing handler', { error: error.message });
      }
    };

    this.recognizer.recognized = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text && e.result.text.trim()) {
          this.emit('transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognized handler', { error: error.message });
      }
    };

    this.recognizer.canceled = (s, e) => {
      logger.warn('Recognition session canceled', {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails
      });

      if (e.reason === sdk.CancellationReason.Error) {
        const details = e.errorDetails || '';
        if (details.includes('1006')) {
          this.emit('error', 'Network connection failed. Please check your internet connection.');
        } else if (details.includes('InvalidServiceCredentials')) {
          this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
        } else if (details.includes('Forbidden')) {
          this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
        } else if (details.includes('AudioInputMicrophone_InitializationFailure')) {
          this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
        } else {
          this.emit('error', `Recognition error: ${details}`);
        }
      }

      this.stopRecording();
    };

    this.recognizer.sessionStarted = (s, e) => {
      logger.info('Recognition session started', { sessionId: e.sessionId });
    };

    this.recognizer.sessionStopped = () => {
      this.stopRecording();
    };

    const startTimeout = setTimeout(() => {
      logger.error('Recognition start timeout');
      this.emit('error', 'Speech recognition start timeout. Please try again.');
      this.stopRecording();
    }, 10000);

    this.recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(startTimeout);
        logger.info('Continuous Azure speech recognition started successfully');
        if (global.windowManager) {
          global.windowManager.handleRecordingStarted();
        }
      },
      (error) => {
        clearTimeout(startTimeout);
        logger.error('Failed to start continuous recognition', { error: error.toString() });
        this.emit('error', `Recognition startup failed: ${error}`);
        this.isRecording = false;
        this._cleanup();
      }
    );
  }

  _startWhisperRecording() {
    this._cleanup();
    this.isRecording = true;
    this.isFinalizing = false;
    this._startLatencySession(this.recordingSessionId, Date.now());
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this._whisperFlushQueue = Promise.resolve();
    this._whisperPendingSegments = [];
    this._whisperBatchPending = [];
    this._whisperBatchTimer = null;
    this._whisperBatchFlushScheduled = false;
    this._whisperBatchRunning = false;
    this._whisperRunningSegment = null;
    this._whisperSegmentSequence = 0;
    this._whisperFinalizationPromise = null;
    this._rendererAudioStats = {
      sessionId: this.recordingSessionId,
      startedAt: Date.now(),
      lastChunkAt: 0,
      lastLogAt: Date.now(),
      loggedChunks: 0,
      loggedBytes: 0,
      totalChunks: 0,
      totalBytes: 0
    };
    this._resetVadState();
    this._resetTranscriptionProgress();
    this.emit('recording-started', { sessionId: this.recordingSessionId });
    this.emit('status', 'Local Whisper recording started');
    this._ensureWhisperWorker().catch((error) => {
      logger.warn('Persistent Whisper worker unavailable; CLI fallback will be used', {
        error: error.message
      });
    });

    // Capture microphone audio in the renderer via the Web Audio API on Windows
    // and macOS. Windows lacks the Unix sox/rec/arecord tools node-record-lpcm16
    // needs; macOS would otherwise require a Homebrew `sox` install (not bundled)
    // and a child-process mic that the system TCC prompt can't attribute. The
    // renderer path uses getUserMedia, which macOS prompts for cleanly via the
    // app's NSMicrophoneUsageDescription. Linux keeps the native recorder path.
    this.useRendererCapture = process.platform === 'win32' || process.platform === 'darwin';
    if (this.useRendererCapture) {
      this.emit('status', 'Waiting for microphone audio…');
      // The renderer starts sending chunks once it receives the recording-started event.
      this._startSegmentWatchdog();
      if (global.windowManager) {
        global.windowManager.handleRecordingStarted();
      }
      return;
    }

    this._startMicrophoneCapture();
    this._startSegmentWatchdog();

    if (global.windowManager) {
      global.windowManager.handleRecordingStarted();
    }
  }

  /**
   * Reset the voice-activity-detection state machine. VAD replaces the old
   * fixed-interval segmentation: instead of cutting audio every N seconds
   * (which split sentences mid-word and transcribed silent windows), we
   * accumulate audio while the user is speaking and flush a segment once a
   * natural pause is detected. State is intentionally simple so it works for
   * both the renderer (Web Audio) and native (sox/arecord) capture paths.
   */
  _resetVadState() {
    this.vadSpeaking = false;        // currently inside an utterance
    this.vadHasDetectedSpeech = false; // speech has been detected in this session
    this.vadSpeechMs = 0;            // accumulated voiced audio in this segment
    this.vadSilenceMs = 0;           // trailing silence since last voiced chunk
    this.vadNoiseFloor = 0;          // adaptive EMA of background energy
    this.vadNoiseInit = false;       // has the noise floor been seeded
    this.vadPreRoll = [];            // ring of recent pre-speech chunks
    this.vadPreRollMs = 0;           // duration held in the pre-roll ring
    this.vadLastChunkAt = 0;         // timestamp of the last ingested chunk
    this.segmentAudioMs = 0;         // audio duration since the last flush
    this._vadChunkCount = 0;
    this._lastVadLogAt = 0;
  }

  /**
   * Lightweight watchdog. Silence is normally detected from incoming chunks
   * (which keep flowing at low energy), but if the capture pipeline stalls
   * mid-utterance we still want to flush what we have. The watchdog also
   * enforces the max-utterance cap as a backstop.
   */
  _startSegmentWatchdog() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
    }
    this.segmentTimer = setInterval(() => {
      if (!this.isRecording || this.provider !== 'whisper') {
        return;
      }

      // VAD disabled (fallback): preserve the legacy fixed-window behaviour by
      // flushing once the accumulated audio reaches the configured segment size.
      if (!this._isVadEnabled()) {
        if (this.segmentBytes && this.vadSpeechMs >= this._getWhisperSegmentMs()) {
          this._endUtteranceFlush();
        }
        return;
      }

      // If we're mid-utterance and no audio has arrived recently, the mic may
      // have stalled — flush what we captured rather than holding it forever.
      const sinceLastChunk = this.vadLastChunkAt ? Date.now() - this.vadLastChunkAt : 0;
      const stalled = this.vadSpeaking && sinceLastChunk > 1500;
      const tooLong = this.vadSpeaking && this.vadSpeechMs >= this._getMaxUtteranceMs();
      if (stalled || tooLong) {
        this._endUtteranceFlush();
        return;
      }

      // VAD remains active during a long monologue. Flush only the audio
      // accumulated since the previous flush, then keep the same utterance
      // state so capture continues without interruption.
      if (this.segmentBytes && this.segmentAudioMs >= this._getPeriodicFlushMs()) {
        this._periodicWhisperFlush();
      }
    }, 500);
  }

  /**
   * Force a partial Whisper flush while preserving the active VAD utterance.
   * The capture path keeps ingesting new chunks while Whisper processes the
   * snapshot asynchronously.
   */
  _periodicWhisperFlush() {
    if (!this.isRecording || this.provider !== 'whisper' || !this.segmentBytes) {
      return;
    }

    this.vadSpeechMs = 0;
    this.vadSilenceMs = 0;
    this._flushWhisperSegment({ final: false, reason: 'periodic' }).catch((error) => {
      logger.error('Whisper periodic segment transcription failed', { error: error.message });
    });
  }

  /**
   * Receive raw 16kHz mono 16-bit PCM audio from the renderer and add it to
   * the current Whisper segment buffer.
   */
  handleAudioChunkFromRenderer(chunk) {
    if ((!this.isRecording && !this.isFinalizing) || this.provider !== 'whisper' || !this.useRendererCapture) {
      return;
    }
    if (!chunk || !chunk.length) {
      return;
    }
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.recordAudioChunk(buffer.length);
    this._recordRendererAudioChunk(buffer);
    this._ingestWhisperAudio(buffer);
  }

  _recordRendererAudioChunk(buffer) {
    const stats = this._rendererAudioStats;
    if (!stats) {
      return;
    }
    const now = Date.now();
    this._markLatencyEvent('firstAudioAt', now);
    const gapMs = stats.lastChunkAt ? now - stats.lastChunkAt : null;
    const isFirstChunk = stats.totalChunks === 0;
    stats.lastChunkAt = now;
    stats.totalChunks += 1;
    stats.totalBytes += buffer.length;
    if (isFirstChunk) {
      performanceTracker.mark('speech-first-audio', { bytes: buffer.length, sessionId: stats.sessionId });
    }
    if (now - stats.lastLogAt < 1000) {
      return;
    }
    const intervalMs = Math.max(1, now - stats.lastLogAt);
    const intervalChunks = stats.totalChunks - stats.loggedChunks;
    const intervalBytes = stats.totalBytes - stats.loggedBytes;
    logger.debug('Renderer audio chunks received in main process', {
      sessionId: stats.sessionId,
      totalChunks: stats.totalChunks,
      totalBytes: stats.totalBytes,
      intervalChunks,
      intervalBytes,
      chunksPerSecond: Number((intervalChunks * 1000 / intervalMs).toFixed(1)),
      lastChunkGapMs: gapMs
    });
    stats.lastLogAt = now;
    stats.loggedChunks = stats.totalChunks;
    stats.loggedBytes = stats.totalBytes;
  }

  /**
   * Compute the RMS energy (normalized to 0..1) of a 16-bit little-endian PCM
   * buffer. Used as the voice-activity signal.
   */
  _chunkRmsEnergy(buffer) {
    const sampleCount = Math.floor(buffer.length / 2);
    if (sampleCount === 0) {
      return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
      const sample = buffer.readInt16LE(i * 2) / 32768;
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / sampleCount);
  }

  /**
   * Single ingest path for both capture backends. Runs the VAD state machine:
   * accumulate audio while the user speaks, and flush the segment to Whisper
   * once a natural pause (trailing silence) is detected. Falls back to plain
   * buffering when VAD is disabled.
   */
  _ingestWhisperAudio(buffer) {
    if (!buffer || !buffer.length) {
      return;
    }

    const chunkMs = this._chunkDurationMs(buffer);
    if (!this._isVadEnabled()) {
      // Legacy behaviour: the watchdog/max-utterance cap drives flushing.
      this.segmentBuffers.push(buffer);
      this.segmentBytes += buffer.length;
      this.segmentAudioMs += chunkMs;
      this.vadSpeaking = true;
      this.vadSpeechMs += chunkMs;
      this.vadLastChunkAt = Date.now();
      this._logVadState({ chunkMs, phase: 'vad-disabled' });
      return;
    }

    this.vadLastChunkAt = Date.now();
    const energy = this._chunkRmsEnergy(buffer);

    const floor = this._getVadEnergyFloor();
    // Seed / adapt the background noise floor while not actively speaking so
    // the threshold tracks the room rather than a hard-coded constant. Seed
    // conservatively: if the very first chunk is already loud (the user started
    // talking immediately), clamp to the configured floor so a high seed can't
    // push the enter-threshold out of reach and stall VAD for the whole session.
    if (!this.vadNoiseInit) {
      this.vadNoiseFloor = Math.min(energy, floor);
      this.vadNoiseInit = true;
    }
    // Hysteresis: it takes more energy to *start* an utterance than to keep
    // one going, so a brief dip mid-sentence doesn't end it prematurely.
    // After the first utterance, use a softer re-entry threshold. A speaker
    // can naturally get quieter after a pause; treating that quieter voice as
    // background permanently loses the rest of the session.
    const enterThreshold = this.vadHasDetectedSpeech
      ? Math.max(floor * 0.75, this.vadNoiseFloor * 1.1)
      : Math.max(floor, this.vadNoiseFloor * 2.5);
    const exitThreshold = Math.max(floor * 0.7, this.vadNoiseFloor * 1.1);
    const isVoiced = this.vadSpeaking ? energy >= exitThreshold : energy >= enterThreshold;

    if (!this.vadSpeaking) {
      if (isVoiced) {
        // Speech onset: prepend the pre-roll so the first syllable survives.
        this.vadSpeaking = true;
        this.vadHasDetectedSpeech = true;
        this.vadSpeechMs = 0;
        this.vadSilenceMs = 0;
        for (const pre of this.vadPreRoll) {
          this.segmentBuffers.push(pre);
          this.segmentBytes += pre.length;
          this.segmentAudioMs += this._chunkDurationMs(pre);
        }
        this.vadPreRoll = [];
        this.vadPreRollMs = 0;
        this.segmentBuffers.push(buffer);
        this.segmentBytes += buffer.length;
        this.segmentAudioMs += chunkMs;
        this.vadSpeechMs += chunkMs;
        this._logVadState({ energy, chunkMs, phase: 'onset', enterThreshold, exitThreshold, isVoiced });
      } else {
        // Background: adapt the noise floor and keep a short pre-roll ring.
        // Once speech has been detected, do not learn the speaker's quieter
        // follow-up words as the new noise floor. Only adapt from clearly quiet
        // chunks so the VAD can re-enter after a natural pause.
        if (!this.vadHasDetectedSpeech || energy < floor) {
          this.vadNoiseFloor = this.vadNoiseFloor * 0.95 + energy * 0.05;
        }
        this.vadPreRoll.push(buffer);
        this.vadPreRollMs += chunkMs;
        const preRollLimit = this._getPreRollMs();
        while (this.vadPreRollMs > preRollLimit && this.vadPreRoll.length > 1) {
          const dropped = this.vadPreRoll.shift();
          this.vadPreRollMs -= this._chunkDurationMs(dropped);
        }
        this._logVadState({ energy, chunkMs, phase: 'background', enterThreshold, exitThreshold, isVoiced });
      }
      return;
    }

    // Already speaking: keep capturing (including trailing silence so word
    // endings aren't clipped) and watch for a pause that ends the utterance.
    this.segmentBuffers.push(buffer);
    this.segmentBytes += buffer.length;
    this.segmentAudioMs += chunkMs;
    if (isVoiced) {
      this.vadSpeechMs += chunkMs;
      this.vadSilenceMs = 0;
    } else {
      this.vadSilenceMs += chunkMs;
    }
    this._logVadState({ energy, chunkMs, phase: 'speaking', enterThreshold, exitThreshold, isVoiced });

    const pausedLongEnough = this.vadSilenceMs >= this._getSilenceHangoverMs();
    const haveRealSpeech = this.vadSpeechMs >= this._getMinUtteranceMs();
    const tooLong = this.vadSpeechMs >= this._getMaxUtteranceMs();

    if ((pausedLongEnough && haveRealSpeech) || tooLong) {
      this._endUtteranceFlush();
    } else if (pausedLongEnough && !haveRealSpeech) {
      // Just noise (cough/click) with no real speech — discard, don't waste a
      // Whisper spawn or risk a hallucinated transcript.
      this.segmentBuffers = [];
      this.segmentBytes = 0;
      this.segmentAudioMs = 0;
      this.vadSpeaking = false;
      this.vadSpeechMs = 0;
      this.vadSilenceMs = 0;
      this._logVadState({ energy, chunkMs, phase: 'discarded-noise', enterThreshold, exitThreshold, isVoiced });
    }
  }

  /** Flush the accumulated utterance and reset VAD for the next one. */
  _endUtteranceFlush() {
    const reason = this._isVadEnabled() ? 'vad' : 'segment';
    this.vadSpeaking = false;
    this.vadSpeechMs = 0;
    this.vadSilenceMs = 0;
    this.vadPreRoll = [];
    this.vadPreRollMs = 0;
    this._flushWhisperSegment({ final: false, reason }).catch((error) => {
      logger.error('Whisper segment transcription failed', { error: error.message });
    });
  }

  _chunkDurationMs(buffer) {
    // 16kHz mono 16-bit => 2 bytes/sample => 32 bytes/ms.
    return buffer.length / 32;
  }

  _logVadState({ energy = null, chunkMs = 0, phase = 'unknown', enterThreshold = null, exitThreshold = null, isVoiced = null } = {}) {
    this._vadChunkCount += 1;
    const now = Date.now();
    if (now - this._lastVadLogAt < 1000 && this._vadChunkCount % 20 !== 0) {
      return;
    }
    logger.debug('Whisper VAD state', {
      phase,
      chunkNumber: this._vadChunkCount,
      energy: energy === null ? null : Number(energy.toFixed(4)),
      chunkMs: Math.round(chunkMs),
      vadSpeaking: this.vadSpeaking,
      vadHasDetectedSpeech: this.vadHasDetectedSpeech,
      isVoiced,
      enterThreshold: enterThreshold === null ? null : Number(enterThreshold.toFixed(4)),
      exitThreshold: exitThreshold === null ? null : Number(exitThreshold.toFixed(4)),
      vadSpeechMs: Math.round(this.vadSpeechMs),
      vadSilenceMs: Math.round(this.vadSilenceMs),
      segmentAudioMs: Math.round(this.segmentAudioMs),
      segmentBytes: this.segmentBytes,
      preRollMs: Math.round(this.vadPreRollMs),
      noiseFloor: Number(this.vadNoiseFloor.toFixed(4))
    });
    this._lastVadLogAt = now;
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    this._markLatencyEvent('captureStoppedAt');
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    logger.info('Stopping speech recognition session', {
      provider: this.provider,
      sessionDuration: `${sessionDuration}ms`
    });

    if (this.provider === 'azure' && this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync(
          () => {
            this._finalizeStop('Recording stopped');
          },
          (error) => {
            logger.error('Error during recognition stop', { error: error.toString() });
            this._finalizeStop('Recording stopped');
          }
        );
      } catch (error) {
        logger.error('Error stopping recognizer', { error: error.message });
        this._finalizeStop('Recording stopped');
      }
      return;
    }

    if (this.provider === 'whisper') {
      this.isFinalizing = true;
      this._beginRendererCaptureDrain();
      this.emit('recording-capture-stopped', { sessionId: this.recordingSessionId });
      this.emit('status', 'Transcribing captured audio…');
      this._emitTranscriptionProgress({ state: 'transcribing', finalizing: true });
      this._finalizeWhisperStop();
      return;
    }

    this._finalizeStop('Recording stopped');
  }

  async _finalizeWhisperStop() {
    if (this._whisperFinalizationPromise) {
      return this._whisperFinalizationPromise;
    }

    const sessionId = this.recordingSessionId;
    let finalizationHadFailures = false;
    const finalization = (async () => {
      if (this.segmentTimer) {
        clearInterval(this.segmentTimer);
        this.segmentTimer = null;
      }

      if (this.recording) {
        try {
          this.recording.stop();
        } catch (error) {
          logger.error('Error stopping audio recording', { error: error.message });
        }
        this.recording = null;
      }

      // Freeze queued-but-not-started segments before waiting for the renderer.
      const pendingSegments = this._takePendingWhisperSegments(sessionId);
      await this._waitForRendererCaptureDrain();
      const finalSegment = this._takeCurrentWhisperSegment(sessionId);
      if (finalSegment) {
        this._queueTranscriptionSegment(sessionId);
      }

      const tailSegments = pendingSegments
        .concat(finalSegment ? [finalSegment] : [])
        .sort((left, right) => left.sequence - right.sequence);

      await this._waitForWhisperFlushes(sessionId);
      if (!tailSegments.length) {
        return;
      }

      const batches = this._createWhisperTailBatches(tailSegments);
      let failed = false;
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        this._emitTranscriptionProgress({
          state: 'transcribing',
          phase: 'draining',
          finalizing: true,
          tailBatchIndex: index + 1,
          tailBatchTotal: batches.length,
          currentLabel: 'Transcribing remaining audio ' + (index + 1) + '/' + batches.length
        });

        try {
          await this._enqueueWhisperSegment(batch.audioBuffer, {
            sessionId,
            sequence: batch.segments[0].sequence,
            reason: 'final-batch',
            final: true,
            sourceSegments: batch.segments,
            deferFailureOutcome: batch.segments.length > 1,
            tailBatchIndex: index + 1,
            tailBatchTotal: batches.length
          });
        } catch (error) {
          if (batch.segments.length <= 1) {
            failed = true;
            logger.error('Final Whisper segment failed', { error: error.message });
            continue;
          }

          logger.warn('Merged Whisper tail failed; retrying smaller segments', {
            segmentCount: batch.segments.length,
            error: error.message
          });
          for (const segment of batch.segments) {
            try {
              await this._enqueueWhisperSegment(segment.audioBuffer, {
                sessionId,
                sequence: segment.sequence,
                reason: 'final-retry',
                final: true,
                sourceSegments: [segment]
              });
            } catch (retryError) {
              failed = true;
              logger.error('Final Whisper retry failed', { error: retryError.message });
            }
          }
        }
      }

      await this._waitForWhisperFlushes(sessionId);
      if (failed) {
        finalizationHadFailures = true;
        this.emit('error', 'Some audio could not be transcribed.');
      }
    })();

    this._whisperFinalizationPromise = finalization;
    let finalizationSucceeded = false;
    try {
      await finalization;
      finalizationSucceeded = true;
    } catch (error) {
      logger.error('Final Whisper transcription failed', { error: error.message });
      if (sessionId === this.recordingSessionId) {
        this.emit('error', 'Whisper transcription failed: ' + error.message);
      }
    } finally {
      if (sessionId === this.recordingSessionId && !this.isRecording) {
        this.isFinalizing = false;
        if (finalizationSucceeded && !finalizationHadFailures) {
          this._markLatencyEvent('finalTranscriptionAt');
        }
        this._emitTranscriptionProgress({
          state: 'complete',
          phase: 'complete',
          finalizing: false,
          tailBatchIndex: 0,
          tailBatchTotal: 0,
          currentLabel: ''
        });
        this._finalizeStop('Recording stopped');
      }
      this._whisperFinalizationPromise = null;
    }

    return finalization;
  }

  _initializeOpenAiWhisperClient(fallbackReason = null) {
    this.whisperCommand = this._resolveWhisperCommand();
    this.fasterWhisperLaunch = null;
    this.whisperCppLaunch = null;
    if (!this.whisperCommand) {
      this.available = false;
      this.effectiveWhisperEngine = null;
      const reason = 'Local Whisper unavailable. Install the Whisper CLI or set WHISPER_COMMAND.';
      logger.warn(reason);
      this.emit('status', reason);
      return false;
    }

    this.available = true;
    this.effectiveWhisperEngine = 'openai';
    if (fallbackReason) {
      logger.warn(fallbackReason, {
        command: [this.whisperCommand.command, ...this.whisperCommand.baseArgs].join(' '),
        model: this._getWhisperModel(),
        language: this._getWhisperLanguage()
      });
      this.emit('status', fallbackReason);
    } else {
      logger.info('Local Whisper service initialized successfully', {
        command: [this.whisperCommand.command, ...this.whisperCommand.baseArgs].join(' '),
        model: this._getWhisperModel(),
        language: this._getWhisperLanguage()
      });
      this.emit('status', 'Local Whisper ready');
    }
    return true;
  }

  _initializeWhisperCppClient() {
    const launch = this._resolveWhisperCppLaunch();
    if (!launch || !launch.model || !fs.existsSync(launch.model)) {
      if (launch && launch.model) {
        logger.warn('whisper.cpp model is not available yet', { model: launch.model });
      }
      this.whisperCppLaunch = null;
      this.available = false;
      this.effectiveWhisperEngine = null;
      logger.warn('whisper.cpp engine unavailable; falling back to OpenAI Whisper backend');
      return false;
    }
    this.whisperCppLaunch = launch;
    this.fasterWhisperLaunch = null;
    this.available = true;
    this.effectiveWhisperEngine = 'whisper-cpp';
    logger.info('whisper.cpp engine configured', {
      command: [launch.command, ...launch.args].join(' '),
      model: launch.model,
      language: this._getWhisperLanguage(),
      threads: this._getWhisperCppThreads(),
      blas: this._getWhisperCppBlas(),
    });
    this.emit('status', 'whisper.cpp ready');
    return true;
  }
  _initializeFasterWhisperClient() {
    const launch = this._resolveFasterWhisperLaunch();
    if (!launch) {
      logger.warn('Faster Whisper engine unavailable; falling back to OpenAI Whisper backend');
      return false;
    }
    this.fasterWhisperLaunch = launch;
    this.whisperCppLaunch = null;
    this.available = true;
    this.effectiveWhisperEngine = 'faster';
    logger.info('Faster Whisper engine configured', {
      command: [launch.command, ...launch.args].join(' '),
      model: this._getWhisperModel(),
      language: this._getWhisperLanguage(),
      device: this._getWhisperFasterDevice(),
      computeType: this._getWhisperFasterComputeType()
    });
    this.emit('status', 'Faster Whisper ready');
    return true;
  }

  _takePendingWhisperSegments(sessionId) {
    const pending = [];
    const active = [...this._activeWhisperFlushes]
      .filter((tracked) => tracked.sessionId === sessionId && !tracked.cancelled)
      .sort((left, right) => left.sequence - right.sequence);
    // If stop arrives in the same tick that the queue is starting, the oldest
    // active item is the current segment even before its runner sets started.
    const running = this._whisperRunningSegment || (this._whisperBatchPending.length ? null : active[0]);
    for (const tracked of active) {
      if (tracked === running || tracked.started || tracked.batchQueued) {
        continue;
      }
      this._settleCancelledWhisperTracked(tracked);
      this._activeWhisperFlushes.delete(tracked);
      pending.push({
        audioBuffer: tracked.audioBuffer,
        sequence: tracked.sequence,
        durationMs: tracked.durationMs,
        reason: tracked.reason
      });
    }
    this._whisperBatchPending = this._whisperBatchPending.filter((tracked) => !tracked.cancelled);
    this._whisperPendingSegments = pending;
    this.activeTranscriptionCount = this._activeWhisperFlushes.size;
    this.transcriptionInFlight = this.activeTranscriptionCount > 0;
    return pending;
  }

  _takeCurrentWhisperSegment(sessionId) {
    if (sessionId !== this.recordingSessionId || !this.segmentBytes) {
      this.segmentBuffers = [];
      this.segmentBytes = 0;
      this.segmentAudioMs = 0;
      return null;
    }

    const audioBuffer = Buffer.concat(this.segmentBuffers, this.segmentBytes);
    const segment = {
      audioBuffer,
      sequence: ++this._whisperSegmentSequence,
      durationMs: Math.round(audioBuffer.length / 32),
      reason: 'final'
    };
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.segmentAudioMs = 0;
    return segment;
  }

  _getWhisperFinalBatchMs() {
    const configured = this._getSetting('whisperFinalBatchMs') || process.env.WHISPER_FINAL_BATCH_MS || 30000;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(5000, Math.min(30000, parsed)) : 30000;
  }

  _getWhisperBatchSize() {
    const configured = this._getSetting('whisperBatchSize') || process.env.WHISPER_BATCH_SIZE || config.get('speech.whisper.batchSize') || 4;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(8, Math.floor(parsed))) : 4;
  }

  _getWhisperBatchTimeoutMs() {
    const configured = this._getSetting('whisperBatchTimeoutMs') || process.env.WHISPER_BATCH_TIMEOUT_MS || config.get('speech.whisper.batchTimeoutMs') || 2000;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(100, Math.min(10000, Math.floor(parsed))) : 2000;
  }

  _getWhisperMaxConcurrent() {
    const configured = this._getSetting('whisperMaxConcurrent') || process.env.WHISPER_MAX_CONCURRENT || config.get('speech.whisper.maxConcurrent') || 4;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(8, Math.floor(parsed))) : 4;
  }

  _getWhisperBeamSize() {
    const configured = this._getSetting('whisperBeamSize') || process.env.WHISPER_BEAM_SIZE || config.get('speech.whisper.beamSize') || 5;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(20, Math.floor(parsed))) : 5;
  }

  _getWhisperCppBeamSize() {
    const configured = this._getSetting('whisperCppBeamSize') ||
      process.env.WHISPER_CPP_BEAM_SIZE ||
      config.get('speech.whisper.cppBeamSize') || 1;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(20, Math.floor(parsed))) : 1;
  }

  _getWhisperCppBestOf() {
    const configured = this._getSetting('whisperCppBestOf') ||
      process.env.WHISPER_CPP_BEST_OF ||
      config.get('speech.whisper.cppBestOf') || 1;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(20, Math.floor(parsed))) : 1;
  }

  _getWhisperCppNoFallback() {
    const configured = this._getSetting('whisperCppNoFallback');
    if (configured !== null && configured !== undefined) {
      return !['false', 'off', '0', 'no'].includes(String(configured).trim().toLowerCase());
    }
    const envValue = process.env.WHISPER_CPP_NO_FALLBACK;
    if (envValue !== undefined) {
      return !['false', 'off', '0', 'no'].includes(String(envValue).trim().toLowerCase());
    }
    const configuredDefault = config.get('speech.whisper.cppNoFallback');
    return configuredDefault === undefined ? true : configuredDefault === true;
  }

  _getWhisperCppFlashAttention() {
    const configured = this._getSetting('whisperCppFlashAttention');
    if (configured !== null && configured !== undefined) {
      return !['false', 'off', '0', 'no'].includes(String(configured).trim().toLowerCase());
    }
    const envValue = process.env.WHISPER_CPP_FLASH_ATTENTION;
    if (envValue !== undefined) {
      return !['false', 'off', '0', 'no'].includes(String(envValue).trim().toLowerCase());
    }
    const configuredDefault = config.get('speech.whisper.cppFlashAttention');
    return configuredDefault === undefined ? true : configuredDefault === true;
  }

  _getAudioChunkSamples() {
    const configured = this._getSetting('whisperCaptureChunkSamples') ||
      process.env.WHISPER_CAPTURE_CHUNK_SAMPLES ||
      config.get('speech.whisper.captureChunkSamples') || 2048;
    const parsed = Number(configured);
    if (!Number.isFinite(parsed)) return 2048;
    const clamped = Math.max(512, Math.min(8192, Math.floor(parsed)));
    return 2 ** Math.floor(Math.log2(clamped));
  }

  _createWhisperTailBatches(segments) {
    const maxBytes = this._getWhisperFinalBatchMs() * 32;
    const batches = [];
    let current = [];
    let currentBytes = 0;

    for (const segment of segments) {
      const segmentBytes = segment.audioBuffer.length;
      if (current.length && currentBytes + segmentBytes > maxBytes) {
        batches.push({
          segments: current,
          audioBuffer: Buffer.concat(current.map((item) => item.audioBuffer), currentBytes)
        });
        current = [];
        currentBytes = 0;
      }
      current.push(segment);
      currentBytes += segmentBytes;
    }

    if (current.length) {
      batches.push({
        segments: current,
        audioBuffer: Buffer.concat(current.map((item) => item.audioBuffer), currentBytes)
      });
    }
    return batches;
  }

  _beginRendererCaptureDrain() {
    this._resolveRendererCaptureDrain();
    if (!this.useRendererCapture) {
      return;
    }

    this._rendererCaptureDrainPromise = new Promise((resolve) => {
      this._rendererCaptureDrainResolve = resolve;
      this._rendererCaptureDrainTimer = setTimeout(() => {
        this._resolveRendererCaptureDrain();
      }, 350);
    });
  }

  confirmRendererCaptureStopped() {
    this._resolveRendererCaptureDrain();
  }

  _resolveRendererCaptureDrain() {
    if (this._rendererCaptureDrainTimer) {
      clearTimeout(this._rendererCaptureDrainTimer);
      this._rendererCaptureDrainTimer = null;
    }
    if (this._rendererCaptureDrainResolve) {
      const resolve = this._rendererCaptureDrainResolve;
      this._rendererCaptureDrainResolve = null;
      this._rendererCaptureDrainPromise = null;
      resolve();
    } else {
      this._rendererCaptureDrainPromise = null;
    }
  }

  async _waitForRendererCaptureDrain() {
    if (this._rendererCaptureDrainPromise) {
      await this._rendererCaptureDrainPromise;
    }
  }

  _finalizeStop(statusMessage) {
    const sessionId = this.recordingSessionId;
    const latencySession = this._latencySession;
    const latency = this._getLatencyMetrics();
    this._cleanup();
    // The main-process stop listener records dispatchAt synchronously before
    // its first await. Keep only this completed session alive for that event,
    // then discard it so a later recording cannot inherit stale metrics.
    if (latencySession && this._latencySession === null) {
      this._latencySession = latencySession;
    }
    const stopPayload = { sessionId, latency };
    this.emit('recording-stopped', stopPayload);
    if (latencySession && this._latencySession === latencySession) {
      stopPayload.latency = this._getLatencyMetrics();
      this._latencySession = null;
    }
    this.emit('status', statusMessage);
    if (global.windowManager) {
      global.windowManager.handleRecordingStopped();
    }
  }

  _cleanup() {
    // Invalidate results from any Whisper process that is still running.
    // A later recording must never receive text from an older session.
    this.recordingSessionId += 1;

    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

    if (this.audioConfig) {
      try {
        if (typeof this.audioConfig.close === 'function') {
          this.audioConfig.close();
        }
      } catch (error) {
        logger.error('Error closing audio config', { error: error.message });
      }
      this.audioConfig = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    if (this.pushStream) {
      try {
        if (typeof this.pushStream.close === 'function') {
          this.pushStream.close();
        }
      } catch (error) {
        logger.error('Error closing push stream', { error: error.message });
      }
      this.pushStream = null;
    }

    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this._clearWhisperBatchTimer();
    for (const tracked of this._whisperBatchPending) {
      this._settleCancelledWhisperTracked(tracked);
    }
    this._whisperBatchPending = [];
    this._whisperBatchRunning = false;
    this._whisperPendingSegments = [];
    this._whisperRunningSegment = null;
    this._whisperFinalizationPromise = null;
    this.isFinalizing = false;
    this._latencySession = null;
    this._resolveRendererCaptureDrain();
    this._resetVadState();
    this.transcriptionInFlight = this.activeTranscriptionCount > 0;
    this._audioDataLogged = false;
    this._rendererAudioStats = null;
    this.useRendererCapture = false;
  }

  _resetTranscriptionProgress() {
    this._transcriptionProgress = {
      sessionId: this.recordingSessionId,
      totalSegments: 0,
      completedSegments: 0,
      failedSegments: 0,
      state: 'recording',
      phase: 'recording',
      tailBatchIndex: 0,
      tailBatchTotal: 0,
      currentLabel: '',
      finalizing: false
    };
    this._emitTranscriptionProgress();
  }

  _startLatencySession(sessionId, startedAt = Date.now()) {
    this._latencySession = {
      sessionId,
      startedAt,
      firstAudioAt: null,
      firstPartialAt: null,
      captureStoppedAt: null,
      finalTranscriptionAt: null,
      dispatchAt: null,
      audioChunks: 0,
      audioBytes: 0,
      droppedChunks: 0
    };
  }

  _markLatencyEvent(eventName, at = Date.now()) {
    if (!this._latencySession || !Object.prototype.hasOwnProperty.call(this._latencySession, eventName)) {
      return;
    }
    if (this._latencySession[eventName] === null) {
      this._latencySession[eventName] = at;
    }
  }

  markLatencyEvent(eventName, at = Date.now()) {
    this._markLatencyEvent(eventName, at);
    return this._getLatencyMetrics();
  }

  recordAudioChunk(bytes, dropped = false) {
    if (!this._latencySession) return;
    if (dropped) {
      this._latencySession.droppedChunks += 1;
      return;
    }
    this._latencySession.audioChunks += 1;
    this._latencySession.audioBytes += Math.max(0, Number(bytes) || 0);
  }

  _latencyDelta(eventName, baseName = 'startedAt') {
    const session = this._latencySession;
    if (!session || session[eventName] === null || session[baseName] === null) {
      return null;
    }
    return Math.max(0, session[eventName] - session[baseName]);
  }

  _getLatencyMetrics() {
    const session = this._latencySession;
    if (!session) {
      return null;
    }
    return {
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      firstAudioMs: this._latencyDelta('firstAudioAt'),
      firstPartialMs: this._latencyDelta('firstPartialAt'),
      captureToFinalMs: this._latencyDelta('finalTranscriptionAt', 'captureStoppedAt'),
      finalTranscriptionMs: this._latencyDelta('finalTranscriptionAt'),
      dispatchMs: this._latencyDelta('dispatchAt'),
      audioChunks: session.audioChunks,
      audioBytes: session.audioBytes,
      droppedChunks: session.droppedChunks
    };
  }

  getLatencyMetrics() {
    return this._getLatencyMetrics();
  }

  _emitTranscriptionProgress(overrides = {}) {
    const progress = this._transcriptionProgress;
    if (!progress || progress.sessionId !== this.recordingSessionId) {
      return;
    }
    Object.assign(progress, overrides);
    const totalSegments = progress.totalSegments;
    const completedSegments = progress.completedSegments;
    this.emit('transcription-progress', {
      state: progress.state,
      totalSegments,
      completedSegments,
      failedSegments: progress.failedSegments,
      pendingSegments: Math.max(0, totalSegments - completedSegments),
      currentSegment: totalSegments > completedSegments ? completedSegments + 1 : totalSegments,
      phase: progress.phase || 'recording',
      tailBatchIndex: progress.tailBatchIndex || 0,
      tailBatchTotal: progress.tailBatchTotal || 0,
      currentLabel: progress.currentLabel || '',
      sessionId: progress.sessionId,
      finalizing: !!progress.finalizing,
      latency: this._getLatencyMetrics()
    });
  }

  _recordTranscriptionSegmentOutcome(sessionId, succeeded, segmentCount = 1) {
    const progress = this._transcriptionProgress;
    if (!progress || progress.sessionId !== sessionId) {
      return;
    }
    progress.completedSegments += Math.max(1, segmentCount);
    if (!succeeded) {
      progress.failedSegments += Math.max(1, segmentCount);
    }
    progress.state = 'transcribing';
    progress.phase = this.isFinalizing ? 'draining' : 'recording';
    this._emitTranscriptionProgress();
  }

  _queueTranscriptionSegment(sessionId) {
    const progress = this._transcriptionProgress;
    if (!progress || progress.sessionId !== sessionId) {
      return;
    }
    progress.totalSegments += 1;
    progress.state = 'transcribing';
    progress.phase = this.isFinalizing ? 'draining' : 'recording';
    this._emitTranscriptionProgress();
  }

  async recognizeFromFile(audioFilePath) {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            resolve(result.reason === sdk.ResultReason.RecognizedSpeech ? result.text : '');
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });
    }

    if (this.provider === 'whisper') {
      return this._transcribeWhisperFile(audioFilePath);
    }

    throw new Error('Speech service not initialized');
  }

  async testConnection() {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      try {
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
        recognizer.close();
        audioConfig.close();
        return { success: true, message: 'Azure connection test successful' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    if (this.provider === 'whisper') {
      if (this._getEffectiveWhisperEngine() === 'whisper-cpp') {
        try {
          await this._ensureWhisperWorker();
          return { success: true, message: 'whisper.cpp worker ready' };
        } catch (error) {
          logger.warn('whisper.cpp unavailable; trying Faster Whisper fallback', { error: error.message });
          if (!this._initializeFasterWhisperClient()) {
            this._initializeOpenAiWhisperClient('whisper.cpp unavailable; OpenAI backend remains available');
          }
        }
      }
      if (this._getEffectiveWhisperEngine() === 'faster') {
        try {
          await this._ensureWhisperWorker();
          return { success: true, message: 'Faster Whisper worker ready' };
        } catch (error) {
          logger.warn('Faster Whisper unavailable; OpenAI backend remains available', { error: error.message });
          this._initializeOpenAiWhisperClient('Faster Whisper unavailable; OpenAI backend remains available');
        }
      }
      if (!this.whisperCommand) {
        return { success: false, message: 'Local Whisper CLI not found' };
      }
      // Actually probe the executable to confirm it works
      const probe = spawnSync(
        this.whisperCommand.command,
        [...this.whisperCommand.baseArgs, '--help'],
        { encoding: 'utf8', timeout: 10000, env: this._buildChildEnv() }
      );
      if (probe.error || probe.status !== 0) {
        const err = probe.error ? probe.error.message : `exit code ${probe.status}`;
        return {
          success: false,
          message: `Local Whisper CLI detected but probe failed: ${err}`
        };
      }
      return {
        success: true,
        message: `Local Whisper CLI works: ${this.whisperCommand.command}`
      };
    }

    return { success: false, message: 'Speech service not initialized' };
  }

  getStatus() {
    return {
      provider: this.provider,
      isRecording: this.isRecording,
      isInitialized: this.provider === 'azure' ? !!this.speechConfig : !!this.available,
      isFinalizing: this.isFinalizing,
      pendingTranscriptions: this.activeTranscriptionCount,
      transcriptionProgress: this._transcriptionProgress ? { ...this._transcriptionProgress } : null,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      effectiveSettings: {
        speechProvider: this.provider,
        whisperEngine: this._getWhisperEngine(),
        whisperEffectiveEngine: this._getEffectiveWhisperEngine(),
        azureKey: (this._getSetting('azureKey') ? '[REDACTED]' : ''),
        azureRegion: this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION || '',
        whisperCommand: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        whisperFasterDevice: this._getWhisperFasterDevice(),
        whisperFasterComputeType: this._getWhisperFasterComputeType(),
        whisperCppCommand: this._getWhisperCppCommand(),
        whisperCppServerCommand: this.whisperCppLaunch?.serverBinary || this._getSetting('whisperCppServerCommand') || process.env.WHISPER_CPP_SERVER_COMMAND || '',
        whisperCppPython: this._getWhisperCppPython(),
        whisperCppThreads: this._getWhisperCppThreads(),
        whisperCppBlas: this._getWhisperCppBlas(),
        whisperCppBackend: this._getWhisperCppBackend(),
        whisperCppModelDir: this._getWhisperModelDir('whisper-cpp'),
        whisperModelDir: this._getWhisperModelDir(),
        whisperModel: this._getWhisperModel(),
        whisperLanguage: this._getWhisperLanguage(),
        whisperSegmentMs: String(this._getWhisperSegmentMs()),
        whisperPeriodicFlushMs: String(this._getPeriodicFlushMs()),
        whisperSilenceHangoverMs: String(this._getSilenceHangoverMs()),
        whisperCaptureChunkSamples: this._getAudioChunkSamples(),
        whisperBatchSize: this._getWhisperBatchSize(),
        whisperBatchTimeoutMs: this._getWhisperBatchTimeoutMs(),
        whisperMaxConcurrent: this._getWhisperMaxConcurrent(),
        whisperBeamSize: this._getWhisperBeamSize(),
        whisperCppBeamSize: this._getWhisperCppBeamSize(),
        whisperCppBestOf: this._getWhisperCppBestOf(),
        whisperCppNoFallback: this._getWhisperCppNoFallback(),
        whisperCppFlashAttention: this._getWhisperCppFlashAttention()
      },
      config: {
        azure: config.get('speech.azure') || {},
        whisper: config.get('speech.whisper') || {},
        selectedProvider: this.provider
      }
    };
  }

  _getHardwareScriptPath(filename) {
    const candidates = [];
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', filename));
    }
    candidates.push(path.resolve(__dirname, '..', '..', 'scripts', filename));
    candidates.push(path.join(process.cwd(), 'scripts', filename));
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  _runHardwareScriptJson(filename) {
    const scriptPath = this._getHardwareScriptPath(filename);
    if (!scriptPath) return null;
    const candidates = [];
    const configured = filename === 'detect-cpu.py'
      ? (this._getWhisperCppPython() || this._getSetting('whisperPython') || process.env.WHISPER_PYTHON || '')
      : (this._getWhisperCppPython() || process.env.PYTHON || '');
    if (configured) candidates.push({ command: configured, args: [] });
    candidates.push({ command: process.platform === 'win32' ? 'python' : 'python3', args: [] });
    candidates.push({ command: 'python', args: [] });
    if (process.platform === 'win32') candidates.push({ command: 'py', args: ['-3'] });

    for (const candidate of candidates) {
      if (!this._validateWhisperCommand(candidate.command)) continue;
      try {
        const result = spawnSync(candidate.command, [...candidate.args, scriptPath], {
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
          env: this._buildChildEnv()
        });
        if (!result.error && result.status === 0) {
          return JSON.parse(String(result.stdout || '').trim());
        }
      } catch (_) {
        // Try the next interpreter.
      }
    }
    return null;
  }

  _runHardwareScriptJsonAsync(filename) {
    const scriptPath = this._getHardwareScriptPath(filename);
    if (!scriptPath) return Promise.resolve(null);

    const candidates = [];
    const configured = filename === 'detect-cpu.py'
      ? (this._getWhisperCppPython() || this._getSetting('whisperPython') || process.env.WHISPER_PYTHON || '')
      : (this._getWhisperCppPython() || process.env.PYTHON || '');
    if (configured) candidates.push({ command: configured, args: [] });
    candidates.push({ command: process.platform === 'win32' ? 'python' : 'python3', args: [] });
    candidates.push({ command: 'python', args: [] });
    if (process.platform === 'win32') candidates.push({ command: 'py', args: ['-3'] });

    return (async () => {
      const tried = new Set();
      for (const candidate of candidates) {
        const key = `${candidate.command}\u0000${candidate.args.join('\u0000')}`;
        if (tried.has(key) || !(await this._validateWhisperCommandAsync(candidate.command))) continue;
        tried.add(key);
        try {
          const { stdout } = await this._execFileAsync(candidate.command, [...candidate.args, scriptPath], {
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            env: this._buildChildEnv()
          });
          return JSON.parse(String(stdout || '').trim());
        } catch (_) {
          // Try the next interpreter when execution or JSON parsing fails.
        }
      }
      return null;
    })();
  }

  _execFileAsync(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      execFile(command, args, options, (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }
  _writeSilentProbeWav(filePath) {
    const sampleRate = 16000;
    const sampleCount = Math.floor(sampleRate * 0.35);
    const dataSize = sampleCount * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    fs.writeFileSync(filePath, buffer);
  }

  _selectWhisperCppVulkanDevice() {
    const result = spawnSync('vulkaninfo', ['--summary'], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
      env: this._buildChildEnv()
    });
    if (result.error || result.status !== 0) return null;
    return this._parseWhisperCppVulkanDevice(`${result.stdout || ''}\n${result.stderr || ''}`);
  }

  _parseWhisperCppVulkanDevice(output) {
    const blocks = output.split(/(?=^GPU\d+:)/m);
    const devices = [];
    for (const block of blocks) {
      const indexMatch = block.match(/^GPU(\d+):/m);
      if (!indexMatch) continue;
      const nameMatch = block.match(/^\s*deviceName\s*=\s*(.+)$/im);
      const typeMatch = block.match(/^\s*deviceType\s*=\s*(.+)$/im);
      devices.push({
        index: indexMatch[1],
        name: nameMatch ? nameMatch[1].trim() : '',
        type: typeMatch ? typeMatch[1].trim().toLowerCase() : ''
      });
    }

    const selected = devices.find((device) => device.type.includes('discrete_gpu'))
      || devices.find((device) => /\b(?:rx|geforce|arc)\b/i.test(device.name))
      || devices[0];
    return selected ? selected.index : null;
  }

  async _selectWhisperCppVulkanDeviceAsync() {
    try {
      const result = await this._execFileAsync('vulkaninfo', ['--summary'], {
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: this._buildChildEnv()
      });
      return this._parseWhisperCppVulkanDevice(`${result.stdout || ''}\n${result.stderr || ''}`);
    } catch (_) {
      return null;
    }
  }

  async _probeWhisperCppRuntimeAsync(launch) {
    if (!launch || !launch.binary || !launch.model || !fs.existsSync(launch.binary) || !this._isWhisperExecutablePathAllowed(launch.binary)) {
      return { success: false, usedGpu: false, backend: 'unavailable', gpuName: '', message: 'whisper-cli ou modelo não encontrado' };
    }
    if (!fs.existsSync(launch.model)) {
      return { success: false, usedGpu: false, backend: 'unavailable', gpuName: '', message: 'modelo whisper.cpp não encontrado' };
    }

    let tempDir;
    try {
      tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'opencluely-gpu-probe-'));
      const audioPath = path.join(tempDir, 'probe.wav');
      const outputPrefix = path.join(tempDir, 'result');
      this._writeSilentProbeWav(audioPath);
      const args = [
        '-m', launch.model,
        '-f', audioPath,
        '-l', this._getWhisperLanguage(),
        '-t', '1',
        '-nt',
        '-np',
        '-otxt',
        '-of', outputPrefix
      ];
      const selectedDevice = launch.backend === 'cpu'
        ? null
        : (launch.device && launch.device !== 'auto'
          ? launch.device
          : await this._selectWhisperCppVulkanDeviceAsync());
      if (launch.backend === 'cpu') args.push('-ng');
      else if (selectedDevice !== null) args.push('-dev', selectedDevice);

      try {
        const result = await this._execFileAsync(launch.binary, args, {
          encoding: 'utf8',
          timeout: 90000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          env: this._buildChildEnv()
        });
        const diagnostics = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
        const selectedVulkanMatch = selectedDevice !== null
          ? diagnostics.match(new RegExp(`(?:^|\\n)\\s*(?:ggml_vulkan:\\s*)?${selectedDevice}\\s*=\\s*((?:AMD|NVIDIA|Intel)[^\\r\\n]+)$`, 'im'))
          : null;
        const vulkanMatch = selectedVulkanMatch
          || diagnostics.match(/(?:ggml_vulkan|vulkan device)[\s\S]*?(?:\d+\s*=\s*)?((?:AMD|NVIDIA|Intel)[^\r\n]+)/i);
        const usedGpu = /ggml_vulkan|vulkan device/i.test(diagnostics);
        const backend = usedGpu ? 'vulkan' : 'cpu';
        return {
          success: true,
          usedGpu,
          backend,
          device: selectedDevice,
          gpuName: vulkanMatch ? vulkanMatch[1].trim() : '',
          message: usedGpu ? 'whisper.cpp inicializou o backend Vulkan' : 'whisper.cpp respondeu sem inicializar Vulkan',
          output: diagnostics.slice(-3000)
        };
      } catch (error) {
        const diagnostics = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
        return {
          success: false,
          usedGpu: false,
          backend: 'error',
          device: selectedDevice,
          gpuName: '',
          message: error.killed ? 'Teste do whisper.cpp excedeu o tempo limite' : (error.message || 'whisper.cpp encerrou com erro'),
          output: diagnostics.slice(-3000)
        };
      }
    } catch (error) {
      return { success: false, usedGpu: false, backend: 'error', gpuName: '', message: error.message };
    } finally {
      if (tempDir) {
        try { await fsPromises.rm(tempDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
      }
    }
  }
  _probeWhisperCppRuntime(launch) {
    if (!launch || !launch.binary || !launch.model || !fs.existsSync(launch.binary)) {
      return { success: false, usedGpu: false, backend: 'unavailable', gpuName: '', message: 'whisper-cli ou modelo não encontrado' };
    }
    if (!fs.existsSync(launch.model)) {
      return { success: false, usedGpu: false, backend: 'unavailable', gpuName: '', message: 'modelo whisper.cpp não encontrado' };
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-gpu-probe-'));
    const audioPath = path.join(tempDir, 'probe.wav');
    const outputPrefix = path.join(tempDir, 'result');
    try {
      this._writeSilentProbeWav(audioPath);
      const args = [
        '-m', launch.model,
        '-f', audioPath,
        '-l', this._getWhisperLanguage(),
        '-t', '1',
        '-nt',
        '-np',
        '-otxt',
        '-of', outputPrefix
      ];
      const selectedDevice = launch.backend === 'cpu' ? null : this._selectWhisperCppVulkanDevice();
      if (launch.backend === 'cpu') args.push('-ng');
      else if (selectedDevice !== null) args.push('-dev', selectedDevice);
      const result = spawnSync(launch.binary, args, {
        encoding: 'utf8',
        timeout: 90000,
        windowsHide: true,
        env: this._buildChildEnv()
      });
      const diagnostics = ((result.stdout || '') + '\n' + (result.stderr || '')).trim();
      const selectedVulkanMatch = selectedDevice !== null
        ? diagnostics.match(new RegExp(`(?:^|\\n)\\s*(?:ggml_vulkan:\\s*)?${selectedDevice}\\s*=\\s*((?:AMD|NVIDIA|Intel)[^\\r\\n]+)$`, 'im'))
        : null;
      const vulkanMatch = selectedVulkanMatch
        || diagnostics.match(/(?:ggml_vulkan|vulkan device)[\s\S]*?(?:\d+\s*=\s*)?((?:AMD|NVIDIA|Intel)[^\r\n]+)/i);
      const usedGpu = /ggml_vulkan|vulkan device/i.test(diagnostics);
      const backend = usedGpu ? 'vulkan' : 'cpu';
      return {
        success: !result.error && result.status === 0,
        usedGpu,
        backend,
        device: selectedDevice,
        gpuName: vulkanMatch ? vulkanMatch[1].trim() : '',
        message: result.error
          ? result.error.message
          : (result.status === 0 ? (usedGpu ? 'whisper.cpp inicializou o backend Vulkan' : 'whisper.cpp respondeu, mas não inicializou Vulkan') : 'whisper.cpp encerrou com erro'),
        output: diagnostics.slice(-3000)
      };
    } catch (error) {
      return { success: false, usedGpu: false, backend: 'error', gpuName: '', message: error.message };
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
    }
  }

  getHardwareStatus({ probe = false } = {}) {
    const gpu = this._runHardwareScriptJson('detect-gpu.py') || {
      device: 'cpu',
      cuda: false,
      rocm: false,
      gpuName: '',
      vulkan: false,
      vulkanGpuName: ''
    };
    const cpu = this._runHardwareScriptJson('detect-cpu.py') || {
      vendor: 'unknown',
      cpuName: '',
      has_avx2: false,
      has_avx512: false,
      blas_available: false,
      logical_cpus: os.cpus().length || 1
    };
    return this._buildHardwareStatus({ probe, gpu, cpu, allowResolve: true });
  }

  /**
   * Read hardware status without blocking Electron's main event loop.
   * The old path used spawnSync for Python/GPU probes, so opening the chip
   * popover could freeze every window while a probe waited or timed out.
   */
  getHardwareStatusAsync({ probe = false } = {}) {
    if (this._hardwareStatusPromise && !probe) {
      return this._hardwareStatusPromise;
    }

    const shouldProbe = this.provider === 'whisper';
    const launchPromise = shouldProbe && this._getEffectiveWhisperEngine() === 'whisper-cpp'
      ? (this.whisperCppLaunch || this._resolveWhisperCppLaunchAsync())
      : Promise.resolve(this.whisperCppLaunch);
    const request = Promise.all([
      shouldProbe ? this._runHardwareScriptJsonAsync('detect-gpu.py') : Promise.resolve(null),
      shouldProbe ? this._runHardwareScriptJsonAsync('detect-cpu.py') : Promise.resolve(null),
      launchPromise
    ]).then(([gpu, cpu, launch]) => {
      if (launch && !this.whisperCppLaunch && this._getEffectiveWhisperEngine() === 'whisper-cpp') {
        this.whisperCppLaunch = launch;
        this.available = true;
      }
      const result = this._buildHardwareStatus({ probe: false, gpu, cpu, allowResolve: false, whisperCppLaunch: launch });
      if (!probe || this._getEffectiveWhisperEngine() !== 'whisper-cpp' ||
          !result.engine.binary || !result.engine.modelExists) {
        return result;
      }

      return this._probeWhisperCppRuntimeAsync(launch || this.whisperCppLaunch).then((probeResult) => {
        result.probe = probeResult;
        result.execution = {
          kind: probeResult.usedGpu ? 'gpu' : 'cpu',
          backend: probeResult.backend,
          label: probeResult.usedGpu ? 'GPU (Vulkan)' : 'CPU',
          gpuName: probeResult.gpuName || result.gpu.name
        };
        result.checks.push({ ok: probeResult.success, label: probeResult.message });
        result.ok = !!result.engine.binary && result.engine.modelExists && probeResult.success === true;
        return result;
      });
    }).catch((error) => {
      const result = this._buildHardwareStatus({ probe: false, gpu: null, cpu: null, allowResolve: false, whisperCppLaunch: this.whisperCppLaunch });
      result.error = error.message || String(error);
      result.checks.push({ ok: false, label: 'Falha ao consultar o hardware' });
      return result;
    }).finally(() => {
      if (!probe && this._hardwareStatusPromise === request) {
        this._hardwareStatusPromise = null;
      }
    });

    if (!probe) {
      this._hardwareStatusPromise = request;
    }
    return request;
  }

  _buildHardwareStatus({ probe = false, gpu, cpu, allowResolve = true, whisperCppLaunch = null } = {}) {
    const configuredEngine = this._getConfiguredWhisperEngine();
    const effectiveEngine = this._getEffectiveWhisperEngine();
    gpu = gpu || {
      device: 'cpu',
      cuda: false,
      rocm: false,
      gpuName: '',
      vulkan: false,
      vulkanGpuName: ''
    };
    cpu = cpu || {
      vendor: 'unknown',
      cpuName: '',
      has_avx2: false,
      has_avx512: false,
      blas_available: false,
      logical_cpus: os.cpus().length || 1
    };
    const result = {
      ok: false,
      provider: this.provider,
      configuredEngine,
      effectiveEngine,
      fallback: configuredEngine !== effectiveEngine,
      available: this.isAvailable(),
      execution: {
        kind: 'unavailable',
        backend: 'none',
        label: 'Indisponível',
        gpuName: ''
      },
      gpu: {
        detected: !!gpu.gpuName || !!gpu.vulkanGpuName || gpu.cuda === true || gpu.rocm === true,
        name: gpu.vulkanGpuName || gpu.gpuName || '',
        vulkan: gpu.vulkan === true,
        cuda: gpu.cuda === true,
        rocm: gpu.rocm === true
      },
      cpu: {
        name: cpu.cpuName || '',
        vendor: cpu.vendor || 'unknown',
        avx2: cpu.has_avx2 === true,
        blas: cpu.blas_available === true,
        logicalCpus: Number(cpu.logical_cpus) || 1
      },
      engine: {
        binary: '',
        model: '',
        modelExists: false,
        workerReady: !!this._whisperWorkerReady,
        requestedBackend: this._getWhisperCppBackend(),
        lastRuntime: this._lastWhisperRuntime ? { ...this._lastWhisperRuntime } : null
      },
      checks: []
    };

    if (this.provider === 'azure') {
      result.execution = { kind: 'remote', backend: 'azure', label: 'Nuvem (Azure)', gpuName: '' };
      result.ok = !!this.speechConfig && !!this.available;
      result.checks.push({ ok: result.ok, label: result.ok ? 'Azure Speech conectado' : 'Azure Speech não configurado' });
      return result;
    }

    if (this.provider !== 'whisper') {
      result.checks.push({ ok: false, label: 'Reconhecimento de fala desativado' });
      return result;
    }

    if (effectiveEngine === 'whisper-cpp') {
      const launch = allowResolve
        ? (this.whisperCppLaunch || this._resolveWhisperCppLaunch())
        : (whisperCppLaunch || this.whisperCppLaunch);
      result.engine.binary = launch ? launch.binary || '' : '';
      result.engine.model = launch ? launch.model || '' : '';
      result.engine.modelExists = !!result.engine.model && fs.existsSync(result.engine.model);
      result.engine.requestedBackend = launch?.backend || this._getWhisperCppBackend();
      const wantsVulkan = result.engine.requestedBackend !== 'cpu';
      result.execution = {
        kind: wantsVulkan && result.gpu.vulkan ? 'gpu' : 'cpu',
        backend: wantsVulkan && result.gpu.vulkan ? 'vulkan' : 'cpu',
        label: wantsVulkan && result.gpu.vulkan ? 'GPU (Vulkan)' : 'CPU',
        gpuName: result.gpu.name
      };
      if (this._lastWhisperRuntime && this._lastWhisperRuntime.backend) {
        const runtimeGpu = this._lastWhisperRuntime.backend === 'vulkan';
        result.execution = {
          kind: runtimeGpu ? 'gpu' : 'cpu',
          backend: this._lastWhisperRuntime.backend,
          label: runtimeGpu ? 'GPU (Vulkan)' : 'CPU',
          gpuName: this._lastWhisperRuntime.gpuName || result.gpu.name
        };
      }
      result.checks.push({ ok: !!result.engine.binary, label: result.engine.binary ? 'whisper-cli encontrado' : 'whisper-cli não encontrado' });
      result.checks.push({ ok: result.engine.modelExists, label: result.engine.modelExists ? 'Modelo whisper.cpp encontrado' : 'Modelo whisper.cpp ausente' });
      if (probe && result.engine.binary && result.engine.modelExists) {
        const probeResult = this._probeWhisperCppRuntime(launch);
        result.probe = probeResult;
        result.execution = {
          kind: probeResult.usedGpu ? 'gpu' : 'cpu',
          backend: probeResult.backend,
          label: probeResult.usedGpu ? 'GPU (Vulkan)' : 'CPU',
          gpuName: probeResult.gpuName || result.gpu.name
        };
        result.checks.push({ ok: probeResult.success, label: probeResult.message });
      }
      result.ok = !!result.engine.binary && result.engine.modelExists && (!probe || result.probe?.success === true);
      return result;
    }

    if (effectiveEngine === 'faster') {
      const device = String(this._getWhisperFasterDevice()).toLowerCase();
      const useGpu = device === 'cuda' || (device === 'auto' && gpu.cuda);
      result.execution = {
        kind: useGpu ? 'gpu' : 'cpu',
        backend: useGpu ? 'cuda' : 'cpu',
        label: useGpu ? 'GPU (CUDA)' : 'CPU (INT8)',
        gpuName: useGpu ? gpu.gpuName : ''
      };
      result.ok = !!this.available && !!this.fasterWhisperLaunch;
      result.checks.push({ ok: result.ok, label: result.ok ? 'Faster Whisper pronto' : 'Faster Whisper indisponível' });
      return result;
    }

    result.execution = { kind: 'cpu', backend: 'openai', label: 'CPU (OpenAI Whisper)', gpuName: '' };
    result.ok = !!this.available && !!this.whisperCommand;
    result.checks.push({ ok: result.ok, label: result.ok ? 'Whisper local pronto' : 'Whisper local indisponível' });
    return result;
  }

  isAvailable() {
    if (this.provider === 'azure') {
      return !!this.speechConfig && !!this.available;
    }

    if (this.provider === 'whisper') {
      const engine = this._getEffectiveWhisperEngine();
      const configured = engine === 'faster' ? this.fasterWhisperLaunch
        : (engine === 'whisper-cpp' ? this.whisperCppLaunch : this.whisperCommand);
      const modelReady = engine !== 'whisper-cpp' || Boolean(configured?.model && fs.existsSync(configured.model));
      return !!this.available && !!configured && modelReady;
    }

    return false;
  }

  updateSettings(settings = {}) {
    const speechKeys = ['speechProvider', 'whisperEngine', 'azureKey', 'azureRegion', 'whisperCommand', 'whisperPython', 'whisperModelDir', 'whisperModel', 'whisperLanguage', 'whisperSegmentMs', 'whisperPeriodicFlushMs', 'whisperSilenceHangoverMs', 'whisperCaptureChunkSamples', 'whisperCppBeamSize', 'whisperCppBestOf', 'whisperCppNoFallback', 'whisperCppFlashAttention', 'whisperFasterDevice', 'whisperFasterComputeType', 'whisperCppCommand', 'whisperCppServerCommand', 'whisperCppPython', 'whisperCppThreads', 'whisperCppBlas', 'whisperCppBackend', 'whisperCppDevice', 'whisperCppModel', 'whisperCppModelDir', 'whisperBatchSize', 'whisperBatchTimeoutMs', 'whisperMaxConcurrent', 'whisperBeamSize'];
    let changed = false;

    for (const key of speechKeys) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        this.runtimeSettings[key] = settings[key];
        changed = true;
      }
    }

    if (changed) {
      this.initializeClient();
    }

    return this.getStatus();
  }

  prewarmWhisper() {
    if (this.provider !== 'whisper' || !this.available) {
      return Promise.resolve(false);
    }
    return this._ensureWhisperWorker();
  }

  shutdown() {
    this._shutdownWhisperWorker();
  }

  _getWhisperWorkerPath(engine = this._getEffectiveWhisperEngine()) {
    const filename = engine === 'faster'
      ? 'faster-whisper-worker.py'
      : (engine === 'whisper-cpp' ? 'whisper-cpp-worker.py' : 'whisper-worker.py');
    const unpackedPath = process.resourcesPath
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', filename)
      : '';
    if (unpackedPath && fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }

    const sourcePath = path.resolve(__dirname, '..', '..', 'scripts', filename);
    return fs.existsSync(sourcePath) ? sourcePath : null;
  }

  _getWhisperEngine() {
    return String(this._getSetting('whisperEngine') || process.env.WHISPER_ENGINE || 'whisper-cpp').trim().toLowerCase();
  }

  _getConfiguredWhisperEngine() {
    return normalizeWhisperEngine(this._getWhisperEngine());
  }

  _getEffectiveWhisperEngine() {
    return this.effectiveWhisperEngine || this._getConfiguredWhisperEngine();
  }

  _getWhisperFasterDevice() {
    return this._getSetting('whisperFasterDevice') || process.env.WHISPER_FASTER_DEVICE || 'cpu';
  }

  _getWhisperFasterComputeType() {
    return this._getSetting('whisperFasterComputeType') || process.env.WHISPER_FASTER_COMPUTE_TYPE || 'int8';
  }

  _getWhisperCppCommand() {
    return this._getSetting('whisperCppCommand') || process.env.WHISPER_CPP_COMMAND || '';
  }

  _getWhisperCppPython() {
    return this._getSetting('whisperCppPython') || process.env.WHISPER_CPP_PYTHON || '';
  }

  _getWhisperCppThreads() {
    const configured = this._getSetting('whisperCppThreads') || process.env.WHISPER_CPP_THREADS || config.get('speech.whisper.cppThreads') || require('os').cpus().length || 4;
    const parsed = Number(configured);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(32, Math.floor(parsed))) : 4;
  }

  _getWhisperCppBlas() {
    const configured = this._getSetting('whisperCppBlas') ?? process.env.WHISPER_CPP_BLAS;
    if (configured === false || String(configured).toLowerCase() === 'false' || String(configured).toLowerCase() === 'off' || String(configured) === '0') {
      return false;
    }
    return true;
  }

  _getWhisperCppBackend() {
    const configured = this._getSetting('whisperCppBackend') || process.env.WHISPER_CPP_BACKEND || config.get('speech.whisper.cppBackend') || 'vulkan';
    const backend = String(configured).trim().toLowerCase();
    return ['auto', 'vulkan', 'cpu'].includes(backend) ? backend : 'vulkan';
  }


  _getWhisperCppDevice() {
    const configured = this._getSetting('whisperCppDevice') || process.env.WHISPER_CPP_DEVICE || 'auto';
    const device = String(configured).trim().toLowerCase();
    if (device === 'auto') return 'auto';
    const parsed = Number(device);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 32 ? String(parsed) : 'auto';
  }
  _normaliseWhisperCppModelName(modelName) {
    const raw = this._sanitizeWhisperModelName(modelName) || 'turbo';
    return { turbo: 'large-v3-turbo', large: 'large-v3' }[raw] || raw;
  }

  _sanitizeWhisperModelName(modelName) {
    const value = String(modelName || '').trim().toLowerCase().replace(/^ggml-/, '').replace(/\.bin$/, '');
    if (!value || value.length > 64 || value.includes('..') || !/^[a-z0-9._-]+$/.test(value)) return null;
    return value;
  }

  _getWhisperCppModelPath() {
    const configured = this._getSetting('whisperCppModel') || process.env.WHISPER_CPP_MODEL || '';
    if (configured && path.isAbsolute(configured)) {
      // An explicit absolute path is a user-selected model location. Keep it
      // intact so portable installs and externally managed model directories
      // work; initialization still verifies that the file exists before use.
      return path.resolve(configured);
    }
    if (configured && fs.existsSync(configured)) {
      const resolved = path.resolve(configured);
      const modelDir = path.resolve(this._getWhisperModelDir('whisper-cpp'));
      const rel = path.relative(modelDir, resolved);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return resolved;
    }
    const modelName = this._sanitizeWhisperModelName(configured) || this._sanitizeWhisperModelName(this._getWhisperModel()) || 'turbo';
    return path.join(this._getWhisperModelDir('whisper-cpp'), `ggml-${this._normaliseWhisperCppModelName(modelName)}.bin`);
  }

  _resolveWhisperCppPython() {
    const configured = this._getWhisperCppPython();
    const candidates = [];
    if (configured) candidates.push({ command: configured, baseArgs: [] });
    try {
      const { app } = require('electron');
      const userData = app.getPath('userData');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const python = path.join(userData, '.venv-whisper-cpp', binDir, `python${ext}`);
      if (fs.existsSync(python)) candidates.push({ command: python, baseArgs: [] });
    } catch (_) { /* ignore */ }
    for (const command of [process.env.PYTHON, process.env.PYTHON_EXECUTABLE, 'python3', 'python']) {
      if (command) candidates.push({ command, baseArgs: [] });
    }
    if (process.platform === 'win32') candidates.push({ command: 'py', baseArgs: ['-3'] });
    for (const candidate of candidates) {
      if (!this._validateWhisperCommand(candidate.command)) continue;
      try {
        const probe = spawnSync(candidate.command, [...candidate.baseArgs, '-c', 'import sys; print(sys.version_info[0])'], {
          encoding: 'utf8', timeout: 10000, windowsHide: true, env: this._buildChildEnv(),
        });
        if (!probe.error && probe.status === 0) return candidate;
      } catch (_) { /* try the next candidate */ }
    }
    return null;
  }

  _resolveWhisperCppBinary() {
    const configured = this._getWhisperCppCommand();
    const candidates = [];
    if (configured) candidates.push(configured);
    try {
      const { app } = require('electron');
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'));
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', 'Release', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'));
    } catch (_) { /* ignore */ }
    const extension = process.platform === 'win32' ? '.exe' : '';
    for (const root of [path.join(__dirname, '..', '..', '.whisper.cpp'), path.join(__dirname, '..', '..', 'whisper.cpp')]) {
      candidates.push(path.join(root, 'build', 'bin', `whisper-cli${extension}`));
      candidates.push(path.join(root, 'build', 'bin', 'Release', `whisper-cli${extension}`));
      candidates.push(path.join(root, 'build', 'Release', `whisper-cli${extension}`));
    }
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
      if (!path.isAbsolute(candidate)) {
        try {
          const locator = process.platform === 'win32' ? 'where' : 'which';
           const result = spawnSync(locator, [candidate], { encoding: 'utf8', windowsHide: true, env: this._buildChildEnv() });
          if (!result.error && result.status === 0) {
            const resolved = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
            if (resolved) return resolved;
          }
        } catch (_) { /* try next candidate */ }
      }
    }
    return null;
  }

  _resolveWhisperCppServerBinary(binary) {
    const configured = this._getSetting('whisperCppServerCommand') || process.env.WHISPER_CPP_SERVER_COMMAND || '';
    const extension = process.platform === 'win32' ? '.exe' : '';
    const candidates = [];
    if (configured) candidates.push(configured);
    if (binary && path.isAbsolute(binary)) {
      candidates.push(path.join(path.dirname(binary), `whisper-server${extension}`));
    }
    try {
      const { app } = require('electron');
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', `whisper-server${extension}`));
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', 'Release', `whisper-server${extension}`));
    } catch (_) { /* electron is unavailable in isolated tests */ }
    for (const candidate of candidates) {
      if (this._isWhisperServerPathAllowed(candidate)) {
        return candidate;
      }
      if (!path.isAbsolute(candidate) && ['whisper-server', 'whisper-server.exe'].includes(path.basename(candidate).toLowerCase())) {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const probe = spawnSync(locator, [candidate], { encoding: 'utf8', windowsHide: true, env: this._buildChildEnv() });
        const located = !probe.error && probe.status === 0
          ? String(probe.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)
          : null;
        if (located && this._isWhisperServerPathAllowed(located)) return located;
      }
    }
    return null;
  }

  async _resolveWhisperCppServerBinaryAsync(binary) {
    const configured = this._getSetting('whisperCppServerCommand') || process.env.WHISPER_CPP_SERVER_COMMAND || '';
    const extension = process.platform === 'win32' ? '.exe' : '';
    const candidates = [];
    if (configured) candidates.push(configured);
    if (binary && path.isAbsolute(binary)) {
      candidates.push(path.join(path.dirname(binary), `whisper-server${extension}`));
    }
    try {
      const { app } = require('electron');
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', `whisper-server${extension}`));
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', 'Release', `whisper-server${extension}`));
    } catch (_) { /* electron is unavailable in isolated tests */ }

    for (const candidate of candidates) {
      if (await this._isWhisperServerPathAllowedAsync(candidate)) return candidate;
      if (!path.isAbsolute(candidate) && ['whisper-server', 'whisper-server.exe'].includes(path.basename(candidate).toLowerCase())) {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        try {
          const result = await this._execFileAsync(locator, [candidate], {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            env: this._buildChildEnv()
          });
          const located = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
          if (located && await this._isWhisperServerPathAllowedAsync(located)) return located;
        } catch (_) { /* try next candidate */ }
      }
    }
    return null;
  }

  _resolveWhisperCppLaunch() {
    const workerPath = this._getWhisperWorkerPath('whisper-cpp');
    const python = this._resolveWhisperCppPython();
    const binary = this._resolveWhisperCppBinary();
    if (!workerPath || !python || !binary) return null;
    const configuredBinary = this._getWhisperCppCommand();
    const binaryIsPath = path.isAbsolute(configuredBinary) || configuredBinary.includes(path.sep) || configuredBinary.includes('/');
    if (
      (binaryIsPath && !this._isWhisperExecutablePathAllowed(binary)) ||
      (!binaryIsPath && !this._isWhisperExecutablePathAllowed(binary))
    ) {
      logger.warn('Ignoring untrusted whisper.cpp binary', { binary });
      return null;
    }
    const model = this._getWhisperCppModelPath();
    const serverBinary = this._resolveWhisperCppServerBinary(binary);
    const args = [
      ...python.baseArgs,
      workerPath,
      '--binary', binary,
      '--model', model,
      '--language', this._getWhisperLanguage(),
      '--threads', String(this._getWhisperCppThreads()),
      '--beam-size', String(this._getWhisperCppBeamSize()),
      '--best-of', String(this._getWhisperCppBestOf()),
    ];
    if (this._getWhisperCppNoFallback()) args.push('--no-fallback');
    args.push(this._getWhisperCppFlashAttention() ? '--flash-attn' : '--no-flash-attn');
    if (this._getWhisperCppBlas()) args.push('--blas');
    args.push('--backend', this._getWhisperCppBackend());
    args.push('--device', this._getWhisperCppDevice());
    if (serverBinary) args.push('--server-binary', serverBinary);
    return { command: python.command, args, binary, serverBinary, model, backend: this._getWhisperCppBackend(), device: this._getWhisperCppDevice(), source: 'whisper-cpp' };
  }

  async _resolveWhisperCppPythonAsync() {
    const configured = this._getWhisperCppPython();
    const candidates = [];
    if (configured) candidates.push({ command: configured, baseArgs: [] });
    try {
      const { app } = require('electron');
      const userData = app.getPath('userData');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const python = path.join(userData, '.venv-whisper-cpp', binDir, `python${ext}`);
      if (await this._isFileAsync(python)) candidates.push({ command: python, baseArgs: [] });
    } catch (_) { /* ignore */ }
    for (const command of [process.env.PYTHON, process.env.PYTHON_EXECUTABLE, 'python3', 'python']) {
      if (command) candidates.push({ command, baseArgs: [] });
    }
    if (process.platform === 'win32') candidates.push({ command: 'py', baseArgs: ['-3'] });
    for (const candidate of candidates) {
      if (!await this._validateWhisperCommandAsync(candidate.command)) continue;
      try {
        const result = await this._execFileAsync(candidate.command, [...candidate.baseArgs, '-c', 'import sys; print(sys.version_info[0])'], {
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          env: this._buildChildEnv()
        });
        if (result.stdout !== undefined) return candidate;
      } catch (_) { /* try the next candidate */ }
    }
    return null;
  }

  async _resolveWhisperCppBinaryAsync() {
    const configured = this._getWhisperCppCommand();
    const candidates = [];
    if (configured) candidates.push(configured);
    try {
      const { app } = require('electron');
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'));
      candidates.push(path.join(app.getPath('userData'), '.whisper.cpp', 'build', 'bin', 'Release', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'));
    } catch (_) { /* ignore */ }
    const extension = process.platform === 'win32' ? '.exe' : '';
    for (const root of [path.join(__dirname, '..', '..', '.whisper.cpp'), path.join(__dirname, '..', '..', 'whisper.cpp')]) {
      candidates.push(path.join(root, 'build', 'bin', `whisper-cli${extension}`));
      candidates.push(path.join(root, 'build', 'bin', 'Release', `whisper-cli${extension}`));
      candidates.push(path.join(root, 'build', 'Release', `whisper-cli${extension}`));
    }

    for (const candidate of candidates) {
      if (await this._isFileAsync(candidate)) return candidate;
      if (path.isAbsolute(candidate)) continue;
      try {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const result = await this._execFileAsync(locator, [candidate], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          env: this._buildChildEnv()
        });
        const resolved = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
        if (resolved && await this._isFileAsync(resolved)) return resolved;
      } catch (_) { /* try next candidate */ }
    }
    return null;
  }

  async _resolveWhisperCppLaunchAsync() {
    const workerPath = this._getWhisperWorkerPath('whisper-cpp');
    const [python, binary] = await Promise.all([
      this._resolveWhisperCppPythonAsync(),
      this._resolveWhisperCppBinaryAsync()
    ]);
    if (!workerPath || !python || !binary || !this._isWhisperExecutablePathAllowed(binary)) return null;
    const model = this._getWhisperCppModelPath();
    const serverBinary = await this._resolveWhisperCppServerBinaryAsync(binary);
    const args = [
      ...python.baseArgs,
      workerPath,
      '--binary', binary,
      '--model', model,
      '--language', this._getWhisperLanguage(),
      '--threads', String(this._getWhisperCppThreads()),
      '--beam-size', String(this._getWhisperCppBeamSize()),
      '--best-of', String(this._getWhisperCppBestOf())
    ];
    if (this._getWhisperCppNoFallback()) args.push('--no-fallback');
    args.push(this._getWhisperCppFlashAttention() ? '--flash-attn' : '--no-flash-attn');
    if (this._getWhisperCppBlas()) args.push('--blas');
    args.push('--backend', this._getWhisperCppBackend(), '--device', this._getWhisperCppDevice());
    if (serverBinary) args.push('--server-binary', serverBinary);
    return { command: python.command, args, binary, serverBinary, model, backend: this._getWhisperCppBackend(), device: this._getWhisperCppDevice(), source: 'whisper-cpp' };
  }

  _resolveFasterWhisperLaunch() {
    const workerPath = this._getWhisperWorkerPath('faster');
    const python = this._resolveFasterWhisperPython();
    if (!workerPath || !python) {
      return null;
    }
    const args = [...python.baseArgs, workerPath, '--model', this._getWhisperModel(), '--language', this._getWhisperLanguage(), '--device', this._getWhisperFasterDevice(), '--compute-type', this._getWhisperFasterComputeType(), '--beam-size', String(this._getWhisperBeamSize()), '--max-concurrent', String(this._getWhisperMaxConcurrent())];
    const modelDir = this._getWhisperModelDir('faster');
    if (modelDir) args.push('--model-dir', modelDir);
    return { command: python.command, args, baseArgs: [], source: 'faster-whisper' };
  }

  _resolveFasterWhisperPython() {
    const configured = this._getSetting('whisperPython') || process.env.WHISPER_PYTHON || '';
    const candidates = [];
    if (configured) candidates.push({ command: configured, baseArgs: [] });
    try {
      const { app } = require('electron');
      const userData = app.getPath('userData');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const python = path.join(userData, '.venv-faster-whisper', binDir, `python${ext}`);
      if (fs.existsSync(python)) candidates.push({ command: python, baseArgs: [] });
    } catch (_) {}
    for (const command of [process.env.PYTHON, process.env.PYTHON_EXECUTABLE, 'python3', 'python']) {
      if (command) candidates.push({ command, baseArgs: [] });
    }
    if (process.platform === 'win32') candidates.push({ command: 'py', baseArgs: ['-3'] });
    const probeScript = 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("faster_whisper") else 1)';
    for (const candidate of candidates) {
      if (!this._validateWhisperCommand(candidate.command)) continue;
      try {
        const probe = spawnSync(candidate.command, [...candidate.baseArgs, '-c', probeScript], {
          encoding: 'utf8', timeout: 10000, windowsHide: true, env: this._buildChildEnv(),
        });
        if (!probe.error && probe.status === 0) return candidate;
      } catch (_) {
        // Try the next candidate.
      }
    }
    return null;
  }

  _getWhisperWorkerLaunch() {
    if (this._getEffectiveWhisperEngine() === 'faster') {
      return this.fasterWhisperLaunch || this._resolveFasterWhisperLaunch();
    }
    if (this._getEffectiveWhisperEngine() === 'whisper-cpp') {
      return this.whisperCppLaunch || this._resolveWhisperCppLaunch();
    }
    if (!this.whisperCommand) {
      return null;
    }

    const workerPath = this._getWhisperWorkerPath('openai');
    const baseArgs = this.whisperCommand.baseArgs || [];
    const moduleIndex = baseArgs.findIndex((arg, index) => arg === '-m' && baseArgs[index + 1] === 'whisper');
    if (!workerPath || moduleIndex < 0) {
      return null;
    }

    const args = [
      ...baseArgs.slice(0, moduleIndex),
      workerPath,
      '--model', this._getWhisperModel(),
      '--language', this._getWhisperLanguage(),
    ];
    const modelDir = this._getWhisperModelDir();
    if (modelDir) {
      args.push('--model-dir', modelDir);
    }

    return { command: this.whisperCommand.command, args };
  }

  _validateWhisperCommand(command) {
    if (!command || typeof command !== 'string') {
      return false;
    }
    if (/[;&|`]/.test(command) || /\$\([^)]*\)/.test(command)) {
      return false;
    }

    const normalizedCommand = command.trim();
    const trustedRoots = this._getTrustedWhisperRoots();
    const isInsideTrustedRoot = (candidate) => trustedRoots.some((root) => {
      const rel = path.relative(root, candidate);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    });

    const candidates = [];
    const commandIsPath = path.isAbsolute(normalizedCommand) || normalizedCommand.includes(path.sep) || normalizedCommand.includes('/');
    if (path.isAbsolute(normalizedCommand)) {
      candidates.push(path.normalize(normalizedCommand));
    } else {
      candidates.push(path.resolve(normalizedCommand));
    }

    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    try {
      const probe = spawnSync(whichCmd, [normalizedCommand], { encoding: 'utf8', windowsHide: true, timeout: 5000, env: this._buildChildEnv() });
      if (!probe.error && probe.status === 0 && probe.stdout) {
        probe.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => candidates.push({
          path: path.resolve(line),
          fromPath: true
        }));
      }
    } catch (_) {}

    return candidates.some((entry) => {
      const candidate = typeof entry === 'string' ? entry : entry.path;
      const fromPath = typeof entry === 'object' && entry.fromPath === true;
      if (!fs.existsSync(candidate)) return false;
      try {
        if (!fs.statSync(candidate).isFile()) return false;
      } catch (_) {
        return false;
      }
      let real;
      try { real = fs.realpathSync(candidate); } catch (_) { return false; }
      if (isInsideTrustedRoot(real)) return true;
      // A command outside the managed roots is accepted only when it resolves
      // to an explicitly allowlisted interpreter/Whisper executable. This
      // keeps configured absolute installations usable without accepting an
      // arbitrary executable path.
      return this._isAllowedWhisperExecutableName(real) &&
        (fromPath || commandIsPath);
    });
  }

  _isWhisperExecutablePathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) return false;
    try {
      if (!fs.statSync(filePath).isFile()) return false;
      const real = fs.realpathSync(filePath);
      const allowedNames = new Set(['whisper-cli', 'whisper-cli.exe', 'main', 'main.exe']);
      return this._isTrustedWhisperPath(real) || allowedNames.has(path.basename(real).toLowerCase());
    } catch (_) {
      return false;
    }
  }

  _isAllowedWhisperExecutableName(value) {
    const basename = path.basename(String(value || '')).toLowerCase();
    const fixedNames = new Set([
      'python', 'python3', 'python.exe', 'python3.exe', 'py', 'py.exe',
      'whisper', 'whisper.exe', 'whisper-cli', 'whisper-cli.exe', 'main', 'main.exe'
    ]);
    return fixedNames.has(basename) || /^python3\.\d+(?:\.exe)?$/.test(basename);
  }

  _isWhisperServerPathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) return false;
    try {
      if (!fs.statSync(filePath).isFile()) return false;
      const real = fs.realpathSync(filePath);
      return this._isTrustedWhisperPath(real) ||
        ['whisper-server', 'whisper-server.exe'].includes(path.basename(real).toLowerCase());
    } catch (_) {
      return false;
    }
  }

  async _isWhisperServerPathAllowedAsync(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      const stat = await fsPromises.stat(filePath);
      if (!stat.isFile()) return false;
      const real = await fsPromises.realpath(filePath);
      const isTrusted = this._getTrustedWhisperRoots().some((root) => {
        const relative = path.relative(root, real);
        return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      });
      return isTrusted || ['whisper-server', 'whisper-server.exe'].includes(path.basename(real).toLowerCase());
    } catch (_) {
      return false;
    }
  }

  async _isFileAsync(filePath) {
    try {
      return (await fsPromises.stat(filePath)).isFile();
    } catch (_) {
      return false;
    }
  }

  async _validateWhisperCommandAsync(command) {
    if (!command || typeof command !== 'string') return false;
    if (/[;&|`]/.test(command) || /\$\([^)]*\)/.test(command)) return false;

    const normalizedCommand = command.trim();
    const trustedRoots = this._getTrustedWhisperRoots();
    const commandIsPath = path.isAbsolute(normalizedCommand) || normalizedCommand.includes(path.sep) || normalizedCommand.includes('/');
    const candidates = [];
    if (path.isAbsolute(normalizedCommand)) {
      candidates.push({ path: path.normalize(normalizedCommand), fromPath: false });
    } else {
      candidates.push({ path: path.resolve(normalizedCommand), fromPath: false });
    }

    if (!commandIsPath) {
      try {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const result = await this._execFileAsync(locator, [normalizedCommand], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          env: this._buildChildEnv()
        });
        String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
          candidates.push({ path: path.resolve(line), fromPath: true });
        });
      } catch (_) {
        // The next candidate or interpreter may still be usable.
      }
    }

    for (const candidate of candidates) {
      try {
        const stat = await fsPromises.stat(candidate.path);
        if (!stat.isFile()) continue;
        const real = await fsPromises.realpath(candidate.path);
        const rel = trustedRoots.find((root) => {
          const relative = path.relative(root, real);
          return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        });
        if (rel || (this._isAllowedWhisperExecutableName(real) && (candidate.fromPath || commandIsPath))) {
          return true;
        }
      } catch (_) {
        // Ignore missing or inaccessible candidates.
      }
    }
    return false;
  }

  _getTrustedWhisperRoots() {
    const roots = [];
    if (this.dataDir) roots.push(path.resolve(this.dataDir));
    if (process.resourcesPath) roots.push(path.resolve(process.resourcesPath));
    roots.push(path.resolve(__dirname, '..', '..'));
    try {
      const { app } = require('electron');
      roots.push(path.resolve(app.getPath('userData')));
    } catch (_) { /* electron is unavailable in isolated tests */ }
    return roots;
  }

  _isTrustedWhisperPath(filePath) {
    if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) return false;
    let real;
    try { real = fs.realpathSync(filePath); } catch (_) { return false; }
    return this._getTrustedWhisperRoots().some((root) => {
      const rel = path.relative(root, real);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
  }

  _validateWhisperWorkerLaunch(launch) {
    if (!launch || !this._validateWhisperCommand(launch.command)) return false;
    const args = Array.isArray(launch.args) ? launch.args : [];
    if (args.some((arg) => ['-c', '--command', '-e', '--eval'].includes(String(arg)))) return false;
    const workerPath = args.find((arg) => /(?:^|[\\/])(?:whisper|faster-whisper|whisper-cpp)-worker\.py$/i.test(String(arg)));
    return Boolean(workerPath && this._isTrustedWhisperPath(String(workerPath)));
  }

  _buildChildEnv() {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key === 'GEMINI_API_KEY' || key === 'AZURE_SPEECH_KEY' || key === 'AZURE_SPEECH_REGION' || key === 'AZURE_SPEECH_SUBSCRIPTION_KEY' || /TOKEN/i.test(key) || /SECRET/i.test(key) || /API_KEY$/i.test(key)) {
        delete env[key];
      }
    }
    return env;
  }

  _ensureWhisperWorker() {
    if (this._whisperWorkerReady && this._whisperWorker && !this._whisperWorker.killed) {
      return Promise.resolve(true);
    }
    if (this._whisperWorkerStartPromise) {
      return this._whisperWorkerStartPromise;
    }
    if (Date.now() < this._whisperWorkerRetryAfter) {
      return Promise.reject(new Error('Whisper worker retry is temporarily delayed'));
    }

    const launch = this._getWhisperWorkerLaunch();
    if (!launch) {
      return Promise.reject(new Error('Persistent worker requires a Python module Whisper command'));
    }

    let worker;
    try {
      if (!this._validateWhisperWorkerLaunch(launch)) {
        return Promise.reject(new Error('Refusing to spawn untrusted Whisper command: ' + launch.command));
      }
      worker = spawn(launch.command, launch.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...this._buildChildEnv(),
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        },
      });
    } catch (error) {
      return Promise.reject(error);
    }

    this._whisperWorker = worker;
    this._whisperWorkerReady = false;
    this._whisperWorkerStdoutBuffer = '';
    this._whisperWorkerStderr = '';

    const startPromise = new Promise((resolve, reject) => {
      this._whisperWorkerStart = { worker, resolve, reject, settled: false };
    });
    this._whisperWorkerStartPromise = startPromise;

    worker.stdout.setEncoding('utf8');
    worker.stdout.on('data', (chunk) => this._consumeWhisperWorkerOutput(worker, chunk));
    worker.stderr.setEncoding('utf8');
    worker.stderr.on('data', (chunk) => {
      if (this._whisperWorker === worker) {
        this._whisperWorkerStderr = (this._whisperWorkerStderr + chunk).slice(-2000);
      }
    });
    worker.once('error', (error) => this._handleWhisperWorkerExit(worker, error));
    worker.once('close', (code) => {
      this._handleWhisperWorkerExit(worker, new Error('Whisper worker exited with code ' + code));
    });

    startPromise.then(() => {
      if (this._whisperWorkerStartPromise === startPromise) {
        this._whisperWorkerStartPromise = null;
      }
    }, () => {
      if (this._whisperWorkerStartPromise === startPromise) {
        this._whisperWorkerStartPromise = null;
      }
    });
    return startPromise;
  }

  _consumeWhisperWorkerOutput(worker, chunk) {
    if (this._whisperWorker !== worker) {
      return;
    }
    this._whisperWorkerStdoutBuffer += String(chunk);
    let newlineIndex;
    while ((newlineIndex = this._whisperWorkerStdoutBuffer.indexOf('\n')) >= 0) {
      const line = this._whisperWorkerStdoutBuffer.slice(0, newlineIndex).trim();
      this._whisperWorkerStdoutBuffer = this._whisperWorkerStdoutBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      try {
        this._handleWhisperWorkerMessage(worker, JSON.parse(line));
      } catch (_) {
        // Ignore non-protocol stdout so no audio/transcript-like data reaches logs.
      }
    }
  }

  _settleWhisperWorkerRequest(requestId, settle) {
    const request = this._whisperWorkerRequests.get(requestId);
    if (!request) return false;
    this._whisperWorkerRequests.delete(requestId);
    if (request.timer) {
      clearTimeout(request.timer);
      request.timer = null;
    }
    settle(request);
    return true;
  }

  _handleWhisperWorkerMessage(worker, message) {
    if (this._whisperWorker !== worker || !message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'ready') {
      this._whisperWorkerReady = true;
      this._whisperWorkerFallbackLogged = false;
      this._whisperWorkerRetryAfter = 0;
      const start = this._whisperWorkerStart;
      if (start && start.worker === worker && !start.settled) {
        start.settled = true;
        start.resolve(true);
      }
      logger.info('Persistent Whisper worker ready', {
        engine: message.engine || this._getEffectiveWhisperEngine(),
        device: message.device || this._getWhisperFasterDevice(),
        computeType: message.computeType || this._getWhisperFasterComputeType(),
        model: message.model || this._getWhisperModel(),
        modelLoadMs: Number(message.modelLoadMs) || null,
        backendRequested: message.backendRequested || message.backend || null,
        backendUsed: message.backendUsed || message.backend || null,
        backendConfirmed: message.backendConfirmed === true,
        executionMode: message.executionMode || 'cli',
        gpuName: message.gpuName || '',
        beamSize: Number(message.beamSize) || null,
        bestOf: Number(message.bestOf) || null,
        flashAttention: message.flashAttention === true,
      });
      return;
    }

    if (message.type === 'fatal') {
      this._handleWhisperWorkerExit(worker, new Error(message.error || 'Whisper worker initialization failed'));
      return;
    }

    if (message.type === 'stopped') {
      this._handleWhisperWorkerExit(worker, new Error(message.reason || 'Whisper worker stopped'));
      return;
    }

    if (message.type === 'batch_result') {
      if (!message.id) {
        return;
      }
      const request = this._whisperWorkerRequests.get(message.id);
      if (!request || request.worker !== worker) {
        return;
      }
      this._settleWhisperWorkerRequest(message.id, (pending) => {
        if (Array.isArray(message.results)) {
          pending.resolve(message.results);
        } else {
          pending.reject(new Error(message.error || 'Whisper worker batch response was invalid'));
        }
      });
      return;
    }

    if (message.type !== 'result' || !message.id) {
      return;
    }

    const request = this._whisperWorkerRequests.get(message.id);
    if (!request || request.worker !== worker) {
      return;
    }
    this._settleWhisperWorkerRequest(message.id, (pending) => {
      if (message.ok) {
        const backendUsed = message.backendUsed || message.backend || null;
        const backendConfirmed = message.backendConfirmed === true;
        if (backendUsed) {
          this._lastWhisperRuntime = {
            backend: String(backendUsed),
            backendRequested: String(message.backendRequested || this._getWhisperCppBackend()),
            backendConfirmed,
            executionMode: String(message.executionMode || 'cli'),
            gpuName: String(message.gpuName || ''),
            device: String(message.device || ''),
            at: Date.now()
          };
        }
        pending.resolve({
          text: typeof message.text === 'string' ? message.text : '',
          transcribeMs: Number(message.transcribeMs) || null,
          backend: backendUsed,
          backendRequested: message.backendRequested || this._getWhisperCppBackend(),
          backendUsed,
          backendConfirmed,
          executionMode: message.executionMode || 'cli',
          device: message.device || '',
          gpuName: message.gpuName || ''
        });
      } else {
        pending.reject(new Error(message.error || 'Whisper worker transcription failed'));
      }
    });
  }

  _rejectWhisperWorkerStart(worker, error) {
    const start = this._whisperWorkerStart;
    if (start && start.worker === worker && !start.settled) {
      start.settled = true;
      start.reject(error);
    }
  }

  _handleWhisperWorkerExit(worker, error) {
    if (this._whisperWorker !== worker) {
      return;
    }

    const wasReady = this._whisperWorkerReady;
    this._whisperWorker = null;
    this._whisperWorkerReady = false;
    this._whisperWorkerStdoutBuffer = '';
    this._whisperWorkerRetryAfter = Date.now() + 30000;
    this._rejectWhisperWorkerStart(worker, error);
    this._whisperWorkerStart = null;

    for (const [requestId, request] of this._whisperWorkerRequests) {
      if (request.worker === worker) {
        this._settleWhisperWorkerRequest(requestId, (pending) => pending.reject(error));
      }
    }

    if (wasReady) {
      logger.warn('Persistent Whisper worker stopped; falling back to the CLI', {
        error: error.message,
        stderrPreview: this._whisperWorkerStderr.slice(-500),
      });
    }
  }

  _shutdownWhisperWorker() {
    const worker = this._whisperWorker;
    if (!worker) {
      return;
    }

    const shutdownError = new Error('Whisper worker shut down');
    this._whisperWorker = null;
    this._whisperWorkerReady = false;
    this._rejectWhisperWorkerStart(worker, shutdownError);
    this._whisperWorkerStart = null;
    for (const [requestId, request] of this._whisperWorkerRequests) {
      if (request.worker === worker) {
        this._settleWhisperWorkerRequest(requestId, (pending) => pending.reject(shutdownError));
      }
    }
    const forceKill = () => {
      try {
        if (!worker.killed) worker.kill();
      } catch (_) {
        // The process may already have exited.
      }
    };
    const canRequestGracefulStop = worker.stdin
      && !worker.stdin.destroyed
      && typeof worker.stdin.write === 'function'
      && typeof worker.once === 'function';
    if (!canRequestGracefulStop) {
      forceKill();
      return;
    }

    const killTimer = setTimeout(forceKill, WHISPER_WORKER_SHUTDOWN_TIMEOUT_MS);
    worker.once('close', () => clearTimeout(killTimer));
    try {
      worker.stdin.write(JSON.stringify({ type: 'stop' }) + '\n');
    } catch (_) {
      clearTimeout(killTimer);
      forceKill();
    }
  }

  async _transcribeWithPersistentWorker(audioFilePath) {
    await this._ensureWhisperWorker();
    const worker = this._whisperWorker;
    if (!worker || !this._whisperWorkerReady || !worker.stdin || worker.stdin.destroyed) {
      throw new Error('Whisper worker is not ready');
    }

    const id = 'whisper-' + Date.now() + '-' + (++this._whisperWorkerRequestSeq);
    return new Promise((resolve, reject) => {
      const request = { worker, resolve, reject, timer: null };
      request.timer = setTimeout(() => {
        this._settleWhisperWorkerRequest(id, (pending) => pending.reject(new Error('Whisper worker request timed out')));
      }, WHISPER_WORKER_REQUEST_TIMEOUT_MS);
      this._whisperWorkerRequests.set(id, request);
      try {
        worker.stdin.write(JSON.stringify({ type: 'transcribe', id, audioPath: audioFilePath }) + '\n', (error) => {
          if (!error) {
            return;
          }
          this._settleWhisperWorkerRequest(id, (pending) => pending.reject(error));
        });
      } catch (error) {
        this._settleWhisperWorkerRequest(id, (pending) => pending.reject(error));
      }
    });
  }

  async _transcribeWithPersistentWorkerBatch(audioFilePaths) {
    await this._ensureWhisperWorker();
    const worker = this._whisperWorker;
    if (!worker || !this._whisperWorkerReady || !worker.stdin || worker.stdin.destroyed) {
      throw new Error('Whisper worker is not ready');
    }
    if (!Array.isArray(audioFilePaths) || !audioFilePaths.length) {
      return [];
    }

    const id = 'whisper-batch-' + Date.now() + '-' + (++this._whisperWorkerRequestSeq);
    const items = audioFilePaths.map((audioPath, index) => ({
      id: id + '-' + index,
      audioPath,
    }));
    return new Promise((resolve, reject) => {
      const request = { worker, resolve, reject, timer: null };
      request.timer = setTimeout(() => {
        this._settleWhisperWorkerRequest(id, (pending) => pending.reject(new Error('Whisper worker batch request timed out')));
      }, WHISPER_WORKER_REQUEST_TIMEOUT_MS);
      this._whisperWorkerRequests.set(id, request);
      try {
        worker.stdin.write(JSON.stringify({ type: 'transcribe_batch', id, items }) + '\n', (error) => {
          if (!error) {
            return;
          }
          this._settleWhisperWorkerRequest(id, (pending) => pending.reject(error));
        });
      } catch (error) {
        this._settleWhisperWorkerRequest(id, (pending) => pending.reject(error));
      }
    });
  }

  _getConfiguredProvider() {
    const provider = String(this._getSetting('speechProvider') || process.env.SPEECH_PROVIDER || '').trim().toLowerCase();

    if (provider === 'azure' || provider === 'whisper') {
      return provider;
    }

    const hasAzure = !!((this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY) &&
      (this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION));

    if (hasAzure) {
      return 'azure';
    }

    return 'whisper';
  }

  _getWhisperModel() {
    return this._getSetting('whisperModel') || process.env.WHISPER_MODEL || config.get('speech.whisper.model') || 'turbo';
  }

  _getWhisperModelDir(engine = this._getEffectiveWhisperEngine()) {
    const configured = engine === 'faster'
      ? (process.env.WHISPER_FASTER_MODEL_DIR || '')
      : (engine === 'whisper-cpp'
        ? (this._getSetting('whisperCppModelDir') || process.env.WHISPER_CPP_MODEL_DIR || '')
        : (this._getSetting('whisperModelDir') || process.env.WHISPER_MODEL_DIR || ''));
    // Honor an absolute configured dir. Empty or relative values (the old
    // `.whisper-models` default resolved against an unstable cwd) are replaced
    // with the stable userData location the installer downloads weights into,
    // so --model_dir and download_root always agree.
    if (configured && path.isAbsolute(configured)) {
      return configured;
    }
    return this._getUserDataModelDir(engine) || configured;
  }

  /**
   * Absolute model-weights dir under Electron userData — matches
   * WhisperInstaller.modelDir so transcription finds downloaded models.
   */
  _getUserDataModelDir(engine = this._getEffectiveWhisperEngine()) {
    try {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), engine === 'faster' ? '.faster-whisper-models' : (engine === 'whisper-cpp' ? '.whisper-cpp-models' : '.whisper-models'));
    } catch (_) {
      return '';
    }
  }

  _getWhisperLanguage() {
    return this._getSetting('whisperLanguage') || process.env.WHISPER_LANGUAGE || config.get('speech.whisper.language') || 'pt';
  }

  _getWhisperSegmentMs() {
    const rawValue = this._getSetting('whisperSegmentMs') || process.env.WHISPER_SEGMENT_MS || config.get('speech.whisper.segmentMs') || 4000;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? Math.max(2000, parsed) : 4000;
  }

  _getPeriodicFlushMs() {
    const rawValue = this._getSetting('whisperPeriodicFlushMs') || process.env.WHISPER_PERIODIC_FLUSH_MS || config.get('speech.whisper.periodicFlushMs') || 3000;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
  }

  _vadNumber(settingKey, envKey, configPath, fallback, min) {
    const raw = this._getSetting(settingKey) || process.env[envKey] || config.get(configPath) || fallback;
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    return typeof min === 'number' ? Math.max(min, value) : value;
  }

  _isVadEnabled() {
    const override = this._getSetting('whisperVadEnabled');
    if (override === false || override === 'false') return false;
    if (override === true || override === 'true') return true;
    if (process.env.WHISPER_VAD_ENABLED === 'false') return false;
    const configured = config.get('speech.whisper.vadEnabled');
    return configured !== false;
  }

  _getSilenceHangoverMs() {
    return this._vadNumber('whisperSilenceHangoverMs', 'WHISPER_SILENCE_HANGOVER_MS', 'speech.whisper.silenceHangoverMs', 600, 200);
  }

  _getMinUtteranceMs() {
    return this._vadNumber('whisperMinUtteranceMs', 'WHISPER_MIN_UTTERANCE_MS', 'speech.whisper.minUtteranceMs', 350, 100);
  }

  _getMaxUtteranceMs() {
    return this._vadNumber('whisperMaxUtteranceMs', 'WHISPER_MAX_UTTERANCE_MS', 'speech.whisper.maxUtteranceMs', 15000, 2000);
  }

  _getPreRollMs() {
    return this._vadNumber('whisperPreRollMs', 'WHISPER_PRE_ROLL_MS', 'speech.whisper.preRollMs', 300, 0);
  }

  _getVadEnergyFloor() {
    return this._vadNumber('whisperVadEnergyFloor', 'WHISPER_VAD_ENERGY_FLOOR', 'speech.whisper.vadEnergyFloor', 0.008, 0.0005);
  }

  _getSetting(key) {
    const value = this.runtimeSettings[key];
    return value === '' ? null : value;
  }

  /**
   * Build a whisper candidate pointing at the app-local venv inside
   * Electron's userData directory. This is where the onboarding installer
   * creates the venv in packaged builds.
   */
  _getUserDataWhisperCandidate() {
    try {
      const { app } = require('electron');
      const userData = app.getPath('userData');
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
      const ext = process.platform === 'win32' ? '.exe' : '';
      const python = path.join(userData, '.venv-whisper', binDir, `python${ext}`);
      if (fs.existsSync(python)) {
        return { command: python, baseArgs: ['-m', 'whisper'] };
      }
    } catch (_) {
      // electron may not be available in unit tests
    }
    return null;
  }

  _resolveWhisperCommand() {
    const configured = this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND;
    const candidates = [];

    if (configured) {
      candidates.push(...this._expandConfiguredWhisperCandidates(configured));
    }

    // Persistent app venv (highest priority after explicit config)
    const userDataVenv = this._getUserDataWhisperCandidate();
    if (userDataVenv) {
      candidates.push({ ...userDataVenv, source: 'app userData venv' });
    }

    // Platform-aware fallback candidates (higher priority = tried first)
    candidates.push({ command: 'whisper', baseArgs: [], source: 'system PATH' });
    if (process.platform === 'win32') {
      candidates.push({ command: 'whisper.exe', baseArgs: [], source: 'system PATH (exe)' });
      candidates.push({ command: 'py', baseArgs: ['-3', '-m', 'whisper'], source: 'py launcher' });
    }
    candidates.push({ command: 'python3', baseArgs: ['-m', 'whisper'], source: 'python3 module' });
    candidates.push({ command: 'python', baseArgs: ['-m', 'whisper'], source: 'python module' });

    for (const candidate of candidates) {
      if (!candidate || !candidate.command) {
        continue;
      }
      if (!this._validateWhisperCandidate(candidate)) {
        logger.warn('Skipping untrusted Whisper candidate', { command: candidate.command });
        continue;
      }

      const resolved = this._probeWhisperCandidate(candidate);
      if (resolved) {
        logger.info('Whisper command resolved', {
          command: resolved.command,
          baseArgs: resolved.baseArgs,
          source: resolved.source || candidate.source || 'unknown'
        });
        return resolved;
      }
    }

    logger.warn('No Whisper CLI candidate succeeded after probing all fallbacks');
    return null;
  }

  /**
   * Fast, torch-free check for python `-m whisper` candidates. Importing the
   * whisper package pulls in torch/numba and can take well over 8 s on a cold
   * cache (first run after install), which made `--help` time out and the mic
   * button stay hidden until a second launch. `importlib.util.find_spec`
   * confirms the module is installed without importing it, returning in well
   * under a second. Returns the candidate on success, else null.
   */
  _probeWhisperModuleFast(candidate) {
    const mIdx = candidate.baseArgs.indexOf('-m');
    if (mIdx === -1 || candidate.baseArgs[mIdx + 1] !== 'whisper') {
      return null; // not a `-m whisper` form (e.g. a whisper binary)
    }
    const pyArgs = candidate.baseArgs.slice(0, mIdx);
    const script = 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("whisper") else 1)';
    try {
      // No shell: an absolute .exe runs directly. shell:true on Windows does
      // NOT quote args, so a spaced path like
      //   C:\Users\CANDAN SINGH\...\python.exe
      // would be split at the space and the probe would wrongly fail —
      // hiding the mic for any user whose profile name contains a space.
      const probe = spawnSync(candidate.command, [...pyArgs, '-c', script], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
        env: this._buildChildEnv(),
      });
      if (!probe.error && probe.status === 0) {
        return candidate;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  /**
   * Probe a single candidate: exists check → fast module check → spawn --help.
   * Returns the working candidate object, or null on failure.
   */
  _probeWhisperCandidate(candidate) {
    const cmd = candidate.command;
    const args = [...candidate.baseArgs, '--help'];

    // Fast path: skip spawnSync if the file clearly doesn't exist
    if (path.isAbsolute(cmd) || cmd.includes(path.sep) || cmd.includes('/')) {
      try {
        const normalized = path.normalize(cmd);
        if (!fs.existsSync(normalized)) {
          logger.debug('Whisper probe skipped: file does not exist', {
            command: cmd,
            normalized
          });
          return null;
        }
      } catch (e) {
        // fs.existsSync can throw on invalid paths; treat as missing
        return null;
      }
    }

    // Cheap torch-free check first so the mic appears on the first run.
    const fast = this._probeWhisperModuleFast(candidate);
    if (fast) {
      logger.debug('Whisper module confirmed via find_spec', { command: cmd });
      return fast;
    }

    let probe;
    try {
      probe = spawnSync(cmd, args, {
        encoding: 'utf8',
        // First `import whisper` (torch/numba) can be slow on a cold cache.
        timeout: 30000,
        windowsHide: true,
        env: this._buildChildEnv(),
        // No shell — see _probeWhisperModuleFast: shell:true on Windows splits
        // spaced paths (e.g. "C:\Users\CANDAN SINGH\...") and breaks the probe.
      });
    } catch (spawnErr) {
      logger.debug('Whisper probe spawn error', {
        command: cmd,
        error: spawnErr.message
      });
      return null;
    }

    const output = `${probe.stdout || ''}\n${probe.stderr || ''}`;
    const noModule = output.includes('No module named whisper');
    const isHelpOutput = output.includes('usage:') || output.includes('whisper') || output.includes('options');

    if (!probe.error && probe.status === 0 && !noModule) {
      return candidate;
    }

    // Some whisper builds exit with non-zero on --help but still print usage
    if (!probe.error && !noModule && isHelpOutput) {
      logger.debug('Whisper probe accepted non-zero help output', {
        command: cmd,
        status: probe.status
      });
      return candidate;
    }

    logger.debug('Whisper probe failed', {
      command: cmd,
      status: probe.status,
      error: probe.error ? probe.error.message : null,
      noModule,
      isHelpOutput,
      outputPreview: output.substring(0, 200)
    });
    return null;
  }

  _expandConfiguredWhisperCandidates(rawCommand) {
    const parsed = this._parseCommand(rawCommand);
    if (!parsed) {
      return [];
    }

    const candidates = [];
    // Normalize forward slashes to platform separator before trying anything
    const normalizedCmd = path.normalize(parsed.command);

    candidates.push({
      command: normalizedCmd,
      baseArgs: parsed.baseArgs,
      source: 'configured (normalized)'
    });

    const resolvedPath = path.resolve(normalizedCmd);
    if (resolvedPath !== normalizedCmd) {
      candidates.push({
        command: resolvedPath,
        baseArgs: parsed.baseArgs,
        source: 'configured (resolved)'
      });
    }

    if (process.platform === 'win32') {
      const base = normalizedCmd;
      // Try .exe / .cmd / .bat variants when extension is missing
      if (!/\.(exe|cmd|bat)$/i.test(base)) {
        candidates.push({ command: `${base}.exe`, baseArgs: parsed.baseArgs, source: 'configured (.exe)' });
        candidates.push({ command: `${base}.cmd`, baseArgs: parsed.baseArgs, source: 'configured (.cmd)' });
        if (resolvedPath !== base) {
          candidates.push({ command: `${resolvedPath}.exe`, baseArgs: parsed.baseArgs, source: 'configured (resolved .exe)' });
        }
      }
      // Some Windows venvs create whisper-script.py alongside whisper.exe
      const scriptPath = base + '-script.py';
      candidates.push({ command: 'python', baseArgs: [scriptPath, ...parsed.baseArgs], source: 'configured (script.py)' });
      // Try using the venv's own python with -m whisper
      const venvPython = path.join(path.dirname(base), 'python.exe');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python -m whisper)' });
      }
    } else {
      // On Unix, try the directory's python3 with -m whisper if the configured path looks like a venv entry point
      const venvPython3 = path.join(path.dirname(normalizedCmd), 'python3');
      if (fs.existsSync(venvPython3)) {
        candidates.push({ command: venvPython3, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python3 -m whisper)' });
      }
      const venvPython = path.join(path.dirname(normalizedCmd), 'python');
      if (fs.existsSync(venvPython)) {
        candidates.push({ command: venvPython, baseArgs: ['-m', 'whisper', ...parsed.baseArgs], source: 'configured (venv python -m whisper)' });
      }
    }

    return candidates;
  }

  _parseCommand(rawCommand) {
    // Respect double-quoted segments so Windows userData paths like
    // "C:\Users\CANDAN SINGH\...\python.exe" survive intact.
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return null;
    }
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [trimmed];
    const normalized = parts.map((p) => p.replace(/^"|"$/g, '')).filter(Boolean);
    if (normalized.length === 0) {
      return null;
    }

    return {
      command: normalized[0],
      baseArgs: normalized.slice(1)
    };
  }

  _validateWhisperCandidate(candidate) {
    if (!candidate || !this._validateWhisperCommand(candidate.command)) return false;
    const args = Array.isArray(candidate.baseArgs) ? candidate.baseArgs.map(String) : [];
    if (args.some((arg) => ['-c', '--command', '-e', '--eval'].includes(arg))) return false;
    const moduleIndex = args.indexOf('-m');
    return moduleIndex < 0 || args[moduleIndex + 1] === 'whisper';
  }

  _startMicrophoneCapture() {
    if (!recorder || typeof recorder.record !== 'function') {
      this.emit('error', 'Local microphone capture dependency is missing. Run npm install to restore speech recording support.');
      return;
    }

    // node-record-lpcm16 only ships two recorder modules: `sox` and `arecord`.
    // `recorder` is the option it actually reads (the old `recordProgram` name
    // was silently ignored, so every attempt fell back to sox). Each entry maps
    // the recorder module to the binary we must verify is on PATH.
    //   - macOS: sox (via Homebrew)
    //   - Linux: arecord (ALSA, usually preinstalled) then sox
    const candidates = process.platform === 'darwin'
      ? [{ recorder: 'sox', bin: 'sox' }]
      : [{ recorder: 'arecord', bin: 'arecord' }, { recorder: 'sox', bin: 'sox' }];
    this._startMicrophoneCaptureWithFallback(candidates);
  }

  /**
   * Whether an audio capture binary is on PATH. node-record-lpcm16 spawns
   * these directly and, when the binary is missing, emits an `error` on its
   * child process with no listener — which would otherwise crash the whole
   * app. We pre-filter to binaries that exist so the library never receives a
   * missing program.
   */
  _audioProgramExists(bin) {
    try {
      const r = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        [bin],
        { windowsHide: true, timeout: 4000, env: this._buildChildEnv() }
      );
      return r.status === 0;
    } catch (_) {
      return false;
    }
  }

  _startMicrophoneCaptureWithFallback(candidates) {
    const available = candidates.filter((c) => this._audioProgramExists(c.bin));

    if (available.length === 0) {
      const hint = process.platform === 'darwin'
        ? 'Install one with `brew install sox`.'
        : process.platform === 'linux'
          ? 'Install one with `sudo apt install alsa-utils` (arecord) or `sudo apt install sox`.'
          : 'No supported microphone capture tool was found.';
      logger.warn('No audio capture program available', {
        tried: candidates.map((c) => c.bin),
        platform: process.platform,
      });
      this.isRecording = false;
      this.emit('error', `Microphone capture needs sox or arecord, but none was found. ${hint}`);
      return;
    }

    const queue = [...available];

    const tryNextProgram = () => {
      const candidate = queue.shift();
      if (!candidate) {
        this.isRecording = false;
        this.emit('error', 'Could not start microphone capture with any available audio program');
        return;
      }

      const program = candidate.bin;
      try {
        this.recording = recorder.record({
          sampleRate: 16000,
          sampleRateHertz: 16000,
          channels: 1,
          threshold: 0,
          verbose: false,
          recorder: candidate.recorder,
          silence: '10.0s'
        });

        const stream = this.recording.stream();
        this.audioProgram = program;

        // Guard the spawned child process directly. A spawn failure (e.g. the
        // binary disappeared between our probe and the spawn, or a permission
        // error) emits `error` on the child, which node-record-lpcm16 leaves
        // unhandled — fatal without this listener.
        const child = this.recording.process;
        if (child && typeof child.on === 'function') {
          child.on('error', (error) => {
            logger.error('Audio recording process error', { error: error.message, program });
            if (this.recording) {
              try { this.recording.stop(); } catch (_) { /* ignore */ }
              this.recording = null;
            }
            if (this.isRecording) tryNextProgram();
          });
        }

        stream.on('error', (error) => {
          logger.error('Audio recording stream error', { error: error.message, program });
          if (this.recording) {
            try {
              this.recording.stop();
            } catch (stopError) {
              logger.error('Error stopping failed recording program', { error: stopError.message });
            }
            this.recording = null;
          }

          if (this.isRecording) {
            tryNextProgram();
          }
        });

        stream.on('data', (chunk) => {
          this._handleAudioChunk(chunk);
        });
      } catch (error) {
        logger.error('Failed to start microphone capture program', { program, error: error.message });
        tryNextProgram();
      }
    };

    tryNextProgram();
  }

  _handleAudioChunk(chunk) {
    if (!chunk || !chunk.length || (!this.isRecording && !this.isFinalizing)) {
      return;
    }

    if (this.provider === 'azure' && this.pushStream) {
      try {
        this.pushStream.write(chunk);
      } catch (error) {
        logger.error('Error writing audio data to Azure push stream', { error: error.message });
      }
      return;
    }

    if (this.provider === 'whisper') {
      this.recordAudioChunk(chunk.length);
      this._markLatencyEvent('firstAudioAt');
      this._ingestWhisperAudio(Buffer.from(chunk));
    }
  }

  async _flushWhisperSegment({ final, reason = final ? 'final' : 'utterance' }) {
    const hasAudio = this.segmentBytes > 0;
    const sessionId = this.recordingSessionId;
    if (!hasAudio) {
      if (final) {
        await this._waitForWhisperFlushes(sessionId);
      }
      return;
    }

    const audioBuffer = Buffer.concat(this.segmentBuffers, this.segmentBytes);
    const sequence = ++this._whisperSegmentSequence;
    const durationMs = Math.round(audioBuffer.length / 32);
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.segmentAudioMs = 0;
    this._queueTranscriptionSegment(sessionId);

    return this._enqueueWhisperSegment(audioBuffer, {
      sessionId,
      sequence,
      reason,
      final,
      sourceSegments: [{ audioBuffer, sequence, durationMs, reason }]
    });
  }

  _enqueueWhisperSegment(audioBuffer, options = {}) {
    if (this._getEffectiveWhisperEngine() !== 'faster') {
      return this._enqueueWhisperSegmentSequential(audioBuffer, options);
    }
    return this._enqueueWhisperBatchSegment(audioBuffer, options);
  }

  _enqueueWhisperBatchSegment(audioBuffer, options = {}) {
    const sessionId = options.sessionId ?? this.recordingSessionId;
    const sourceSegments = options.sourceSegments?.length
      ? options.sourceSegments
      : [{ audioBuffer, sequence: options.sequence ?? ++this._whisperSegmentSequence }];
    const sequence = options.sequence ?? sourceSegments[0].sequence;
    const durationMs = Math.round(audioBuffer.length / 32);
    const tracked = {
      sessionId,
      sequence,
      audioBuffer,
      durationMs,
      reason: options.reason || 'segment',
      final: options.final === true,
      sourceSegments,
      sourceSegmentCount: sourceSegments.length,
      deferFailureOutcome: options.deferFailureOutcome === true,
      tailBatchIndex: options.tailBatchIndex || 0,
      tailBatchTotal: options.tailBatchTotal || 0,
      started: false,
      batchQueued: false,
      cancelled: false,
      settled: false,
      promise: null,
      _resolve: null,
      _reject: null,
    };

    tracked.promise = new Promise((resolve, reject) => {
      tracked._resolve = (value) => {
        if (!tracked.settled) {
          tracked.settled = true;
          resolve(value);
        }
      };
      tracked._reject = (error) => {
        if (!tracked.settled) {
          tracked.settled = true;
          reject(error);
        }
      };
    });

    const cleanup = () => {
      this._activeWhisperFlushes.delete(tracked);
      this.activeTranscriptionCount = this._activeWhisperFlushes.size;
      this.transcriptionInFlight = this.activeTranscriptionCount > 0;
    };
    tracked.promise.then(cleanup, cleanup);
    this._activeWhisperFlushes.add(tracked);
    this.activeTranscriptionCount = this._activeWhisperFlushes.size;
    this.transcriptionInFlight = true;

    this._whisperBatchPending.push(tracked);
    if (tracked.final || this._whisperBatchPending.length >= this._getWhisperBatchSize()) {
      this._scheduleWhisperBatchFlush(0);
    } else {
      this._scheduleWhisperBatchFlush(this._getWhisperBatchTimeoutMs());
    }
    return tracked.promise;
  }

  _scheduleWhisperBatchFlush(delayMs) {
    if (!this._whisperBatchPending.length) {
      return;
    }
    if (delayMs <= 0) {
      this._clearWhisperBatchTimer();
      this._whisperBatchFlushScheduled = true;
      this._flushWhisperBatch().catch((error) => {
        logger.error('Faster Whisper batch flush failed', { error: error.message });
      });
      return;
    }
    if (this._whisperBatchTimer) {
      return;
    }
    this._whisperBatchTimer = setTimeout(() => {
      this._whisperBatchTimer = null;
      this._whisperBatchFlushScheduled = true;
      this._flushWhisperBatch().catch((error) => {
        logger.error('Faster Whisper timed batch flush failed', { error: error.message });
      });
    }, delayMs);
  }

  async _flushWhisperBatch() {
    this._clearWhisperBatchTimer();
    this._whisperBatchFlushScheduled = false;
    if (!this._whisperBatchPending.length) {
      return;
    }

    const batch = this._whisperBatchPending.splice(0, this._getWhisperBatchSize());
    batch.forEach((tracked) => { tracked.batchQueued = true; });
    const activeBatch = batch.filter((tracked) => !tracked.cancelled);
    if (!activeBatch.length) {
      return;
    }

    const run = async () => {
      this._whisperBatchRunning = true;
      activeBatch.forEach((tracked) => { tracked.started = true; });
      try {
        let results;
        try {
          results = await this._transcribeWhisperBuffersInBatch(activeBatch);
        } catch (error) {
          logger.warn('Faster Whisper batch failed; retrying individual segments', {
            segmentCount: activeBatch.length,
            error: error.message,
          });
          for (const tracked of activeBatch) {
            await this._runWhisperTracked(tracked, () => this._transcribeWhisperBuffer(tracked.audioBuffer));
          }
          return;
        }

        for (let index = 0; index < activeBatch.length; index += 1) {
          const tracked = activeBatch[index];
          const result = Array.isArray(results) ? results[index] : null;
          if (result && result.ok) {
            await this._runWhisperTracked(tracked, () => result.text || '');
          } else {
            await this._runWhisperTracked(tracked, () => this._transcribeWhisperBuffer(tracked.audioBuffer));
          }
        }
      } finally {
        this._whisperBatchRunning = false;
        if (this._whisperBatchPending.length && !this.isFinalizing) {
          this._scheduleWhisperBatchFlush(
            this._whisperBatchPending.length >= this._getWhisperBatchSize()
              ? 0
              : this._getWhisperBatchTimeoutMs()
          );
        }
      }
    };

    const taskPromise = this._whisperFlushQueue.then(run, run);
    this._whisperFlushQueue = taskPromise.catch(() => undefined);
    return taskPromise;
  }

  async _runWhisperTracked(tracked, transcribe) {
    if (tracked.cancelled) {
      if (tracked._resolve) tracked._resolve();
      return;
    }

    tracked.started = true;
    this._whisperRunningSegment = tracked;
    this._emitTranscriptionProgress({
      state: 'transcribing',
      phase: tracked.sourceSegmentCount > 1 ? 'draining' : (this.isFinalizing ? 'draining' : 'recording'),
      finalizing: this.isFinalizing,
      currentLabel: tracked.sourceSegmentCount > 1
        ? 'Transcribing remaining audio ' + (tracked.tailBatchIndex || 1) + '/' + (tracked.tailBatchTotal || 1)
        : ''
    });

    let succeeded = false;
    try {
      const transcript = await transcribe();
      succeeded = true;
      if (tracked.sessionId !== this.recordingSessionId) {
        logger.debug('Ignored stale Whisper batch transcription result', {
          reason: tracked.reason,
          sessionId: tracked.sessionId,
          durationMs: tracked.durationMs,
        });
        if (tracked._resolve) tracked._resolve();
        return;
      }

      const clean = transcript ? transcript.trim() : '';
      const isHallucination = clean && this._isHallucinatedTranscript(clean);
      if (clean && !isHallucination) {
        const partial = !tracked.final && tracked.reason !== 'final' && tracked.reason !== 'final-batch' && tracked.reason !== 'final-retry';
        if (partial) {
          this._markLatencyEvent('firstPartialAt');
        }
        this.emit('transcription', clean, {
          partial,
          reason: tracked.reason,
          sessionId: tracked.sessionId,
          segmentSequence: tracked.sequence,
          consolidated: tracked.sourceSegmentCount > 1,
          sourceSegmentCount: tracked.sourceSegmentCount,
          backendRequested: this._lastWhisperRuntime?.backendRequested || this._getWhisperCppBackend(),
          backendUsed: this._lastWhisperRuntime?.backend || null,
          gpuName: this._lastWhisperRuntime?.gpuName || '',
          latency: this._getLatencyMetrics(),
        });
      } else if (isHallucination) {
        logger.debug('Dropped likely Whisper silence hallucination', {
          reason: tracked.reason,
          durationMs: tracked.durationMs,
        });
      }
      if (tracked._resolve) tracked._resolve();
    } catch (error) {
      logger.error('Whisper batch segment transcription failed', {
        error: error.message,
        reason: tracked.reason,
        durationMs: tracked.durationMs,
      });
      if (tracked.final) {
        if (tracked._reject) tracked._reject(error);
      } else if (tracked._resolve) {
        tracked._resolve();
      }
    } finally {
      if (this._whisperRunningSegment === tracked) {
        this._whisperRunningSegment = null;
      }
      if (succeeded || !tracked.deferFailureOutcome) {
        this._recordTranscriptionSegmentOutcome(tracked.sessionId, succeeded, tracked.sourceSegmentCount);
      }
    }
  }

  _clearWhisperBatchTimer() {
    if (this._whisperBatchTimer) {
      clearTimeout(this._whisperBatchTimer);
      this._whisperBatchTimer = null;
    }
    this._whisperBatchFlushScheduled = false;
  }

  _settleCancelledWhisperTracked(tracked) {
    if (!tracked) {
      return;
    }
    tracked.cancelled = true;
    if (tracked._resolve) {
      tracked._resolve();
    }
  }
  _enqueueWhisperSegmentSequential(audioBuffer, options = {}) {
    const sessionId = options.sessionId ?? this.recordingSessionId;
    const sourceSegments = options.sourceSegments?.length
      ? options.sourceSegments
      : [{ audioBuffer, sequence: options.sequence ?? ++this._whisperSegmentSequence }];
    const sequence = options.sequence ?? sourceSegments[0].sequence;
    const durationMs = Math.round(audioBuffer.length / 32);
    const tracked = {
      sessionId,
      sequence,
      audioBuffer,
      durationMs,
      reason: options.reason || 'segment',
      final: options.final === true,
      sourceSegments,
      sourceSegmentCount: sourceSegments.length,
      deferFailureOutcome: options.deferFailureOutcome === true,
      tailBatchIndex: options.tailBatchIndex || 0,
      tailBatchTotal: options.tailBatchTotal || 0,
      started: false,
      cancelled: false,
      promise: null
    };

    const run = async () => {
      if (tracked.cancelled) {
        return;
      }
      tracked.started = true;
      this._whisperRunningSegment = tracked;
      this._emitTranscriptionProgress({
        state: 'transcribing',
        phase: tracked.sourceSegmentCount > 1 ? 'draining' : (this.isFinalizing ? 'draining' : 'recording'),
        finalizing: this.isFinalizing,
        currentLabel: tracked.sourceSegmentCount > 1
          ? 'Transcribing remaining audio ' + (tracked.tailBatchIndex || 1) + '/' + (tracked.tailBatchTotal || 1)
          : ''
      });

      let succeeded = false;
      try {
        const transcript = await this._transcribeWhisperBuffer(audioBuffer);
        succeeded = true;
        if (sessionId !== this.recordingSessionId) {
          logger.debug('Ignored stale Whisper transcription result', {
            reason: tracked.reason,
            sessionId,
            durationMs
          });
          return;
        }

        const clean = transcript ? transcript.trim() : '';
        const isHallucination = clean && this._isHallucinatedTranscript(clean);
        if (clean && !isHallucination) {
          const partial = !tracked.final && tracked.reason !== 'final' && tracked.reason !== 'final-batch' && tracked.reason !== 'final-retry';
          if (partial) {
            this._markLatencyEvent('firstPartialAt');
          }
          this.emit('transcription', clean, {
            partial,
            reason: tracked.reason,
            sessionId,
            segmentSequence: tracked.sequence,
          consolidated: tracked.sourceSegmentCount > 1,
          sourceSegmentCount: tracked.sourceSegmentCount,
          backendRequested: this._lastWhisperRuntime?.backendRequested || this._getWhisperCppBackend(),
          backendUsed: this._lastWhisperRuntime?.backend || null,
          gpuName: this._lastWhisperRuntime?.gpuName || '',
          latency: this._getLatencyMetrics()
          });
        } else if (isHallucination) {
          logger.debug('Dropped likely Whisper silence hallucination', {
            reason: tracked.reason,
            durationMs
          });
        }
        logger.debug('Whisper segment flush completed', {
          reason: tracked.reason,
          final: tracked.final,
          bytes: audioBuffer.length,
          durationMs,
          sessionId,
          sourceSegmentCount: tracked.sourceSegmentCount,
          emitted: !!(clean && !isHallucination)
        });
      } catch (error) {
        logger.error('Whisper segment transcription failed', {
          error: error.message,
          reason: tracked.reason,
          durationMs
        });
        if (tracked.final) {
          throw error;
        }
      } finally {
        if (this._whisperRunningSegment === tracked) {
          this._whisperRunningSegment = null;
        }
        if (succeeded || !tracked.deferFailureOutcome) {
          this._recordTranscriptionSegmentOutcome(sessionId, succeeded, tracked.sourceSegmentCount);
        }
      }
    };

    const taskPromise = this._whisperFlushQueue.then(run, run);
    this._whisperFlushQueue = taskPromise.catch(() => undefined);
    tracked.promise = taskPromise;
    this._activeWhisperFlushes.add(tracked);
    this.activeTranscriptionCount = this._activeWhisperFlushes.size;
    this.transcriptionInFlight = true;
    const cleanup = () => {
      this._activeWhisperFlushes.delete(tracked);
      this.activeTranscriptionCount = this._activeWhisperFlushes.size;
      this.transcriptionInFlight = this.activeTranscriptionCount > 0;
    };
    taskPromise.then(cleanup, cleanup);
    return taskPromise;
  }

  async _waitForWhisperFlushes(sessionId) {
    while (true) {
      const pending = [...this._activeWhisperFlushes]
        .filter((flush) => flush.sessionId === sessionId)
        .map((flush) => flush.promise);
      if (!pending.length) {
        return;
      }
      await Promise.allSettled(pending);
    }
  }

  /**
   * Whisper reliably hallucinates a small set of stock phrases when fed near-
   * silence or non-speech audio (training-data artifacts from video captions).
   * VAD already prevents most silent flushes; this is the final guard so these
   * phantom phrases never reach the chat or the LLM.
   */
  _isHallucinatedTranscript(text) {
    const normalized = text.toLowerCase().replace(/[\s.,!?¡¿"'`]+/g, ' ').trim();
    if (!normalized) {
      return true;
    }
    const HALLUCINATIONS = new Set([
      'thank you',
      'obrigado',
      'obrigada',
      'valeu',
      'de nada',
      'tchau',
      'thank you for watching',
      'thanks for watching',
      'thank you so much for watching',
      'please subscribe',
      'like and subscribe',
      'you',
      'bye',
      'bye bye',
      'okay',
      'ok',
      'so',
      'the end',
      'subtitles by the amara org community'
    ]);
    return HALLUCINATIONS.has(normalized);
  }

  async _transcribeWhisperBuffer(audioBuffer) {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'opencluely-whisper-'));
    const audioFilePath = path.join(tempDir, 'segment.wav');
    const startedAt = Date.now();

    try {
      await fsPromises.writeFile(audioFilePath, this._createWavBuffer(audioBuffer));
      logger.debug('Whisper segment WAV prepared', {
        durationMs: Math.round(audioBuffer.length / 32),
        wavWriteMs: Date.now() - startedAt,
      });
      return await this._transcribeWhisperFile(audioFilePath);
    } finally {
      await this._removeTempDir(tempDir);
    }
  }

  async _transcribeWhisperBuffersInBatch(trackedBatch) {
    if (!Array.isArray(trackedBatch) || !trackedBatch.length) {
      return [];
    }

    const tempDirs = [];
    const audioPaths = [];
    try {
      for (const tracked of trackedBatch) {
        const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'opencluely-whisper-batch-'));
        const audioFilePath = path.join(tempDir, 'segment.wav');
        tempDirs.push(tempDir);
        await fsPromises.writeFile(audioFilePath, this._createWavBuffer(tracked.audioBuffer));
        audioPaths.push(audioFilePath);
      }
      return await this._transcribeWithPersistentWorkerBatch(audioPaths);
    } finally {
      for (const tempDir of tempDirs) {
        await this._removeTempDir(tempDir);
      }
    }
  }

  async _transcribeWhisperFile(audioFilePath) {
    const engine = this._getEffectiveWhisperEngine();
    const launch = engine === 'faster' ? this.fasterWhisperLaunch
      : (engine === 'whisper-cpp' ? this.whisperCppLaunch : this.whisperCommand);
    if (!launch) {
      throw new Error('Local Whisper engine not configured');
    }

    const startedAt = Date.now();
    try {
      const result = await this._transcribeWithPersistentWorker(audioFilePath);
      logger.debug('Persistent Whisper transcription completed', {
        workerTranscribeMs: result.transcribeMs,
        wallClockMs: Date.now() - startedAt,
      });
      return result.text;
    } catch (workerError) {
      if (!this._whisperWorkerFallbackLogged) {
        this._whisperWorkerFallbackLogged = true;
        logger.warn('Persistent Whisper worker failed; using CLI fallback', {
          error: workerError.message,
        });
      }
      if (engine === 'whisper-cpp' && this._initializeFasterWhisperClient()) {
        return this._transcribeWhisperFile(audioFilePath);
      }
      if (!this._initializeOpenAiWhisperClient('Persistent Whisper worker failed; using OpenAI CLI fallback')) {
        throw workerError;
      }
      return this._transcribeWhisperFileWithCli(audioFilePath);
    }
  }

  async _transcribeWhisperFileWithCli(audioFilePath) {
    const startedAt = Date.now();
    const outputDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'opencluely-whisper-out-'));
    const args = [
      ...this.whisperCommand.baseArgs,
      audioFilePath,
      '--model', this._getWhisperModel(),
      '--language', this._getWhisperLanguage(),
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', outputDir,
      '--verbose', 'False',
      '--fp16', 'False'
    ];

    if (this._getWhisperModelDir()) {
      args.push('--model_dir', this._getWhisperModelDir());
    }

    try {
      await new Promise((resolve, reject) => {
        if (!this._validateWhisperCommand(this.whisperCommand.command)) {
          reject(new Error('Refusing to spawn untrusted Whisper command: ' + this.whisperCommand.command));
          return;
        }
        const child = spawn(this.whisperCommand.command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env: this._buildChildEnv(),
        });

        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr = (stderr + chunk.toString()).slice(-4000);
        });

        child.on('error', (error) => {
          reject(error);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(stderr.trim() || 'Whisper exited with code ' + code));
        });
      });

      const transcriptPath = path.join(outputDir, path.parse(audioFilePath).name + '.txt');
      let transcript = '';
      try {
        transcript = (await fsPromises.readFile(transcriptPath, 'utf8')).trim();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      logger.debug('Whisper CLI transcription completed', {
        wallClockMs: Date.now() - startedAt,
      });
      return transcript;
    } finally {
      await this._removeTempDir(outputDir);
    }
  }

  _createWavBuffer(rawPcmBuffer) {
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + rawPcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(rawPcmBuffer.length, 40);

    return Buffer.concat([header, rawPcmBuffer]);
  }

  async _removeTempDir(tempDir) {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.error('Failed to remove Whisper temp directory', {
        tempDir,
        error: error.message
      });
    }
  }
}

module.exports = new SpeechService();
