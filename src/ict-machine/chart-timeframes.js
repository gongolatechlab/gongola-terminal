/** Complete 15-minute bars only, constructed from observed contiguous five-minute bars. */
const FIVE = 5 * 60_000;
const FIFTEEN = 3 * FIVE;
export function aggregate5mTo15m(bars) {
  if (!Array.isArray(bars)) throw new TypeError('Candles must be an array.');
  let last = -Infinity;
  const groups = new Map();
  for (let i=0;i<bars.length;i++) {
    const b=bars[i];
    if (!b || !Number.isSafeInteger(b.time) || b.time%FIVE!==0 || b.time<=last ||
        ![b.open,b.high,b.low,b.close].every(Number.isFinite) ||
        b.high<Math.max(b.open,b.low,b.close) || b.low>Math.min(b.open,b.high,b.close)) {
      throw new Error(`Invalid five-minute candle at index ${i}.`);
    }
    last=b.time;
    const key=Math.floor(b.time/FIFTEEN)*FIFTEEN;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(b);
  }
  const out=[];
  for(const [start,group] of groups){
    if(group.length!==3 || group[0].time!==start || group[1].time!==start+FIVE || group[2].time!==start+2*FIVE) continue;
    out.push({time:start,end:start+FIFTEEN,open:group[0].open,high:Math.max(...group.map(b=>b.high)),low:Math.min(...group.map(b=>b.low)),close:group[2].close});
  }
  return out;
}
