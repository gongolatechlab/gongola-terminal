import test from 'node:test';
import assert from 'node:assert';
import { prepareChartData } from '../src/prepare-data.js';

test('prepareChartData returns valid data and swings for valid candles', () => {
  const validCandles = [
    { time: 1000, open: 10, high: 12, low: 9, close: 11 },
    { time: 2000, open: 11, high: 13, low: 10, close: 12 },
    { time: 3000, open: 12, high: 14, low: 11, close: 13 },
    { time: 4000, open: 13, high: 15, low: 12, close: 14 },
    { time: 5000, open: 14, high: 20, low: 13, close: 18 }, // Swing High
    { time: 6000, open: 18, high: 19, low: 15, close: 16 },
    { time: 7000, open: 16, high: 17, low: 14, close: 15 },
    { time: 8000, open: 15, high: 16, low: 13, close: 14 },
    { time: 9000, open: 14, high: 15, low: 12, close: 13 },
  ];
  const result = prepareChartData(validCandles);
  
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.candles.length, 9);
  assert.ok(result.swings.length > 0);
  assert.strictEqual(result.errors.length, 0);
});

test('prepareChartData returns empty data and errors for invalid candles', () => {
  const invalidCandles = [
    { time: 1000, open: 10, high: 8, low: 9, close: 11 }, // Invalid OHLC
  ];
  const result = prepareChartData(invalidCandles);
  
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.candles.length, 0);
  assert.strictEqual(result.swings.length, 0);
  assert.ok(result.errors.length > 0);
});
