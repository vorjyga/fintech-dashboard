const FIRST_SYMBOLS = ['ALFA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'] as const;

export function instrumentSymbol(instrumentId: number): string {
  return FIRST_SYMBOLS[instrumentId] ?? `INST${String(instrumentId + 1).padStart(3, '0')}`;
}
