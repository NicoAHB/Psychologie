import FFT from 'fft.js';

/** Whisper's 400-point periodic Hann STFT and Slaney-normalized 80-bin mel bank.
 * Bluestein convolution preserves the 400-point spectrum (padding the FFT itself
 * to 512 would change the frequencies). All computation runs in the speech worker. */
export function whisperFeatures(audio: Float32Array): Float32Array<ArrayBuffer> {
  const n = 400, size = 1024, frames = 3000, bins = 201;
  const fft = new FFT(size), chirp = new Float64Array(n * 2);
  const kernel = fft.createComplexArray(), spectrum = fft.createComplexArray();
  const input = fft.createComplexArray(), transformed = fft.createComplexArray(), convolution = fft.createComplexArray();
  for (let i = 0; i < n; i++) {
    const angle = Math.PI * i * i / n, c = Math.cos(angle), s = Math.sin(angle);
    chirp[2 * i] = c; chirp[2 * i + 1] = -s;
    kernel[2 * i] = c; kernel[2 * i + 1] = s;
    if (i) { kernel[2 * (size - i)] = c; kernel[2 * (size - i) + 1] = s; }
  }
  fft.transform(spectrum, kernel);
  const toMel = (hz: number) => hz < 1000 ? hz / (200 / 3) : 15 + Math.log(hz / 1000) / (Math.log(6.4) / 27);
  const fromMel = (mel: number) => mel < 15 ? mel * (200 / 3) : 1000 * Math.exp((mel - 15) * Math.log(6.4) / 27);
  const edges = Array.from({ length: 82 }, (_, i) => fromMel(toMel(8000) * i / 81));
  const filters = Array.from({ length: 80 }, (_, m) => Array.from({ length: bins }, (_, k) => {
    const hz = k * 40;
    return Math.max(0, Math.min((hz - edges[m]) / (edges[m + 1] - edges[m]), (edges[m + 2] - hz) / (edges[m + 2] - edges[m + 1]))) * 2 / (edges[m + 2] - edges[m]);
  }));
  const window = Float64Array.from({ length: n }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / n));
  const power = new Float64Array(bins), mel = new Float32Array(80 * frames);
  let peak = -Infinity;
  // Reflect at the beginning, then zero-pad the waveform to 30 seconds.
  const sample = (i: number) => { if (i < 0) i = -i; return i < audio.length ? audio[i] : 0; };
  for (let frame = 0; frame < frames; frame++) {
    input.fill(0);
    for (let i = 0; i < n; i++) {
      const x = sample(frame * 160 + i - 200) * window[i];
      input[2 * i] = x * chirp[2 * i]; input[2 * i + 1] = x * chirp[2 * i + 1];
    }
    fft.transform(transformed, input);
    for (let i = 0; i < size * 2; i += 2) {
      const re = transformed[i], im = transformed[i + 1];
      transformed[i] = re * spectrum[i] - im * spectrum[i + 1]; transformed[i + 1] = re * spectrum[i + 1] + im * spectrum[i];
    }
    fft.inverseTransform(convolution, transformed);
    for (let k = 0; k < bins; k++) power[k] = convolution[2 * k] ** 2 + convolution[2 * k + 1] ** 2;
    for (let m = 0; m < 80; m++) {
      let sum = 0; for (let k = 0; k < bins; k++) sum += power[k] * filters[m][k];
      const log = Math.log10(Math.max(1e-10, sum)); mel[m * frames + frame] = log; peak = Math.max(peak, log);
    }
  }
  for (let i = 0; i < mel.length; i++) mel[i] = (Math.max(mel[i], peak - 8) + 4) / 4;
  return mel;
}

export function resampleSpeech(input: Float32Array, rate: number): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(rate) || rate < 16000 || rate > 192000 || input.length > rate * 21) throw new Error('speechOfflineError');
  if (rate === 16000) return new Float32Array(input);
  // Area averaging for downsampling, including fractional boundary samples.
  const ratio = rate / 16000, out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = i * ratio, end = (i + 1) * ratio; let sum = 0;
    for (let j = Math.floor(start); j < end; j++) sum += input[j] * (Math.min(end, j + 1) - Math.max(start, j));
    out[i] = sum / ratio;
  }
  return out;
}
