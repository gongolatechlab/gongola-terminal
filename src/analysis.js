// analysis.js
// Core math engine for the Gongola ICT Machine.
// All functions here are pure: they take data in, return results out.
// No DOM access, no side effects.

/**
 * Finds Swing Highs and Swing Lows in a given array of OHLC candles.
 * 
 * A Swing High is a candle whose high is greater than the highs of
 * `lookback` candles before it and `lookback` candles after it.
 * 
 * @param {Array} candles - Array of {time, open, high, low, close}
 * @param {number} lookback - Number of candles to check on each side (default 3)
 * @returns {Array} Array of swing points: { index, time, price, type: 'high'|'low' }
 */
export function findSwingPoints(candles, lookback = 3) {
  if (!candles || candles.length < lookback * 2 + 1) return [];
  
  const swings = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      // Check for Swing High
      if (candles[i - j].high >= current.high || candles[i + j].high >= current.high) {
        isSwingHigh = false;
      }
      // Check for Swing Low
      if (candles[i - j].low <= current.low || candles[i + j].low <= current.low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swings.push({ index: i, time: current.time, price: current.high, type: 'high' });
    } else if (isSwingLow) {
      swings.push({ index: i, time: current.time, price: current.low, type: 'low' });
    }
  }

  return swings;
}
