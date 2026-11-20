import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectICTMachine
} from '../src/ict-machine/integration.js';

const input = {
  enabled: true,
  source: 'verified',
  candles: [{ time: 100 }],
  detectionCandles: [{ time: 100 }],
  obOptions: {},
  fvgOptions: {},
};

test('Real engine rejects unsupported symbol', () => {
  const result = inspectICTMachine({
    ...input,
    symbol: 'UNKNOWN',
    timeframeMinutes: 15,
  });

  assert.equal(
    result.reason,
    'REFERENCE_SYMBOL_NOT_SUPPORTED'
  );

  assert.deepEqual(result.signals, []);
});

test('Real engine rejects unsupported timeframe', () => {
  const result = inspectICTMachine({
    ...input,
    symbol: 'FOREXCOM:XAUUSD',
    timeframeMinutes: 5,
  });

  assert.equal(
    result.reason,
    'UNSUPPORTED_TIMEFRAME'
  );

  assert.deepEqual(result.signals, []);
});
