import { loadWasm } from './wasm-loader';

const generatorExports = { init: () => 0, generateBatch: () => 0, getBatchLength: () => 0 };
const emptyModule = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

function mockModule(exports: WebAssembly.Exports) {
  return vi
    .spyOn(WebAssembly, 'instantiate')
    .mockImplementation(async () => ({ instance: { exports } }) as never);
}

describe('Wasm loader', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(emptyModule)),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Checks ArrayBuffer loading with cancellation support and ABI validation.
  it('fetches an ArrayBuffer with cancellation and verifies the ABI', async () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const instantiate = mockModule({ ...generatorExports, memory, abiVersion: () => 1 });
    const controller = new AbortController();
    expect(
      (await loadWasm('https://example.test/wasm/market.wasm', controller.signal)).memory,
    ).toBe(memory);
    expect(fetch).toHaveBeenCalledWith('https://example.test/wasm/market.wasm', {
      signal: controller.signal,
      cache: 'no-cache',
    });
    expect(instantiate.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
  });

  // Checks HTTP error reporting without attempting to instantiate Wasm.
  it('reports HTTP errors without trying to instantiate', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const instantiate = vi.spyOn(WebAssembly, 'instantiate');
    await expect(loadWasm('/missing.wasm')).rejects.toMatchObject({
      stage: 'load',
      message: expect.stringContaining('HTTP 404'),
    });
    expect(instantiate).not.toHaveBeenCalled();
  });

  // Checks the correct error stage for network failures and invalid binary modules.
  it('reports network and invalid binary errors with their initialization stage', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'));
    await expect(loadWasm('/market.wasm')).rejects.toMatchObject({
      stage: 'load',
      message: expect.stringContaining('Offline'),
    });
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    await expect(loadWasm('/market.wasm')).rejects.toMatchObject({ stage: 'instantiate' });
  });

  // Checks rejection of modules with missing exports or incompatible ABI versions.
  it('rejects missing exports and incompatible ABI versions', async () => {
    const instantiate = mockModule({});
    await expect(loadWasm('/market.wasm')).rejects.toMatchObject({ stage: 'abi' });
    instantiate.mockImplementation(
      async () =>
        ({
          instance: {
            exports: { memory: new WebAssembly.Memory({ initial: 1 }), abiVersion: () => 2 },
          },
        }) as never,
    );
    await expect(loadWasm('/market.wasm')).rejects.toMatchObject({
      stage: 'abi',
      message: expect.stringContaining('expected 1'),
    });
  });

  // Checks rejection of a compatible ABI version without required generator functions.
  it('rejects an ABI version 1 module without the generator exports', async () => {
    mockModule({ memory: new WebAssembly.Memory({ initial: 1 }), abiVersion: () => 1 });
    await expect(loadWasm('/market.wasm')).rejects.toMatchObject({
      stage: 'abi',
      message: expect.stringContaining('init export'),
    });
  });

  // Checks that AssemblyScript abort becomes a meaningful runtime error.
  it('turns AssemblyScript abort into a meaningful runtime error', async () => {
    const instantiate = mockModule({
      ...generatorExports,
      memory: new WebAssembly.Memory({ initial: 1 }),
      abiVersion: () => 1,
    });
    await loadWasm('/market.wasm');
    const imports = instantiate.mock.calls[0][1] as {
      env: { abort: (message: number, file: number, line: number, column: number) => never };
    };
    expect(() => imports.env.abort(0, 0, 12, 4)).toThrow('aborted at 12:4');
  });

  // Checks that a cancelled load does not instantiate Wasm.
  it('does not instantiate after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const instantiate = vi.spyOn(WebAssembly, 'instantiate');
    await expect(loadWasm('/market.wasm', controller.signal)).rejects.toBeDefined();
    expect(instantiate).not.toHaveBeenCalled();
  });
});
