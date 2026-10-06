const MAX_INSTRUMENTS: i32 = 50;
const MAX_BATCH_SIZE: i32 = 1000;
const RECORD_BYTES: i32 = 28;
const ZERO_SEED_FALLBACK: u32 = 0x6d2b79f5;

// Only static storage: 50 bid prices and one reusable buffer of 1000 records.
const bids: usize = memory.data(MAX_INSTRUMENTS * sizeof<u32>());
const batch: usize = memory.data(MAX_BATCH_SIZE * RECORD_BYTES);
let instrumentCount: i32 = 0;
let randomState: u32 = ZERO_SEED_FALLBACK;
let batchLength: i32 = 0;

export function abiVersion(): i32 {
  return 1;
}

/** Invalid initialization preserves the previous run; 0 means success. */
export function init(count: i32, seed: u32): i32 {
  if (count < 1 || count > MAX_INSTRUMENTS) return 1;
  instrumentCount = count;
  randomState = seed == 0 ? ZERO_SEED_FALLBACK : seed;
  batchLength = 0;
  memory.fill(batch, 0, <usize>(MAX_BATCH_SIZE * RECORD_BYTES));
  memory.fill(bids, 0, MAX_INSTRUMENTS * sizeof<u32>());
  for (let id: i32 = 0; id < count; id++) {
    store<u32>(bids + <usize>id * sizeof<u32>(), <u32>(10000 + id * 1000));
  }
  return 0;
}

/** xorshift32, with logical unsigned shifts and persistent nonzero state. */
function nextRandom(): u32 {
  let value = randomState;
  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;
  randomState = value;
  return value;
}

/** The returned memory is overwritten by the next successful call or init. */
export function generateBatch(size: i32): usize {
  if (instrumentCount == 0 || size < 1 || size > MAX_BATCH_SIZE) {
    batchLength = 0;
    return 0;
  }

  for (let index: i32 = 0; index < size; index++) {
    const id: u32 = nextRandom() % <u32>instrumentCount;
    const bidPointer = bids + <usize>id * sizeof<u32>();
    const step: i32 = <i32>(nextRandom() % 11) - 5;
    const bid: i32 = min<i32>(1000000, max<i32>(1, load<i32>(bidPointer) + step));
    store<i32>(bidPointer, bid);
    const ask: u32 = <u32>bid + 1 + nextRandom() % 20;
    const price: u32 = (nextRandom() & 1) == 0 ? <u32>bid : ask;
    const quantity: u32 = 1 + nextRandom() % 1000;
    const bidQuantity: u32 = nextRandom() % 10001;
    const askQuantity: u32 = nextRandom() % 10001;

    // Seven little-endian u32 words, in shared MarketUpdate field order.
    const record = batch + <usize>(index * RECORD_BYTES);
    store<u32>(record, id, 0);
    store<u32>(record, price, 4);
    store<u32>(record, quantity, 8);
    store<u32>(record, <u32>bid, 12);
    store<u32>(record, ask, 16);
    store<u32>(record, bidQuantity, 20);
    store<u32>(record, askQuantity, 24);
  }
  batchLength = size;
  return batch;
}

export function getBatchLength(): i32 {
  return batchLength;
}
