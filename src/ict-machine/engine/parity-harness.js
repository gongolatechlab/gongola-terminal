/** Deterministic comparison of engine events with independently captured TradingView events.
 * No reference observations are manufactured by this module.
 */
import {replayOBToFVGLifecycle} from './fvg-replay.js';

const TYPES = new Set(['ob-confirmed','ob-deleted','fvg-created','fvg-inverted','drawing-created','drawing-untracked','drawing-deleted']);
const DEFAULT_FIELDS = {
  'ob-confirmed':['chartBar','direction','top','bottom'],
  'ob-deleted':['chartBar','reason'],
  'fvg-created':['chartBar','direction','top','bottom'],
  'fvg-inverted':['chartBar','direction','top','bottom'],
  'drawing-created':['chartBar','kind','top','bottom'],
  'drawing-untracked':['chartBar','kind','reason'],
  'drawing-deleted':['chartBar','kind','reason']
};

export function normalizeEngineEvents(replay){
  const ob=(replay.ob?.events??[]).filter(e=>e.source==='ob'&&(e.type==='confirmed'||e.type==='deleted')).map(e=>({
    type:`ob-${e.type}`,chartBar:e.chartBar,direction:e.box?.direction,top:e.box?.top,bottom:e.box?.bottom,reason:e.reason
  }));
  const fvg=(replay.fvg?.events??[]).filter(e=>e.type==='fvg-created').map(e=>({type:'fvg-created',chartBar:e.chartBar,direction:e.direction,top:e.top,bottom:e.bottom}));
  const drawings=(replay.lifecycle?.events??[]).map(e=>({type:e.type,chartBar:e.bar,kind:e.kind,top:e.top,bottom:e.bottom,reason:e.reason}));
  return [...ob,...fvg,...drawings].filter(e=>TYPES.has(e.type)).sort((a,b)=>a.chartBar-b.chartBar||a.type.localeCompare(b.type));
}

export function compareParity(actual,reference,{priceTolerance=0,fields=DEFAULT_FIELDS}={}){
  if(!Array.isArray(actual)||!Array.isArray(reference))throw new TypeError('Expected event arrays');
  if(!Number.isFinite(priceTolerance)||priceTolerance<0)throw new RangeError('Invalid price tolerance');
  for(const [name,events] of [['actual',actual],['reference',reference]])for(const [i,e] of events.entries()){
    if(!e||!TYPES.has(e.type)||!Number.isInteger(e.chartBar)||e.chartBar<0)throw new Error(`Invalid ${name} event ${i}`);
  }
  const unmatchedActual=new Set(actual.map((_,i)=>i));
  const missing=[];
  for(const expected of reference){
    const matching=[...unmatchedActual].find(i=>{
      const got=actual[i];
      if(got.type!==expected.type||got.chartBar!==expected.chartBar)return false;
      return (fields[expected.type]??[]).every(field=>{
        if(!(field in expected))return true;
        const a=got[field],b=expected[field];
        return ['top','bottom'].includes(field)&&typeof a==='number'&&typeof b==='number' ? Math.abs(a-b)<=priceTolerance : a===b;
      });
    });
    if(matching===undefined)missing.push(expected);else unmatchedActual.delete(matching);
  }
  const unexpected=[...unmatchedActual].map(i=>actual[i]);
  return {pass:missing.length===0&&unexpected.length===0,expectedCount:reference.length,actualCount:actual.length,matched:reference.length-missing.length,missing,unexpected};
}

export function runParityFixture(fixture){
  if(!fixture||!Array.isArray(fixture.referenceEvents)||fixture.referenceEvents.length===0)throw new Error('Independent nonempty TradingView referenceEvents required');
  if(!fixture.chart||!fixture.detection||!fixture.obOptions||!fixture.fvgOptions)throw new Error('Missing replay inputs');
  const replay=replayOBToFVGLifecycle(fixture.chart,fixture.detection,fixture.obOptions,fixture.fvgOptions,fixture.lifecycleOptions);
  return compareParity(normalizeEngineEvents(replay),fixture.referenceEvents,fixture.compareOptions);
}

/** Strict sequence comparison. Unlike compareParity, this detects permutations.
 * `identityField` is an optional externally assigned stable logical drawing key;
 * Pine object handles and engine numeric ids are not inherently comparable.
 */
export function compareOrderedParity(actual, reference, {priceTolerance=0, identityField=null}={}) {
  if(!Array.isArray(actual)||!Array.isArray(reference))throw new TypeError('Expected event arrays');
  if(!Number.isFinite(priceTolerance)||priceTolerance<0)throw new RangeError('Invalid price tolerance');
  if(identityField!==null&&(typeof identityField!=='string'||!identityField.trim()))throw new TypeError('Invalid identity field');
  const mismatches=[];
  const max=Math.max(actual.length,reference.length);
  for(let i=0;i<max;i++){
    const got=actual[i],expected=reference[i];
    if(!got||!expected){mismatches.push({index:i,reason:!got?'missing-event':'unexpected-event',expected,actual:got});continue;}
    if(!TYPES.has(got.type)||!TYPES.has(expected.type)||!Number.isInteger(got.chartBar)||!Number.isInteger(expected.chartBar)||got.chartBar<0||expected.chartBar<0){
      mismatches.push({index:i,reason:'invalid-event',expected,actual:got});continue;
    }
    const required=new Set(['type','chartBar',...(DEFAULT_FIELDS[expected.type]??[])]);
    if(identityField)required.add(identityField);
    for(const field of required){
      if(!(field in expected))continue;
      const a=got[field],b=expected[field];
      const same=['top','bottom'].includes(field)&&typeof a==='number'&&typeof b==='number'
        ? Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=priceTolerance
        : a===b;
      if(!same)mismatches.push({index:i,reason:'field-mismatch',field,expected:b,actual:a});
    }
  }
  return {pass:mismatches.length===0,expectedCount:reference.length,actualCount:actual.length,mismatches};
}

/** Attach explicit event ordering within the originating event stream.
 * Cross-stream event ordering cannot be inferred from separately logged arrays.
 */
export function normalizeOrderedEventStreams(replay){
  const ob=(replay.ob?.events??[]).filter(e=>e.source==='ob'&&(e.type==='confirmed'||e.type==='deleted')).map((e,i)=>({
    stream:'ob',sequence:i,type:`ob-${e.type}`,chartBar:e.chartBar,direction:e.box?.direction,top:e.box?.top,bottom:e.box?.bottom,reason:e.reason
  }));
  const fvg=(replay.fvg?.events??[]).filter(e=>e.type==='fvg-created').map((e,i)=>({
    stream:'fvg',sequence:i,type:'fvg-created',chartBar:e.chartBar,direction:e.direction,top:e.top,bottom:e.bottom
  }));
  const drawings=(replay.lifecycle?.events??[]).map((e,i)=>({
    stream:'drawing',sequence:i,type:e.type,chartBar:e.bar,engineId:e.id,kind:e.kind,top:e.top,bottom:e.bottom,reason:e.reason
  }));
  return {ob,fvg,drawing:drawings};
}

/** Compare each stream in source order; reject missing or unexpected events. */
export function compareStreamParity(actualStreams,referenceStreams,options={}){
  const results={};let pass=true;
  for(const stream of ['ob','fvg','drawing']){
    const actual=actualStreams?.[stream]??[];
    const reference=referenceStreams?.[stream]??[];
    const result=compareOrderedParity(actual,reference,options);
    results[stream]=result;if(!result.pass)pass=false;
  }
  return {pass,streams:results};
}
