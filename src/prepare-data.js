import { validateOHLC } from './data-validation.js';
import { findSwingPoints } from './analysis.js';

export function prepareChartData(rawCandles) {
  const validation = validateOHLC(rawCandles);

  if (!validation.valid) {
    return {
      valid: false,
      candles: [],
      swings: [],
      errors: validation.errors,
    };
  }

  const swings = findSwingPoints(rawCandles, 3);

  return {
    valid: true,
    candles: rawCandles,
    swings,
    errors: [],
  };
}
