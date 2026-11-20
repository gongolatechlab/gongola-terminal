// Gongola ICT Machine integration.
// Disabled by default. TradingView parity is not verified.

import { evaluateTerminalEngine } from './engine/terminal-adapter.js';

export const ICT_MACHINE_ENABLED = false;

export function inspectICTMachine({
  enabled = ICT_MACHINE_ENABLED,
  source = 'simulated',
  candles = [],
  symbol,
  timeframeMinutes,
  detectionCandles,
  obOptions,
  fvgOptions,
  lifecycleOptions = {},
} = {}) {

  if (!enabled) {
    return { status: 'disabled', signals: [] };
  }

  if (source !== 'verified') {
    return { status: 'unverified-data', signals: [] };
  }

  if (!Array.isArray(candles) || candles.length === 0) {
    return { status: 'invalid-data', signals: [] };
  }

  if (
    !Array.isArray(detectionCandles) ||
    detectionCandles.length === 0 ||
    !obOptions ||
    !fvgOptions
  ) {
    return { status: 'engine-not-connected', signals: [] };
  }

  const result = evaluateTerminalEngine({
    enabled: true,
    source: 'verified-historical',
    symbol,
    timeframeMinutes,
    chartCandles: candles,
    detectionCandles,
    obOptions,
    fvgOptions,
    lifecycleOptions,
  });

  return {
    status: result.status,
    reason: result.reason,
    signals: [],
    events: result.events,
    drawings: result.drawings,
    diagnostics: result.diagnostics,
  };
}
