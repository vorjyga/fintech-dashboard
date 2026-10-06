# Worker logic

`market.worker.ts` is the Angular CLI entry point. It supplies native timers, performance.now, postMessage and the Wasm loader to `ProducerController`, and creates a fresh seed for each start.

`producer-controller.ts` replaces the earlier initialization-only handler. It validates settings, cancels superseded loading, initializes Wasm and fresh metrics, and manages one sequential timer. Every batch is consumed into `MarketAggregator` before buffer reuse. Ordinary snapshots are limited to once per 100 ms. Pause emits the final snapshot; Resume preserves the generator and totals and schedules a full interval later. Errors stop the run; restart/dispose cancel timers and pending fetches.

`wasm-loader.ts` downloads an ArrayBuffer, supplies the AssemblyScript abort handler, instantiates the module and checks all ABI exports. `market-aggregator.ts` owns exact cumulative metrics without trade history.

Sequence numbers increase within each run. Initial running status uses commandId 0; control acknowledgements echo positive IDs. Commands during loading and stale run/command IDs are ignored. Canceled callbacks are rejected using a timer version even after resume.

`testing/fake-clock.ts` supports unit/integration tests without real waits. The real-Wasm controller test exercises 50 instruments, 1000 updates and a 50 ms interval.
