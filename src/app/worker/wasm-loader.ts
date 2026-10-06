import { WASM_ABI_VERSION, MarketWasmExports, ProducerErrorStage } from '../shared/contracts';

export class WasmInitializationError extends Error {
  constructor(
    public readonly stage: ProducerErrorStage,
    message: string,
  ) {
    super(message);
    this.name = 'WasmInitializationError';
  }
}

/** ArrayBuffer instantiation also works on hosts that serve Wasm with a generic MIME type. */
export async function loadWasm(wasmUrl: string, signal?: AbortSignal): Promise<MarketWasmExports> {
  let bytes: ArrayBuffer;
  try {
    const response = await fetch(wasmUrl, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = await response.arrayBuffer();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new WasmInitializationError(
      'load',
      `Could not download the market module: ${errorMessage(error)}`,
    );
  }

  let exports: WebAssembly.Exports;
  try {
    signal?.throwIfAborted();
    const result = await WebAssembly.instantiate(bytes, {
      env: {
        abort: (_message: number, _file: number, line: number, column: number): never => {
          throw new WasmInitializationError(
            'runtime',
            `The market module aborted at ${line}:${column}.`,
          );
        },
      },
    });
    signal?.throwIfAborted();
    exports = result.instance.exports;
  } catch (error) {
    if (signal?.aborted || error instanceof WasmInitializationError) throw error;
    throw new WasmInitializationError(
      'instantiate',
      `Could not initialize the market module: ${errorMessage(error)}`,
    );
  }

  if (
    !(exports['memory'] instanceof WebAssembly.Memory) ||
    typeof exports['abiVersion'] !== 'function'
  ) {
    throw new WasmInitializationError(
      'abi',
      'The market module is missing its memory or ABI version export.',
    );
  }
  const wasm = exports as MarketWasmExports;
  let version: number;
  try {
    version = wasm.abiVersion();
  } catch (error) {
    if (error instanceof WasmInitializationError) throw error;
    throw new WasmInitializationError(
      'runtime',
      `Could not read the market ABI: ${errorMessage(error)}`,
    );
  }
  if (version !== WASM_ABI_VERSION) {
    throw new WasmInitializationError(
      'abi',
      `Unsupported market ABI ${version}; expected ${WASM_ABI_VERSION}.`,
    );
  }
  for (const name of ['init', 'generateBatch', 'getBatchLength']) {
    if (typeof exports[name] !== 'function') {
      throw new WasmInitializationError('abi', `The market module is missing its ${name} export.`);
    }
  }
  return wasm;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
