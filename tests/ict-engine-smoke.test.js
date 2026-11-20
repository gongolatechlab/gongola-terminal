import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateTerminalEngine
} from '../src/ict-machine/engine/terminal-adapter.js';

test('ICT Machine engine loads successfully', () => {
  assert.equal(typeof evaluateTerminalEngine, 'function');
});

test('ICT Machine engine is disabled by default', () => {
  const result = evaluateTerminalEngine();

  assert.equal(result.status, 'disabled');
  assert.equal(result.reason, 'FEATURE_FLAG_OFF');
  assert.deepEqual(result.events, []);
});

test('Simulated market data cannot activate the engine', () => {
  const result = evaluateTerminalEngine({
    enabled: true,
    source: 'simulated'
  });

  assert.equal(result.status, 'disabled');
  assert.equal(result.reason, 'UNVERIFIED_MARKET_DATA');
  assert.deepEqual(result.events, []);
});
