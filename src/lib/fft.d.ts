declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    createComplexArray(): number[];
    transform(out: number[], input: number[]): void;
    inverseTransform(out: number[], input: number[]): void;
  }
}
