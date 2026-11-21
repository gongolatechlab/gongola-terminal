/**
 * Gongola Terminal 1.4 — responsive presentation shell based on the user-provided
 * compact HTML reference. Reparents existing DOM nodes and dispatches the existing
 * chart-layer/timeframe change events; creates no candles, signals, or orders.
 */
import './terminal-shell.css';

const create = (tag, cls, txt) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (txt) el.textContent = txt;
  return el;
};
const pulse = input => input.dispatchEvent(new Event('change', {bubbles:true}));

export function mountTerminalShell({
  toolbar, settings, mobilePreset, layerControls,
  refreshButton, latestButton, focusButton, context, message,
} = {}) {
  const body = document.body;
  if (body.classList.contains('g-shell-v14')) return null;
  const app = document.querySelector('#app');
  const header = document.querySelector('.topbar');
  const marketHeader = document.querySelector('.market-header');
  const marketSelect = document.querySelector('#gongola-market-select');
  const tfSelect = document.querySelector('#gongola-timeframe-select');
  const chartPanel = document.querySelector('#chart-wrapper')?.closest('.chart-panel');
  const controlsMount = document.querySelector('#research-controls');
  const dataStrip = document.querySelector('.gongola-elite-feed-status');
  const liveLabel = document.querySelector('#live-label');
  const contextDrawer = context?.closest('.gongola-compact-context');
  if (!app || !header || !marketHeader || !marketSelect || !tfSelect || !chartPanel ||
      !toolbar || !settings || !mobilePreset || !refreshButton || !latestButton ||
      !focusButton || !contextDrawer || !dataStrip || !liveLabel || !message ||
      !layerControls?.ob || !layerControls?.fvg || !layerControls?.dol) return null;

  // The source template simulates candles; that script is NEVER imported here.
  // Reparent live DOM nodes so their current event handlers and data updates survive.
  body.classList.add('g-shell-v14');
  header.after(toolbar);
  const brand = header.querySelector('.brand');
  if (brand) brand.setAttribute('aria-label','Gongola Terminal');
  // The market picker already identifies the active pair. Keep quote nodes in
  // the DOM for their existing live-update handlers, but don't occupy the topbar
  // or create horizontal overflow on narrow phones.
  marketHeader.classList.add('g-shell-quote');
  marketHeader.hidden = true;
  marketHeader.setAttribute('aria-hidden', 'true');
  const symbol = marketHeader.querySelector('#market-symbol');
  if (symbol) {
    symbol.title = 'Select a market from the toolbar';
  }

  const picker = toolbar.querySelector('.gongola-elite-pickers');
  if (picker) picker.classList.add('g-shell-picker-storage');
  const symbolSelectWrap = create('div','g-shell-symbol-select');
  symbolSelectWrap.append(marketSelect);
  symbolSelectWrap.title = 'Market';
  toolbar.prepend(symbolSelectWrap);

  const timeframe = create('div','g-shell-timeframes');
  timeframe.setAttribute('role','group');
  timeframe.setAttribute('aria-label','Chart timeframe');
  const tfs = new Map();
  for (const [minutes,name] of [['5','5M'],['15','15M']]) {
    const btn = create('button','g-shell-tf',name);
    btn.type = 'button';
    btn.dataset.timeframe = minutes;
    btn.addEventListener('click', () => {
      if (tfSelect.value === minutes) return;
      tfSelect.value = minutes;
      pulse(tfSelect); // existing data reload + rendering path
    });
    timeframe.append(btn);
    tfs.set(minutes,btn);
  }
  const syncTf = () => {
    for (const [minutes,btn] of tfs) {
      const active = minutes === tfSelect.value;
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-pressed',String(active));
    }
  };
  tfSelect.addEventListener('change',syncTf);
  syncTf();
  symbolSelectWrap.after(timeframe);

  const layers = create('div','g-shell-layer-chips');
  layers.setAttribute('role','group');
  layers.setAttribute('aria-label','Visible chart overlays');
  const layerGroups = [
    {name:'Liquidity',cls:'g-shell-liq',keys:['dol','minor']},
    {name:'Zones',cls:'g-shell-zones',keys:['ob','fvg','htf']},
    {name:'Structure',cls:'g-shell-structure',keys:['structure','swing']},
  ];
  const chips = [];
  for (const item of layerGroups) {
    const controls = item.keys.map(key=>layerControls[key]).filter(Boolean);
    if (!controls.length) continue;
    const btn = create('button',`g-shell-chip ${item.cls}`,item.name);
    btn.type='button';
    const refresh = () => {
      const active=controls.some(c=>c.checked);
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-pressed',String(active));
    };
    btn.addEventListener('click',()=>{
      const next = !controls.some(c=>c.checked);
      for(const c of controls) if(c.checked!==next){c.checked=next;pulse(c);}
      refresh();
    });
    for(const c of controls) c.addEventListener('change',refresh);
    refresh();
    chips.push(btn);
    layers.append(btn);
  }
  timeframe.after(layers);
  // Mirror the existing 'nearby/all history' control; its original click
  // handler still owns the actual overlay state.
  const existingAll = [...settings.querySelectorAll('button')]
    .find(b => b.textContent.trim().startsWith('Zones:'));
  if (existingAll) {
    const all = create('button','g-shell-chip g-shell-all','All levels');
    all.type='button';
    const sync = () => {
      const on = /all history/i.test(existingAll.textContent);
      all.classList.toggle('is-active',on);
      all.setAttribute('aria-pressed',String(on));
    };
    all.addEventListener('click',()=>{existingAll.click();sync();});
    existingAll.addEventListener('click',()=>queueMicrotask(sync));
    sync();
    layers.append(all);
  }

  const viewLabel = create('label','g-shell-view-label');
  viewLabel.textContent='VIEW';
  viewLabel.append(mobilePreset);
  layers.after(viewLabel);
  mobilePreset.title='Overlay visibility preset';

  toolbar.querySelector('.gongola-elite-commands')?.classList.add('g-shell-commands');
  for(const [button,txt,description] of [
    [refreshButton,'↻','Refresh provider candles'],
    [latestButton,'⌖','Jump to latest candles'],
    [focusButton,'⛶','Chart focus mode'],
  ]) {
    button.textContent=txt;
    button.title=description;
    button.setAttribute('aria-label',description);
    button.classList.add('g-shell-icon');
  }

  const settingsWrap=create('div','g-shell-settings-wrap');
  toolbar.append(settingsWrap);
  settingsWrap.append(settings);
  const settingsSummary = settings.querySelector(':scope > summary');
  if(settingsSummary){
    settingsSummary.textContent='☷';
    settingsSummary.title='Open filters and advanced chart settings';
    settingsSummary.setAttribute('aria-label','Open filters and settings');
  }
  const scrim=create('button','g-shell-settings-scrim');
  scrim.type='button';
  scrim.setAttribute('aria-label','Close filters and settings');
  body.append(scrim);
  const closeSettings=()=>{settings.open=false;body.classList.remove('g-shell-settings-open');};
  const settingsBody = settings.querySelector(':scope > .gongola-elite-settings-body');
  if(settingsBody){
    const done=create('button','g-shell-sheet-close','Done');
    done.type='button';
    done.setAttribute('aria-label','Close settings panel');
    done.addEventListener('click',closeSettings);
    settingsBody.prepend(done);
  }
  settings.addEventListener('toggle',()=>{
    body.classList.toggle('g-shell-settings-open',settings.open);
  });
  scrim.addEventListener('click',closeSettings);
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeSettings();});

  // Thin, data-driven status row. No invented live status is created.
  const status = create('div','g-shell-status');
  status.id='g-shell-status';
  const dot=create('span','g-shell-status-dot');
  dot.setAttribute('aria-hidden','true');
  status.append(dot);
  status.append(liveLabel);
  status.append(dataStrip);
  const detailsButton=create('button','g-shell-details','DETAILS');
  detailsButton.type='button';
  detailsButton.addEventListener('click',()=>{
    dataStrip.classList.toggle('expanded');
    detailsButton.setAttribute('aria-expanded',String(dataStrip.classList.contains('expanded')));
  });
  detailsButton.setAttribute('aria-expanded','false');
  status.append(detailsButton);
  toolbar.after(status);

  // Keep the existing chart, overlays, hit testing and inspector in place.
  chartPanel.classList.add('g-shell-chart-panel');
  const chartHint=create('span','g-shell-chart-hint','DRAG TO PAN · PINCH TO ZOOM · TAP ZONE TO ANALYZE');
  chartPanel.querySelector('.chart-footnote')?.prepend(chartHint);

  // Existing live metric nodes are moved, never duplicated or faked.
  contextDrawer.open=true;
  contextDrawer.classList.add('g-shell-stats');
  context.classList.add('g-shell-stats-content');
  const metricGrid=context.querySelector('.machine-grid');
  if(metricGrid){
    // Place the most actionable information first, without combining different biases.
    const orderedIds=['ob-direction','gongola-structure-direction','ob-count','fvg-count'];
    for (const id of [...orderedIds].reverse()) {
      const metric=metricGrid.querySelector(`#${id}`)?.closest('.metric');
      if(metric)metricGrid.prepend(metric);
    }
    // Other metrics remain available, but are not allowed to crowd the chart.
    metricGrid.classList.add('g-shell-metric-grid');
  }
  chartPanel.after(contextDrawer);
  contextDrawer.querySelector(':scope > summary')?.setAttribute('aria-hidden','true');

  // Keep the old controls in the DOM; their listener-backed nodes were moved above.
  controlsMount.classList.add('g-shell-control-storage');
  const openMenu = () => {settings.open=true;};
  const sourceNotice = document.querySelector('.market-subtitle');
  if (sourceNotice) sourceNotice.title='Data source and session details are available under Settings';
  const systemStatus=document.querySelector('#system-status');
  if(systemStatus)systemStatus.classList.add('g-shell-system-hidden');
  // Trigger chart re-measurement after reparenting (existing app observers do the rest).
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  return {closeSettings,openMenu,syncTf,layerChips:chips};
}
