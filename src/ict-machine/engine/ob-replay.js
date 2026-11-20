/** Historical OB replay adapter. Restricted to chart TF == OB detection TF.
 * Caller supplies provider-aligned chart candles, explicit chart TF milliseconds,
 * Pine's historical `cut` predicate and tick size. Does not emulate request.security.
 */
import {validateCandles} from './pine-foundation.js';
import {pineATR,initialSwingState,stepSwings} from './ob-dependencies.js';
import {initialOBState,stepOB} from './ob-engine.js';

export function replayOBHistory(input, options={}) {
  const bars=validateCandles(input);
  const {chartTfMs=900000,detectTfMs=900000,minTick,cut=()=>true,
    swingLookback=1,swingLookforward=1,atrLength=20,
    config={},sessionValid=()=>true,extraContext=()=>({})}=options;
  if(chartTfMs!==detectTfMs) throw new Error('Replay requires chart timeframe equal OB detection timeframe; MTF adapter not implemented');
  if(!Number.isFinite(minTick)||minTick<=0) throw new Error('minTick required');
  if(typeof cut!=='function'||typeof sessionValid!=='function'||typeof extraContext!=='function') throw new TypeError('Replay callbacks required');
  const atr=pineATR(bars,atrLength);
  let swings=initialSwingState(), ob=initialOBState();
  const events=[], snapshots=[];
  // Pine request.security(expr[1],lookahead_on) returns the preceding confirmed
  // detection-TF candle at the new timeframe boundary. On equal TF, this is
  // the preceding bar, not the current bar.
  const recent=[];
  for(let i=0;i<bars.length;i++) {
    const bar=bars[i], eligible=Boolean(cut(bar,i));
    const swingResult=stepSwings(swings,bars,i,{lookback:swingLookback,lookforward:swingLookforward,cut:eligible});
    swings=swingResult.state;
    for(const event of swingResult.events) events.push({chartBar:i,source:'swing',...event});
    if(i>0) recent.unshift(bars[i-1]);
    if(recent.length>300) recent.pop();
    const supplied=extraContext(bar,i);
    if(supplied && ('recent' in supplied || 'swings' in supplied || 'atr' in supplied || 'chartBarIndex' in supplied)) throw new Error('Cannot override calculated replay dependencies');
    const result=stepOB(ob,{
      ...supplied,chartBarIndex:i,time:bar.time,close:bar.close,
      recent,newDetection:i>0,cut:eligible,atr:atr[i],swings,
      minTick,detectTfMs,sessionValid:Boolean(sessionValid(bar,i))
    },{chartTfMs,...config});
    ob=result.state;
    for(const event of result.events) events.push({chartBar:i,source:'ob',...event});
    snapshots.push({chartBar:i,time:bar.time,atr:atr[i],lastOBDir:ob.lastOBDir,
      pendingBear:ob.pendingBear.length,pendingBull:ob.pendingBull.length,
      bearBoxes:ob.bearBoxes.length,bullBoxes:ob.bullBoxes.length});
  }
  return {state:ob,swings,events,snapshots};
}
