/**
 * Visual-only workspace layout. Preserves the installed Gongola engine, market
 * bridge and TradingView reference iframe. Does not request or fabricate data.
 */
export function mountWorkspaceLayout() {
  if (document.querySelector('#gongola-reference-switch')) return;
  const research = document.querySelector('#chart-wrapper')?.closest('.chart-panel');
  if (!research) return;

  const style = document.createElement('style');
  style.textContent = `
    .terminal {max-width:1500px}
    .chart-wrapper #chart {height:clamp(520px,72vh,920px)}
    #research-controls {padding:0 10px}
    .ict-research-tools {margin-top:7px}
    .ict-research-tools .ict-check {padding:4px 2px}
    .gongola-ref-switch {margin-top:14px;padding:13px 14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid #26384b;border-radius:8px;background:#101a26;color:#b8c8d9;font:12px system-ui,sans-serif}
    .gongola-ref-switch button {border:1px solid #376078;border-radius:6px;padding:9px 12px;background:#172b3b;color:#cce9f2;font-weight:700;cursor:pointer}
    .gongola-ref-switch a {color:#79d8c6;text-decoration:none}
    .gongola-ref-note {color:#879bae;font-size:11px;flex:1;min-width:170px}
    .gongola-chart-subtitle {font-size:10px;color:#8fcdbd;letter-spacing:.35px}
    .gongola-action {border:1px solid #2e6073;padding:5px 10px;border-radius:6px;background:#142c3b;color:#d1f0ed;cursor:pointer;font-size:11px}
    .gongola-chart-right {display:flex;align-items:center;gap:9px}
    #live-market-panel[hidden], #gongola-tradingview-panel[hidden] {display:none!important}
    @media(max-width:650px){
      .chart-wrapper #chart {height:clamp(510px,66vh,800px)}
      .chart-panel .panel-heading{gap:6px}
      .gongola-chart-subtitle{font-size:9px}
      .gongola-ref-switch {margin-top:9px;padding:10px}
      .terminal{padding:13px 8px}
    }
  `;
  document.head.append(style);

  const heading = research.querySelector('.panel-heading');
  if (heading) {
    const text = heading.querySelector('span');
    if (text) text.textContent = 'GONGOLA CHART · XAU/USD 15M';
    const status = heading.querySelector('.live-label');
    if (status) {
      const holder = document.createElement('div');
      holder.className = 'gongola-chart-right';
      status.before(holder);
      holder.append(status);
      const source = document.createElement('small');
      source.className = 'gongola-chart-subtitle';
      source.textContent = 'ICT MACHINE · RESEARCH';
      heading.insertBefore(source, holder);
    }
  }
  const metrics = document.querySelector('.machine-grid');
  if (metrics && !document.querySelector('#dol-active-count')) {
    for (const [id, label] of [
      ['dol-active-count', 'ACTIVE PRIOR-DAY BSL / SSL'],
      ['confirmed-swing-count', 'CONFIRMED SWINGS · 1/1'],
    ]) {
      const metric = document.createElement('div');
      metric.className = 'metric';
      const caption = document.createElement('span');
      caption.textContent = label;
      const value = document.createElement('strong');
      value.id = id;
      value.textContent = '—';
      metric.append(caption, value);
      metrics.append(metric);
    }
  }

  // Runs once main.js's mountLiveMarket() has added the external reference.
  const reference = document.querySelector('#live-market-panel, #gongola-tradingview-panel');
  if (!reference || !reference.parentElement) return;
  const switchBar = document.createElement('div');
  switchBar.id = 'gongola-reference-switch';
  switchBar.className = 'gongola-ref-switch';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded','true');
  toggle.textContent = '▾ Hide TradingView reference';
  const note = document.createElement('span');
  note.className = 'gongola-ref-note';
  note.textContent = 'Separate FOREXCOM chart for comparison. The Gongola engine uses Twelve Data candles.';
  const link = document.createElement('a');
  link.href = 'https://www.tradingview.com/chart/?symbol=FOREXCOM%3AXAUUSD';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open TradingView';
  switchBar.append(toggle, note, link);
  research.after(switchBar);
  switchBar.after(reference);
  // Let the embedded autosize widget mount at a visible size once, then collapse.
  const setOpen = (open) => {
    reference.hidden = !open;
    toggle.textContent = open ? '▾ Hide TradingView reference' : '▸ Show TradingView reference';
    toggle.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };
  toggle.addEventListener('click', () => setOpen(reference.hidden));
  window.setTimeout(() => setOpen(false), 1300);
}
