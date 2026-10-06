/** Shared across Angular and the worker; no framework dependencies. */
export interface ProducerSettings {
  instrumentCount: number;
  updatesPerBatch: number;
  batchIntervalMs: number;
}

export const DEFAULT_PRODUCER_SETTINGS: Readonly<ProducerSettings> = Object.freeze({
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
});

export interface MarketUpdate {
  instrumentId: number;
  priceCents: number;
  tradeQuantity: number;
  bidCents: number;
  askCents: number;
  bidQuantity: number;
  askQuantity: number;
}

export interface InstrumentSnapshot {
  instrumentId: number;
  symbol: string;
  lastPriceCents: number | null;
  spreadCents: number | null;
  volume: bigint;
  vwap: { numeratorCents: bigint; denominator: bigint } | null;
  imbalance: number | null;
}

export const WASM_ABI_VERSION = 1;
export const MARKET_UPDATE_WORDS = 7;
export const MARKET_UPDATE_BYTES = MARKET_UPDATE_WORDS * Uint32Array.BYTES_PER_ELEMENT;

export interface MarketWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  abiVersion(): number;
  init(instrumentCount: number, seed: number): number;
  generateBatch(size: number): number;
  getBatchLength(): number;
}

export type ProducerCommand =
  | { type: 'start'; runId: number; settings: ProducerSettings; seed: number; wasmUrl: string }
  | { type: 'pause' | 'resume'; runId: number; commandId: number };

export type ProducerErrorStage = 'settings' | 'load' | 'instantiate' | 'abi' | 'runtime';

export type ProducerEvent =
  | { type: 'ready'; runId: number; abiVersion: number }
  | { type: 'snapshot'; runId: number; sequence: number; rows: InstrumentSnapshot[] }
  | { type: 'status'; runId: number; commandId: number; status: 'running' | 'paused' }
  | { type: 'error'; runId: number; stage: ProducerErrorStage; message: string };
