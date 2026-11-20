/**
 * Local-development market-data bridge for Gongola Terminal.
 * Twelve Data key is loaded server-side from .env.local, never sent to browser.
 * No simulated price path exists. Vite development server only.
 */
import {loadEnv} from 'vite';

export const BAR_MS = 15 * 60 * 1000; // legacy 15m export
export const MARKET_PAIRS = Object.freeze({XAUUSD: 'XAU/USD', BTCUSD: 'BTC/USD'});
export const ALLOWED_TIMEFRAMES = Object.freeze([5, 15]);
export function resolveMarketSelection(query = {}) {
  const market = query.market ?? 'XAUUSD';
  const timeframeMinutes = Number(query.tf ?? '15');
  if (typeof market !== 'string' || !Object.hasOwn(MARKET_PAIRS, market) ||
      !ALLOWED_TIMEFRAMES.includes(timeframeMinutes) ||
      (query.tf !== undefined && String(query.tf) !== String(timeframeMinutes))) {
    throw new MarketFeedError('INVALID_MARKET_SELECTION', 'Choose XAUUSD/BTCUSD and a 5M or 15M chart.', 422);
  }
  return {market, instrument: MARKET_PAIRS[market], timeframeMinutes,
          interval: `${timeframeMinutes}min`, barMs: timeframeMinutes * 60000};
}
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);
const API_URL = 'https://api.twelvedata.com/time_series';
const ENDPOINT = '/__gongola/market/candles';

export class MarketFeedError extends Error {
  constructor(code, message, httpStatus = 422) {
    super(message);
    this.name = 'MarketFeedError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function requireValidUTC(datetime, barMs) {
  if (typeof datetime !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(datetime)) {
    throw new MarketFeedError('INVALID_TIMESTAMP', 'Provider returned a timestamp that is not UTC YYYY-MM-DD HH:mm:ss.');
  }
  const ms = Date.parse(datetime.replace(' ', 'T') + 'Z');
  if (!Number.isSafeInteger(ms) || ms < MIN_MS || ms >= MAX_MS ||
      new Date(ms).toISOString().slice(0, 19).replace('T', ' ') !== datetime || ms % barMs !== 0) {
    throw new MarketFeedError('INVALID_TIMESTAMP', 'Provider returned an invalid or misaligned UTC candle.');
  }
  return ms;
}

function requirePrice(value, field) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new MarketFeedError('INVALID_OHLC', `Provider ${field} value is invalid.`);
  }
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new MarketFeedError('INVALID_OHLC', `Provider ${field} value is invalid.`);
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    throw new MarketFeedError('INVALID_OHLC', `Provider ${field} value is invalid.`);
  }
  return price;
}

export function normalizeTwelveData(payload, {asOfMs = Date.now(), market = 'XAUUSD', timeframeMinutes = 15} = {}) {
  const selection = resolveMarketSelection({market, tf: String(timeframeMinutes)});
  const {instrument, barMs, interval} = selection;
  if (!Number.isSafeInteger(asOfMs) || asOfMs < MIN_MS || asOfMs >= MAX_MS) {
    throw new MarketFeedError('INVALID_CLOCK', 'Server clock is invalid.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new MarketFeedError('INVALID_RESPONSE', 'Provider response is not an object.');
  }
  if (payload.status === 'error' || payload.code) {
    const code = Number(payload.code);
    if (code === 429) throw new MarketFeedError('RATE_LIMIT', 'Provider rate limit reached. Retry later.', 429);
    if ([400, 401, 403].includes(code)) throw new MarketFeedError('PROVIDER_ACCESS', 'Provider rejected the request. Check API key, symbol and subscription.', 502);
    throw new MarketFeedError('PROVIDER_UNAVAILABLE', 'Provider did not return valid market candles.', 502);
  }
  if (!Array.isArray(payload.values) || payload.values.length === 0 || payload.values.length > 5000) {
    throw new MarketFeedError('NO_CANDLES', 'Provider returned no usable historical candles.', 502);
  }
  // The metadata check prevents accidentally rendering another symbol/timeframe
  // even if a provider returns unexpected data for our fixed request.
  if (payload.meta && (
    (payload.meta.symbol && payload.meta.symbol !== instrument) ||
    (payload.meta.interval && payload.meta.interval !== interval)
  )) throw new MarketFeedError('PROVIDER_MISMATCH', 'Provider returned a different market or timeframe.', 502);

  const bars = payload.values.map((record) => {
    if (!record || typeof record !== 'object') throw new MarketFeedError('INVALID_OHLC', 'Provider candle is malformed.');
    const time = requireValidUTC(record.datetime, barMs);
    const open = requirePrice(record.open, 'open');
    const high = requirePrice(record.high, 'high');
    const low = requirePrice(record.low, 'low');
    const close = requirePrice(record.close, 'close');
    if (high < Math.max(open, low, close) || low > Math.min(open, high, close)) {
      throw new MarketFeedError('INVALID_OHLC', 'Provider candle violates OHLC high/low bounds.');
    }
    return {time, open, high, low, close};
  }).sort((a, b) => a.time - b.time);
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time === bars[i - 1].time) {
      throw new MarketFeedError('DUPLICATE_TIME', 'Provider returned duplicate candle timestamps.');
    }
  }
  // Exclude any current or future candle; do not predict/fill missing OHLC.
  const completed = bars.filter(bar => bar.time + barMs <= asOfMs);
  const excludedUnclosed = bars.length - completed.length;
  if (!completed.length) throw new MarketFeedError('NO_CLOSED_CANDLES', 'Provider has no completed candle yet.', 502);
  let gapCount = 0;
  for (let i = 1; i < completed.length; i++) {
    if (completed[i].time - completed[i - 1].time > barMs) gapCount++;
  }
  return {
    provider: 'Twelve Data',
    instrument,
    referenceInstrument: market === 'XAUUSD' ? 'FOREXCOM:XAUUSD' : null,
    matchesReferenceFeed: false,
    timeframeMinutes,
    classification: 'provider-aggregated historical candles',
    candles: completed,
    gapCount,
    excludedUnclosed,
    lastClosedCandleOpen: new Date(completed.at(-1).time).toISOString(),
  };
}

