/**
 * Gongola Terminal tap-to-analyze research scenarios. NO order creation.
 * Regular FVG edge/3-candle SL reproduce the source's *disabled* signal-filter
 * trade-engine geometry; the liquidity objective replaces the source's fixed
 * 3R TP by explicit user request. OB midpoint is a separate, illustrative model.
 * No scenario is called a V0.99 trade signal or a recommendation.
 */
const finite = Number.isFinite;
const reason = (message) => ({ status: 'unavailable', message,
  entry:null, stop:null, target:null, rr:null, risk:null, reward:null, targetSource:null });

/** Prioritize price proximity only, not unverified or already-taken levels. */
export function nextUntakenLiquidity({direction, entry, lastClose, levels} = {}) {
  if (!['bullish','bearish'].includes(direction) || !finite(entry) || !finite(lastClose) || !Array.isArray(levels)) return null;
  const desired = direction === 'bullish' ? 'BSL' : 'SSL';
  const threshold = direction === 'bullish' ? Math.max(entry,lastClose) : Math.min(entry,lastClose);
  const possible = levels.filter(x=> x && x.type===desired && x.mitigated === false && finite(x.price) &&
    (direction==='bullish' ? x.price>threshold : x.price<threshold));
  possible.sort((a,b)=>Math.abs(a.price-threshold)-Math.abs(b.price-threshold));
  return possible[0] || null;
}

function formationThree(bars, ms, tfMinutes) {
  if (!Array.isArray(bars) || !Number.isSafeInteger(ms) || !Number.isInteger(tfMinutes)) return null;
  const step=tfMinutes*60_000;
  const idx=bars.findIndex(b=>b.time===ms);
  if (idx<0 || idx+2>=bars.length) return null;
  const group=bars.slice(idx,idx+3);
  if (group.some((b,i)=>b.time!==ms+i*step || ![b.high,b.low].every(finite))) return null;
  return group;
}

/** Output is illustrative market analysis, not a backtested signal or order. */
export function buildResearchTradePlan({zone, bars, fifteenBars=null, levels=[], lastClose, timeframeMinutes=15}={}) {
  if (!zone || typeof zone!=='object') return reason('No zone selected.');
  if (zone.archived || zone.active === false) return reason('Historical or untracked drawing: no active setup proposed.');
  if (!['ob','fvg','htf-fvg'].includes(zone.category)) return reason('Unsupported drawing type.');
  if (!['bullish','bearish'].includes(zone.direction)) return reason('Direction is unavailable.');
  if (zone.inverse) return reason('Inverse FVG entry model is not implemented or verified.');
  const top=Number(zone.top),bottom=Number(zone.bottom);
  if (![top,bottom,lastClose].every(finite) || top<=bottom) return reason('Invalid zone bounds or latest close.');
  if (![5,15].includes(timeframeMinutes)) return reason('Unsupported chart timeframe.');
  const up=zone.direction==='bullish';
  let entry,stop,entryRule,stopRule;
  if (zone.category==='ob') {
    entry=(top+bottom)/2;stop=up?bottom:top;
    entryRule='OB midpoint — illustrative, not a Pine trade signal';
    stopRule='Opposite OB boundary; no spread or safety buffer';
  } else {
    const isHtf=zone.category==='htf-fvg';
    const formation=isHtf?fifteenBars:bars;
    const tf=isHtf?15:timeframeMinutes;
    const group=formationThree(formation,zone.formationTimeMs,tf);
    if (!group) return reason('Cannot locate all three consecutive formation candles; no FVG entry or stop calculated.');
    entry=up?top:bottom;
    stop=up?Math.min(...group.map(b=>b.low)):Math.max(...group.map(b=>b.high));
    entryRule='V0.99 regular FVG edge — research projection (signal filter is OFF)';
    stopRule='Extreme of three complete FVG formation candles (V0.99)';
  }
  const risk=up?entry-stop:stop-entry;
  if (!(risk>0) || !finite(risk)) return reason('Entry and stop do not define positive risk.');
  if (up ? lastClose<=stop : lastClose>=stop) return reason('Latest completed close is beyond the structural stop. No current scenario.');
  const base={status:'no-target',entry,stop,risk,entryRule,stopRule,
    direction:zone.direction,category:zone.category,target:null,rr:null,reward:null,targetSource:null,
    message:'No eligible untaken liquidity target beyond both entry and last closed price. TP and RR unavailable.',
    note:'Research scenario only. No order, alerts, fills, costs or V0.99 signal-filter validation.'};
  const target=nextUntakenLiquidity({direction:zone.direction,entry,lastClose,levels});
  if (!target) return base;
  const reward=up?target.price-entry:entry-target.price;
  if (!(reward>0) || !finite(reward))return base;
  return {...base,status:'ready',target:target.price,reward,rr:reward/risk,
    targetSource:target.source||'Untaken liquidity',message:'Conditional scenario. Validate the setup, feed and spread before any trading decision.'};
}
