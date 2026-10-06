import { ProducerCommand, ProducerEvent } from '../shared/contracts';
import { errorMessage, loadWasm, WasmInitializationError } from './wasm-loader';

/** The handler owns pending loading; later stages add generator state and scheduling here. */
export function createInitializationHandler(
  send: (event: ProducerEvent) => void,
  load: typeof loadWasm = loadWasm,
) {
  let currentLoad: AbortController | undefined;
  return async (command: ProducerCommand): Promise<void> => {
    if (command.type !== 'start') return;
    currentLoad?.abort();
    const pendingLoad = new AbortController();
    currentLoad = pendingLoad;
    try {
      const wasm = await load(command.wasmUrl, pendingLoad.signal);
      if (currentLoad !== pendingLoad || pendingLoad.signal.aborted) return;
      if (wasm.init(command.settings.instrumentCount, command.seed) !== 0) {
        throw new WasmInitializationError(
          'settings',
          'The market module rejected the instrument count.',
        );
      }
      send({ type: 'ready', runId: command.runId, abiVersion: wasm.abiVersion() });
    } catch (error) {
      if (currentLoad !== pendingLoad || pendingLoad.signal.aborted) return;
      send({
        type: 'error',
        runId: command.runId,
        stage: error instanceof WasmInitializationError ? error.stage : 'runtime',
        message: errorMessage(error),
      });
    }
  };
}
