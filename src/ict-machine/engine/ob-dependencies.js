/** Source-derived V0.99 dependencies. Candles ordered oldest to newest.
 * This module does not emulate Pine request.security or the full swing/BOS drawing lifecycle.
 */
import {validateCandles} from './pine-foundation.js';

/** Pine ta.atr(length): Wilder RMA of true range, seeded by SMA of first length TR values.
 * Missing warmup values are null (Pine na). Index 0 TR uses high-low.
 */
export function pineATR(input, length=20) {
  const bars=validateCandles(input);
  if(!Number.isInteger(length)||length<1) throw new RangeError('ATR length must be positive integer');
  const out=Array(bars.length).fill(null);
  let sum=0, previous=null;
  for(let i=0;i<bars.length;i++) {
    const b=bars[i], p=bars[i-1];
    const tr=p ? Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close)) : b.high-b.low;
    if(i<length) sum+=tr;
    if(i===length-1) {previous=sum/length;out[i]=previous;}
    else if(i>=length) {previous=(previous*(length-1)+tr)/length;out[i]=previous;}
  }
  return out;
}

export function initialSwingState() {
  return {lastSwingType:0,swingHighPrice:null,swingLowPrice:null,highs:[],lows:[],lastHighBar:null,lastLowBar:null};
}
/** One confirmed chart bar; candidate swing is at index-lookforward.
 * Pine checks swingHigh first, else swingLow; equal highs/lows pass comparisons.
 * `cut` gates surviving record insertion but not the underlying swing calculation.
 * Surviving records mirror the source's consecutive same-type replacement and 300 cap.
 */
export function stepSwings(state, bars, index, {lookback=1,lookforward=1,cut=true}={}) {
  if(!Number.isInteger(lookback)||lookback<1||!Number.isInteger(lookforward)||lookforward<1) throw new RangeError('Invalid swing lookback/forward');
  if(!Number.isInteger(index)||index<0||index>=bars.length) throw new RangeError('Invalid index');
  const s=structuredClone(state),events=[];
  const j=index-lookforward;
  if(j-lookback<0) return {state:s,events};
  const b=bars[j];
  let hi=true,lo=true;
  for(let k=1;k<=lookback;k++){hi &&= b.high>=bars[j-k].high;lo &&= b.low<=bars[j-k].low;}
  for(let k=1;k<=lookforward;k++){hi &&= b.high>=bars[j+k].high;lo &&= b.low<=bars[j+k].low;}
  let direction=null;
  if(hi){
    if(s.lastSwingType!==1 || b.high>s.swingHighPrice){direction='high';s.swingHighPrice=b.high;s.lastSwingType=1;}
  }else if(lo){
    if(s.lastSwingType!==-1 || b.low<s.swingLowPrice){direction='low';s.swingLowPrice=b.low;s.lastSwingType=-1;}
  }
  if(direction && cut){
    const key=direction==='high'?'highs':'lows', lastKey=direction==='high'?'lastHighBar':'lastLowBar';
    // Consecutive same-type swing label replacement follows source's swingTypes[0].
    if(s.lastRecordedType===direction) s[key].shift();
    s[key].unshift({time:b.time,price:direction==='high'?b.high:b.low,barIndex:j});
    if(s[key].length>300) s[key].pop();
    s[lastKey]=j;s.lastRecordedType=direction;
    events.push({type:'confirmed-swing',direction,time:b.time,price:direction==='high'?b.high:b.low,barIndex:j,confirmedAt:index});
  }
  return {state:s,events};
}
export function replaySwings(input,options={}) {
  const bars=validateCandles(input);let state=initialSwingState();const events=[];
  for(let i=0;i<bars.length;i++){const result=stepSwings(state,bars,i,options);state=result.state;events.push(...result.events);}
  return {state,events};
}
