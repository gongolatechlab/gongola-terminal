import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMinorDOL} from '../src/ict-machine/minor-dol.js';
const base=Date.parse('2026-11-18T00:00:00.000Z');
const q=15*60_000;
const bar=(n,{open=100,high=102,low=98,close=100}={})=>({time:base+n*q,open,high,low,close});
const fill=(from,to,values={})=>Array.from({length:to-from},(_,i)=>bar(from+i,values));

test('requires closed-style ascending 15m candle data; no sorting or fabrication',()=>{
  assert.throws(()=>calculateMinorDOL([]),/requires/);
  assert.throws(()=>calculateMinorDOL([bar(1),bar(0)]),/Invalid/);
  assert.throws(()=>calculateMinorDOL([bar(0),bar(0)]),/Invalid/);
  assert.throws(()=>calculateMinorDOL([bar(0,{high:99})]),/Invalid/);
  assert.throws(()=>calculateMinorDOL([{...bar(0),time:base+60_000}]),/Invalid/);
});

test('forms previous 4H high/low at next UTC 4H open, no peek at current period',()=>{
  const bars=[bar(0,{high:104,low:97}),bar(8,{high:109,low:99}),bar(12,{high:105,low:94})];
  assert.equal(calculateMinorDOL(bars).levels.length,0);
  const r=calculateMinorDOL([...bars,bar(16,{high:100,low:96})]);
  assert.equal(r.counts.levelsCreated,2);
  const bsl=r.levels.find(x=>x.type==='BSL');
  const ssl=r.levels.find(x=>x.type==='SSL');
  assert.equal(bsl.price,109);assert.equal(bsl.anchorTime,bar(8).time);
  assert.equal(bsl.startTime,bar(16).time);
  assert.equal(ssl.price,94);assert.equal(ssl.anchorTime,bar(12).time);
  assert.equal(r.activeBSL,1);assert.equal(r.activeSSL,1);
});

test('BSL wick crossing with rejection close creates -TS; freezes mitigated line',()=>{
  const bars=[bar(0,{high:105,low:96}),bar(16,{high:106,low:97,close:99})];
  const r=calculateMinorDOL(bars);
  assert.equal(r.mitigatedBSL,1);
  assert.equal(r.levels.find(x=>x.type==='BSL').touchedAt,bar(16).time);
  assert.deepEqual(r.events.map(e=>e.label),['-TS']);
  assert.equal(r.currentDirection,null,'TS is not a BOS direction');
});

test('BSL above-close confirms +BOS once original extreme has aged 3 bars',()=>{
  const r=calculateMinorDOL([bar(0,{high:105,low:96}),...fill(1,16,{high:103,low:97}),bar(16,{high:108,low:97,open:100,close:107})]);
  assert.deepEqual(r.events.map(e=>e.label),['+BOS']);
  assert.equal(r.currentDirection,'+');
});

test('SSL below-close confirms -BOS, a later BSL close confirms +MSS',()=>{
  const bars=[bar(0,{high:105,low:95}),...fill(1,16,{high:103,low:97}),bar(16,{open:100,high:103,low:94,close:94.5}),
    bar(17,{open:95,high:107,low:95,close:106})];
  const r=calculateMinorDOL(bars);
  assert.deepEqual(r.events.map(e=>e.label),['-BOS','+MSS']);
  assert.equal(r.currentDirection,'+');
});

test('TS reversal relabels old label as BOS without creating a duplicate TS',()=>{
  const bars=[bar(0,{high:105,low:95}),bar(16,{open:100,high:106,low:97,close:100}),
    bar(17,{open:100,high:108,low:99,close:107})];
  const a=calculateMinorDOL(bars.slice(0,2));
  assert.equal(a.events.find(e=>e.label==='-TS')?.time,bar(16).time);
  const b=calculateMinorDOL(bars);
  assert.equal(b.events.some(e=>e.type==='TS'),false);
  assert.equal(b.events.find(e=>e.label==='+BOS')?.time,bar(16).time);
  assert.equal(b.events[0].convertedAt,bar(17).time);
});

test('BOS minimum age uses formation bar, not mitigation bar',()=>{
  const bars=[bar(0),bar(1,{high:110,low:99,open:100,close:105}),
    bar(2),bar(16,{high:111,low:98,close:111,open:100})];
  const r=calculateMinorDOL(bars,{minBarsBOS:20});
  assert.equal(r.events.filter(e=>e.type==='BOS'||e.type==='MSS').length,0);
});

test('4H period boundaries honor configured 15m offsets without shifting prices',()=>{
  const bars=[bar(1,{high:105,low:95}),bar(16),bar(17,{high:104,low:96})];
  const noOffset=calculateMinorDOL(bars);
  const withOffset=calculateMinorDOL(bars,{boundaryOffsetMs:q});
  assert.equal(noOffset.counts.levelsCreated,2);
  assert.equal(withOffset.counts.levelsCreated,2);
  assert.equal(noOffset.levels.find(l=>l.type==='BSL').price,105);
  assert.equal(withOffset.levels.find(l=>l.type==='BSL').price,105);
  assert.equal(noOffset.levels.find(l=>l.type==='BSL').startTime,bar(16).time);
  assert.equal(withOffset.levels.find(l=>l.type==='BSL').startTime,bar(17).time);
});

test('applies separate per-side retention of active and mitigated levels',()=>{
  const bars=[];
  for(let k=0;k<6;k++) bars.push(bar(k*16,{high:120-k,low:80+k}));
  const r=calculateMinorDOL(bars,{maxUnmitigated:2,maxMitigated:0});
  assert.equal(r.activeBSL,2);assert.equal(r.activeSSL,2);
  assert.equal(r.levels.length,4);
});

test('never synthesizes missing 15m/4H bars across data gaps',()=>{
  const r=calculateMinorDOL([bar(0,{high:106,low:93}),bar(33,{high:104,low:95})]);
  assert.equal(r.counts.levelsCreated,2);
  assert.equal(r.levels.find(l=>l.type==='BSL').startTime,bar(33).time);
});

test('rejects unsupported timeframes and invalid caps',()=>{
  assert.throws(()=>calculateMinorDOL([bar(0)],{periodMs:q}),/Only 4-hour/);
  assert.throws(()=>calculateMinorDOL([bar(0)],{maxUnmitigated:0}),/Invalid/);
  assert.throws(()=>calculateMinorDOL([bar(0)],{boundaryOffsetMs:1}),/Invalid/);
});
