/** Read-only Gongola Terminal integration boundary.
 * No DOM, chart mutations, or implicit use of simulated candles.
 * This is NOT a TradingView-parity certification or a market-data connector.
 */
import {validateCandles} from './pine-foundation.js';
import {replayOBToFVGLifecycle} from './fvg-replay.js';

const SUPPORTED = new Set([15,60,240,1440]);
const disabled = reason => ({status:'disabled',reason,events:[],drawings:[],diagnostics:{}});

/** Explicitly opt in with verified historical data. Throws on malformed inputs. */
export function evaluateTerminalEngine({enabled=false,source='simulated',symbol,timeframeMinutes,chartCandles,detectionCandles,obOptions,fvgOptions,lifecycleOptions={}}={}) {
  if (!enabled) return disabled('FEATURE_FLAG_OFF');
  if (source !== 'verified-historical') return disabled('UNVERIFIED_MARKET_DATA');
  if (symbol !== 'FOREXCOM:XAUUSD') return disabled('REFERENCE_SYMBOL_NOT_SUPPORTED');
  if (!SUPPORTED.has(timeframeMinutes)) return disabled('UNSUPPORTED_TIMEFRAME');
  if (!obOptions || !fvgOptions) throw new TypeError('Explicit engine options are required');
  const chart=validateCandles(chartCandles);
  const detection=validateCandles(detectionCandles);
  if (!chart.length || !detection.length) return disabled('EMPTY_HISTORY');
  if (obOptions.chartTfMs !== timeframeMinutes*60000) throw new Error('Chart timeframe mismatch');
  if (fvgOptions.chartTfMinutes !== timeframeMinutes) throw new Error('FVG timeframe mismatch');
  const result=replayOBToFVGLifecycle(chart,detection,obOptions,fvgOptions,lifecycleOptions);
  const events=[...result.ob.events,...result.fvg.events,...result.lifecycle.events]
    .map((event,index)=>({stream:index<result.ob.events.length?'ob':index<result.ob.events.length+result.fvg.events.length?'fvg':'lifecycle',...event}));
  return {status:'experimental',reason:'TRADINGVIEW_PARITY_NOT_VERIFIED',events,drawings:[],diagnostics:{chartBars:chart.length,detectionBars:detection.length,obEvents:result.ob.events.length,fvgEvents:result.fvg.events.length,lifecycleEvents:result.lifecycle.events.length}};
}
