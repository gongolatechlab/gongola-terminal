import {regularFVGGeometry,enforceFVGDisplayLimits} from './fvg-drawings.js';
/** Historical regular/ inverse FVG drawing lifecycle modeled on V0.99.
 * Maintains tracked arrays separately from drawings (Pine box.delete semantics).
 * Reclaimed states are intentionally excluded: they require enabled signal filter
 * and session bias, which are outside the active user preset.
 */
export function replayFVGLifecycle(candles, creationEvents, {maxFVGAge=20,deleteMitigated=true,extendFVG=false,maxFVGtoShow=300,timeframeMultiplier=15,chartTfMinutes=15,enableSignalFilter=false}={}) {
  if (!Array.isArray(candles)||!Array.isArray(creationEvents)) throw new TypeError('Expected candle and creation event arrays');
  if (!Number.isInteger(maxFVGAge)||maxFVGAge<0) throw new RangeError('Invalid FVG age');
  if(!Number.isInteger(maxFVGtoShow)||maxFVGtoShow<1)throw new RangeError('Invalid max FVG display count');
  const tracked={bullish:[],bearish:[],inverseBullish:[],inverseBearish:[]};
  const drawings=new Map(),events=[],snapshots=[];
  const byBar=new Map();let nextId=1;
  for(const event of creationEvents){
    if(event.type!=='fvg-created')continue;
    if(!Number.isInteger(event.chartBar)||event.chartBar<0||event.chartBar>=candles.length)throw new Error('Invalid creation bar');
    if(!byBar.has(event.chartBar))byBar.set(event.chartBar,[]);
    byBar.get(event.chartBar).push(event);
  }
  function create(kind,bar,top,bottom,originBar,formationTime){
    const id=nextId++;
    const geometry=regularFVGGeometry({formationTime,createdTime:candles[bar].time,timeframeMultiplier,top,bottom,extendFVG});
    const inverse=kind.startsWith('inverse');
    const drawing={id,kind,top,bottom,originBar,createdBar:bar,formationTime,deleted:false,extendFVG,
      left:inverse?geometry.inverseLeft:geometry.left,
      right:inverse?geometry.inverseRight:geometry.right,
      xloc:geometry.xloc,extend:geometry.extend};
    drawings.set(id,drawing);tracked[kind].push(id);
    events.push({type:'drawing-created',bar,id,kind,top,bottom});
    return id;
  }
  function untrack(kind,index,bar,reason,deleteDrawing=false){
    const [id]=tracked[kind].splice(index,1);
    events.push({type:'drawing-untracked',bar,id,kind,reason});
    if(deleteDrawing){drawings.get(id).deleted=true;events.push({type:'drawing-deleted',bar,id,kind,reason});}
  }
  for(let i=0;i<candles.length;i++){
    const close=candles[i].close;
    if(!Number.isFinite(close))throw new Error(`Invalid close at bar ${i}`);
    // Pine creates regular FVGs before processing inversion on the same bar.
    for(const e of byBar.get(i)||[]){
      if(!Number.isFinite(e.top)||!Number.isFinite(e.bottom)||e.top<=e.bottom)throw new Error('Invalid FVG bounds');
      create(e.direction==='+'?'bullish':'bearish',i,e.top,e.bottom,i,e.formationTime);
    }
    for(const [kind,inverseKind,invalidated] of [
      ['bullish','inverseBullish',d=>close<d.bottom],
      ['bearish','inverseBearish',d=>close>d.top]
    ]){
      for(let j=tracked[kind].length-1;j>=0;j--){
        const d=drawings.get(tracked[kind][j]);
        if(invalidated(d)&&i-d.originBar<=maxFVGAge){
          // shouldShowFVG(..., true) bypasses Recent OB filter with active preset.
          // No explicit box.delete on original: its drawing remains visible.
          create(inverseKind,i,d.top,d.bottom,i,candles[i].time);
          untrack(kind,j,i,'inverted',false);
        }
      }
    }
    // Reclaimed conversion is not reachable with the user's signal filter OFF.
    if(enableSignalFilter&&chartTfMinutes<=15){
      throw new Error('Reclaimed FVG requires separate session-bias implementation');
    }
    if(deleteMitigated){
      for(const [kind,invalidated,deleteDrawing] of [
        ['inverseBullish',d=>close>d.top,true],
        ['inverseBearish',d=>close<d.bottom,false]
      ]){
        for(let j=tracked[kind].length-1;j>=0;j--){
          const d=drawings.get(tracked[kind][j]);
          if(invalidated(d))untrack(kind,j,i,'inverse-mitigated',deleteDrawing);
        }
      }
    }
    enforceFVGDisplayLimits(tracked,drawings,maxFVGtoShow,i,events);
    snapshots.push({bar:i,tracked:Object.fromEntries(Object.entries(tracked).map(([k,v])=>[k,[...v]])),visibleDrawingIds:[...drawings.values()].filter(d=>!d.deleted).map(d=>d.id)});
  }
  return {events,snapshots,drawings:[...drawings.values()],tracked};
}
