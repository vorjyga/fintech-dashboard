/// <reference lib="webworker" />

import type { ProducerCommand } from '../shared/contracts';
import { ProducerController } from './producer-controller';
import { loadWasm } from './wasm-loader';

const producer = new ProducerController({
  load: loadWasm,
  now: () => performance.now(),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer as number),
  send: (event) => postMessage(event),
});
addEventListener('message', ({ data }: MessageEvent<ProducerCommand>) => {
  // Seed creation is the only randomness outside Wasm; market decisions run in the module.
  const command =
    data.type === 'start' ? { ...data, seed: crypto.getRandomValues(new Uint32Array(1))[0] } : data;
  void producer.handle(command);
});
