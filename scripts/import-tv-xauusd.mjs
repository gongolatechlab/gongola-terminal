import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestXAUUSD15mHistorical } from '../src/ict-machine/historical-feed.js';

const PERIOD_MS = 900_000;
const REQUIRED = ['time', 'open', 'high', 'low', 'close'];

export function parseCsv(input) {
  if (typeof input !== 'string') throw new TypeError('CSV text required');
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      if (field.trim()) throw new Error('Unexpected quote in CSV');
      quoted = true;
    } else if (c === ',') {
      row.push(field.trim()); field = '';
    } else if (c === '\n') {
      row.push(field.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(value => value !== '')) rows.push(row);
  }
  return rows;
}

function parseTime(value) {
  if (/^\d{10}$/.test(value)) return Number(value) * 1000;
  if (/^\d{13}$/.test(value)) return Number(value);
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Unsupported or timezone-ambiguous candle time: ${value}`);
}

function parsePrice(value, row, name) {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
    throw new Error(`Invalid ${name} on CSV row ${row}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Invalid ${name} on CSV row ${row}`);
  return number;
}

export function convertTradingViewCsv(text, { asOfMs = Date.now() } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV requires a header and candle rows');
  const header = rows[0].map(value => value.toLowerCase());
  const indices = Object.fromEntries(REQUIRED.map(name => [name, header.indexOf(name)]));
  for (const name of REQUIRED) {
    if (indices[name] < 0) throw new Error(`Missing CSV column: ${name}`);
    if (header.lastIndexOf(name) !== indices[name]) throw new Error(`Duplicate CSV column: ${name}`);
  }
  const bars = rows.slice(1).map((row, i) => {
    if (row.length !== header.length) throw new Error(`CSV row ${i + 2} column count mismatch`);
    const value = field => row[indices[field]];
    return {
      time: parseTime(value('time')),
      open: parsePrice(value('open'), i + 2, 'open'),
      high: parsePrice(value('high'), i + 2, 'high'),
      low: parsePrice(value('low'), i + 2, 'low'),
      close: parsePrice(value('close'), i + 2, 'close'),
    };
  });
  const last = bars[bars.length - 1];
  const omitLast = last.time + PERIOD_MS > asOfMs;
  const closedBars = omitLast ? bars.slice(0, -1) : bars;
  if (!closedBars.length) throw new Error('No completed candles in export');
  const payload = {
    metadata: { provider: 'FOREXCOM', symbol: 'XAUUSD', timeframeMinutes: 15, timeUnit: 'ms', historical: true, simulated: false },
    candles: closedBars,
  };
  const checked = ingestXAUUSD15mHistorical(payload, { asOfMs });
  return { payload, gapCount: checked.gaps.length, gaps: checked.gaps, excludedOpenBar: omitLast ? 1 : 0 };
}

async function main() {
  const [filename, declaration] = process.argv.slice(2);
  if (!filename || declaration !== '--chart=FOREXCOM:XAUUSD') {
    throw new Error('Usage: node scripts/import-tv-xauusd.mjs /path/to/export.csv --chart=FOREXCOM:XAUUSD');
  }
  const bytes = await readFile(filename);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const checked = convertTradingViewCsv(bytes.toString('utf8'));
  const outputDir = join(process.cwd(), 'local-data');
  const output = join(outputDir, `xauusd-15m-${digest.slice(0, 16)}.json`);
  const artifact = {
    ...checked.payload,
    provenance: {
      source: 'user-supplied TradingView chart CSV',
      declaredChart: 'FOREXCOM:XAUUSD',
      authenticated: false,
      sha256: digest,
      importedAt: new Date().toISOString(),
      sourceFilename: basename(filename),
    },
  };
  await mkdir(outputDir, { recursive: true });
  try {
    await writeFile(output, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  console.log(JSON.stringify({ output, bars: artifact.candles.length, earliest: new Date(artifact.candles[0].time).toISOString(), latest: new Date(artifact.candles.at(-1).time).toISOString(), gaps: checked.gapCount, excludedOpenBar: checked.excludedOpenBar, authenticated: false }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error('Import rejected:', error.message); process.exitCode = 1; });
}
