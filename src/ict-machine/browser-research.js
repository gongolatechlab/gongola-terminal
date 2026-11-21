/**
 * Gongola Terminal: visible ICT Machine research viewer.
 * Reads a local TradingView-style CSV in the user's browser (no upload).
 * Visualizes the locally installed PARTIAL V0.99 OB/FVG engine.
 * Intentionally separate from the disabled official trade-signal gate.
 */
import { replayOBToFVGLifecycle } from './engine/fvg-replay.js';
import { calculatePriorDayLiquidity, calculateConfirmedSwings } from './market-structure.js';
import { mountWorkspaceLayout } from './workspace-layout.js';
import { calculateMinorDOL } from './minor-dol.js';
import { calculateICTMacros, MACRO_TIMES_NY } from './ict-macros.js';
import { aggregate5mTo15m } from './chart-timeframes.js';
import {makeOBSessionEligibility,buildOBMinorContext} from './ob-filter-context.js';
import {makeFVGMinorDirectionAt, normalizeFVGFilterSettings} from './fvg-filter-context.js';
import { mountEliteWorkspace } from './elite-workspace.js';
import { buildResearchTradePlan } from './trade-plan.js';
import { archivedOrderBlocks, archivedFairValueGaps, zoneNearPrice } from './zone-history.js';
import { replay15mHTFFVGOn5m } from './htf-fvg.js';

const FIFTEEN = 15 * 60_000;
const FIVE = 5 * 60_000;
const MARKET_NAMES = Object.freeze({XAUUSD:'XAU/USD', BTCUSD:'BTC/USD'});
const DEBOUNCE_MS = 120;
const REFRESH_MS = 5 * 60_000; // Protect basic API quotas; 15-minute completed bars only.

function csvRows(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(cell.trim()); cell = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unmatched quotation mark.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseTime(value) {
  const s = String(value ?? '').trim();
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  if (/^\d{13}$/.test(s)) return Number(s);
  if (/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:?\d\d)$/i.test(s)) {
    const v = Date.parse(s.replace(' ', 'T'));
    if (Number.isFinite(v)) return v;
  }
  throw new Error(`Unrecognized time "${s}". Use Unix seconds/ms or ISO-8601 with a timezone.`);
}

/** CSV is untrusted, so this validates OHLC and chronological time independently. */
export function parse15mOHLC(text, { asOfMs = Date.now(), timeframeMinutes = 15 } = {}) {
  if (![5,15].includes(timeframeMinutes)) throw new Error('Only 5M and 15M history is supported.');
  const barMs = timeframeMinutes * 60_000;
  if (typeof text !== 'string') throw new TypeError('Expected CSV text.');
  const rows = csvRows(text);
  if (rows.length < 2) throw new Error('CSV needs a header and at least one candle.');
  const header = rows[0].map(s => s.trim().replace(/^"|"$/g, '').toLowerCase());
  const getIndex = names => header.findIndex(h => names.includes(h));
  const t = getIndex(['time', 'timestamp', 'datetime', 'date']);
  const o = getIndex(['open']);
  const h = getIndex(['high']);
  const l = getIndex(['low']);
  const c = getIndex(['close']);
  if ([t,o,h,l,c].some(i => i < 0)) throw new Error('CSV must contain Time, Open, High, Low and Close columns.');
  if (rows.length > 15_000) throw new Error('Too many candles. Export a smaller chart range (maximum 15,000 rows).');
  let bars = rows.slice(1).map((r, i) => {
    const time = parseTime(r[t]);
    const values = [o,h,l,c].map(k => r[k] !== '' && r[k] != null ? Number(r[k]) : NaN);
    const [open, high, low, close] = values;
    if (!values.every(Number.isFinite) || high < Math.max(open, close, low) || low > Math.min(open, close, high))
      throw new Error(`Invalid OHLC values in CSV row ${i + 2}.`);
    if (!Number.isSafeInteger(time) || time < Date.UTC(2000,0,1) || time >= Date.UTC(2100,0,1) || time % barMs !== 0)
      throw new Error(`CSV row ${i + 2} is not aligned to the selected UTC candle opening timestamp.`);
    return { time, open, high, low, close };
  });
  // Some providers export newest first. Reverse only if the ENTIRE file is descending.
  const descending = bars.every((b, i) => i === 0 || b.time < bars[i - 1].time);
  if (descending) bars.reverse();
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time <= bars[i - 1].time) throw new Error(`Duplicate or unsorted candle at CSV row ${i + 2}.`);
    if ((bars[i].time - bars[i - 1].time) % barMs !== 0) throw new Error('Misaligned candle interval.');
  }
  // Do not compute signals from a candle that has not yet completed.
  const excludedUnclosed = bars.length && bars[bars.length - 1].time + barMs > asOfMs ? 1 : 0;
  if (excludedUnclosed) bars = bars.slice(0, -1);
  if (!bars.length) throw new Error('No completed candles in this CSV.');
  const gapCount = bars.slice(1).filter((b, i) => b.time - bars[i].time > barMs).length;
  return { bars, gapCount, excludedUnclosed, newestFirst: descending };
}

/** Source-derived historical subset using the user's previously supplied preset. */
export function calculateResearchZones(bars, { swingFilter = true, atrFilter = true,
    recentOB = true, timeframeMinutes = 15, obSessionFilter = false,
    obHHLLFilter = false, obStructureFilter = false,
    fvgMinorFilter = false, fvgSessionFilter = false,
    fvgDisplacement = 0.5, fvgWideGap = 18 } = {}) {
  if (![5,15].includes(timeframeMinutes)) throw new Error('Unsupported chart timeframe.');
  const chartMs = timeframeMinutes * 60_000;
  const fvgSettings = normalizeFVGFilterSettings({
    fvgMinorFilter, fvgSessionFilter, fvgDisplacement, fvgWideGap
  });
  // For 5M, the active preset's 15M OB detection/lock uses only full groups
  // of three real, contiguous, closed 5M candles. Never fill missing bars.
  const detectionBars = timeframeMinutes === 5 ? aggregate5mTo15m(bars)
    : bars.map(b => ({ ...b, end:b.time + FIFTEEN }));
  // Source-derived OB confirmation context; disabled filters preserve v0.8 output.
  // NY session timezone and UTC 4H boundaries are explicitly provisional.
  const sessionValid=makeOBSessionEligibility({enabled:obSessionFilter,exchangeTimezone:'America/New_York'});
  const extraContext=buildOBMinorContext(bars,{timeframeMinutes,
    hhllFilter:obHHLLFilter,structFilter:obStructureFilter});
  return replayOBToFVGLifecycle(bars, detectionBars, {
    chartTfMs: chartMs,
    detectTfMs: FIFTEEN,
    minTick: 0.01, // Working assumption for XAUUSD; confirm against provider tick size.
    lockOBtoTF: true,
    lockTfMs: FIFTEEN,
    lockBars: timeframeMinutes === 5 ? detectionBars : null,
    deadline: 5,
    swingLookback: 1,
    swingLookforward: 1,
    atrLength: 20,
    sessionValid, extraContext,
    config: {
      showOB: true,
      maxCount: 70,
      atrFilter,
      atrMultiplier: 3,
      swingFilter,
      hhllFilter: obHHLLFilter,
      structFilter: obStructureFilter,
      sessionFilter: obSessionFilter,
      extend: true,
    }
  }, {
    chartTfMinutes: timeframeMinutes,
    showFVG: true,
    volatilityPeriod: 100,
    displacementMultiplier: fvgSettings.fvgDisplacement,
    wideGap: fvgSettings.fvgWideGap,
    recentOB,
    signalFilter: false, // Full V0.99 session bias & trading branch not yet implemented.
    minorDOL: fvgSettings.fvgMinorFilter,
    // Pine's Minor DOL engine is below regular FVG: only prior CLOSED bar's
    // direction may qualify the current FVG. This includes + / - TS.
    minorDirectionAt: fvgSettings.fvgMinorFilter
      ? makeFVGMinorDirectionAt(bars,{timeframeMinutes})
      : ()=>null,
    sessionConfig: {
      // Inspection assumption: user can confirm the exchange session timezone.
      exchangeTimezone: 'America/New_York',
      useAsia: true,
      useLondon: true,
      useNY: true,
      fvgSessionFilter: fvgSettings.fvgSessionFilter,
    },
  }, {
    maxFVGAge: 20,
    deleteMitigated: true,
    maxFVGtoShow: 300,
    timeframeMultiplier: timeframeMinutes,
    chartTfMinutes: timeframeMinutes,
  });
}

