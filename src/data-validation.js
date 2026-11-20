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

    const requiredFields = ['time', 'open', 'high', 'low', 'close'];
    let missingField = false;
    for (const field of requiredFields) {
      if (!(field in candle)) {
        errors.push({ index, reason: `Missing field: ${field}` });
        missingField = true;
      }
    }
    if (missingField) continue;

    const { time, open, high, low, close } = candle;

    // Validate time
    if (typeof time !== 'number' || !isFinite(time)) {
      errors.push({ index, reason: 'time must be a finite number' });
      continue;
    }

    // Validate prices
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

    // Validate OHLC relationships
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

    // Validate timestamp ordering
    if (time <= lastTime) {
      errors.push({ index, reason: 'time must be strictly greater than previous candle time' });
    }
    lastTime = time;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
