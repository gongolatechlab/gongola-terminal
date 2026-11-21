/**
 * V0.99 Order Block confirmation-filter dependencies.
 * Source: user's The ICT Machine V0.99 Pine, OB section lines ~1386-1489.
 * The OB engine runs BEFORE the current chart bar's Minor DOL update; do not
 * feed current-bar structure/HHLL into candidate creation or confirmation.
 * The UTC-4H Minor DOL boundaries and the selected exchange timezone are
 * provisional provider assumptions, not verified TradingView parity.
 */
import {calculateMinorDOL} from './minor-dol.js';
import {sessionContains} from './engine/session-compat.js';

const DEFAULT_SESSIONS = Object.freeze({
  useAsia:false, useLondon:true, useNY:true,
  asia:'2000-0000', london:'0300-0500', ny:'0900-1030',
});

export function makeOBSessionEligibility({enabled=false,exchangeTimezone,
  useAsia=DEFAULT_SESSIONS.useAsia, useLondon=DEFAULT_SESSIONS.useLondon,
  useNY=DEFAULT_SESSIONS.useNY, asia=DEFAULT_SESSIONS.asia,
  london=DEFAULT_SESSIONS.london,ny=DEFAULT_SESSIONS.ny}={}) {
  if(!enabled) return ()=>true;
  if(typeof exchangeTimezone!=='string'||!exchangeTimezone.trim())
    throw new Error('Exchange timezone required for enabled OB session filter');
  const windows=[[useAsia,asia],[useLondon,london],[useNY,ny]].filter(([on])=>on).map(([,s])=>s);
  if(!windows.length) return ()=>false; // Pine: no active sessions -> false
  // Verify timezone and window format now, not in the middle of replay.
  for(const s of windows) sessionContains(Date.UTC(2026,0,5,12),s,exchangeTimezone);
  return (bar)=>windows.some(s=>sessionContains(bar.time,s,exchangeTimezone));
}

/**
 * `chartBars` must be real, ascending, CLOSED 5m/15m bars.
 * The snapshots are consumed only if the HH/LL or structure filter is ON.
 * `at(bar,index)` is intentionally strict: no lookahead to the current bar.
 */
export function buildOBMinorContext(chartBars, {timeframeMinutes=15,
  hhllFilter=false,structFilter=false,boundaryOffsetMs=0}={}) {
  if(!hhllFilter&&!structFilter)return ()=>({});
  const chartTfMs=timeframeMinutes*60_000;
  const snapshots=calculateMinorDOL(chartBars,{chartTfMs,boundaryOffsetMs}).snapshots;
  let cursor=-1,previousQuery=-Infinity;
  return (bar)=>{
    if(bar.time<previousQuery)throw new Error('OB minor-context queries must be chronological');
    previousQuery=bar.time;
    // Never use current-bar data (Pine OB block precedes MDOL updates).
    while(cursor+1<snapshots.length && snapshots[cursor+1].end<=bar.time)cursor++;
    const s=cursor>=0?snapshots[cursor]:null;
    return {
      // At candidate creation Pine stores HHLL gate permanently; we supply
      // current tracked extreme time from the preceding closed chart candle.
      hhllHighTime:s?.highTime??null, hhllLowTime:s?.lowTime??null,
      // lastFvgFilterDir includes BOS/MSS and Turtle Soup; never IDM.
      minorDirection:s?.lastFvgFilterDir??null,
      structDirection:s?.lastStructBreakDir??null,
      structTime:s?.lastStructBreakDirTime??null,
    };
  };
}
