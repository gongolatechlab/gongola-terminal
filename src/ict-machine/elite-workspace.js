/** Premium MOBILE-FIRST CHART WORKSPACE. All calculations remain in browser-research.js.
 * Reparents existing controls rather than cloning; existing listeners stay active. */
import './elite-workspace.css';
import './trade-inspector.css';
import './professional-ui.css';
import {mountTerminalShell} from './terminal-shell.js';
import {presentResearchTicket} from './professional-trade-view.js';
import {LAYER_KEYS, getPresetVisibility, matchingPreset} from './elite-presets.js';

const make = (tag, className = '', text = '') => {
  const n = document.createElement(tag);
  n.className = className;
  if (text) n.textContent = text;
  return n;
};

export function mountEliteWorkspace({
  chart, layerControls, marketRow, refreshButton, autoLabel,
  latestButton, message, filterPanel, importPanel, analysisPanel, legendPanel, onCloseInspector,
} = {}) {
  if (document.querySelector('#gongola-elite-toolbar')) return null;
  const terminal = document.querySelector('.terminal');
  const chartPanel = document.querySelector('#chart-wrapper')?.closest('.chart-panel');
  const controlsMount = document.querySelector('#research-controls');
  const context = document.querySelector('.machine-panel');
  const marketHeader = document.querySelector('.market-header');
  if (!terminal || !chartPanel || !controlsMount || !marketHeader || !marketRow || !refreshButton || !message ||
      LAYER_KEYS.some(key => !layerControls?.[key])) return null;

  document.body.classList.add('gongola-elite');
  const brandSubtitle = document.querySelector('.brand span');
  if (brandSubtitle) brandSubtitle.textContent = 'MARKET TERMINAL';
  const label = chartPanel.querySelector('.panel-heading > span:first-child');
  if (label) label.textContent = 'MARKET WORKSPACE';
  const contextLabel = context?.querySelector('.panel-heading > span:first-child');
  if (contextLabel) contextLabel.textContent = 'MARKET CONTEXT';

  const toolbar = make('div', 'gongola-elite-toolbar');
  toolbar.id = 'gongola-elite-toolbar';
  const pickerWrap = make('div', 'gongola-elite-pickers');
  pickerWrap.append(marketRow);
  const commands = make('div', 'gongola-elite-commands');
  refreshButton.classList.add('gongola-elite-refresh');
  refreshButton.title = 'Refresh completed provider candles';
  refreshButton.setAttribute('aria-label', 'Refresh completed market candles');
  refreshButton.textContent = '↻';
  commands.append(refreshButton, latestButton);
  latestButton.classList.add('gongola-elite-latest');
  latestButton.title = 'Go to latest 170 candles';
  latestButton.setAttribute('aria-label', 'Go to latest 170 candles');
  latestButton.textContent = '◎';
  const focusButton = make('button', 'gongola-elite-focus', '⛶');
  focusButton.type = 'button';
  focusButton.setAttribute('aria-pressed', 'false');
  focusButton.title = 'Focus on the chart (Escape to exit)';
  focusButton.setAttribute('aria-label', 'Focus mode');
  commands.append(focusButton);
  toolbar.append(pickerWrap, commands);
  marketHeader.after(toolbar);

  const strip = make('div', 'gongola-elite-preset-strip');
  const caption = make('span', 'gongola-elite-caption', 'CHART VIEW');
  const presetBar = make('div', 'gongola-elite-presets');
  presetBar.setAttribute('role', 'group');
  presetBar.setAttribute('aria-label', 'Chart visibility presets');
  const buttons = new Map();
  for (const [key, title] of [['clean','Clean'],['structure','Structure'],['liquidity','Liquidity'],['full','Full ICT']]) {
    const button = make('button', 'gongola-elite-preset', title);
    button.type = 'button';
    button.dataset.preset = key;
    button.setAttribute('aria-pressed', 'false');
    presetBar.append(button);
    buttons.set(key, button);
  }
  // The mobile layout uses one native selection control instead of four wide buttons.
  // Existing desktop buttons and their listeners remain supported.
  const mobilePreset = make('select', 'gongola-elite-mobile-preset');
  mobilePreset.setAttribute('aria-label', 'Chart overlay visibility preset');
  for (const [value, label] of [
    ['custom', 'Custom view'], ['clean', 'Clean'], ['structure', 'Structure'],
    ['liquidity', 'Liquidity'], ['full', 'Full ICT'],
  ]) {
    const option = make('option', '', label);
    option.value = value;
    if (value === 'custom') option.disabled = true;
    mobilePreset.append(option);
  }
  const settings = make('details', 'gongola-elite-settings');
  settings.id = 'gongola-elite-settings';
  const summary = make('summary', '', '⚙');
  summary.title = 'ICT Settings';
  summary.setAttribute('aria-label', 'Expand chart layers and ICT filters');
  const settingsBody = make('div', 'gongola-elite-settings-body');
  for (const panel of [filterPanel, importPanel, analysisPanel, legendPanel]) {
    if (panel) settingsBody.append(panel);
  }
  const autoWrap = make('div', 'gongola-elite-auto');
  if (autoLabel) autoWrap.append(autoLabel);
  settingsBody.append(autoWrap);
  settings.append(summary, settingsBody);
  strip.append(caption, presetBar, mobilePreset, settings);
  controlsMount.prepend(strip);

  // Leave the original diagnostics visible in a compact, expandable-by-tap strip.
  const dataStrip = make('div', 'gongola-elite-feed-status');
  message.classList.add('gongola-elite-message');
  message.tabIndex = 0;
  message.setAttribute('role', 'button');
  message.setAttribute('aria-label', 'Expand feed and engine diagnostics');
  const expandMessage = () => dataStrip.classList.toggle('expanded');
  message.addEventListener('click', expandMessage);
  message.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();expandMessage();}
  });
  dataStrip.append(message);
  controlsMount.append(dataStrip);

  // Compact market-context cards. Do NOT infer one overall directional bias.
  if (context) {
    context.classList.add('gongola-elite-context');
    // Market metrics are available on demand; do not consume the first mobile viewport.
    const contextDrawer = make('details', 'gongola-compact-context');
    const contextSummary = make('summary', '', 'Market context');
    contextSummary.setAttribute('aria-label', 'Expand market structure and liquidity snapshot');
    contextDrawer.append(contextSummary, context);
    chartPanel.after(contextDrawer);
    const grid = context.querySelector('.machine-grid');
    if (grid && !document.querySelector('#gongola-structure-direction')) {
      const metric = make('div', 'metric');
      metric.append(make('span', '', 'LAST MINOR DOL BREAK'));
      const strong = make('strong', 'neutral', '—');
      strong.id = 'gongola-structure-direction';
      metric.append(strong);
      grid.insertBefore(metric, grid.children[1] || null);
    }
  }

  function readLayers() {
    return Object.fromEntries(LAYER_KEYS.map(key => [key, layerControls[key].checked]));
  }
  function syncPresets() {
    const selected = matchingPreset(readLayers());
    mobilePreset.value = selected || 'custom';
    for (const [key, button] of buttons) {
      const active = key === selected;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  for (const key of LAYER_KEYS) layerControls[key].addEventListener('change', syncPresets);
  function applyPreset(key) {
    const chosen = getPresetVisibility(key);
    for (const layerKey of LAYER_KEYS) {
      const input = layerControls[layerKey];
      if (input.checked !== chosen[layerKey]) {
        input.checked = chosen[layerKey];
        input.dispatchEvent(new Event('change', {bubbles: true}));
      }
    }
    syncPresets();
  }
  for (const [key, button] of buttons) button.addEventListener('click', () => applyPreset(key));
  mobilePreset.addEventListener('change', () => {
    if (mobilePreset.value !== 'custom') applyPreset(mobilePreset.value);
  });
  syncPresets(); // Preserve preexisting layer settings on installation.

  function setFocus(enabled) {
    document.body.classList.toggle('gongola-focus-mode', enabled);
    focusButton.textContent = enabled ? '↙' : '⛶';
    focusButton.setAttribute('aria-label', enabled ? 'Exit focus mode' : 'Focus mode');
    focusButton.title = enabled ? 'Exit focus mode' : 'Focus on chart';
    focusButton.setAttribute('aria-pressed', String(enabled));
    requestAnimationFrame(() => {
      // Existing ResizeObserver and resize listener update chart dimensions.
      window.dispatchEvent(new Event('resize'));
    });
  }
  focusButton.addEventListener('click', () => setFocus(!document.body.classList.contains('gongola-focus-mode')));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('gongola-focus-mode')) setFocus(false);
  });

  // Drawing information panel; descriptive only, contains no trade actions.
  const inspectShade = make('div', 'gongola-elite-inspector-backdrop');
  inspectShade.hidden = true;
  const sheet = make('section', 'gongola-elite-inspector');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'ICT drawing details');
  const top = make('div', 'gongola-elite-inspector-top');
  const heading = make('strong', '', 'Drawing details');
  const close = make('button', '', '✕ Close');
  close.type = 'button';
  top.append(heading, close);
  const body = make('div', 'gongola-elite-inspector-values');
  sheet.append(top, body);
  inspectShade.append(sheet);
  document.body.append(inspectShade);
  const dismiss = () => { inspectShade.hidden = true; if(typeof onCloseInspector==='function')onCloseInspector(); };
  close.addEventListener('click', dismiss);
  inspectShade.addEventListener('click', e => { if (e.target === inspectShade) dismiss(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
  function showZone(data) {
    if (!data || typeof data !== 'object') return;
    heading.textContent = data.label || 'ICT zone';
    body.replaceChildren();
    for (const [key, value] of Object.entries({
      'Upper boundary': data.top,
      'Lower boundary': data.bottom,
      'Origin (UTC)': data.origin,
      'Current state': data.status,
      'Source': 'Gongola partial V0.99 engine · unverified',
    })) {
      const dt = make('dt', '', key);const dd = make('dd', '', String(value ?? 'Not available'));
      body.append(dt, dd);
    }
    const p=data.plan;
    const section=make('div','gongola-trade-section','RESEARCH SCENARIO · NOT AN ORDER');
    body.append(section);
    const values=p && p.status!=='unavailable'
      ? {'Direction':p.direction==='bullish'?'BUY (illustrative)':'SELL (illustrative)',
         'Entry model':p.entryRule,'Entry':Number(p.entry).toFixed(2),
         'Stop rule':p.stopRule,'Stop Loss':Number(p.stop).toFixed(2),
         'Risk distance':Number(p.risk).toFixed(2),
         'Take Profit (next untaken liquidity)':p.target===null?'Not available':Number(p.target).toFixed(2),
         'Target source':p.targetSource??'Not available',
         'Reward distance':p.reward===null?'Not available':Number(p.reward).toFixed(2),
         'Risk:Reward':p.rr===null?'Not available':'1:' + p.rr.toFixed(2)}
      : {'Research plan':'Unavailable'};
    for(const [key,value] of Object.entries(values)){
      body.append(make('dt','',key),make('dd','',String(value)));
    }
    const note=make('div','gongola-trade-note',p?.message||'No trade model for this drawing.');
    body.append(note);
    body.append(make('div','gongola-trade-warning',
      'Research projection only. The Pine signal filter is OFF; no order is placed. Prices exclude spread, slippage and fees.'));
    presentResearchTicket(body, data);
    inspectShade.hidden = false;
    close.focus();
  }
  mountTerminalShell({
    toolbar,settings,mobilePreset,layerControls,refreshButton,latestButton,
    focusButton,context,message,
  });
  return {showZone, syncPresets, setFocus};
}
