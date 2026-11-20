/** Historical OB replay with provider-aligned detection and optional lock TF bars.
 * Partial V0.99 compatibility: chart TF <= detection TF, historical bars only.
 * Locked close is sampled from previous completed lock-TF candle with gaps_off.
 * Source calculates obCheckGate but does not apply it in f_confirmOBs().
 */
import {validateCandles,validateHTFBars,confirmedHTFAt} from './pine-foundation.js';
import {createOBDetectionFeed} from './mtf-ob-feed.js';
import {pineATR,initialSwingState,stepSwings} from './ob-dependencies.js';
import {initialOBState,stepOB} from './ob-engine.js';

export function replayOBHistoryMTF(chartInput, detectionInput, options={}) {
  const chart=validateCandles(chartInput);
  const {chartTfMs,detectTfMs,minTick,lockOBtoTF=false,lockTfMs=chartTfMs,
    lockBars=null,deadline=5,swingLookback=1,swingLookforward=1,atrLength=20,
    cut=()=>true,sessionValid=()=>true,extraContext=()=>({}),config={}}=options;
  if(!Number.isSafeInteger(chartTfMs)||chartTfMs<=0||!Number.isSafeInteger(detectTfMs)||detectTfMs<=0||chartTfMs>detectTfMs) throw new Error('Requires chartTfMs <= detectTfMs');
  if(!Number.isSafeInteger(lockTfMs)||lockTfMs<=0) throw new Error('Invalid lock timeframe');
  if(!Number.isFinite(minTick)||minTick<=0) throw new Error('minTick required');
  if(!Number.isInteger(deadline)||deadline<1) throw new Error('Invalid OB deadline');
  for(const f of [cut,sessionValid,extraContext]) if(typeof f!=='function') throw new TypeError('Callbacks must be functions');
  const locked=lockOBtoTF && chartTfMs<lockTfMs;
  const locks=locked?validateHTFBars(lockBars):null;
  const feed=createOBDetectionFeed(chart,detectionInput,{chartTfMs,detectTfMs});
  const atr=pineATR(chart,atrLength);
  let swings=initialSwingState(),ob=initialOBState();
  const events=[],snapshots=[];
  for(let i=0;i<chart.length;i++){
    const bar=chart[i];
    const eligible=Boolean(cut(bar,i));
    const swingResult=stepSwings(swings,chart,i,{lookback:swingLookback,lookforward:swingLookforward,cut:eligible});
    swings=swingResult.state;
    for(const event of swingResult.events)events.push({chartBar:i,source:'swing',...event});
    const previousLock=locked?confirmedHTFAt(bar.time,locks):null;
    const checkClose=locked?(previousLock?.close??null):bar.close;
    const supplied=extraContext(bar,i);
    if(supplied && ['recent','swings','atr','chartBarIndex','checkClose','newDetection','time','close'].some(k=>k in supplied)) throw new Error('Cannot override calculated replay dependencies');
    // Pine na comparison evaluates false. null must never be coerced to zero.
    // Pending candidates can expire before lock data becomes available.
    const result=stepOB(ob,{
      ...supplied,chartBarIndex:i,time:bar.time,close:bar.close,
      recent:feed[i].recent,newDetection:feed[i].newDetection,cut:eligible,
      atr:atr[i],swings,minTick,detectTfMs,
      checkClose:checkClose===null?NaN:checkClose,
      sessionValid:Boolean(sessionValid(bar,i))
    },{...config,chartTfMs,deadline:locked?Math.trunc(deadline*(lockTfMs/chartTfMs)):deadline});
    ob=result.state;
    for(const event of result.events)events.push({chartBar:i,source:'ob',...event});
    snapshots.push({chartBar:i,time:bar.time,newDetection:feed[i].newDetection,
      lockActive:locked,checkClose,atr:atr[i],lastOBDir:ob.lastOBDir,
      pendingBear:ob.pendingBear.length,pendingBull:ob.pendingBull.length,
      bearBoxes:ob.bearBoxes.length,bullBoxes:ob.bullBoxes.length});
  }
  return {state:ob,swings,events,snapshots};
}
