# Worker logic

`market.worker.ts` is the Angular CLI worker entry point. `initialize-run.ts` cancels superseded loads and sends typed ready/error events. `wasm-loader.ts` downloads an ArrayBuffer, supplies the AssemblyScript abort handler, instantiates the module and checks memory, version and all generator function exports.

For each start the Worker creates a fresh seed with crypto.getRandomValues and calls the Wasm init export with the instrument count. Stage 3 provides the tested generator; stage 4 provides the framework-independent MarketAggregator; stage 5 adds scheduled generation and connects batches to the aggregator. Pause/resume commands are reserved in the protocol; this stage does not implement them.
