// data-validation.js
// Pure OHLC validation logic. Does not modify or sort data.

/**
 * Validates an array of OHLC candles.
 * @param {Array} candles - Array of {time, open, high, low, close}
 * @returns {{ valid: boolean, errors: Array<{ index: number, reason: string }> }}
 */
export function validateOHLC(candles) {
  if (!Array.isArray(candles)) {
    return {
      valid: false,
      errors: [{ index: -1, reason: 'Input must be an array of candles' }],
    };
  }

  const errors = [];
  let lastTime = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const index = i;

    if (!candle || typeof candle !== 'object') {
      errors.push({ index, reason: 'Candle must be an object' });
      continue;
    }

    // 1. Independent Timestamp Validation
    const time = candle.time;
    if (time === undefined) {
      errors.push({ index, reason: 'Missing field: time' });
    } else if (typeof time !== 'number' || !Number.isInteger(time) || !isFinite(time)) {
      errors.push({ index, reason: 'time must be a finite integer number' });
    } else {
      if (time <= lastTime) {
        errors.push({ index, reason: 'time must be strictly greater than previous candle time' });
      } else {
        lastTime = time;
      }
    }

    // 2. OHLC Field Validation
    const requiredFields = ['open', 'high', 'low', 'close'];
    let missingField = false;
    for (const field of requiredFields) {
      if (!(field in candle)) {
        errors.push({ index, reason: `Missing field: ${field}` });
        missingField = true;
      }
    }
    if (missingField) continue;

    const { open, high, low, close } = candle;

    // 3. OHLC Price Validation
    const priceFields = ['open', 'high', 'low', 'close'];
    let hasPriceError = false;
    for (const field of priceFields) {
      const value = candle[field];
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push({ index, reason: `${field} must be a finite number` });
        hasPriceError = true;
      }
    }
    if (hasPriceError) continue;

    // 4. OHLC Relationship Validation
    if (high < low) {
      errors.push({ index, reason: 'high must be greater than or equal to low' });
    }
    if (high < open) {
      errors.push({ index, reason: 'high must be greater than or equal to open' });
    }
    if (high < close) {
      errors.push({ index, reason: 'high must be greater than or equal to close' });
    }
    if (low > open) {
      errors.push({ index, reason: 'low must be less than or equal to open' });
    }
    if (low > close) {
      errors.push({ index, reason: 'low must be less than or equal to close' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
