// tests/data-validation.test.js
import test from 'node:test';
import assert from 'node:assert';
import { validateOHLC } from '../src/data-validation.js';

test('valid candles pass validation', () => {
  const candles = [
    { time: 1000, open: 10, high: 12, low: 9, close: 11 },
    { time: 2000, open: 11, high: 13, low: 10, close: 12 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

test('missing fields are detected', () => {
  const candles = [{ time: 1000, open: 10, high: 12, low: 9 }]; // missing close
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('Missing field: close')));
});

test('NaN and Infinity are rejected', () => {
  const candles = [
    { time: 1000, open: NaN, high: 12, low: 9, close: 11 },
    { time: 2000, open: 11, high: Infinity, low: 10, close: 12 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('open must be a finite number')));
  assert.ok(result.errors.some(e => e.reason.includes('high must be a finite number')));
});

test('invalid OHLC relationships are caught', () => {
  const candles = [
    { time: 1000, open: 10, high: 8, low: 9, close: 11 }, // high < open and high < low
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('high must be greater than or equal to open')));
  assert.ok(result.errors.some(e => e.reason.includes('high must be greater than or equal to low')));
});

test('duplicate timestamps are rejected', () => {
  const candles = [
    { time: 1000, open: 10, high: 12, low: 9, close: 11 },
    { time: 1000, open: 11, high: 13, low: 10, close: 12 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('time must be strictly greater')));
});

test('descending timestamps are rejected', () => {
  const candles = [
    { time: 2000, open: 10, high: 12, low: 9, close: 11 },
    { time: 1000, open: 11, high: 13, low: 10, close: 12 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('time must be strictly greater')));
});

test('empty input is handled', () => {
  const result = validateOHLC([]);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

test('non-array input is handled', () => {
  const result = validateOHLC('not an array');
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('Input must be an array')));
});

// Regression tests for Phase 1.1

test('invalid price at T=300 followed by valid T=200 fails on timestamp', () => {
  const candles = [
    { time: 300, open: NaN, high: 12, low: 9, close: 11 },
    { time: 200, open: 11, high: 13, low: 10, close: 12 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('time must be strictly greater')));
});

test('missing OHLC field at T=300 followed by T=200 fails on timestamp', () => {
  const candles = [
    { time: 300, open: 10, high: 12, low: 9 }, // missing close
    { time: 200, open: 11, high: 13, low: 10, close: 12 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('time must be strictly greater')));
});

test('fractional timestamps fail', () => {
  const candles = [
    { time: 1000.5, open: 10, high: 12, low: 9, close: 11 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.reason.includes('time must be a finite integer number')));
});

test('invalid timestamp values fail', () => {
  const candles = [
    { time: '1000', open: 10, high: 12, low: 9, close: 11 },
    { time: NaN, open: 11, high: 13, low: 10, close: 12 },
    { time: Infinity, open: 10, high: 12, low: 9, close: 11 },
  ];
  const result = validateOHLC(candles);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.errors.filter(e => e.reason === 'time must be a finite integer number').length, 3);
});
