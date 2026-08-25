require('dotenv').config();

const speechService = require('../src/services/speech.service');
const path = require('path');
const fs = require('fs');

async function main() {
  speechService.updateSettings({ speechProvider: 'whisper', whisperEngine: 'faster' });
  speechService.initializeClient();
  const status = speechService.getStatus();

  console.log('Speech provider:', status.provider);
  console.log('Initialized:', status.isInitialized);
  console.log('Available:', speechService.isAvailable());
  console.log('Whisper engine:', status.effectiveSettings.whisperEngine);
  console.log('Faster device:', status.effectiveSettings.whisperFasterDevice);
  console.log('Faster compute type:', status.effectiveSettings.whisperFasterComputeType);
  console.log('Periodic flush (ms):', status.effectiveSettings.whisperPeriodicFlushMs || '5000');

  const workerPath = path.resolve(__dirname, 'faster-whisper-worker.py');
  const workerSource = fs.readFileSync(workerPath, 'utf8');
  console.log('Worker present:', workerSource.includes('WhisperModel'));

  try {
    const connection = await speechService.testConnection();
    console.log('Connection test:', JSON.stringify(connection, null, 2));
  } catch (error) {
    console.error('Connection test failed:', error.message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
