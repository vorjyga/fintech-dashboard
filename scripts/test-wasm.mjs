import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const WORDS = 7;
const BYTES = WORDS * Uint32Array.BYTES_PER_ELEMENT;
const files = ['assembly/build/market.debug.wasm', 'public/wasm/market.wasm'];

async function instantiate(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      abort: () => {
        throw new Error('Unexpected AssemblyScript abort');
      },
    },
  });
  return instance.exports;
}

function readBatch(wasm, size) {
  const pointer = wasm.generateBatch(size);
  assert.ok(pointer > 0);
  assert.equal(pointer % 4, 0);
  assert.equal(wasm.getBatchLength(), size);
  assert.ok(pointer + size * BYTES <= wasm.memory.buffer.byteLength);
  // Copy: the ABI buffer is reused by the next call.
  return new Uint32Array(wasm.memory.buffer, pointer, size * WORDS).slice();
}

function validateBatch(words, count, previousBids) {
  for (let offset = 0; offset < words.length; offset += WORDS) {
    const [id, price, quantity, bid, ask, bidQuantity, askQuantity] = words.subarray(
      offset,
      offset + WORDS,
    );
    assert.ok(id < count);
    assert.ok(bid >= 1 && bid <= 1_000_000);
    assert.ok(ask - bid >= 1 && ask - bid <= 20);
    assert.ok(price === bid || price === ask);
    assert.ok(quantity >= 1 && quantity <= 1000);
    assert.ok(bidQuantity <= 10_000 && askQuantity <= 10_000);
    assert.ok(Math.abs(bid - previousBids[id]) <= 5);
    previousBids[id] = bid;
  }
}

