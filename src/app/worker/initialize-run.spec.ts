import { ProducerCommand } from '../shared/contracts';
import { createInitializationHandler } from './initialize-run';
import { loadWasm, WasmInitializationError } from './wasm-loader';

const load = vi.fn<typeof loadWasm>();
const wasm = { memory: new WebAssembly.Memory({ initial: 1 }), abiVersion: () => 1 };
const command = (runId: number): ProducerCommand => ({
  type: 'start',
  runId,
  settings: { instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 500 },
  seed: 1,
  wasmUrl: '/wasm/market.wasm',
});

describe('Worker initialization handler', () => {
  afterEach(() => vi.resetAllMocks());

  it('sends ready only after Wasm execution succeeds', async () => {
    load.mockResolvedValue(wasm);
    const send = vi.fn();
    await createInitializationHandler(send, load)(command(1));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'ready', runId: 1, abiVersion: 1 });
  });

  it('cancels and ignores a superseded load even if it finishes later', async () => {
    let completeOld!: (value: typeof wasm) => void;
    load
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeOld = resolve;
          }),
      )
      .mockResolvedValueOnce(wasm);
    const send = vi.fn();
    const initialize = createInitializationHandler(send, load);
    const old = initialize(command(1));
    const oldSignal = load.mock.calls[0][1];
    await initialize(command(2));
    expect(oldSignal?.aborted).toBe(true);
    completeOld(wasm);
    await old;
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'ready', runId: 2, abiVersion: 1 });
  });

  it('preserves the error stage and runId', async () => {
    load.mockRejectedValue(new WasmInitializationError('abi', 'Unsupported ABI'));
    const send = vi.fn();
    await createInitializationHandler(send, load)(command(3));
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'error',
      runId: 3,
      stage: 'abi',
      message: 'Unsupported ABI',
    });
  });
});
