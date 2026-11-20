// Read-only historical OHLC input boundary.
// Provider labels are not proof of provenance.
// This module never authorizes trading signals.

import { validateCandles } from './engine/pine-foundation.js';

const BAR_MS = 15 * 60 * 1000;
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);

export function ingestXAUUSD15mHistorical(
  payload,
  { asOfMs = Date.now() } = {}
) {
  if (!payload || typeof payload !== 'object' ||
      Array.isArray(payload)) {
    throw new TypeError('Historical payload must be an object');
  }

  const { metadata, candles } = payload;

  if (!metadata ||
      metadata.provider !== 'FOREXCOM' ||
      metadata.symbol !== 'XAUUSD' ||
      metadata.timeframeMinutes !== 15) {
    throw new Error(
      'Expected declared FOREXCOM XAUUSD 15-minute history'
    );
  }

  if (metadata.simulated !== false ||
      metadata.historical !== true) {
    throw new Error(
      'Payload must declare nonsimulated historical data'
    );
  }

  if (metadata.timeUnit !== 's' &&
      metadata.timeUnit !== 'ms') {
    throw new Error('timeUnit must be explicit: s or ms');
  }

  if (!Number.isSafeInteger(asOfMs) ||
      asOfMs < MIN_MS || asOfMs >= MAX_MS) {
    throw new Error('Invalid asOfMs');
  }

  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error(
      'Historical candles must be a nonempty array'
    );
  }

  const converted = candles.map((bar, index) => {
    if (!bar || !Number.isSafeInteger(bar.time)) {
      throw new Error(
        `Invalid candle timestamp at index ${index}`
      );
    }

    const time = metadata.timeUnit === 's'
      ? bar.time * 1000
      : bar.time;

    if (!Number.isSafeInteger(time) ||
        time < MIN_MS || time >= MAX_MS) {
      throw new Error(
        `Unexpected timestamp scale at index ${index}`
      );
    }

    if (time % BAR_MS !== 0) {
      throw new Error(
        `Candle must use a 15-minute UTC opening boundary at index ${index}`
      );
    }

    if (time + BAR_MS > asOfMs) {
      throw new Error(
        `Unclosed or future candle at index ${index}`
      );
    }

    return {
      time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close
    };
  });

  // Reject malformed, duplicate and unordered candles.
  // Never sort, interpolate or manufacture missing data.
  const validated = validateCandles(converted);

  const gaps = [];

  for (let i = 1; i < validated.length; i++) {
    const delta = validated[i].time -
      validated[i - 1].time;

    if (delta % BAR_MS !== 0) {
      throw new Error(
        `Misaligned interval at index ${i}`
      );
    }

    if (delta > BAR_MS) {
      gaps.push({
        afterMs: validated[i - 1].time,
        beforeMs: validated[i].time,
        missingIntervals: delta / BAR_MS - 1
      });
    }
  }

  return {
    status: 'validated-but-unverified',
    canGenerateSignals: false,
    declaredProvider: 'FOREXCOM:XAUUSD',
    timeframeMinutes: 15,
    candles: validated,
    gaps
  };
}
