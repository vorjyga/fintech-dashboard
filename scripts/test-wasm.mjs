import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const file of ['assembly/build/market.debug.wasm', 'public/wasm/market.wasm']) {
  test(`${file}: real Wasm exports memory and ABI version 1`, async () => {
    const bytes = await readFile(file);
    assert.equal(WebAssembly.validate(bytes), true);
    const { instance } = await WebAssembly.instantiate(bytes, {
      env: {
        abort: () => {
          throw new Error('Unexpected AssemblyScript abort');
        },
      },
    });
    assert.ok(instance.exports.memory instanceof WebAssembly.Memory);
    assert.ok(instance.exports.memory.buffer.byteLength >= 65536);
    assert.equal(instance.exports.abiVersion(), 1);
    assert.equal(instance.exports.abiVersion(), 1);
  });
}