for (const file of files) {
  const bytes = await readFile(file);
  describe(file, () => {
    test('exports the numeric ABI and does not import host randomness', async () => {
      assert.equal(WebAssembly.validate(bytes), true);
      const wasm = await instantiate(bytes);
      for (const name of ['abiVersion', 'init', 'generateBatch', 'getBatchLength']) {
        assert.equal(typeof wasm[name], 'function');
      }
      assert.equal(wasm.abiVersion(), 1);
      assert.ok(wasm.memory instanceof WebAssembly.Memory);
      assert.equal(wasm.memory.buffer.byteLength, 65536);
      assert.ok(
        WebAssembly.Module.imports(new WebAssembly.Module(bytes)).every(
          (entry) => entry.module === 'env' && entry.name === 'abort',
        ),
      );
    });

    test('rejects generation before init and invalid instrument counts', async () => {
      const wasm = await instantiate(bytes);
      assert.equal(wasm.generateBatch(1), 0);
      assert.equal(wasm.getBatchLength(), 0);
      for (const count of [-2147483648, -1, 0, 51, 2147483647]) {
        assert.notEqual(wasm.init(count, 1), 0);
        assert.equal(wasm.generateBatch(1), 0);
      }
      for (let count = 1; count <= 50; count++) assert.equal(wasm.init(count, 1), 0);
    });

    test('returns every supported batch size and valid continuous updates for every instrument count', async () => {
      const wasm = await instantiate(bytes);
      for (let count = 1; count <= 50; count++) {
        assert.equal(wasm.init(count, count), 0);
        const previous = Array.from({ length: count }, (_, id) => 10000 + id * 1000);
        for (const size of [1, 2, 100, 999, 1000])
          validateBatch(readBatch(wasm, size), count, previous);
      }
      wasm.init(5, 1);
      for (let size = 1; size <= 1000; size++) readBatch(wasm, size);
    });

    test('matches the fixed seed vector and little-endian record layout', async () => {
      const wasm = await instantiate(bytes);
      wasm.init(5, 1);
      const pointer = wasm.generateBatch(1);
      const record = new DataView(wasm.memory.buffer, pointer, BYTES);
      const words = Array.from({ length: WORDS }, (_, index) => record.getUint32(index * 4, true));
      assert.deepEqual(words, [4, 13998, 234, 13996, 13998, 962, 2245]);
    });

    test('repeats identical seeds across independent instances and varies different seeds', async () => {
      const first = await instantiate(bytes);
      const second = await instantiate(bytes);
      for (const seed of [0, 1, 0xdeadbeef, 0xffffffff]) {
        first.init(50, seed);
        second.init(50, seed);
        for (const size of [1, 100, 1000])
          assert.deepEqual(readBatch(first, size), readBatch(second, size));
      }
      first.init(5, 1);
      second.init(5, 2);
      assert.notDeepEqual(readBatch(first, 100), readBatch(second, 100));
    });

    test('maps seed zero to a fixed nonzero seed without degenerating', async () => {
      const first = await instantiate(bytes);
      const second = await instantiate(bytes);
      first.init(5, 0);
      second.init(5, 0x6d2b79f5);
      const words = readBatch(first, 100);
      assert.deepEqual(words, readBatch(second, 100));
      const ids = new Set(Array.from(words).filter((_, index) => index % WORDS === 0));
      assert.equal(ids.size, 5);
    });

    test('continues PRNG and instrument prices across arbitrary batch boundaries', async () => {
      const split = await instantiate(bytes);
      const whole = await instantiate(bytes);
      split.init(50, 0xffffffff);
      whole.init(50, 0xffffffff);
      const parts = [1, 37, 400, 562].map((size) => readBatch(split, size));
      assert.deepEqual(new Uint32Array(parts.flatMap((part) => [...part])), readBatch(whole, 1000));
      assert.deepEqual(readBatch(split, 100), readBatch(whole, 100));
    });

    test('reinitialization resets prices, random state and batch length after changing count', async () => {
      const wasm = await instantiate(bytes);
      wasm.init(5, 123);
      const expected = readBatch(wasm, 1000);
      wasm.init(50, 456);
      readBatch(wasm, 1000);
      wasm.init(1, 789);
      readBatch(wasm, 1000);
      wasm.init(5, 123);
      assert.equal(wasm.getBatchLength(), 0);
      assert.deepEqual(readBatch(wasm, 1000), expected);
    });

    test('invalid batches clear length without changing prices, PRNG or buffer data', async () => {
      const first = await instantiate(bytes);
      const second = await instantiate(bytes);
      first.init(5, 123);
      second.init(5, 123);
      assert.deepEqual(readBatch(first, 100), readBatch(second, 100));
      for (const size of [-2147483648, -1, 0, 1001, 2147483647]) {
        const before = new Uint8Array(first.memory.buffer).slice();
        assert.equal(first.generateBatch(size), 0);
        assert.equal(first.getBatchLength(), 0);
        assert.deepEqual(new Uint8Array(first.memory.buffer), before);
      }
      assert.deepEqual(readBatch(first, 100), readBatch(second, 100));
    });

    test('invalid init preserves an existing valid run', async () => {
      const first = await instantiate(bytes);
      const second = await instantiate(bytes);
      first.init(5, 123);
      second.init(5, 123);
      assert.deepEqual(readBatch(first, 100), readBatch(second, 100));
      for (const count of [0, -1, 51]) assert.notEqual(first.init(count, 456), 0);
      assert.equal(first.getBatchLength(), 100);
      assert.deepEqual(readBatch(first, 1000), readBatch(second, 1000));
    });

    test('clamps bids at both boundaries using controlled initial memory', async () => {
      const wasm = await instantiate(bytes);
      for (const boundary of [1, 1_000_000]) {
        wasm.init(1, 1);
        // The freshly zeroed module has one unique initial price. Seed it at an extreme
        // to test bounds in real Wasm without adding production-only test exports.
        const memory = new Uint32Array(wasm.memory.buffer);
        const matches = [];
        for (let index = 0; index < memory.length; index++)
          if (memory[index] === 10000) matches.push(index);
        assert.equal(matches.length, 1);
        memory[matches[0]] = boundary;
        const words = readBatch(wasm, 1000);
        validateBatch(words, 1, [boundary]);
        assert.ok(
          Array.from(words).some((value, index) => index % WORDS === 3 && value === boundary),
        );
      }
    });

    test('reuses one buffer without growing or replacing memory over 2000 maximum batches', async () => {
      const wasm = await instantiate(bytes);
      wasm.init(50, 1);
      const memory = wasm.memory.buffer;
      const pointer = wasm.generateBatch(1000);
      const initial = new Uint32Array(memory, pointer, 1000 * WORDS).slice();
      for (let index = 0; index < 2000; index++) {
        assert.equal(wasm.generateBatch(1000), pointer);
        assert.equal(wasm.getBatchLength(), 1000);
        assert.equal(wasm.memory.buffer, memory);
      }
      assert.notDeepEqual(new Uint32Array(memory, pointer, 1000 * WORDS), initial);
      assert.equal(memory.byteLength, 65536);
    });
  });
}

test('debug and release modules produce identical sequences', async () => {
  const debug = await instantiate(await readFile(files[0]));
  const release = await instantiate(await readFile(files[1]));
  for (const seed of [0, 1, 0xdeadbeef, 0xffffffff]) {
    debug.init(50, seed);
    release.init(50, seed);
    for (const size of [1, 100, 1000])
      assert.deepEqual(readBatch(debug, size), readBatch(release, size));
  }
});
