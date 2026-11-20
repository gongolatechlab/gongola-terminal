/**
 * Gongola V0.99 historical research: source-derived swing and daily DOL subset.
 * 15m closed OHLC in ascending order, UTC opening time in milliseconds.
 * No signal generation, no BOS/MSS, no HTF Minor DOL/RPDS.
 */

function assertBars(bars) {
  if (!Array.isArray(bars)) throw new TypeError('Candles must be an array.');
  let last = -Infinity;
  for (const [index, b] of bars.entries()) {
    if (!b || !Number.isSafeInteger(b.time) || b.time <= last ||
        ![b.open, b.high, b.low, b.close].every(Number.isFinite) ||
        b.high < Math.max(b.open, b.low, b.close) ||
        b.low > Math.min(b.open, b.high, b.close)) {
      throw new Error(`Invalid candle at index ${index}.`);
    }
    last = b.time;
  }
}

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
});

/** NY 00:00 day key, DST-aware; not a fixed UTC offset. */
export function newYorkDay(ms) {
  const parts = Object.fromEntries(nyFormatter.formatToParts(new Date(ms))
    .filter(p => ['year', 'month', 'day'].includes(p.type)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * V0.99 DOL historical subset: previous NY day's high becomes BSL, low becomes SSL
 * on the first bar of the new NY day. High >= BSL / Low <= SSL mitigates, freezing
 * the line at that bar. Track caps mirror source defaults: 20 active / 3 mitigated
 * per direction. The current incomplete NY day never becomes a DOL pair.
 */
export function calculatePriorDayLiquidity(bars, {
  maxUnmitigated = 20, maxMitigated = 3,
} = {}) {
  assertBars(bars);
  for (const [name, value] of Object.entries({maxUnmitigated, maxMitigated})) {
    if (!Number.isInteger(value) || value < (name === 'maxMitigated' ? 0 : 1))
      throw new RangeError(`Invalid ${name}`);
  }
  const activeBSL = [], activeSSL = [], touchedBSL = [], touchedSSL = [];
  let day = null, prev = null;
  let created = 0;
  for (const b of bars) {
    const key = newYorkDay(b.time);
    if (key !== day) {
      if (prev) {
        activeBSL.push({type:'BSL', price:prev.high, fromDay:day,
          anchorTime:prev.highAt, startTime:b.time, endTime:b.time,
          mitigated:false, touchedAt:null});
        activeSSL.push({type:'SSL', price:prev.low, fromDay:day,
          anchorTime:prev.lowAt, startTime:b.time, endTime:b.time,
          mitigated:false, touchedAt:null});
        created += 2;
      }
      day = key;
      prev = {high:b.high, low:b.low, highAt:b.time, lowAt:b.time};
    } else {
      if (b.high > prev.high) {prev.high = b.high; prev.highAt = b.time;}
      if (b.low < prev.low) {prev.low = b.low; prev.lowAt = b.time;}
    }
    // Check every active line (including a newly created line) on the current bar.
    for (const [arr, touched, mitigates] of [
      [activeBSL, touchedBSL, level => b.high >= level],
      [activeSSL, touchedSSL, level => b.low <= level],
    ]) {
      for (let i = 0; i < arr.length;) {
        const item = arr[i];
        item.endTime = b.time;
        if (mitigates(item.price)) {
          item.mitigated = true;
          item.touchedAt = b.time;
          touched.push(item);
          arr.splice(i, 1);
        } else i++;
      }
      while (arr.length > maxUnmitigated) arr.shift();
      while (touched.length > maxMitigated) touched.shift();
    }
  }
  return {
    lines: [...activeBSL, ...activeSSL, ...touchedBSL, ...touchedSSL],
    activeBSL:activeBSL.length, activeSSL:activeSSL.length,
    mitigatedBSL:touchedBSL.length, mitigatedSSL:touchedSSL.length,
    totalCreated:created,
  };
}

/**
 * Swing marker subset of V0.99: 1/1 pivot with >= / <= ties; high wins if both;
 * alternating H/L, with only a stronger consecutive same-type extreme surviving.
 * Each pivot appears only after its lookforward bar has CLOSED.
 */
export function calculateConfirmedSwings(bars, {
  lookback = 1, lookforward = 1, maxVisible = 70,
} = {}) {
  assertBars(bars);
  for (const x of [lookback, lookforward, maxVisible]) {
    if (!Number.isInteger(x) || x < 1 || x > 500) throw new RangeError('Invalid swing window or count.');
  }
  const points = [];
  for (let i = lookback; i + lookforward < bars.length; i++) {
    const b = bars[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (b.high < bars[i-j].high) isHigh = false;
      if (b.low > bars[i-j].low) isLow = false;
    }
    for (let j = 1; j <= lookforward; j++) {
      if (b.high < bars[i+j].high) isHigh = false;
      if (b.low > bars[i+j].low) isLow = false;
    }
    const type = isHigh ? 'high' : isLow ? 'low' : null;
    if (!type) continue;
    const level = type === 'high' ? b.high : b.low;
    const point = {type, price:level, time:b.time, confirmedAt:bars[i + lookforward].time};
    const prior = points.at(-1);
    if (prior?.type === type) {
      if ((type === 'high' && level > prior.price) || (type === 'low' && level < prior.price))
        points[points.length - 1] = point;
    } else points.push(point);
  }
  return points.slice(-maxVisible);
}
