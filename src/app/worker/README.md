# Worker logic

`market.worker.ts` is the Angular CLI worker entry point. `initialize-run.ts` cancels superseded loads and sends typed ready/error events. `wasm-loader.ts` downloads an ArrayBuffer, supplies the AssemblyScript abort handler, instantiates the module and checks memory, version and all generator function exports.

For each start the Worker creates a fresh seed with crypto.getRandomValues and calls the Wasm init export with the instrument count. Stage 3 provides the tested generator; stages 4–5 add aggregation and scheduled generation. Pause/resume commands are reserved in the protocol; this stage does not implement them.
