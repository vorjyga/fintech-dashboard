# Application services

`WasmInitialization` is a root service for the stage 2 integration. It creates one worker, derives the Wasm URL from `document.baseURI`, observes worker messages/errors through RxJS and exposes a readonly status Signal. Retry replaces the worker; replacement and application destruction unsubscribe event listeners and terminate the worker.

Stage 6 extends/replaces this initialization service with settings, snapshots and producer controls. Pages share the root service and must not create producers of their own.