const css = `
.ict-research-tools{display:flex;flex-direction:column;align-items:stretch;gap:9px;padding:10px 12px;margin:10px 0;background:#101c2c;border:1px solid #263a50;border-radius:9px;color:#d7e2ed;font:12px system-ui,sans-serif}
.ict-primary-row{display:flex;flex-wrap:wrap;align-items:center;gap:9px}
.ict-primary-row strong{margin-right:auto;letter-spacing:.25px}
.ict-primary-row select{font:inherit;border:1px solid #356d74;border-radius:6px;padding:9px;background:#0e2631;color:#e0faf2;min-height:36px}
.ict-primary-row select:focus-visible{outline:2px solid #42d8ad}
.ict-market-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.ict-market-row label{color:#8fcfba;font-weight:600;font-size:11px}
.ict-research-tools details{border:1px solid #30465d;border-radius:7px;background:#0d1826;min-width:0}
.ict-research-tools details>summary{list-style:none;cursor:pointer;padding:11px 12px;color:#dbe7f6;font-weight:700;display:flex;gap:8px;align-items:center;justify-content:space-between}
.ict-research-tools details>summary::-webkit-details-marker{display:none}
.ict-research-tools details>summary:before{content:'▸';color:#46d2ad}
.ict-research-tools details[open]>summary:before{content:'▾'}
.ict-research-tools details>summary:focus-visible{outline:2px solid #49dfbd;outline-offset:2px}
.ict-filter-count{font-size:10px;color:#7adcc5;margin-left:auto;font-weight:500;text-align:right}
.ict-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:10px;padding:0 10px 12px}
.ict-filter-group{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:10px;border:1px solid #253c51;border-radius:7px}
.ict-filter-group legend{font-weight:700;color:#89e1d0;padding:0 6px}
.ict-filter-group .ict-check{min-height:28px;font-size:12px;white-space:normal}
.ict-filter-group .ict-check input{accent-color:#36caad;flex-shrink:0}
.ict-filter-note{font-size:10px;line-height:1.5;color:#92a7bc;max-width:340px}
.ict-detail-content{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:0 12px 12px}
.ict-detail-content .feed-source,.ict-detail-content .gongola-mdol-summary,.ict-detail-content .gongola-macro-summary{flex-basis:100%}
.ict-research-tools .ict-research-message{padding:4px 1px}
.ict-research-tools label,.ict-research-tools button{font:inherit}
.ict-research-tools input[type=file]{max-width:250px;font:inherit;color:#bbc8d9}
.ict-research-tools button{padding:6px 12px;border-radius:6px;border:1px solid #496079;background:#1a2c41;color:#e4f3ff;cursor:pointer}
.ict-research-tools button:disabled{opacity:.45;cursor:default}
.ict-research-tools button.connect-feed{color:#09221a;background:#3ad2a5;border-color:#49e3b6;font-weight:700}
.ict-research-tools .feed-status{font-size:10px;color:#90a9ba}
.ict-research-tools .feed-source{flex-basis:100%;font-size:10px;color:#8fcfba}
.ict-research-tools .ict-check{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.ict-research-legend{display:flex;flex-wrap:wrap;gap:13px;margin:0 0 8px;padding:0 4px;color:#bac7d8;font:11px system-ui,sans-serif}
.ict-research-legend span:before{content:'';display:inline-block;width:10px;height:10px;margin-right:5px;border-radius:2px;vertical-align:middle;background:var(--swatch)}
.ict-research-message{width:100%;font-size:12px;line-height:1.5;color:#d0ddeb}
.ict-research-message.warn{color:#f5c776}
.ict-research-message.error{color:#ffa4a4}
.gongola-macro-summary{flex-basis:100%;color:#c2b7f4;font-size:11px;line-height:1.45;letter-spacing:.1px}
.gongola-mdol-summary{flex-basis:100%;color:#a1dce4;font-size:11px;line-height:1.5;letter-spacing:.1px}
@media(max-width:640px){.ict-research-tools{gap:8px;padding:9px}.ict-primary-row{gap:7px}.ict-primary-row strong{flex-basis:100%}.ict-research-tools input[type=file]{width:100%;max-width:290px}.ict-filter-grid{grid-template-columns:minmax(0,1fr)}.ict-research-tools .ict-check{font-size:12px}}
`;

