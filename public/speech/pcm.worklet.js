// Microphone samples stay in memory on this device; no recording or networking.
class PraxisraumPcm extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Float32Array(2048); this.offset = 0;
    this.port.onmessage = event => {
      if (event.data === 'flush') { if (this.offset) this.port.postMessage(this.samples.slice(0, this.offset)); this.offset = 0; this.port.postMessage('flushed'); }
    };
  }
  process(inputs) {
    const mono = inputs[0]?.[0];
    if (mono) for (const sample of mono) {
      this.samples[this.offset++] = sample;
      if (this.offset === this.samples.length) {
        this.port.postMessage(this.samples, [this.samples.buffer]); this.samples = new Float32Array(2048); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('praxisraum-pcm', PraxisraumPcm);
