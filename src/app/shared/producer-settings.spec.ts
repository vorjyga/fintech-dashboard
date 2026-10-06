import { DEFAULT_PRODUCER_SETTINGS } from './contracts';
import { isValidProducerSettings } from './producer-settings';

describe('Shared settings validation', () => {
  it('accepts defaults and inclusive bounds', () => {
    expect(isValidProducerSettings(DEFAULT_PRODUCER_SETTINGS)).toBe(true);
    expect(
      isValidProducerSettings({ instrumentCount: 1, updatesPerBatch: 1, batchIntervalMs: 50 }),
    ).toBe(true);
    expect(
      isValidProducerSettings({
        instrumentCount: 50,
        updatesPerBatch: 1000,
        batchIntervalMs: 2000,
      }),
    ).toBe(true);
  });
  it('rejects non-integers, missing values and values outside each range', () => {
    for (const key of ['instrumentCount', 'updatesPerBatch', 'batchIntervalMs']) {
      for (const value of [null, undefined, '', '5', 1.5, NaN, Infinity, -Infinity, -1, 0, 2001]) {
        expect(isValidProducerSettings({ ...DEFAULT_PRODUCER_SETTINGS, [key]: value })).toBe(false);
      }
    }
    expect(isValidProducerSettings({ ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 51 })).toBe(
      false,
    );
    expect(isValidProducerSettings({ ...DEFAULT_PRODUCER_SETTINGS, updatesPerBatch: 1001 })).toBe(
      false,
    );
    expect(isValidProducerSettings({ ...DEFAULT_PRODUCER_SETTINGS, batchIntervalMs: 49 })).toBe(
      false,
    );
  });
  it('rejects missing and non-object settings', () => {
    for (const value of [null, undefined, 5, 'settings', {}, []])
      expect(isValidProducerSettings(value)).toBe(false);
  });
});