function elt(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/** Mounted on the no-demo browser chart; official trade-signal gate remains disabled. */
export function mountICTResearchViewer({chart, candles} = {}) {
  const host = document.querySelector('#chart');
  if (!host || !chart || !candles) return;
  if (document.querySelector('.ict-research-tools')) return;
  const style = elt('style'); style.textContent = css; document.head.append(style);
  // The outer chart already exists; no simulated or alternate chart is created.
  chart.applyOptions({grid:{vertLines:{visible:false},horzLines:{visible:false}}});
  const tools = elt('div', 'ict-research-tools');
  const title = elt('strong', '', 'XAU/USD 15M · MARKET DATA');
  const marketSelect=elt('select','');marketSelect.id='gongola-market-select';
  marketSelect.setAttribute('aria-label','Choose market');
  for(const [value,name] of [['XAUUSD','Gold · XAU/USD'],['BTCUSD','Bitcoin · BTC/USD']]){
    const opt=elt('option','',name);opt.value=value;marketSelect.append(opt);
  }
  const tfSelect=elt('select','');tfSelect.id='gongola-timeframe-select';
  tfSelect.setAttribute('aria-label','Choose timeframe');
  for(const minutes of [5,15]){const opt=elt('option','',`${minutes}M`);opt.value=String(minutes);tfSelect.append(opt);}
  tfSelect.value='15';
  const selector=elt('div','ict-market-row');
  selector.append(elt('label','', 'MARKET'),marketSelect,elt('label','', 'TF'),tfSelect);
  const providerButton = elt('button', 'connect-feed', '↻ Refresh market candles');
  const autoLabel = elt('label', 'ict-check');
  const autoCheck = elt('input'); autoCheck.type='checkbox'; autoCheck.checked=true;
  autoLabel.append(autoCheck, document.createTextNode('Auto every 5 min'));
  const sourceLabel = elt('div', 'feed-source', 'Twelve Data aggregated pricing. XAU/USD differs from FOREXCOM; BTC/USD aggregates crypto exchanges. Not parity-certified.');
  const input = elt('input'); input.type = 'file'; input.accept = '.csv,text/csv'; input.title = 'Open a local TradingView chart CSV';
  const obLabel = elt('label', 'ict-check');
  const obCheck = elt('input'); obCheck.type='checkbox'; obCheck.checked=true;
  obLabel.append(obCheck, document.createTextNode('OB'));
  const fvgLabel = elt('label', 'ict-check');
  const fvgCheck = elt('input'); fvgCheck.type='checkbox'; fvgCheck.checked=true;
  fvgLabel.append(fvgCheck, document.createTextNode('FVG'));
  const htfLabel=elt('label','ict-check');
  const htfCheck=elt('input');htfCheck.type='checkbox';htfCheck.checked=true;
  htfLabel.append(htfCheck,document.createTextNode('15M HTF FVG / IFVG · on 5M'));
  htfCheck.title='Confirmed 15M imbalance zones projected on 5M. Separate from regular 5M FVGs.';
  const dolLabel = elt('label', 'ict-check');
  const dolCheck = elt('input'); dolCheck.type = 'checkbox'; dolCheck.checked = true;
  dolLabel.append(dolCheck, document.createTextNode('Prior-day BSL/SSL'));
  const minorLabel = elt('label', 'ict-check');
  const minorCheck = elt('input'); minorCheck.type='checkbox'; minorCheck.checked=true;
  minorLabel.append(minorCheck,document.createTextNode('4H Minor BSL/SSL'));
  const structureLabel = elt('label', 'ict-check');
  const structureCheck = elt('input'); structureCheck.type='checkbox'; structureCheck.checked=true;
  structureLabel.append(structureCheck,document.createTextNode('BOS/MSS · TS'));
  const minorSummary=elt('div','gongola-mdol-summary','4H Minor DOL: awaiting completed market candles · provisional UTC period alignment.');
  const macroLabel=elt('label','ict-check');
  const macroCheck=elt('input');macroCheck.type='checkbox';macroCheck.checked=true;
  macroLabel.append(macroCheck,document.createTextNode('ICT Macros · NY'));
  const macroSummary=elt('div','gongola-macro-summary','ICT Macros: awaiting completed market candles.');
  const htfSummary=elt('div','gongola-htf-summary','15M HTF FVG: select 5M and load completed candles.');
  const labelModeButton=elt('button','','Structure: last 8');
  labelModeButton.title='Switch between the latest eight BOS/MSS/TS annotations and all retained annotations.';
  const swingLabel = elt('label', 'ict-check');
  const swingCheck = elt('input'); swingCheck.type = 'checkbox'; swingCheck.checked = false;
  swingLabel.append(swingCheck, document.createTextNode('Swing H/L'));
  const obSwingLabel=elt('label','ict-check');
  const obSwingCheck=elt('input'); obSwingCheck.type='checkbox'; obSwingCheck.checked=true;
  obSwingLabel.append(obSwingCheck,document.createTextNode('OB · confirmed swing filter'));
  const obAtrLabel=elt('label','ict-check');
  const obAtrCheck=elt('input'); obAtrCheck.type='checkbox'; obAtrCheck.checked=true;
  obAtrLabel.append(obAtrCheck,document.createTextNode('OB · ATR size filter (20 × 3)'));
  const obSessionLabel=elt('label','ict-check');
  const obSessionCheck=elt('input'); obSessionCheck.type='checkbox'; obSessionCheck.checked=false;
  obSessionLabel.append(obSessionCheck,document.createTextNode('OB · Session (NY timezone assumed)'));
  const obHHLLLabel=elt('label','ict-check');
  const obHHLLCheck=elt('input'); obHHLLCheck.type='checkbox'; obHHLLCheck.checked=false;
  obHHLLLabel.append(obHHLLCheck,document.createTextNode('OB · Minor DOL HH/LL'));
  const obStructureLabel=elt('label','ict-check');
  const obStructureCheck=elt('input'); obStructureCheck.type='checkbox'; obStructureCheck.checked=false;
  obStructureLabel.append(obStructureCheck,document.createTextNode('OB · Recent Minor DOL structure'));
  const fvgRecentLabel=elt('label','ict-check');
  const fvgRecentCheck=elt('input'); fvgRecentCheck.type='checkbox'; fvgRecentCheck.checked=true;
  fvgRecentLabel.append(fvgRecentCheck,document.createTextNode('FVG · matching recent OB direction'));
  const fvgMinorLabel=elt('label','ict-check');
  const fvgMinorCheck=elt('input');fvgMinorCheck.type='checkbox';fvgMinorCheck.checked=false;
  fvgMinorLabel.append(fvgMinorCheck,document.createTextNode('FVG · Minor DOL direction (BOS/MSS/TS)'));
  const htfIRFilterLabel=elt('label','ict-check');
  const htfIRFilterCheck=elt('input');htfIRFilterCheck.type='checkbox';htfIRFilterCheck.checked=false;
  htfIRFilterLabel.append(htfIRFilterCheck,document.createTextNode('15M HTF FVG · require recent 60M HTF IR direction'));
  htfIRFilterLabel.title='Optional V0.99 source-derived filter. Builds only confirmed 60M IR from complete 5M candles; OFF matches current preset.';
  const fvgSessionLabel=elt('label','ict-check');
  const fvgSessionCheck=elt('input');fvgSessionCheck.type='checkbox';fvgSessionCheck.checked=false;
  fvgSessionLabel.append(fvgSessionCheck,document.createTextNode('FVG · session: any of 3 candles'));
  function numberSetting(label,value,min,max,step){
    const wrap=elt('label','ict-check');
    wrap.append(document.createTextNode(label));
    const input=elt('input');input.type='number';input.min=String(min);input.max=String(max);
    input.step=String(step);input.value=String(value);
    input.style.cssText='width:66px;min-width:0;margin-left:auto;padding:4px;border:1px solid #496079;background:#0b1826;color:#e4f3ff;border-radius:4px';
    wrap.append(input);
    return input;
  }
  const fvgDisplacementInput=numberSetting('FVG · Displacement',0.5,0.01,10,0.01);
  const fvgWideGapInput=numberSetting('FVG · Ignore large gap',18,1,1000,0.1);
  const filterButton = elt('button', '', 'Zones: nearby $140');
  filterButton.title = 'Show zones near the visible chart price, or all retained zones. Historical removed drawings are a separate option.';
  const latestButton = elt('button', '', '◉ Latest 170 bars');
  const historyButton = elt('button', '', '↶ History view');
  historyButton.title = 'Browse roughly 500 earlier bars and inspect faint, archived zones that the engine removed. Archived zones are NOT active signals.';
  const reset = elt('button', '', 'Clear imported chart'); reset.disabled = true;
  const message = elt('div','ict-research-message warn', 'Checking local market-feed connection… You can still load your historical CSV.');
  const importLabel = elt('label', '', 'OR IMPORT CSV:');
  const primaryRow=elt('div','ict-primary-row');
  primaryRow.append(title,selector,providerButton,autoLabel,latestButton);
  const filterPanel=elt('details','ict-filter-panel');
  const filterHeader=elt('summary');filterHeader.append(document.createTextNode('ICT Layers & Filters'));
  const filterCount=elt('span','ict-filter-count');filterHeader.append(filterCount);
  const filterGrid=elt('div','ict-filter-grid');
  const layerGroup=elt('fieldset','ict-filter-group');
  layerGroup.append(elt('legend','', 'Chart layers (display only)'),obLabel,fvgLabel,htfLabel,dolLabel,minorLabel,structureLabel,macroLabel,swingLabel,filterButton,historyButton,labelModeButton);
  const computeGroup=elt('fieldset','ict-filter-group');
  computeGroup.append(elt('legend','', 'Detection filters (recalculate)'),
    obSwingLabel,obAtrLabel,obSessionLabel,obHHLLLabel,obStructureLabel,
    fvgRecentLabel,fvgMinorLabel,fvgSessionLabel,htfIRFilterLabel,fvgDisplacementInput.parentElement,
    fvgWideGapInput.parentElement,
    elt('div','ict-filter-note','FVG Minor DOL and 3-candle session filters default OFF. With both Minor DOL and recent OB filters ON, both directions must match. Session membership uses assumed NY exchange timezone; 4H Minor DOL and 60M HTF IR boundaries are provisional UTC. HTF IR direction filter defaults OFF. Full Signal Filter/trade engine not enabled.'));
  const settingsSaveRow=elt('div','ict-settings-save-row');
  settingsSaveRow.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 2px 3px';
  const settingsSaveButton=elt('button','ict-settings-save-button','Save Settings');
  settingsSaveButton.type='button';
  settingsSaveButton.style.cssText='padding:10px 16px;min-height:39px;background:#192e2b;color:#a2efcb;border:1px solid #4d816b;border-radius:8px;font:600 12px system-ui,sans-serif';
  const settingsSaveStatus=elt('span','ict-settings-save-status','Changes also save automatically');
  settingsSaveStatus.setAttribute('role','status');
  settingsSaveStatus.setAttribute('aria-live','polite');
  settingsSaveStatus.style.cssText='color:#9eabb8;font:11px system-ui,sans-serif';
  settingsSaveRow.append(settingsSaveButton,settingsSaveStatus);
  filterGrid.append(layerGroup,computeGroup,settingsSaveRow);
  filterPanel.append(filterHeader,filterGrid);
  const importPanel=elt('details','ict-import-panel');
  const importHead=elt('summary','', 'Data source · import CSV / clear chart');
  const importBody=elt('div','ict-detail-content');importBody.append(importLabel,input,reset);
  importPanel.append(importHead,importBody);
  const detailPanel=elt('details','ict-analysis-panel');
  const detailHead=elt('summary','', 'Market source & analysis details');
  const detailBody=elt('div','ict-detail-content');detailBody.append(sourceLabel,minorSummary,macroSummary,htfSummary);
  detailPanel.append(detailHead,detailBody);
  tools.append(primaryRow,message,filterPanel,importPanel,detailPanel);
  function updateFilterCount(){
    const visual=[obCheck,fvgCheck,htfCheck,dolCheck,minorCheck,structureCheck,macroCheck,swingCheck].filter(x=>x.checked).length;
    const calculated=[obSwingCheck,obAtrCheck,obSessionCheck,obHHLLCheck,obStructureCheck,fvgRecentCheck,fvgMinorCheck,fvgSessionCheck,htfIRFilterCheck].filter(x=>x.checked).length;
    filterCount.textContent=`${visual}/8 layers · ${calculated}/9 detection switches`;
  }
  updateFilterCount();
  const legend=elt('div','ict-research-legend');
  for (const [label,color] of [['Bearish OB','#ef5350'],['Bullish OB','#4589ff'],['Bearish FVG','#949fae'],['Bullish FVG','#19bf89'],['15M HTF FVG','#72aaff'],['15M inverse FVG','#e4aa70'],['BSL · prior high','#50a6ff'],['SSL · prior low','#ff7a7a'],['4H Minor BSL','#40cfd8'],['4H Minor SSL','#f0a657'],['BOS/MSS close','#baa1ff'],['NY ICT Macro','#ad94df']]) {
    const s=elt('span','',label);s.style.setProperty('--swatch',color);legend.append(s);
  }
  const legendPanel=elt('details','ict-legend-panel');
  legendPanel.append(elt('summary','', 'Drawing legend / colors'),legend);
  tools.append(legendPanel);
  const controlMount = document.querySelector('#research-controls');
  if (controlMount) controlMount.append(tools);
  else host.parentNode.insertBefore(tools,host);
  host.style.position='relative';
  const overlay=elt('canvas'); overlay.setAttribute('aria-hidden','true');
  Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'4'});
  host.append(overlay);
  // Keep custom ICT drawings off the chart's price and time scales.
  const plotWidth=()=>Math.max(0,Math.min(host.clientWidth,chart.timeScale().width()));
  let dataset=null, engineResult=null, structureResult=null, minorResult=null, macroResult=null, htfResult=null, raf=0, resizeObserver, activeSource='none', zonesNearby=true, recentStructuresOnly=true, currentMeta=null;
  let historyMode=false, removedOBs=[], removedFVGs=[];
  let selectedMarket='XAUUSD', selectedTimeframe=15, requestVersion=0, activeRequest=null;
  const STORAGE_KEY='gongola-terminal-ict-settings-v1';
  const settingsChecks={
    ob:obCheck,fvg:fvgCheck,htf:htfCheck,dol:dolCheck,minor:minorCheck,
    structure:structureCheck,macro:macroCheck,swing:swingCheck,
    obSwing:obSwingCheck,obAtr:obAtrCheck,obSession:obSessionCheck,
    obHHLL:obHHLLCheck,obStructure:obStructureCheck,
    fvgRecent:fvgRecentCheck,fvgMinor:fvgMinorCheck,
    fvgSession:fvgSessionCheck,htfIR:htfIRFilterCheck
  };
  function restoreChartSettings(){
    let saved;
    try {saved=JSON.parse(window.localStorage.getItem(STORAGE_KEY));}catch{return;}
    if(!saved || saved.version!==1 || typeof saved!=='object')return;
    if(saved.checks && typeof saved.checks==='object'){
      for(const [key,control] of Object.entries(settingsChecks)){
        if(typeof saved.checks[key]==='boolean')control.checked=saved.checks[key];
      }
    }
    if(saved.numbers && typeof saved.numbers==='object'){
      for(const [key,input,min,max] of [
        ['fvgDisplacement',fvgDisplacementInput,0.01,10],
        ['fvgWideGap',fvgWideGapInput,1,1000]
      ]){
        const value=saved.numbers[key];
        if(typeof value==='number' && Number.isFinite(value) && value>=min && value<=max)input.value=String(value);
      }
    }
    if(['XAUUSD','BTCUSD'].includes(saved.market)){selectedMarket=saved.market;marketSelect.value=saved.market;}
    if([5,15].includes(saved.timeframe)){selectedTimeframe=saved.timeframe;tfSelect.value=String(saved.timeframe);}
    if(typeof saved.zonesNearby==='boolean')zonesNearby=saved.zonesNearby;
    if(typeof saved.recentStructuresOnly==='boolean')recentStructuresOnly=saved.recentStructuresOnly;
    labelModeButton.textContent=recentStructuresOnly?'Structure: last 8':'Structure: all labels';
    updateFilterCount();
    settingsSaveStatus.textContent='Saved settings restored';
  }
  function saveChartSettings(explicit=false){
    const displacement=Number(fvgDisplacementInput.value);
    const gap=Number(fvgWideGapInput.value);
    if(!fvgDisplacementInput.value.trim() || !fvgWideGapInput.value.trim() ||
       !Number.isFinite(displacement)||displacement<0.01||displacement>10||
       !Number.isFinite(gap)||gap<1||gap>1000){
      settingsSaveStatus.textContent='Enter valid FVG values before saving';
      settingsSaveStatus.style.color='#f2a3a5';
      return false;
    }
    const state={
      version:1,
      checks:Object.fromEntries(Object.entries(settingsChecks).map(([key,control])=>[key,control.checked])),
      numbers:{fvgDisplacement:displacement,fvgWideGap:gap},
      market:selectedMarket,timeframe:selectedTimeframe,
      zonesNearby,recentStructuresOnly,savedAt:Date.now()
    };
    try{
      window.localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      settingsSaveStatus.textContent=explicit?'Settings saved on this device':'Changes saved automatically';
      settingsSaveStatus.style.color='#a2efcb';
      return true;
    }catch{
      settingsSaveStatus.textContent='Could not save: browser site storage is unavailable';
      settingsSaveStatus.style.color='#f2a3a5';
      return false;
    }
  }
  restoreChartSettings();
  settingsSaveButton.addEventListener('click',()=>saveChartSettings(true));

  let eliteUI = null;
  let researchPriceLines=[];
  function clearResearchPriceLines(){
    for(const line of researchPriceLines)try{candles.removePriceLine(line);}catch{}
    researchPriceLines=[];
  }
  function showResearchPriceLines(plan){
    clearResearchPriceLines();
    if(!plan || plan.status==='unavailable')return;
    for(const [price,title,color] of [
      [plan.entry,'ENTRY','#d8bd82'],[plan.stop,'SL','#e88282'],[plan.target,'TP','#64c7a7']]){
      if(!Number.isFinite(price))continue;
      researchPriceLines.push(candles.createPriceLine({price,title,color,lineWidth:1,lineStyle:2,
        axisLabelVisible:true,priceLineVisible:true}));
    }
  }

  function getX(ms) {
    if(!dataset) return null;
    const bars=dataset.bars, n=bars.length;
    let lo=0,hi=n;
    while(lo<hi){const mid=(lo+hi)>>1;if(bars[mid].time<ms)lo=mid+1;else hi=mid;}
    let logical;
    if (lo===0) logical=0;
    else if (lo>=n) logical=n-1+Math.min(80,(ms-bars[n-1].time)/(selectedTimeframe * 60_000));
    else if(bars[lo].time===ms) logical=lo;
    else logical=lo-1+(ms-bars[lo-1].time)/(bars[lo].time-bars[lo-1].time);
    return chart.timeScale().logicalToCoordinate(logical);
  }

  function visibleReferencePrice() {
    const center = candles.coordinateToPrice(host.clientHeight / 2);
    return Number.isFinite(center) ? center : dataset?.bars.at(-1)?.close;
  }

  function drawZone(ctx, bounds, type, inverse=false, archived=false) {
    if (![bounds.left,bounds.right,bounds.top,bounds.bottom].every(Number.isFinite)) return;
    if (zonesNearby && dataset) {
      const price = visibleReferencePrice();
      const radius=selectedMarket==='BTCUSD'?Math.max(500,price*0.025):140;
      if (!zoneNearPrice(bounds,price,radius)) return;
    }
    const x1=getX(bounds.left),x2=getX(bounds.right);
    const y1=candles.priceToCoordinate(bounds.top),y2=candles.priceToCoordinate(bounds.bottom);
    if(![x1,x2,y1,y2].every(Number.isFinite))return;
    const width=plotWidth(),height=overlay.clientHeight;
    const start=Math.max(0,Math.min(x1,x2)),end=Math.min(width,Math.max(x1,x2));
    const top=Math.max(0,Math.min(y1,y2)),bottom=Math.min(height,Math.max(y1,y2));
    if(end<=start||bottom<=top)return;
    const colors={bearOB:['rgba(239,83,80,.20)','#ef5350'],bullOB:['rgba(69,137,255,.18)','#4589ff'],bearFVG:['rgba(148,159,174,.23)','#949fae'],bullFVG:['rgba(25,191,137,.20)','#19bf89'],inverse:['rgba(202,135,224,.18)','#bd87de']};
    const [fill,stroke]=colors[inverse?'inverse':type];
    ctx.save();
    ctx.globalAlpha=archived?0.3:1;
    ctx.fillStyle=fill; ctx.fillRect(start,top,end-start,bottom-top);
    ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.setLineDash(archived?[2,4]:inverse?[4,3]:[]);
    ctx.strokeRect(start+.5,top+.5,Math.max(0,end-start-1),Math.max(0,bottom-top-1));
    ctx.restore();
  }

  // Distinct 15M HTF box styling; regular 5M FVGs keep their own colors.
  function drawHTFZone(ctx, zone, archived=false) {
    if (!dataset || selectedTimeframe!==5 || !htfCheck.checked) return;
    const right=dataset.bars.at(-1).time + 40 * FIVE;
    const bounds={left:zone.left,right,top:zone.top,bottom:zone.bottom};
    if (zonesNearby) {
      const price=visibleReferencePrice(), radius=selectedMarket==='BTCUSD'?Math.max(500,price*.025):140;
      if(!zoneNearPrice(bounds,price,radius))return;
    }
    const x1=getX(bounds.left),x2=getX(bounds.right);
    const y1=candles.priceToCoordinate(bounds.top),y2=candles.priceToCoordinate(bounds.bottom);
    if(![x1,x2,y1,y2].every(Number.isFinite))return;
    const left=Math.max(0,Math.min(x1,x2)), rightX=Math.min(plotWidth(),Math.max(x1,x2));
    const top=Math.max(0,Math.min(y1,y2)),bottom=Math.min(overlay.clientHeight,Math.max(y1,y2));
    if(rightX<=left || bottom<=top)return;
    const inverse=zone.status.startsWith('inverse_');
    const bull=zone.status==='bullish'||zone.status==='inverse_bullish';
    const stroke=inverse?(bull?'#6ed1a4':'#e5a66c'):(bull?'#70a9ff':'#e47b88');
    const fill=inverse?(bull?'rgba(90,198,148,.09)':'rgba(229,166,108,.09)')
      :(bull?'rgba(112,169,255,.11)':'rgba(228,123,136,.11)');
    ctx.save();
    ctx.globalAlpha=archived?0.28:1;
    ctx.fillStyle=fill;ctx.fillRect(left,top,rightX-left,bottom-top);
    ctx.strokeStyle=stroke;ctx.lineWidth=1.15;ctx.setLineDash(archived?[2,4]:[6,3]);
    ctx.strokeRect(left+.5,top+.5,Math.max(0,rightX-left-1),Math.max(0,bottom-top-1));
    ctx.setLineDash([]);
    if(!archived && rightX-left>80 && bottom-top>12 && top<overlay.clientHeight-10) {
      ctx.font='8px system-ui,sans-serif';ctx.fillStyle=stroke;
      ctx.fillText(inverse?'15M IFVG':'15M FVG',left+5,Math.max(11,top+11));
    }
    ctx.restore();
  }

  function drawLiquidityLine(ctx, item) {
    const x1=getX(item.anchorTime), x2=getX(item.endTime);
    const y=candles.priceToCoordinate(item.price);
    if (![x1,x2,y].every(Number.isFinite)) return;
    const w=plotWidth(),h=overlay.clientHeight;
    if (y < -5 || y > h+5) return;
    const from=Math.max(0,Math.min(w,x1)),to=Math.max(0,Math.min(w,x2));
    if (to <= from) return;
    const color=item.mitigated?'rgba(150,158,169,.5)':item.type==='BSL'?'#50a6ff':'#ff7777';
    ctx.strokeStyle=color; ctx.lineWidth=item.mitigated?1:1.4;
    ctx.setLineDash(item.mitigated?[2,4]:[7,4]);
    ctx.beginPath();ctx.moveTo(from,y+.5);ctx.lineTo(to,y+.5);ctx.stroke();ctx.setLineDash([]);
    if (!item.mitigated && to > 70 && from < w) {
      const label=`${item.type} ${item.price.toFixed(2)}`;
      ctx.font='8px system-ui,sans-serif';
      ctx.fillStyle=color;
      ctx.fillText(label,Math.max(2,Math.min(w-ctx.measureText(label).width-3,to+5)),Math.max(12,Math.min(h-4,y-4)));
    }
  }
  function drawMinorLevel(ctx, item) {
    const x1=getX(item.anchorTime),x2=getX(item.endTime);
    const y=candles.priceToCoordinate(item.price),w=plotWidth(),h=overlay.clientHeight;
    if (![x1,x2,y].every(Number.isFinite)||y < -8 || y > h+8) return;
    const a=Math.max(0,Math.min(w,x1)),z=Math.max(0,Math.min(w,x2));
    if (z<=a) return;
    const color=item.mitigated?'rgba(151,160,173,.55)':item.type==='BSL'?'#40cfd8':'#f0a657';
    ctx.strokeStyle=color;ctx.lineWidth=item.mitigated?1:1.5;
    ctx.setLineDash(item.mitigated?[2,4]:[5,3]);
    ctx.beginPath();ctx.moveTo(a,y+.5);ctx.lineTo(z,y+.5);ctx.stroke();ctx.setLineDash([]);
    if (!item.mitigated && z > 80) {
      const label=`4H ${item.type} ${item.price.toFixed(2)}`;
      ctx.fillStyle=color;ctx.font='8px system-ui,sans-serif';
      ctx.fillText(label,Math.max(2,Math.min(w-ctx.measureText(label).width-3,z+4)),Math.max(12,Math.min(h-4,y-4)));
    }
  }
  function drawMinorEvent(ctx,event) {
    const x=getX(event.time),y=candles.priceToCoordinate(event.price);
    const w=plotWidth(),h=overlay.clientHeight;
    if (![x,y].every(Number.isFinite)||x < -10 || x > w+10 || y < -12 || y > h+12) return;
    const up=event.direction==='+';
    const txt=event.label;
    ctx.font='bold 9px system-ui,sans-serif';
    const tw=ctx.measureText(txt).width+8;
    const px=Math.max(2,Math.min(w-tw-2,x-tw/2));
    const py=up?Math.min(h-18,y+5):Math.max(3,y-18);
    ctx.fillStyle='rgba(12,20,30,.94)';ctx.fillRect(px,py,tw,14);
    ctx.strokeStyle=event.type==='TS'?'#f4c87c':up?'#50bcff':'#fa8b8b';
    ctx.strokeRect(px+.5,py+.5,tw-1,13);
    ctx.fillStyle=ctx.strokeStyle;ctx.fillText(txt,px+4,py+10);
  }
  function drawMacro(ctx, marker, labelTimeAllowed=true) {
    const x=getX(marker.time),w=plotWidth(),h=overlay.clientHeight;
    if(!Number.isFinite(x)||x < -2||x > w+2) return;
    ctx.save();
    ctx.strokeStyle='rgba(172,149,222,.58)';
    ctx.lineWidth=1;ctx.setLineDash([2,5]);
    ctx.beginPath();ctx.moveTo(Math.round(x)+.5,0);ctx.lineTo(Math.round(x)+.5,h);ctx.stroke();
    ctx.setLineDash([]);
    if(labelTimeAllowed) {
      const txt=`${marker.label} NY`;
      ctx.font='8px system-ui,sans-serif';
      const width=ctx.measureText(txt).width+8;
      const px=Math.min(Math.max(2,x+3),w-width-2);
      if(px>=0){
        ctx.fillStyle='rgba(17,21,34,.92)';ctx.fillRect(px,3,width,13);
        ctx.fillStyle='#c7b7f4';ctx.fillText(txt,px+4,13);
      }
    }
    ctx.restore();
  }
  function drawSwing(ctx, item) {
    const x=getX(item.time),y=candles.priceToCoordinate(item.price);
    if (![x,y].every(Number.isFinite) || x<4 || x>plotWidth()-4 || y<12 || y>overlay.clientHeight-12) return;
    const up=item.type==='low';
    ctx.fillStyle=up?'#40d1a7':'#f78a8a';
    ctx.beginPath();
    if(up){ctx.moveTo(x,y+3);ctx.lineTo(x-4,y+10);ctx.lineTo(x+4,y+10);}
    else{ctx.moveTo(x,y-3);ctx.lineTo(x-4,y-10);ctx.lineTo(x+4,y-10);}
    ctx.closePath();ctx.fill();
  }
  function focusLatest(){
    if (!dataset?.bars.length) return;
    const n=dataset.bars.length;
    chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-170),to:n+8});
    queueDraw();
  }
  // Chart tap reads existing zone geometry. It does not create or modify trading signals.
  function inspectZoneAtPoint(point) {
    if (!point || !engineResult || !dataset) return null;
    const hits=[];
    const latest=visibleReferencePrice();
    const radius=selectedMarket==='BTCUSD'?Math.max(500,latest*0.025):140;
    const consider=(label,left,right,top,bottom,status,meta={}) => {
      if (![left,right,top,bottom].every(Number.isFinite)) return;
      if (zonesNearby && !zoneNearPrice({top,bottom},latest,radius)) return;
      const xa=getX(left),xb=getX(right),ya=candles.priceToCoordinate(top),yb=candles.priceToCoordinate(bottom);
      if (![xa,xb,ya,yb].every(Number.isFinite)) return;
      const x0=Math.min(xa,xb),x1=Math.max(xa,xb),y0=Math.min(ya,yb),y1=Math.max(ya,yb);
      if (point.x < x0-3 || point.x > x1+3 || point.y < y0-3 || point.y > y1+3) return;
      hits.push({label,top,bottom,origin:new Date(left).toISOString(),
        status,...meta,area:Math.max(1,(x1-x0)*(y1-y0))});
    };
    if (obCheck.checked) {
      for (const ob of engineResult.ob.state.bearBoxes || []) consider('Bearish Order Block',ob.leftTime,ob.rightTime,ob.top,ob.bottom,'Displayed in current engine state',{category:'ob',direction:'bearish',active:true,formationTimeMs:ob.leftTime});
      for (const ob of engineResult.ob.state.bullBoxes || []) consider('Bullish Order Block',ob.leftTime,ob.rightTime,ob.top,ob.bottom,'Displayed in current engine state',{category:'ob',direction:'bullish',active:true,formationTimeMs:ob.leftTime});
    }
    if (fvgCheck.checked) {
      for (const fvg of engineResult.lifecycle.drawings || []) {
        if (fvg.deleted) continue;
        const direction=fvg.kind.includes('bear')?'Bearish':'Bullish';
        consider(`${direction} ${fvg.kind.startsWith('inverse')?'Inverse FVG':'FVG'}`,fvg.left,fvg.right,fvg.top,fvg.bottom,
          'Not deleted in current engine drawing state',{category:'fvg',direction:fvg.kind.toLowerCase().includes('bear')?'bearish':'bullish',
          active:(engineResult.lifecycle.tracked[fvg.kind]||[]).includes(fvg.id),
          inverse:fvg.kind.startsWith('inverse'),formationTimeMs:fvg.formationTime});
      }
    }
    if (htfCheck.checked && htfResult && selectedTimeframe===5) {
      const end=dataset.bars.at(-1).time+40*FIVE;
      for(const z of htfResult.zones) consider(`15M ${z.status.includes('bullish')?'Bullish':'Bearish'} ${z.status.startsWith('inverse_')?'Inverse FVG':'FVG'}`,z.left,end,z.top,z.bottom,`Confirmed 15M; state: ${z.status}`,{category:'htf-fvg',direction:z.direction,active:true,inverse:z.status.startsWith('inverse_'),formationTimeMs:z.left-900000});
      if(historyMode) for(const z of htfResult.archived) consider('Archived 15M FVG',z.left,end,z.top,z.bottom,`REMOVED (${z.status}) — historical only`,{category:'htf-fvg',direction:z.direction,archived:true,active:false});
    }
    if (historyMode) {
      if (obCheck.checked) for(const d of removedOBs) consider(`${d.direction==='-'?'Bearish':'Bullish'} archived OB`,d.left,d.right,d.top,d.bottom,`REMOVED (${d.reason}) — historical only; not active`,{category:'ob',direction:d.direction==='-'?'bearish':'bullish',archived:true,active:false});
      if (fvgCheck.checked) for(const d of removedFVGs) consider(`Archived ${d.kind} FVG`,d.left,d.right,d.top,d.bottom,'REMOVED — historical only; not active',{category:'fvg',archived:true,active:false});
    }
    if (!hits.length) return null;
    hits.sort((a,b)=>a.area-b.area);
    const {area,...zone}=hits[0];
    return zone;
  }
  function redraw(){
    raf=0;
    const w=host.clientWidth,h=host.clientHeight,dpr=window.devicePixelRatio||1;
    if(!w||!h)return;
    if(overlay.width!==Math.round(w*dpr)||overlay.height!==Math.round(h*dpr)){
      overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);
    }
    const ctx=overlay.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    if(!dataset)return;
    const paneW=plotWidth(),paneH=Math.max(0,h-chart.timeScale().height());
    if(paneW<1||paneH<1)return;
    ctx.save();ctx.beginPath();ctx.rect(0,0,paneW,paneH);ctx.clip();
    if(macroResult && macroCheck.checked) {
      let lastLabelX=-Infinity;
      for(const marker of macroResult.markers) {
        const x=getX(marker.time);
        const showLabel=Number.isFinite(x) && x - lastLabelX >= 54;
        if(showLabel) lastLabelX=x;
        drawMacro(ctx,marker,showLabel);
      }
    }
    if(htfCheck.checked && htfResult && selectedTimeframe===5) {
      if(historyMode) for(const z of htfResult.archived) drawHTFZone(ctx,z,true);
      for(const z of htfResult.zones) drawHTFZone(ctx,z);
    }
    if(historyMode) {
      if(obCheck.checked) for(const d of removedOBs) drawZone(ctx,{left:d.left,right:d.right,top:d.top,bottom:d.bottom},d.direction==='-'?'bearOB':'bullOB',false,true);
      if(fvgCheck.checked) for(const d of removedFVGs) drawZone(ctx,{left:d.left,right:d.right,top:d.top,bottom:d.bottom},d.kind==='bearish'?'bearFVG':'bullFVG',d.kind.startsWith('inverse'),true);
    }
    if(engineResult && obCheck.checked){
      const ob=engineResult.ob.state;
      for(const b of ob.bearBoxes||[])drawZone(ctx,{left:b.leftTime,right:b.rightTime,top:b.top,bottom:b.bottom},'bearOB');
      for(const b of ob.bullBoxes||[])drawZone(ctx,{left:b.leftTime,right:b.rightTime,top:b.top,bottom:b.bottom},'bullOB');
    }
    if(engineResult && fvgCheck.checked){
      for(const d of engineResult.lifecycle.drawings||[]){
        if(d.deleted)continue;
        drawZone(ctx,{left:d.left,right:d.right,top:d.top,bottom:d.bottom},d.kind==='bearish'?'bearFVG':'bullFVG',d.kind.startsWith('inverse'));
      }
    }
    if(structureResult && dolCheck.checked) {
      for (const item of structureResult.dol.lines) drawLiquidityLine(ctx,item);
    }
    if(minorResult && minorCheck.checked) {
      for(const item of minorResult.levels) drawMinorLevel(ctx,item);
    }
    if(minorResult && structureCheck.checked) {
      for(const event of (recentStructuresOnly?minorResult.events.slice(-8):minorResult.events)) drawMinorEvent(ctx,event);
    }
    if(structureResult && swingCheck.checked) {
      for (const point of structureResult.swings.slice(-25)) drawSwing(ctx,point);
    }
    ctx.restore();
  }
  function queueDraw(){if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(redraw)}
  function applyBars(bars, meta) {
    clearResearchPriceLines();
    if (!Array.isArray(bars) || !bars.length) throw new Error('No completed market candles available.');
    // Strict client-side boundary: never pass malformed or unfinished bars to chart or engine.
    for (let i=0; i<bars.length; i++) {
      const b=bars[i];
      if (!Number.isSafeInteger(b.time) || b.time % (selectedTimeframe * 60_000) !== 0 || b.time + (selectedTimeframe * 60_000) > Date.now() ||
          ![b.open,b.high,b.low,b.close].every(Number.isFinite) ||
          b.high < Math.max(b.open,b.low,b.close) || b.low > Math.min(b.open,b.high,b.close) ||
          (i>0 && b.time <= bars[i-1].time)) throw new Error(`Invalid or incomplete market candle at index ${i}.`);
    }
    const wasEmpty = !dataset;
    dataset = {bars};
    activeSource = meta.mode;
    currentMeta = meta;
    engineResult = null;htfResult=null;
    removedOBs=[];removedFVGs=[];
    macroResult = null;
    try {
      // These existing historical 4H/Macro modules accept 15M inputs only.
      // For a 5M chart we pass observed, full 15M aggregations; never fill gaps.
      const fifteenBars = selectedTimeframe === 5 ? aggregate5mTo15m(bars) : bars;
      macroResult=calculateICTMacros(fifteenBars);
      macroSummary.textContent=`ICT Macros (America/New_York): ${MACRO_TIMES_NY.join(' · ')} · ${macroResult.markers.length} retained completed-candle markers. NY daylight saving handled automatically. Display color adapted for dark theme.`;
    } catch(e) {
      macroSummary.textContent=`ICT Macros unavailable: ${e.message}`;
    }
    structureResult = {
      dol: calculatePriorDayLiquidity(bars),
      swings: calculateConfirmedSwings(bars),
    };
    try {
      minorResult=calculateMinorDOL(selectedTimeframe===5?aggregate5mTo15m(bars):bars);
      const structureMetric = document.querySelector('#gongola-structure-direction');
      if (structureMetric) {
        structureMetric.textContent = minorResult.currentDirection==='+'?'BULLISH':minorResult.currentDirection==='-'?'BEARISH':'UNCONFIRMED';
        structureMetric.style.color = minorResult.currentDirection==='+'?'#4ac8a1':minorResult.currentDirection==='-'?'#ed797e':'#b8c5d2';
      }
      minorSummary.textContent = `4H Minor DOL (UTC-aligned research): ${minorResult.activeBSL} BSL · ${minorResult.activeSSL} SSL active · `+
        `${minorResult.counts.BOS} BOS · ${minorResult.counts.MSS} MSS · ${minorResult.counts.TS} TS recorded (net of reversals) · `+
        `last break ${minorResult.currentDirection==='+'?'BULLISH':minorResult.currentDirection==='-'?'BEARISH':'UNCONFIRMED'}. `+
        `Source exchange 4H boundaries/IDM not verified.`;
    } catch(e) {
      minorResult=null;
      const structureMetric=document.querySelector('#gongola-structure-direction');
      if(structureMetric){structureMetric.textContent='—';structureMetric.style.color='';}
      minorSummary.textContent=`Minor DOL unavailable: ${e.message}`;
    }
    candles.setData(bars.map(b => ({...b,time:b.time / 1000})));
    if (wasEmpty || meta.mode === 'csv') focusLatest();
    const dolCount=document.getElementById('dol-active-count');
    if (dolCount) dolCount.textContent=`${structureResult.dol.activeBSL} BSL · ${structureResult.dol.activeSSL} SSL`;
    const swingCount=document.getElementById('confirmed-swing-count');
    if (swingCount) swingCount.textContent=String(structureResult.swings.length);
    document.querySelector('#chart-empty')?.setAttribute('hidden','');
    document.querySelector('#current-price').textContent = bars.at(-1).close.toFixed(2);
    document.querySelector('#quote-status').textContent = `LAST CLOSED ${selectedTimeframe}M CANDLE`;
    document.querySelector('#market-name').textContent = meta.marketName;
    document.querySelector('#market-symbol').firstChild.textContent = `${selectedMarket} `;
    const tfBadge=document.querySelector('#market-symbol .fixed-tf');if(tfBadge)tfBadge.textContent=`${selectedTimeframe}M`;
    document.querySelector('#live-label').textContent = meta.marketStatus;
    const systemStatus = document.querySelector('#system-status');
    if (systemStatus) {
      const dot = elt('span', 'status-dot');
      dot.style.background = meta.mode === 'provider' ? '#2ad8a5' : '#d9a750';
      dot.style.boxShadow = meta.mode === 'provider' ? '0 0 8px #2ad8a5' : 'none';
      systemStatus.replaceChildren(dot, document.createTextNode(meta.mode === 'provider' ? 'PROVIDER DATA · 5M REFRESH' : 'IMPORTED HISTORICAL DATA'));
    }
    document.querySelector('#chart-footnote').textContent =
      `Last closed candle opened ${new Date(bars.at(-1).time).toISOString()} · ${meta.marketName} · Research zones unverified; no trade signals.`;
    reset.disabled = false;
    document.querySelector('#candle-count').textContent=bars.length.toLocaleString();
    for (const id of ['ob-direction','ob-count','fvg-count']) document.getElementById(id).textContent='—';
    recalculateZones();
  }
  function recalculateZones(){
    clearResearchPriceLines();
    if(!dataset || !currentMeta)return;
    const {bars}=dataset,meta=currentMeta;
    engineResult=null;htfResult=null;
    // Independent HTF replay: only 5M; use confirmed 15M periods, never live HTF wicks.
    if(selectedTimeframe===5){
      try {
        htfResult=replay15mHTFFVGOn5m(bars,{filterByHTFIR:htfIRFilterCheck.checked});
        const m=htfResult.summary;
        htfSummary.textContent=`15M HTF FVG (5M chart) · ${m.activeBullish} bullish · ${m.activeBearish} bearish · ${m.inverse} inverse · ${m.archived} historical removed. ${m.hasGaps?'Chart gaps present; FVG windows spanning missing intervals skipped.':''} Close-confirmed, provider-derived research; 60M HTF IR filter ${m.htfIRFilterApplied?'ON':'OFF'}${m.htfIRFilterApplied?` · last IR ${m.lastHTFIRDirection??'none'} · ${m.htfIREventCount} confirmed IR breaks`:''}. UTC period alignment provisional.`;
      } catch(err) {
        htfSummary.textContent=`15M HTF FVG unavailable: ${err.message}`;
      }
    } else htfSummary.textContent='15M HTF FVG overlay applies to the 5M chart only.';
    // The toggles below are actual engine calculation inputs, not cosmetic switches.
    try {
      const result=calculateResearchZones(bars,{
        timeframeMinutes:selectedTimeframe,
        swingFilter:obSwingCheck.checked,
        atrFilter:obAtrCheck.checked,
        recentOB:fvgRecentCheck.checked,
        obSessionFilter:obSessionCheck.checked,
        obHHLLFilter:obHHLLCheck.checked,
        obStructureFilter:obStructureCheck.checked,
        fvgMinorFilter:fvgMinorCheck.checked,
        fvgSessionFilter:fvgSessionCheck.checked,
        fvgDisplacement:Number(fvgDisplacementInput.value),
        fvgWideGap:Number(fvgWideGapInput.value),
      });
      engineResult=result;
      removedOBs=archivedOrderBlocks(result.ob,bars);
      removedFVGs=archivedFairValueGaps(result.lifecycle);
      const obCount=result.ob.state.bearBoxes.length+result.ob.state.bullBoxes.length;
      const fvgCount=result.lifecycle.drawings.filter(d=>!d.deleted).length;
      const direction=result.ob.state.lastOBDir;
      const directionEl=document.querySelector('#ob-direction');
      directionEl.textContent=direction==='-'?'BEARISH':direction==='+'?'BULLISH':'UNCONFIRMED';
      directionEl.style.color=direction==='-'?'#ef6767':direction==='+'?'#2bd1a0':'#d9a750';
      document.querySelector('#ob-count').textContent=String(obCount);
      document.querySelector('#fvg-count').textContent=String(fvgCount);
      message.className='ict-research-message';
      message.textContent=`${meta.notice} · ${bars.length} completed candles · ${obCount} OBs · ${fvgCount} FVG drawings · ${meta.gaps} gaps · ${meta.unclosed} unfinished excluded. Research subset; not parity-certified.`;
    }catch(err){
      for(const id of ['ob-direction','ob-count','fvg-count'])document.getElementById(id).textContent='—';
      message.className='ict-research-message warn';
      message.textContent=`${meta.notice} · ${bars.length} candles plotted. OB/FVG research unavailable: ${err.message}`;
    }
    queueDraw();
  }
  function updateMarketUI(){
    const pair=MARKET_NAMES[selectedMarket];
    title.textContent=`${pair} ${selectedTimeframe}M · MARKET DATA`;
    filterButton.textContent=zonesNearby?(selectedMarket==='BTCUSD'?'Zones: nearby 2.5%':'Zones: nearby $140'):'Zones: all history';
    document.querySelector('#market-symbol').firstChild.textContent=`${selectedMarket} `;
    const tfBadge=document.querySelector('#market-symbol .fixed-tf');if(tfBadge)tfBadge.textContent=`${selectedTimeframe}M`;
    const empty=document.querySelector('#chart-empty span');if(empty)empty.textContent=`No artificial prices. Load ${pair} ${selectedTimeframe}M candles from Twelve Data or import a matching CSV.`;
    const ref=document.querySelector('#gongola-reference-switch');
    if(ref){
      const note=ref.querySelector('.gongola-ref-note');
      const link=ref.querySelector('a');
      if(note)note.textContent=selectedMarket==='BTCUSD'?'Embedded reference remains FOREXCOM gold; Bitcoin opens separately in TradingView.':'Separate FOREXCOM gold reference. Gongola uses Twelve Data aggregated candles.';
      if(link){link.href=selectedMarket==='BTCUSD'?'https://www.tradingview.com/chart/?symbol=COINBASE%3ABTCUSD':'https://www.tradingview.com/chart/?symbol=FOREXCOM%3AXAUUSD';link.textContent=selectedMarket==='BTCUSD'?'Open BTC/USD in TradingView':'Open TradingView';}
    }
    const heading=document.querySelector('.chart-panel .panel-heading>span:first-child');
    if(heading)heading.textContent=`GONGOLA CHART · ${pair} ${selectedTimeframe}M`;
  }
  const clearDataset=()=>{
    clearResearchPriceLines();
    dataset=null;engineResult=null;htfResult=null;removedOBs=[];removedFVGs=[];structureResult=null;minorResult=null;macroResult=null;htfSummary.textContent='15M HTF FVG: select 5M and load completed candles.';activeSource='none';currentMeta=null;minorSummary.textContent='4H Minor DOL: awaiting completed market candles.';macroSummary.textContent='ICT Macros: awaiting completed market candles.';reset.disabled=true;input.value='';candles.setData([]);
    document.querySelector('#chart-empty')?.removeAttribute('hidden');
    document.querySelector('#current-price').textContent='—';
    document.querySelector('#quote-status').textContent='NO MARKET DATA LOADED';
    document.querySelector('#market-name').textContent=`${MARKET_NAMES[selectedMarket]} · Data source not connected`;
    document.querySelector('#live-label').textContent='NO DATA · NOT LIVE';
    const status = document.querySelector('#system-status');
    if (status) status.replaceChildren(elt('span', 'status-dot'), document.createTextNode('NO MARKET DATA'));
    document.querySelector('#chart-footnote').textContent='No source connected · No trades or alerts generated.';
    const structureMetric=document.querySelector('#gongola-structure-direction');
    if(structureMetric){structureMetric.textContent='—';structureMetric.style.color='';}
    for(const id of ['ob-direction','ob-count','fvg-count','candle-count','dol-active-count','confirmed-swing-count']){
      const el=document.getElementById(id);if(el)el.textContent='—';
    }
    queueDraw();
  };
  reset.addEventListener('click',()=>{
    autoCheck.checked=false;
    requestVersion++;if(activeRequest)activeRequest.abort();activeRequest=null;providerButton.disabled=false;
    clearDataset();
    message.className='ict-research-message warn';
    message.textContent='Chart cleared. Click Refresh market candles to reconnect, or import a matching CSV.';
  });
  [obCheck,fvgCheck,htfCheck,dolCheck,minorCheck,structureCheck,macroCheck,swingCheck].forEach(i=>i.addEventListener('change',()=>{updateFilterCount();queueDraw();saveChartSettings();}));
  [obSwingCheck,obAtrCheck,obSessionCheck,obHHLLCheck,obStructureCheck,fvgRecentCheck,fvgMinorCheck,fvgSessionCheck,htfIRFilterCheck].forEach(i=>i.addEventListener('change',()=>{updateFilterCount();recalculateZones();saveChartSettings();}));
  [fvgDisplacementInput,fvgWideGapInput].forEach(i=>i.addEventListener('change',()=>{recalculateZones();saveChartSettings();}));
  labelModeButton.addEventListener('click',()=>{recentStructuresOnly=!recentStructuresOnly;labelModeButton.textContent=recentStructuresOnly?'Structure: last 8':'Structure: all labels';queueDraw();saveChartSettings();});
  filterButton.addEventListener('click',()=>{
    zonesNearby = !zonesNearby;
    filterButton.textContent=zonesNearby?(selectedMarket==='BTCUSD'?'Zones: nearby 2.5%':'Zones: nearby $140'):'Zones: all history';
    queueDraw();
    saveChartSettings();
  });
  latestButton.addEventListener('click',()=>{historyMode=false;historyButton.textContent='↶ History view';focusLatest();});
  historyButton.addEventListener('click',()=>{
    historyMode=!historyMode;
    historyButton.textContent=historyMode?'↶ History on · removed zones faint':'↶ History view';
    if(historyMode){
      zonesNearby=false;filterButton.textContent='Zones: all history';
      if(dataset?.bars.length){const n=dataset.bars.length;chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-500),to:n+8});}
    }else{focusLatest();}
    queueDraw();
  });
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    message.className='ict-research-message';message.textContent=`Reading ${file.name}…`;
    try {
      const incoming=parse15mOHLC(await file.text(),{timeframeMinutes:selectedTimeframe});
      autoCheck.checked=false;
      applyBars(incoming.bars, {
        mode:'csv',marketName:`${MARKET_NAMES[selectedMarket]} · Imported local CSV (unverified source)`,
        marketStatus:'HISTORICAL CSV · NOT LIVE',notice:`Imported ${file.name}`,
        gaps:incoming.gapCount,unclosed:incoming.excludedUnclosed,
      });
    } catch(err) {
      message.className='ict-research-message error';
      message.textContent=`CSV import error: ${err.message}`;
    }
  });
  async function refreshProvider() {
    const myVersion=++requestVersion;
    if(activeRequest)activeRequest.abort();
    const controller=new AbortController();activeRequest=controller;
    const market=selectedMarket, tf=selectedTimeframe;
    providerButton.disabled=true;
    message.className='ict-research-message';
    message.textContent=`Requesting completed ${MARKET_NAMES[market]} ${tf}M candles…`;
    try {
      const endpoint=`${import.meta.env.BASE_URL}__gongola/market/candles?market=${market}&tf=${tf}`;
      const response=await fetch(endpoint,{cache:'no-store',signal:controller.signal});
      const payload=await response.json();
      if(myVersion!==requestVersion)return;
      if(!response.ok||payload.status!=='ok')throw new Error(payload.message||`Market provider HTTP ${response.status}`);
      if(payload.provider!=='Twelve Data'||payload.instrument!==MARKET_NAMES[market]||
          payload.timeframeMinutes!==tf||payload.matchesReferenceFeed!==false){
        throw new Error('Unexpected provider market identity or timeframe.');
      }
      const last=payload.candles?.at(-1)?.time;
      const stale=Number.isFinite(last)&&Date.now()-last>(tf*60_000*4);
      applyBars(payload.candles,{
        mode:'provider',marketName:market==='BTCUSD'?'Bitcoin / US Dollar · Twelve Data aggregated crypto':'Gold Spot / US Dollar · Twelve Data aggregate (NOT FOREXCOM)',
        marketStatus:`PROVIDER ${tf}M · ${stale?'DATA STALE / MARKET INACTIVE':'REFRESH 5 MIN'}`,
        notice:`Twelve Data · ${payload.cached?'cached':'refreshed'} ${new Date(payload.fetchedAt).toLocaleString()}${stale?' · last completed candle is stale':''}`,
        gaps:payload.gapCount,unclosed:payload.excludedUnclosed,
      });
      input.value='';
    }catch(err){
      if(myVersion!==requestVersion || err.name==='AbortError')return;
      message.className='ict-research-message warn';
      message.textContent=`Market feed: ${err.message} ${dataset?'Existing chart retained.':'Chart empty; no simulated fallback.'}`;
      if(activeSource==='provider')document.querySelector('#live-label').textContent='PROVIDER · REFRESH FAILED';
    }finally{
      if(myVersion===requestVersion){activeRequest=null;providerButton.disabled=false;}
    }
  }
  for(const control of [marketSelect,tfSelect])control.addEventListener('change',()=>{
    selectedMarket=marketSelect.value;
    selectedTimeframe=Number(tfSelect.value);
    if(activeRequest)activeRequest.abort();
    requestVersion++;
    autoCheck.checked=true;
    clearDataset();
    updateMarketUI();
    saveChartSettings();
    refreshProvider();
  });
  providerButton.addEventListener('click',()=>{autoCheck.checked=true;refreshProvider();});
  window.setInterval(()=>{
    if(autoCheck.checked&&activeSource!=='csv'&&document.visibilityState!=='hidden')refreshProvider();
  },REFRESH_MS);
  updateMarketUI();
  refreshProvider();
  chart.timeScale().subscribeVisibleLogicalRangeChange(queueDraw);
  window.addEventListener('resize',queueDraw);
  if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(queueDraw);resizeObserver.observe(host);}
  // Move the optional TradingView reference below the primary Gongola chart.
  // mountLiveMarket() runs after this function returns, hence the microtask.
  queueMicrotask(() => {
    mountWorkspaceLayout();
    eliteUI = mountEliteWorkspace({
      chart,
      layerControls:{ob:obCheck,fvg:fvgCheck,htf:htfCheck,dol:dolCheck,minor:minorCheck,
        structure:structureCheck,macro:macroCheck,swing:swingCheck},
      marketRow:selector,refreshButton:providerButton,autoLabel,
      latestButton,message,filterPanel,importPanel,
      analysisPanel:detailPanel,legendPanel,onCloseInspector:clearResearchPriceLines,
    });
  });
  if (typeof chart.subscribeClick === 'function') chart.subscribeClick(param => {
    const zone=inspectZoneAtPoint(param?.point);
    if(zone){
      const levels=[...(structureResult?.dol?.lines||[]).map(x=>({...x,source:'Previous NY day'})),
        ...(minorResult?.levels||[]).map(x=>({...x,source:'4H Minor DOL'}))];
      const plan=buildResearchTradePlan({zone,bars:dataset.bars,
        fifteenBars:selectedTimeframe===5?aggregate5mTo15m(dataset.bars):null,
        levels,lastClose:dataset.bars.at(-1).close,timeframeMinutes:selectedTimeframe});
      showResearchPriceLines(plan);
      eliteUI?.showZone({...zone,plan});
    }
  });
  queueDraw();
}
