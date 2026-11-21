import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateICTMacros, MACRO_TIMES_NY} from '../src/ict-machine/ict-macros.js';
const interval=900_000;
const bars=(start,n)=>Array.from({length:n},(_,i)=>({time:start+i*interval}));

test('default active macro times match enabled Pine v1-v4',()=>{
  assert.deepEqual([...MACRO_TIMES_NY],['02:00','05:00','09:00','12:00']);
});
test('winter NYC 02:00 occurs at 07:00 UTC',()=>{
  const start=Date.UTC(2026,0,15,5);
  const out=calculateICTMacros(bars(start,40));
  assert.equal(out.markers[0].time, Date.UTC(2026,0,15,7));
  assert.equal(out.markers[0].label,'02:00');
});
test('summer NYC 02:00 occurs at 06:00 UTC',()=>{
  const start=Date.UTC(2026,6,15,5);
  const out=calculateICTMacros(bars(start,40));
  assert.equal(out.markers[0].time, Date.UTC(2026,6,15,6));
});
test('New York DST spring jump produces no nonexistent 02:00 session',()=>{
  const start=Date.UTC(2026,2,8,5);
  const out=calculateICTMacros(bars(start,96));
  const onDay=out.markers.filter(x=>x.localDate==='2026-03-08');
  assert.deepEqual(onDay.map(x=>x.label),['05:00','09:00','12:00']);
});
test('does not invent macro line when 09:00 NY bar is missing',()=>{
  const start=Date.UTC(2026,6,15,12); // 08:00 NY
  const data=bars(start,14).filter(x=>x.time!==Date.UTC(2026,6,15,13));
  assert.equal(calculateICTMacros(data).markers.some(m=>m.label==='09:00'),false);
});
test('does not synthesize events for a missing weekend',()=>{
  const friday=bars(Date.UTC(2026,6,17,13),2);
  const monday=bars(Date.UTC(2026,6,20,13),2);
  const out=calculateICTMacros([...friday,...monday]);
  assert.equal(out.markers.length,2);
  assert.equal(out.markers[0].localDate,'2026-07-17');
  assert.equal(out.markers[1].localDate,'2026-07-20');
});
test('rejects unsorted, duplicate, or misaligned data',()=>{
  const time=Date.UTC(2026,6,15,13);
  assert.throws(()=>calculateICTMacros([{time},{time}]),/Invalid chronological/);
  assert.throws(()=>calculateICTMacros([{time:time+60_000}]),/Invalid chronological/);
  assert.throws(()=>calculateICTMacros([{time:time+interval},{time}]),/Invalid chronological/);
});
test('retention cap keeps the most recent session lines',()=>{
  const start=Date.UTC(2026,6,15,0);
  const full=calculateICTMacros(bars(start,8*96));
  const cap=calculateICTMacros(bars(start,8*96),{maxLines:3});
  assert.deepEqual(cap.markers,full.markers.slice(-3));
});
test('empty data is allowed; no fabricated markings',()=>{
  assert.deepEqual(calculateICTMacros([]).markers,[]);
});
test('invalid retention cap fails closed',()=>{
  assert.throws(()=>calculateICTMacros([], {maxLines:0}),/retention/);
});
