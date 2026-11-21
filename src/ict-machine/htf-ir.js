/**
 * V0.99 source-derived higher-TF Immediate Rebalance direction.
 * 60-minute HTF IR from FULL, contiguous 5-minute candles, no lookahead.
 * The source changes lastHTFIRDir when the previous completed 60M close
 * exceeded the immediately preceding completed 60M high/low.
 * Exchange-specific hourly alignment remains unverified (UTC used here).
 */
const FIVE = 5 * 60_000;
const HOUR = 60 * 60_000;

export function confirmed60mIRFrom5m(bars) {
  if (!Array.isArray(bars)) throw new TypeError('Expected OHLC 5M candles');
  const groups = new Map();
  let previousTime = -Infinity;
  for (const [i, b] of bars.entries()) {
    if (!b || !Number.isSafeInteger(b.time) || b.time % FIVE || b.time <= previousTime ||
        ![b.open,b.high,b.low,b.close].every(Number.isFinite) ||
        b.high < Math.max(b.open,b.low,b.close) || b.low > Math.min(b.open,b.high,b.close)) {
      throw new Error(`Malformed/unsorted 5M candle ${i}`);
    }
    const hourStart = Math.floor(b.time / HOUR) * HOUR;
    if (!groups.has(hourStart)) groups.set(hourStart, []);
    groups.get(hourStart).push(b);
    previousTime = b.time;
  }
  const completed = [];
  for (const [start, items] of groups) {
    if (items.length !== 12 || items.some((b, index) => b.time !== start + index * FIVE)) continue;
    completed.push({time:start,high:Math.max(...items.map(b=>b.high)),low:Math.min(...items.map(b=>b.low)),
      close:items[11].close,items});
  }
  const events=[];
  let pos=0;
  for (let i=1;i<completed.length;i++) {
    const current=completed[i], prior=completed[i-1];
    // If the preceding full hour is absent, we cannot know the immediately
    // preceding hourly candle's price from this feed. Never fabricate it.
    if (current.time-prior.time!==HOUR)continue;
    const boundary=current.time+HOUR;
    while(pos<bars.length && bars[pos].time<boundary)pos++;
    if(pos===bars.length)break;
    if(current.close>prior.high){
      const priorExtreme=prior.items.find(b=>b.high===prior.high);
      events.push({type:'htf-ir',direction:'bull',at:bars[pos].time,price:prior.high,
        previousHour:prior.time,confirmedHour:current.time,extremeAt:priorExtreme.time});
    } else if(current.close<prior.low){
      const priorExtreme=prior.items.find(b=>b.low===prior.low);
      events.push({type:'htf-ir',direction:'bear',at:bars[pos].time,price:prior.low,
        previousHour:prior.time,confirmedHour:current.time,extremeAt:priorExtreme.time});
    }
  }
  return events;
}
