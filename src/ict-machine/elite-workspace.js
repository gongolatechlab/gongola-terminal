/** Premium MOBILE-FIRST CHART WORKSPACE. All calculations remain in browser-research.js.
 * Reparents existing controls rather than cloning; existing listeners stay active. */
import './elite-workspace.css';
import {LAYER_KEYS, getPresetVisibility, matchingPreset} from './elite-presets.js';

const make = (tag, className = '', text = '') => {
  const n = document.createElement(tag);
  n.className = className;
  if (text) n.textContent = text;
  return n;
};

export function mountEliteWorkspace({
  chart, layerControls, marketRow, refreshButton, autoLabel,
  latestButton, message, filterPanel, importPanel, analysisPanel, legendPanel,
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
  commands.append(refreshButton, latestButton);
  latestButton.classList.add('gongola-elite-latest');
  const focusButton = make('button', 'gongola-elite-focus', '⛶ Focus');
  focusButton.type = 'button';
  focusButton.setAttribute('aria-pressed', 'false');
  focusButton.title = 'Focus on the chart (Escape to exit)';
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
  const settings = make('details', 'gongola-elite-settings');
  settings.id = 'gongola-elite-settings';
  const summary = make('summary', '', '⚙ Settings');
  summary.setAttribute('aria-label', 'Expand chart layers and ICT filters');
  const settingsBody = make('div', 'gongola-elite-settings-body');
  for (const panel of [filterPanel, importPanel, analysisPanel, legendPanel]) {
    if (panel) settingsBody.append(panel);
  }
  const autoWrap = make('div', 'gongola-elite-auto');
  if (autoLabel) autoWrap.append(autoLabel);
  settingsBody.append(autoWrap);
  settings.append(summary, settingsBody);
  strip.append(caption, presetBar, settings);
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
    chartPanel.before(context);
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
    for (const [key, button] of buttons) {
      const active = key === selected;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  for (const key of LAYER_KEYS) layerControls[key].addEventListener('change', syncPresets);
  for (const [key, button] of buttons) button.addEventListener('click', () => {
    const chosen = getPresetVisibility(key);
    for (const layerKey of LAYER_KEYS) {
      const input = layerControls[layerKey];
      if (input.checked !== chosen[layerKey]) {
        input.checked = chosen[layerKey];
        input.dispatchEvent(new Event('change', {bubbles: true}));
      }
    }
    syncPresets();
  });
  syncPresets(); // Preserve preexisting layer settings on installation.

  function setFocus(enabled) {
    document.body.classList.toggle('gongola-focus-mode', enabled);
    focusButton.textContent = enabled ? '↙ Exit focus' : '⛶ Focus';
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
  const body = make('dl', 'gongola-elite-inspector-values');
  sheet.append(top, body);
  inspectShade.append(sheet);
  document.body.append(inspectShade);
  const dismiss = () => { inspectShade.hidden = true; };
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
    inspectShade.hidden = false;
    close.focus();
  }
  return {showZone, syncPresets, setFocus};
}