export function createGongolaMarketProxy({
  getKey,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  ttlMs = 240_000,
} = {}) {
  let root = process.cwd(), mode = 'development';
  const cache = new Map();
  function apiKey() {
    if (getKey) return getKey();
    return process.env.GONGOLA_TWELVEDATA_API_KEY ||
      loadEnv(mode, root, 'GONGOLA_').GONGOLA_TWELVEDATA_API_KEY || '';
  }
  async function getProviderData(selection) {
    const {market, instrument, timeframeMinutes, interval} = selection;
    const id = `${market}:${timeframeMinutes}`;
    const hit = cache.get(id);
    const key = apiKey();
    if (!key) throw new MarketFeedError('API_KEY_NOT_CONFIGURED', 'Add GONGOLA_TWELVEDATA_API_KEY to .env.local and restart Vite.', 503);
    if (hit && now() - hit.fetchedAtMs < ttlMs) {
      // Fresh completeness cutoff even when provider payload is cached.
      return {...normalizeTwelveData(hit.payload, {asOfMs: now(), market, timeframeMinutes}),
        fetchedAt: new Date(hit.fetchedAtMs).toISOString(), cached: true};
    }
    const url = new URL(API_URL);
    url.searchParams.set('symbol', instrument);
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', '1200');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('order', 'asc');
    url.searchParams.set('apikey', key);
    let response;
    try {
      response = await fetchImpl(url.toString(), {signal: AbortSignal.timeout(20_000), headers: {'Accept': 'application/json'}});
    } catch (_) {
      throw new MarketFeedError('NETWORK_ERROR', 'Unable to reach Twelve Data from the Termux server.', 502);
    }
    if (!response.ok) {
      if (response.status === 429) throw new MarketFeedError('RATE_LIMIT', 'Provider rate limit reached.', 429);
      throw new MarketFeedError('PROVIDER_HTTP_ERROR', `Provider HTTP error (${response.status}).`, 502);
    }
    let payload;
    try { payload = await response.json(); }
    catch (_) { throw new MarketFeedError('INVALID_JSON', 'Provider returned invalid JSON.', 502); }
    const fetchedAtMs = now();
    const result = normalizeTwelveData(payload, {asOfMs: fetchedAtMs, market, timeframeMinutes});
    cache.set(id, {payload, fetchedAtMs});
    return {...result, fetchedAt: new Date(fetchedAtMs).toISOString(), cached: false};
  }
  return {
    name: 'gongola-local-market-feed',
    configResolved(config) { root = config.root; mode = config.mode; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (!(pathname === ENDPOINT || pathname.endsWith(ENDPOINT))) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({status: 'error', code: 'METHOD_NOT_ALLOWED', message: 'GET required'}));
          return;
        }
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const selection = resolveMarketSelection({market:url.searchParams.get('market') ?? undefined,
            tf:url.searchParams.get('tf') ?? undefined});
          const data = await getProviderData(selection);
          res.statusCode = 200;
          res.end(JSON.stringify({status: 'ok', ...data}));
        } catch (error) {
          res.statusCode = error instanceof MarketFeedError ? error.httpStatus : 500;
          res.end(JSON.stringify({
            status: 'error',
            code: error instanceof MarketFeedError ? error.code : 'UNKNOWN_ERROR',
            message: error instanceof MarketFeedError ? error.message : 'Market feed unavailable.',
          }));
        }
      });
    },
  };
}
