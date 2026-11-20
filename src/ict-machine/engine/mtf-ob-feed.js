/** Historical lower-chart-TF OB detection feed for V0.99.
 * Caller supplies exact provider-aligned HTF candles with `end` timestamps.
 * Mirrors the OB source's timeframe.change + request.security(expr[1],
 * lookahead_on) data insertion; does not synthesize HTF candles.
 */
import {validateCandles,validateHTFBars,confirmedHTFAt} from './pine-foundation.js';

export function createOBDetectionFeed(chartInput, htfInput, {chartTfMs,detectTfMs}={}) {
  if (!Number.isSafeInteger(chartTfMs)||chartTfMs<=0||
      !Number.isSafeInteger(detectTfMs)||detectTfMs<=0) throw new Error('Valid timeframe durations required');
  if (chartTfMs>detectTfMs) throw new Error('Pine OB feed only inserts when detection TF >= chart TF');
  const chart=validateCandles(chartInput);
  const htf=validateHTFBars(htfInput);
  const result=[];
  let lastPeriod=null;
  let lastInsertedTime=null;
  const recent=[];
  for (let i=0;i<chart.length;i++) {
    const bar=chart[i];
    // Detect a new source period using provider-aligned HTF [time,end) boundaries.
    // At a period boundary the preceding completed HTF candle becomes visible.
    let period=null;
    let lo=0,hi=htf.length;
    while(lo<hi){const m=(lo+hi)>>>1;if(htf[m].end<=bar.time)lo=m+1;else hi=m;}
    if(lo<htf.length && htf[lo].time<=bar.time && bar.time<htf[lo].end) period=htf[lo].time;
    const previous=confirmedHTFAt(bar.time,htf);
    let newDetection=false;
    if(period!==null && period!==lastPeriod){
      lastPeriod=period;
      if(previous && previous.time!==lastInsertedTime){
        recent.unshift({time:previous.time,open:previous.open,high:previous.high,low:previous.low,close:previous.close});
        if(recent.length>300)recent.pop();
        lastInsertedTime=previous.time;
        newDetection=true;
      }
    }
    result.push({chartBar:i,time:bar.time,newDetection,recent:recent.map(b=>({...b})),previousHTF:previous?{...previous}:null});
  }
  return result;
}
