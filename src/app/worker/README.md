# Worker logic

`market.worker.ts` is the Angular CLI worker entry point. `initialize-run.ts` cancels superseded loads and sends typed ready/error events. `wasm-loader.ts` downloads an ArrayBuffer, supplies the AssemblyScript abort handler, instantiates the module and checks memory and ABI exports.

Stages 3–5 add generation, aggregation and scheduling. Pause/resume commands are reserved in the protocol; this stage does not implement them.
