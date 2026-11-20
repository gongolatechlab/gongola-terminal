import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ingestXAUUSD15mHistorical
} from '../src/ict-machine/historical-feed.js';

const start = Date.UTC(2026, 10, 18, 12);

const price = time => ({
  time,
  open: 4000,
  high: 4002,
  low: 3998,
  close: 4001
});

const envelope = (candles, overrides = {}) => ({
  metadata: {
    provider: 'FOREXCOM',
    symbol: 'XAUUSD',
    timeframeMinutes: 15,
    timeUnit: 'ms',
    historical: true,
    simulated: false,
    ...overrides
  },
  candles
});

const run = payload =>
  ingestXAUUSD15mHistorical(payload, {
    asOfMs: start + 12 * 3600000
  });

test('accepts closed millisecond OHLC without signals', () => {
  const result = run(envelope([
    price(start),
    price(start + 900000)
  ]));

  assert.equal(result.status, 'validated-but-unverified');
  assert.equal(result.canGenerateSignals, false);
  assert.deepEqual(result.gaps, []);
  assert.equal(result.candles[0].time, start);
});

test('converts explicit UTC seconds', () => {
  const result = run(envelope(
    [price(start / 1000)],
    { timeUnit: 's' }
  ));

  assert.equal(result.candles[0].time, start);
});

test('rejects simulated declarations', () => {
  assert.throws(
    () => run(envelope(
      [price(start)],
      { simulated: true }
    )),
    /nonsimulated/
  );
});

test('rejects provider mismatch', () => {
  assert.throws(
    () => run(envelope(
      [price(start)],
      { provider: 'OTHER' }
    )),
    /FOREXCOM/
  );
});

test('rejects timestamp scale mismatch', () => {
  assert.throws(
    () => run(envelope([price(start / 1000)])),
    /timestamp scale/
  );
});

test('rejects duplicate and reversed timestamps', () => {
  assert.throws(
    () => run(envelope([
      price(start),
      price(start)
    ])),
    /timestamp/
  );

  assert.throws(
    () => run(envelope([
      price(start + 900000),
      price(start)
    ])),
    /timestamp/
  );
});

test('rejects misaligned candle opens', () => {
  assert.throws(
    () => run(envelope([price(start + 60000)])),
    /opening boundary/
  );
});

test('rejects unfinished candles', () => {
  assert.throws(
    () => ingestXAUUSD15mHistorical(
      envelope([price(start)]),
      { asOfMs: start + 300000 }
    ),
    /Unclosed/
  );
});

test('preserves gaps without filling them', () => {
  const result = run(envelope([
    price(start),
    price(start + 2700000)
  ]));

  assert.equal(result.candles.length, 2);
  assert.equal(result.gaps[0].missingIntervals, 2);
});

test('rejects invalid OHLC', () => {
  assert.throws(
    () => run(envelope([
      { ...price(start), high: 3990 }
    ])),
    /OHLC/
  );
});
