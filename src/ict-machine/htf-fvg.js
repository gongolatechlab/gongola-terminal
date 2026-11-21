/**
 * 15M HTF FVG projected onto a 5M chart — source-derived box-mode subset.
 * No lower-TF lookahead: HTF bars are eligible only when a subsequent 5M bar
 * exists at or after their close. Data gaps are not filled or interpolated.
 * This is NOT a TradingView parity certificate.
 */
import { aggregate5mTo15m } from './chart-timeframes.js';
import { confirmed60mIRFrom5m } from './htf-ir.js';

const FIVE = 300_000;
const FIFTEEN = 900_000;

function validateBars(bars, asOfMs) {
  if (!Array.isArray(bars)) throw new TypeError('Expected a 5M OHLC array.');
  if (!Number.isSafeInteger(asOfMs)) throw new Error('asOfMs must be an integer UTC millisecond timestamp.');
  let previous = -Infinity;
  for (const [i, b] of bars.entries()) {
    if (!b || !Number.isSafeInteger(b.time) || b.time % FIVE || b.time <= previous ||
        ![b.open,b.high,b.low,b.close].every(Number.isFinite) ||
        b.high < Math.max(b.open,b.close,b.low) || b.low > Math.min(b.open,b.close,b.high))
      throw new Error(`Malformed/unsorted 5M candle ${i}`);
    if (b.time + FIVE > asOfMs) throw new Error(`Unfinished 5M candle ${i}`);
    previous = b.time;
  }
}

const DEFAULTS = Object.freeze({
  volatilityPeriod: 100,
  displacementMultiplier: 0.7,
  wideGap: 12,
  limitConsecutive: true,
  deleteMitigated: true,
  maxToShow: 30,
  filterByHTFIR: false,
});

/**
 * @returns {{zones: object[], archived: object[], events: object[], summary: object}}
 * zones contain regular/inverse currently retained boxes; archived have
 * explicit deleted/pruned status. All timestamps are UTC milliseconds.
 */
