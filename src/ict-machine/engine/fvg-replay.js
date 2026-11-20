import {replayFVGLifecycle} from './fvg-lifecycle.js';
/** V0.99 regular FVG creation subset. Historical only; no IFVG lifecycle yet.
 * Session membership and time-window eligibility are explicit callbacks until
 * TradingView session/timezone semantics are implemented and parity-tested.
 */
import {PineSeries,validateCandles} from './pine-foundation.js';
import {replayOBHistoryMTF} from './mtf-ob-replay.js';
import {makeFVGSessionEligibility,makeFVGTimeEligibility} from './session-compat.js';

export function fvgDirectionAllowed(direction,lastOBDir,{recentOB=true,minorDOL=false,lastMinorDir=null,signalFilter=false,chartTfMinutes=15,bullishBias=false,bearishBias=false,prevBullishBias=false,prevBearishBias=false,inverse=false}={}) {
  if(recentOB||minorDOL){
    if(inverse)return true;
    return (!recentOB||lastOBDir===direction)&&(!minorDOL||lastMinorDir===direction);
  }
  if(!signalFilter||chartTfMinutes>15||inverse)return true;
  const bull=bullishBias||(!bullishBias&&!bearishBias&&prevBullishBias);
  const bear=bearishBias||(!bullishBias&&!bearishBias&&prevBearishBias);
  return bull ? direction==='+' : bear ? direction==='-' : false;
}

export function replayRegularFVG(chartInput,obSnapshots,{sessionEligible,timeEligible,sessionConfig,showFVG=true,volatilityPeriod=100,displacementMultiplier=0.5,wideGap=18,volatilityFilter=true,recentOB=true,minorDOL=false,signalFilter=false,chartTfMinutes=15,dailyOrHigher=false,minorDirectionAt=()=>null,biasAt=()=>({})}={}) {
  if(typeof sessionEligible!=='function')sessionEligible=makeFVGSessionEligibility(sessionConfig);
  if(typeof timeEligible!=='function')timeEligible=makeFVGTimeEligibility({enableSignalFilter:signalFilter,chartTfMinutes});
  const bars=validateCandles(chartInput),series=new PineSeries(bars);
  if(!Array.isArray(obSnapshots)||obSnapshots.length!==bars.length)throw new Error('One OB snapshot per chart bar required');
  if(!Number.isInteger(volatilityPeriod)||volatilityPeriod<1)throw new Error('Invalid volatility period');
  const events=[];
  for(let i=2;i<bars.length;i++){
    if(!showFVG)continue;
    const bar=bars[i],old=bars[i-2];
    const direction=bar.low>old.high?'+':bar.high<old.low?'-':null;
    if(!direction)continue;
    const top=direction==='+'?bar.low:old.low;
    const bottom=direction==='+'?old.high:bar.high;
    const gap=top-bottom,avg=series.previousMeanRange(i,volatilityPeriod);
    const min=(displacementMultiplier/10)*avg;
    const max=(wideGap*(dailyOrHigher?1.5:1)/10)*avg;
    if(volatilityFilter&&!(avg!==null&&gap>=min&&gap<=max))continue;
    if(!timeEligible(old.time,i,bars)||!sessionEligible(i,bars))continue;
    if(!fvgDirectionAllowed(direction,obSnapshots[i].lastOBDir,{recentOB,minorDOL,lastMinorDir:minorDirectionAt(i),signalFilter,chartTfMinutes,...biasAt(i)}))continue;
    events.push({type:'fvg-created',chartBar:i,time:bar.time,formationTime:old.time,direction,top,bottom,gap,lastOBDir:obSnapshots[i].lastOBDir});
  }
  return {events};
}

/** Integrated historical OB → regular FVG creation; no lifecycle/drawing parity yet. */
export function replayOBToFVG(chart,detection,obOptions,fvgOptions){
  const ob=replayOBHistoryMTF(chart,detection,obOptions);
  const fvg=replayRegularFVG(chart,ob.snapshots,fvgOptions);
  return {ob,fvg};
}

/** Full historical OB → FVG creation → lifecycle for the active preset only. */
export function replayOBToFVGLifecycle(chart,detection,obOptions,fvgOptions,lifecycleOptions={}){
  const base=replayOBToFVG(chart,detection,obOptions,fvgOptions);
  const lifecycle=replayFVGLifecycle(chart,base.fvg.events,{
    maxFVGAge:20,deleteMitigated:true,enableSignalFilter:fvgOptions?.signalFilter??false,
    chartTfMinutes:fvgOptions?.chartTfMinutes??15,...lifecycleOptions
  });
  return {...base,lifecycle};
}
