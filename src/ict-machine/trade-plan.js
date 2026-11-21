/**
 * Gongola Terminal tap-to-analyze research scenarios. NO order creation.
 * Regular FVG edge and 3-candle SL retain source-derived geometry.
 * Take-profit projections are computed at 2R, 3R, 4R and 5R from structural SL.
 * Liquidity remains contextual, never an automatic TP. OB midpoint is illustrative.
 * No scenario is called a V0.99 trade signal or a recommendation.
 */
const finite = Number.isFinite;
const reason = (message) => ({ status: 'unavailable', message,
  entry:null, stop:null, target:null, rr:null, risk:null, reward:null, targetSource:null,
  targets:[],liquidityReference:null });


export const RISK_MULTIPLES=Object.freeze([2,3,4,5]);

/** Preserve sub-cent midpoint precision while showing at least 2 decimals. */
export function formatScenarioPrice(value){
  if(!finite(value))return '—';
  const [whole,fraction]=value.toFixed(4).split('.');
  return fraction===undefined?String(value):whole+'.'+fraction.replace(/0+$/,'').padEnd(2,'0');
}

/** For BUY add R multiples to entry; for SELL subtract them. */
export function calculateRiskRewardTargets({direction,entry,stop}={}){
  if(!['bullish','bearish'].includes(direction)||![entry,stop].every(finite))return [];
  const sign=direction==='bullish'?1:-1;
  const risk=sign*(entry-stop);
  if(!(risk>0)||!finite(risk))return [];
  const targets=RISK_MULTIPLES.map(multiple=>({
    multiple,ratio:'1:'+multiple,
    price:entry+sign*risk*multiple,
    reward:risk*multiple
  }));
  return targets.every(t=>finite(t.price)&&finite(t.reward))?targets:[];
}

/** Context only: price proximity, not a validated target or order. */
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
  const targets=calculateRiskRewardTargets({direction:zone.direction,entry,stop});
  if(!targets.length)return reason('Entry and stop do not define positive, finite risk and targets.');
  const risk=Math.abs(entry-stop);
  if(up ? lastClose<=stop : lastClose>=stop)return reason('Latest completed close is beyond the structural stop. No current scenario.');
  const liquidityReference=nextUntakenLiquidity({direction:zone.direction,entry,lastClose,levels});
  return{
    status:'ready',entry,stop,risk,entryRule,stopRule,
    direction:zone.direction,category:zone.category,
    targets,liquidityReference,
    // No single TP is selected and no variable liquidity-based R:R is reported.
    target:null,rr:null,reward:null,targetSource:null,
    message:'Stop-based TP prices at 1:2, 1:3, 1:4 and 1:5. Liquidity is contextual only.',
    note:'Research scenario only. No orders, fills, spreads, fees, slippage or signal validation.'
  };
}
