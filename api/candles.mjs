/** Public beta market-data endpoint for Vercel.
 * Fixed symbol/timeframe allowlist; provider credentials remain server-side.
 * CDN cache helps reduce provider API quota consumption; do not treat as tick data.
 */
import {resolveMarketSelection, normalizeTwelveData, MarketFeedError} from '../server/market-validate.mjs';

const API_URL = 'https://api.twelvedata.com/time_series';

function json(body, status = 200, cacheable = false) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cacheable ? 'public, max-age=30' : 'no-store',
      ...(cacheable ? {'Vercel-CDN-Cache-Control': 's-maxage=240, stale-while-revalidate=60'} : {}),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request) {
  if(request.method !== 'GET') return json({status:'error',code:'METHOD_NOT_ALLOWED',message:'GET required'},405);
  try {
    const incoming = new URL(request.url);
    const selection = resolveMarketSelection({
      market: incoming.searchParams.get('market') ?? undefined,
      tf: incoming.searchParams.get('tf') ?? undefined,
    });
    const key = process.env.GONGOLA_TWELVEDATA_API_KEY;
    if (!key) return json({status:'error',code:'API_KEY_NOT_CONFIGURED',message:'Market data is not configured on the hosting server.'},503);
    const query = new URL(API_URL);
    query.searchParams.set('symbol', selection.instrument);
    query.searchParams.set('interval', selection.interval);
    query.searchParams.set('outputsize', '1200');
    query.searchParams.set('timezone', 'UTC');
    query.searchParams.set('order', 'asc');
    query.searchParams.set('apikey', key);
    let upstream;
    try {
      upstream = await fetch(query, {signal: AbortSignal.timeout(15_000), headers: {Accept:'application/json'}});
    } catch {
      throw new MarketFeedError('NETWORK_ERROR','Market provider could not be reached.',502);
    }
    if (!upstream.ok) throw new MarketFeedError(upstream.status === 429 ? 'RATE_LIMIT':'PROVIDER_HTTP_ERROR',
      upstream.status === 429 ? 'Market provider rate limit reached.':'Market provider unavailable.', upstream.status===429?429:502);
    let payload;
    try { payload = await upstream.json(); }
    catch { throw new MarketFeedError('INVALID_JSON','Invalid data from market provider.',502); }
    const fetchedAt = new Date().toISOString();
    const candles = normalizeTwelveData(payload, {
      asOfMs: Date.now(), market: selection.market, timeframeMinutes: selection.timeframeMinutes,
    });
    return json({status:'ok',...candles,fetchedAt,cached:false},200,true);
  } catch(error) {
    return json({status:'error',code:error instanceof MarketFeedError ? error.code:'UNKNOWN_ERROR',
      message:error instanceof MarketFeedError ? error.message:'Market feed unavailable.'},
      error instanceof MarketFeedError?error.httpStatus:500);
  }
}
