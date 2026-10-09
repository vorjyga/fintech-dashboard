import { vi } from 'vitest';
import type { ProducerEvent } from '../../shared/contracts';

export class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();

  send(data: ProducerEvent): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}