export function replay15mHTFFVGOn5m(bars, options = {}) {
  const config = {...DEFAULTS, ...options};
  const asOfMs = config.asOfMs ?? Date.now();
  validateBars(bars, asOfMs);
  if (typeof config.filterByHTFIR !== 'boolean') throw new Error('filterByHTFIR must be a boolean');
  for (const [key, min, max] of [['volatilityPeriod',1,100],['displacementMultiplier',0.1,10],['wideGap',1,100],['maxToShow',1,500]]) {
    const value = config[key];
    if (!Number.isFinite(value) || value < min || value > max || (['volatilityPeriod','maxToShow'].includes(key) && !Number.isInteger(value)))
      throw new Error(`Invalid HTF FVG setting: ${key}`);
  }
  if (config.wideGap < config.displacementMultiplier) throw new Error('wideGap must not be below displacementMultiplier.');
  const latest5mStart = bars.at(-1)?.time;
  const observed15m = aggregate5mTo15m(bars);
  // A closed 15M candle is delivered by Pine's security(...[1],lookahead_on)
  // at the first available 5M bar in the following 15M interval.
  const confirmed15m = observed15m.filter(b => b.time + FIFTEEN <= latest5mStart);
  const active = [], archived = [], events = [];
  let lastDirection = null, nextId = 1;
  // Only derive HTF IR direction when the user explicitly requests the filter.
  // Pine evaluates HTF FVG detection BEFORE updating a new HTF IR on the
  // same chart bar; preserve this order to avoid future information leakage.
  const irEvents = config.filterByHTFIR ? confirmed60mIRFrom5m(bars) : [];
  let irPosition = 0, lastHTFIRDir = null;
  function advanceIR(at, includeEqual) {
    while(irPosition<irEvents.length && (includeEqual ? irEvents[irPosition].at<=at : irEvents[irPosition].at<at)) {
      lastHTFIRDir=irEvents[irPosition++].direction;
    }
  }


  function emit(type, zone, at, reason = null) {
    events.push({type, id:zone.id, at, direction:zone.direction, status:zone.status, reason});
  }
  function archive(zone, at, reason) {
    const index=active.indexOf(zone);
    if (index >= 0) active.splice(index,1);
    zone.status = reason === 'cap' ? 'pruned' : 'deleted';
    zone.removedAt = at;
    archived.push(zone);
    emit(reason === 'cap' ? 'prune' : 'delete',zone,at,reason);
  }
  function trim(at) {
    for (const status of ['bullish','bearish','inverse_bullish','inverse_bearish']) {
      const items=active.filter(z=>z.status===status);
      while(items.length>config.maxToShow) archive(items.shift(),at,'cap');
    }
  }
  function closeAndMitigate(close, at) {
    // Original V0.99 box conversion and inverse deletion compare confirmed
    // 15M CLOSES, not 5M wick touches or the newest unfinished 15M bar.
    for (const zone of [...active]) {
      if (zone.status === 'bullish' && close < zone.bottom) {
        zone.status='inverse_bearish'; zone.invertedAt=at;
        emit('invert',zone,at,'htf-close-below-bottom');
      } else if (zone.status === 'bearish' && close > zone.top) {
        zone.status='inverse_bullish'; zone.invertedAt=at;
        emit('invert',zone,at,'htf-close-above-top');
      } else if (config.deleteMitigated && zone.status === 'inverse_bearish' && close > zone.top) {
        archive(zone,at,'htf-inverse-rebalanced');
      } else if (config.deleteMitigated && zone.status === 'inverse_bullish' && close < zone.bottom) {
        archive(zone,at,'htf-inverse-rebalanced');
      }
    }
  }
  let next5mIndex=0;
  for (let i=0; i<confirmed15m.length; i++) {
    const newest=confirmed15m[i];
    const closeBoundary=newest.time+FIFTEEN;
    while(next5mIndex<bars.length && bars[next5mIndex].time<closeBoundary) next5mIndex++;
    const now=bars[next5mIndex]?.time;
    if(now===undefined)break;
    advanceIR(now,false); // HTF FVG check precedes same-bar HTF IR updates.
    // Source HTF FVG arrays compare [0] and [2] and need > 3 bars.
    if(i>=3) {
      const middle=confirmed15m[i-1], older=confirmed15m[i-2];
      // Fail closed on gaps; Pine may include valid session closures, so this
      // is a conservative known divergence until provider calendars align.
      if(newest.time-middle.time===FIFTEEN && middle.time-older.time===FIFTEEN) {
        const prior=confirmed15m.slice(Math.max(0,i-config.volatilityPeriod),i);
        const average=prior.reduce((s,b)=>s+b.high-b.low,0)/prior.length;
        for(const [direction,isGap,top,bottom] of [
          ['bullish',newest.low>older.high,newest.low,older.high],
          ['bearish',newest.high<older.low,older.low,newest.high],
        ]) {
          if(!isGap)continue;
          if(config.filterByHTFIR && lastHTFIRDir !== (direction==='bullish'?'bull':'bear'))continue;
          if(config.limitConsecutive && lastDirection===direction) continue;
          // Pine updates lastHTFFVGDir BEFORE checking the volatility filter.
          lastDirection=direction;
          const length=top-bottom;
          if(!(average>0 && length >= config.displacementMultiplier/10*average &&
               length <= config.wideGap/10*average))continue;
          const zone={id:nextId++,direction,status:direction,
            left:middle.time, formedAt:now, top, bottom, invertedAt:null, removedAt:null};
          active.push(zone);
          emit('create',zone,now);
        }
      }
    }
    closeAndMitigate(newest.close,now);
    trim(now);
    advanceIR(now,true); // Update IR direction only AFTER same-bar FVG checks.
  }
  return {
    zones:active.map(z=>({...z})),
    archived:archived.map(z=>({...z})),
    events,
    irEvents,
    summary:{htfIRFilterApplied:config.filterByHTFIR, lastHTFIRDirection:lastHTFIRDir, htfIREventCount:irEvents.length, confirmed15m:confirmed15m.length,activeBullish:active.filter(z=>z.status==='bullish').length,
      activeBearish:active.filter(z=>z.status==='bearish').length,
      inverse:active.filter(z=>z.status.startsWith('inverse_')).length,
      archived:archived.length, latestConfirmedCloseTime:confirmed15m.at(-1)?.time+FIFTEEN ?? null,
      hasGaps:observed15m.some((b,i)=>i>0&&b.time-observed15m[i-1].time!==FIFTEEN)}
  };
}
