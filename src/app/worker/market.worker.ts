/// <reference lib="webworker" />

import { ProducerCommand } from '../shared/contracts';
import { createInitializationHandler } from './initialize-run';

const initialize = createInitializationHandler((event) => postMessage(event));
addEventListener('message', ({ data }: MessageEvent<ProducerCommand>) => {
  void initialize(data);
});
