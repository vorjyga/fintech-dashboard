/// <reference lib="webworker" />

import { ProducerCommand } from '../shared/contracts';
import { createInitializationHandler } from './initialize-run';

const initialize = createInitializationHandler((event) => postMessage(event));
addEventListener('message', ({ data }: MessageEvent<ProducerCommand>) => {
  // Seed creation is the only randomness outside Wasm; all market decisions run in the module.
  const command =
    data.type === 'start' ? { ...data, seed: crypto.getRandomValues(new Uint32Array(1))[0] } : data;
  void initialize(command);
});
