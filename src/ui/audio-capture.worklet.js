class OpenCluelyAudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = options.processorOptions && options.processorOptions.bufferSize || 2048;
    this.pending = new Float32Array(this.bufferSize);
    this.pendingOffset = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!input) return true;

    if (output) output.set(input);

    let offset = 0;
    while (offset < input.length) {
      const remaining = this.bufferSize - this.pendingOffset;
      const count = Math.min(remaining, input.length - offset);
      this.pending.set(input.subarray(offset, offset + count), this.pendingOffset);
      this.pendingOffset += count;
      offset += count;

      if (this.pendingOffset === this.bufferSize) {
        const pcm16 = new Int16Array(this.bufferSize);
        for (let i = 0; i < this.bufferSize; i += 1) {
          const sample = Math.max(-1, Math.min(1, this.pending[i]));
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this.pendingOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor('opencluely-audio-capture', OpenCluelyAudioCaptureProcessor);
