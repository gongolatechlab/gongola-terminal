import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePriorDayLiquidity, calculateConfirmedSwings, newYorkDay}
  from '../src/ict-machine/market-structure.js';

const bar = (iso, open, high, low, close) => ({time:Date.parse(iso),open,high,low,close});

test('New York date respects daylight saving time at midnight', () => {
  assert.equal(newYorkDay(Date.parse('2026-03-08T04:45:00Z')),'2026-03-07');
  assert.equal(newYorkDay(Date.parse('2026-03-08T05:00:00Z')),'2026-03-08');
  assert.equal(newYorkDay(Date.parse('2026-03-09T04:00:00Z')),'2026-03-09');
});

test('DOL is created only upon the next NY day', () => {
  const bars=[bar('2026-11-18T05:00:00Z',10,12,9,11),bar('2026-11-18T20:00:00Z',11,13,8,9)];
  assert.deepEqual(calculatePriorDayLiquidity(bars).lines, []);
  bars.push(bar('2026-11-19T05:00:00Z',9,11,7.5,10));
  const d=calculatePriorDayLiquidity(bars);
  assert.equal(d.activeBSL,1);assert.equal(d.activeSSL,0);
  assert.equal(d.lines.find(x=>x.type==='BSL').price,13);
  assert.equal(d.lines.find(x=>x.type==='SSL').price,8);
  assert.equal(d.lines.find(x=>x.type==='SSL').mitigated,true);
});

test('BSL wick touch freezes its line on mitigation bar', () => {
  const bars=[bar('2026-11-18T05:00:00Z',10,12,9,11),
    bar('2026-11-19T05:00:00Z',10,11,9.5,10),
    bar('2026-11-19T05:15:00Z',10,12,9.5,11),
    bar('2026-11-19T05:30:00Z',11,13,10,12)];
  const lines=calculatePriorDayLiquidity(bars).lines;
  const high=lines.find(x=>x.type==='BSL');
  assert.equal(high.mitigated,true);
  assert.equal(high.touchedAt,bars[2].time);
  assert.equal(high.endTime,bars[2].time);
});

test('DOL track caps are separate by side and mitigation',()=>{
  const days=Array.from({length:6},(_,i)=>bar(`2026-11-${String(10+i).padStart(2,'0')}T05:00:00Z`,10,20-i,2+i,9));
  const d=calculatePriorDayLiquidity(days,{maxUnmitigated:2,maxMitigated:0});
  assert.equal(d.activeBSL,2);assert.equal(d.activeSSL,2);
  assert.equal(d.lines.length,4);
  assert.equal(d.totalCreated,10);
});

test('swing confirmation needs lookforward completed candle',()=>{
  const a=[bar('2026-11-18T05:00:00Z',9,10,8,9),
    bar('2026-11-18T05:15:00Z',9,12,9,11),
    bar('2026-11-18T05:30:00Z',11,11,10,11)];
  assert.equal(calculateConfirmedSwings(a.slice(0,2)).length,0);
  const s=calculateConfirmedSwings(a);
  assert.equal(s[0].type,'high'); assert.equal(s[0].price,12);
  assert.equal(s[0].confirmedAt,a[2].time);
});

test('consecutive higher high replaces prior high, not double plots',()=>{
  const a=[
    bar('2026-11-18T05:00:00Z',9,10,8,9),
    bar('2026-11-18T05:15:00Z',10,14,8.1,10),
    bar('2026-11-18T05:30:00Z',10,12,8.2,11),
    bar('2026-11-18T05:45:00Z',10,15,8.3,12),
    bar('2026-11-18T06:00:00Z',11,13,8.4,12)];
  const s=calculateConfirmedSwings(a);
  assert.equal(s.length,1);
  assert.equal(s[0].price,15);
});

test('equal-price consecutive swing high does not replace extreme',()=>{
  const a=[
    bar('2026-11-18T05:00:00Z',9,10,8,9),
    bar('2026-11-18T05:15:00Z',10,12,8.1,10),
    bar('2026-11-18T05:30:00Z',10,11,8.2,10),
    bar('2026-11-18T05:45:00Z',10,12,8.3,10),
    bar('2026-11-18T06:00:00Z',10,11,8.4,10)];
  const s=calculateConfirmedSwings(a);
  assert.equal(s.length,1);
  assert.equal(s[0].time,a[1].time);
});

test('invalid or unordered candle data fails closed',()=>{
  assert.throws(()=>calculatePriorDayLiquidity([bar('2026-11-18T05:00:00Z',10,9,8,10)]),/Invalid/);
  const b=bar('2026-11-18T05:00:00Z',10,12,8,10);
  assert.throws(()=>calculateConfirmedSwings([b,b]),/Invalid/);
});
