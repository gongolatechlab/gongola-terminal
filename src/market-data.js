// market-data.js
// Market registry + simulated data source for Gongola Terminal.
// IMPORTANT: all candles produced here are SIMULATED demonstration data.
// Replace getSimulatedCandles() with a real feed implementation later;
// nothing else in the app should need to change.

export const MARKETS = {
  EURUSD: { symbol: 'EURUSD', name: 'Euro / US Dollar',             precision: 5, basePrice: 1.085  },
  GBPUSD: { symbol: 'GBPUSD', name: 'British Pound / US Dollar',   precision: 5, basePrice: 1.265  },
  XAUUSD: { symbol: 'XAUUSD', name: 'Gold / US Dollar',            precision: 2, basePrice: 2350   },
  USDCAD: { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar', precision: 5, basePrice: 1.365  },
  NAS100: { symbol: 'NAS100', name: 'Nasdaq 100 Index',            precision: 1, basePrice: 18500  },
};

export const TIMEFRAMES = [
  { label: '15M', minutes: 15   },
  { label: '1H',  minutes: 60   },
  { label: '4H',  minutes: 240  },
  { label: '1D',  minutes: 1440 },
];

function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getSimulatedCandles(symbol, timeframeMinutes, count = 100) {
  const market = MARKETS[symbol];
  if (!market) return [];

  const barSeconds = timeframeMinutes * 60;
  const now = Math.floor(Date.now() / 1000);
  const lastBarTime = Math.floor(now / barSeconds) * barSeconds;
  const start = lastBarTime - (count - 1) * barSeconds;

  const rand = mulberry32(seedFrom(`${symbol}:${timeframeMinutes}`));
  const volatility = market.basePrice * 0.0008;
  let previous = market.basePrice;

  const out = [];
  for (let i = 0; i < count; i++) {
    const open = previous;
    const close = open + (rand() - 0.48) * volatility;
    const high = Math.max(open, close) + rand() * volatility * 0.5;
    const low = Math.min(open, close) - rand() * volatility * 0.5;
    out.push({ time: start + i * barSeconds, open, high, low, close });
    previous = close;
  }
  return out;
}

export function getLatestPrice(candles) {
  return candles.length ? candles[candles.length - 1].close : null;
}

export function formatPrice(price, symbol) {
  if (price == null) return '—';
  const market = MARKETS[symbol];
  const precision = market ? market.precision : 5;
  return price.toFixed(precision);
}
