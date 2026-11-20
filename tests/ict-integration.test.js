import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectICTMachine } from '../src/ict-machine/integration.js';

test('ICT Machine is disabled by default', () => {
  assert.equal(inspectICTMachine().status, 'disabled');
});

test('Simulated data cannot generate signals', () => {
  const result = inspectICTMachine({
    enabled: true,
    source: 'simulated',
    candles: [{ time: 100 }],
  });
  assert.equal(result.status, 'unverified-data');
  assert.deepEqual(result.signals, []);
});

test('Empty verified data is rejected', () => {
  const result = inspectICTMachine({
    enabled: true,
    source: 'verified',
    candles: [],
  });
  assert.equal(result.status, 'invalid-data');
});

test('Verified data cannot bypass missing engine', () => {
  const result = inspectICTMachine({
    enabled: true,
    source: 'verified',
    candles: [{ time: 100 }],
  });
  assert.equal(result.status, 'engine-not-connected');
  assert.deepEqual(result.signals, []);
});
