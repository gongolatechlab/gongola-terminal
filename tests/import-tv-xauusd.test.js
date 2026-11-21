import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, convertTradingViewCsv } from '../scripts/import-tv-xauusd.mjs';

const t = Date.UTC(2026, 10, 18, 12);
const header = 'time,open,high,low,close,Plot';
const line = (time, high = 4002) => `${time},4000,${high},3998,4001,abc`;
const run = (rows, opts = {}) => convertTradingViewCsv([header, ...rows].join('\n'), { asOfMs: t + 3_600_000, ...opts });

test('accepts unix seconds and ignores indicator plot column', () => {
  const out = run([line(t / 1000), line((t + 900000) / 1000)]);
  assert.equal(out.payload.candles.length, 2);
  assert.equal(out.payload.candles[0].time, t);
});
test('accepts unix milliseconds', () => assert.equal(run([line(t)]).payload.candles[0].time, t));
test('accepts RFC3339 UTC and offset time', () => {
  assert.equal(run([line('2026-11-18T12:00:00Z')]).payload.candles[0].time, t);
  assert.equal(run([line('2026-11-18T13:00:00+01:00')]).payload.candles[0].time, t);
});
test('quoted CSV and BOM handled', () => {
  const rows = parseCsv('\ufeff"time",open,high,low,close,Plot\r\n"1763467200",4000,4002,3998,4001,"a,b"\r\n');
  assert.equal(rows[1][5], 'a,b');
});
test('rejects timezone-naive date', () => assert.throws(() => run([line('2026-11-18 12:00:00')]), /timezone-ambiguous/));
test('rejects invalid OHLC', () => assert.throws(() => run([line(t,3990)]), /OHLC/));
test('rejects out-of-order bars', () => assert.throws(() => run([line(t+900000), line(t)]), /timestamp/));
test('rejects duplicate required headers', () => assert.throws(() => convertTradingViewCsv('time,open,OPEN,high,low,close\n' + `${t},4000,4000,4002,3998,4001`,{asOfMs:t+3600000}), /Duplicate CSV column/));
test('trims only last unclosed bar and reports', () => {
  const out = run([line(t),line(t + 900000)], { asOfMs:t+900000+200000 });
  assert.equal(out.excludedOpenBar,1);
  assert.equal(out.payload.candles.length,1);
});
test('preserves gaps and reports them', () => {
  const out = run([line(t),line(t + 2700000)]);
  assert.equal(out.gaps[0].missingIntervals,2);
});
test('rejects malformed CSV and missing columns', () => {
  assert.throws(()=>parseCsv('a,"unfinished'),/Unclosed/);
  assert.throws(()=>convertTradingViewCsv(`time,open,high,low\n${t},4000,4002,3998`,{asOfMs:t+3600000}),/Missing CSV column/);
});
