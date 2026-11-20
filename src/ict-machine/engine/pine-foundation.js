/** Gongola Terminal: isolated Pine-compatible candle foundation.
 * Timestamp contract: UTC milliseconds at candle OPEN; caller must supply
 * provider-aligned bars and HTF boundaries. No synthetic aggregation.
 * V0.99 uses request.security(..., expr[1], lookahead_on, gaps_off).
 */
const FIELDS = ['open', 'high', 'low', 'close'];
export function validateCandles(bars) {
  if (!Array.isArray(bars)) throw new TypeError('bars must be an array');
  let prev = -Infinity;
  return bars.map((bar, index) => {
    if (!bar || !Number.isSafeInteger(bar.time) || bar.time < 0 || bar.time <= prev) {
      throw new Error(`Invalid or unordered UTC millisecond timestamp at bar ${index}`);
    }
    for (const field of FIELDS) if (!Number.isFinite(bar[field])) {
      throw new Error(`Invalid ${field} at bar ${index}`);
    }
    if (bar.high < Math.max(bar.open, bar.close, bar.low) ||
        bar.low > Math.min(bar.open, bar.close, bar.high)) {
      throw new Error(`Invalid OHLC bounds at bar ${index}`);
    }
    prev = bar.time;
    return Object.freeze({...bar});
  });
}

export class PineSeries {
  constructor(bars) { this.bars = validateCandles(bars); }
  /** Pine source[lookback], relative to current chart bar. Missing => null (na). */
  at(barIndex, field, lookback = 0) {
    if (!FIELDS.includes(field) && field !== 'time') throw new Error(`Unknown field: ${field}`);
    if (!Number.isInteger(barIndex) || !Number.isInteger(lookback) || lookback < 0) throw new RangeError('Invalid bar index/lookback');
    return this.bars[barIndex - lookback]?.[field] ?? null;
  }
  /** SMA of preceding N bars, excludes current bar, returns na until enough data. */
  previousMeanRange(barIndex, length) {
    if (!Number.isInteger(length) || length <= 0) throw new RangeError('Invalid length');
    if (barIndex < length || barIndex >= this.bars.length) return null;
    let sum = 0;
    for (let i = barIndex - length; i < barIndex; i++) sum += this.bars[i].high - this.bars[i].low;
    return sum / length;
  }
}

/**
 * HTF bars must have exact provider-aligned open and end timestamps (UTC ms).
 * A bar is confirmed when chart bar OPEN >= its end. Returns last completed
 * HTF candle, matching expr[1]+lookahead_on on ordinary lower-TF historical bars.
 * This is NOT a complete request.security emulator (equal/higher TF, gaps,
 * realtime, irregular provider calendars require separate parity tests).
 */
export function confirmedHTFAt(chartOpenMs, htfBars) {
  if (!Number.isSafeInteger(chartOpenMs)) throw new TypeError('Invalid chart time');
  if (!Array.isArray(htfBars)) throw new TypeError('htfBars must be an array');
  let lo = 0, hi = htfBars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (htfBars[mid].end <= chartOpenMs) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? null : htfBars[lo - 1];
}
export function validateHTFBars(bars) {
  const validated = validateCandles(bars);
  let lastEnd = -Infinity;
  return validated.map((bar, i) => {
    if (!Number.isSafeInteger(bar.end) || bar.end <= bar.time || bar.time < lastEnd) {
      throw new Error(`Invalid HTF boundary at ${i}`);
    }
    lastEnd = bar.end;
    return bar;
  });
}

const clone = value => structuredClone(value);
/** Caller-supplied deterministic evaluator: (state, bar) => new state.
 * Preview always starts from committed state, preventing duplicate intrabar events.
 */
export class PineRollbackEngine {
  constructor(initialState, evaluate) {
    if (typeof evaluate !== 'function') throw new TypeError('evaluate must be a function');
    this.committed = clone(initialState);
    this.evaluate = evaluate;
    this.previewState = null;
  }
  preview(bar) {
    this.previewState = this.evaluate(clone(this.committed), clone(bar));
    return clone(this.previewState);
  }
  commit(bar) {
    this.committed = clone(this.evaluate(clone(this.committed), clone(bar)));
    this.previewState = null;
    return clone(this.committed);
  }
  snapshot() { return clone(this.committed); }
}
