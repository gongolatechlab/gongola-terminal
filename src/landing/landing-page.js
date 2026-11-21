/**
 * Gongola Landing v1.5 — informational product homepage only.
 * Zero provider calls, candles, strategies, order requests, or trading actions.
 */
import './landing-page.css';

const root = import.meta.env.BASE_URL.replace(/\/+$/,'');
const terminalUrl = `${root}/terminal`;
const homeUrl = `${root}/`;
export function isTerminalPath() {
  const path = window.location.pathname.replace(/\/+$/,'');
  return path === terminalUrl || path === `${terminalUrl}/index.html`;
}

const arrow = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const bracket = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M7 5H5v14h2m10-14h2v14h-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const cross = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18M6 6h12v12H6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const wave = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M2 16l5-6 4 4 5-9 6 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 5h5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const scope = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4" stroke="currentColor" stroke-width="1.4"/></svg>`;

const feature = (number,icon,title,text,tag) => `
  <article class="gl-feature">
    <div class="gl-feature-head"><span class="gl-feature-number">${number}</span><span class="gl-feature-icon">${icon}</span></div>
    <h3>${title}</h3><p>${text}</p><span class="gl-feature-tag">${tag}</span>
  </article>`;

export function mountLandingPage() {
  document.title='Gongola Terminal — Market Structure Research';
  document.body.classList.add('gongola-landing-active');
  const app=document.getElementById('app');
  app.innerHTML=`
  <div class="gl-site" id="top">
    <header class="gl-header">
      <div class="gl-container gl-nav-row">
        <a class="gl-logo" href="${homeUrl}" aria-label="Gongola Terminal home">
          <span class="gl-logo-mark">G<span class="gl-logo-point">.</span></span>
          <span class="gl-logo-copy"><strong>GONGOLA</strong><small>TERMINAL</small></span>
        </a>
        <nav class="gl-nav-links" id="gl-navigation" aria-label="Main navigation">
          <a href="#platform">Platform</a><a href="#capabilities">Capabilities</a><a href="#workflow">How it works</a><a href="${root}/intelligence">Macro desk</a>
          <a class="gl-nav-launch" href="${terminalUrl}">Open terminal <span aria-hidden="true">↗</span></a>
        </nav>
        <button class="gl-menu-button" type="button" aria-label="Open menu" aria-controls="gl-navigation" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <main>
      <section class="gl-hero gl-container" aria-labelledby="gl-title">
        <div class="gl-hero-glow" aria-hidden="true"></div>
        <div class="gl-hero-copy">
          <div class="gl-kicker"><span class="gl-kicker-dash"></span> THE INTELLIGENT RESEARCH WORKSPACE <span class="gl-kicker-index">/ 01</span></div>
          <h1 id="gl-title">Market structure.<br><em>Without the noise.</em></h1>
          <p class="gl-hero-lead">A focused workspace for reading price action, mapping liquidity, and inspecting ICT-based trade scenarios — built for traders who value context over clutter.</p>
          <div class="gl-hero-actions">
            <a class="gl-primary-cta" href="${terminalUrl}">Launch Terminal ${arrow}</a>
            <a class="gl-text-cta" href="#platform">Explore the platform <span aria-hidden="true">↓</span></a>
          </div>
          <div class="gl-hero-facts" aria-label="Supported features">
            <span><b>02</b> RESEARCH MARKETS</span><i aria-hidden="true"></i>
            <span><b>05 / 15</b> MIN CHARTS</span><i aria-hidden="true"></i>
            <span><b>V0.99</b> RESEARCH REFERENCE</span>
          </div>
        </div>
        <div class="gl-hero-side" aria-hidden="true"><span>G / T</span><div class="gl-side-rule"></div><span>001—005</span></div>
      </section>

      <section class="gl-platform-section" id="platform" aria-labelledby="gl-platform-title">
        <div class="gl-container">
          <div class="gl-section-top"><div><span class="gl-section-eyebrow">01 / THE WORKSPACE</span><h2 id="gl-platform-title">One clear view.<br><em>Every relevant level.</em></h2></div>
          <p>Price action, structure, liquidity and zone context in a single chart-led interface. Built for analysis — never disguised as an execution signal.</p></div>
          <div class="gl-workspace-frame" role="img" aria-label="Illustrative overview of Gongola Terminal layout: market controls, chart research, structure, zones and liquidity. Not a live chart.">
            <div class="gl-workspace-head"><div class="gl-workspace-brand"><span class="gl-workspace-g">G</span><b>GONGOLA <span>/</span> TERMINAL</b></div>
              <span class="gl-workspace-research"><span class="gl-workspace-indicator"></span> RESEARCH WORKSPACE</span></div>
            <div class="gl-workspace-tools"><span class="gl-tool-symbol">XAUUSD <i>⌄</i></span><span class="gl-tool-current">5M</span><span>15M</span><i class="gl-tool-separator"></i><span class="gl-tool-layer"><b class="gl-blue-square"></b> Liquidity</span><span class="gl-tool-layer"><b class="gl-red-square"></b> Zones</span><span class="gl-tool-layer"><b class="gl-gold-square"></b> Structure</span></div>
            <div class="gl-workspace-body">
              <div class="gl-workspace-chart">
                <div class="gl-chart-watermark"><span>G / T</span><small>VISUAL RESEARCH FRAMEWORK</small></div>
                <div class="gl-chart-level gl-chart-level-one"><span>BUY-SIDE LIQUIDITY</span></div>
                <div class="gl-chart-zone gl-chart-zone-one"><span>BEARISH ZONE</span></div>
                <div class="gl-chart-zone gl-chart-zone-two"><span>BULLISH ZONE</span></div>
                <div class="gl-chart-level gl-chart-level-two"><span>SELL-SIDE LIQUIDITY</span></div>
                <svg class="gl-chart-lines" viewBox="0 0 760 314" preserveAspectRatio="none" aria-hidden="true">
                  <path class="gl-chart-structure-line" d="M25 217L115 217L115 166L205 166L205 191L305 191L305 123L415 123L415 149L525 149L525 90L635 90"/>
                  <path class="gl-chart-structure-dash" d="M25 230L100 230M305 202L410 202M525 162L710 162"/>
                </svg>
                <div class="gl-chart-tag gl-tag-bos">+ BOS</div><div class="gl-chart-tag gl-tag-mss">+ MSS</div>
                <div class="gl-chart-bottom"><span>STRUCTURE</span><span>LIQUIDITY</span><span>ORDER BLOCKS</span><span>FAIR VALUE GAPS</span></div>
              </div>
              <aside class="gl-workspace-aside"><div class="gl-aside-kicker">INSPECTION LAYER</div><div class="gl-aside-title">Zone research</div>
                <div class="gl-aside-line"><span>STRUCTURE</span><strong>CONTEXT</strong></div>
                <div class="gl-aside-line"><span>ENTRY</span><strong>SCENARIO</strong></div>
                <div class="gl-aside-line"><span>STOP LOSS</span><strong>RISK LEVEL</strong></div>
                <div class="gl-aside-line"><span>LIQUIDITY TP</span><strong>TARGET</strong></div>
                <div class="gl-aside-score"><small>RISK / REWARD</small><strong>R:R</strong><span>When a valid target exists</span></div>
              </aside>
            </div>
            <div class="gl-workspace-foot"><span>VISUAL OVERVIEW — NOT LIVE DATA</span><span>RESEARCH · NO BROKER ORDERS</span></div>
          </div>
          <div class="gl-preview-bottom"><span>DESIGNED FOR CLARITY</span><p>Open the live workspace to see actual available provider candles and computed drawings.</p><a href="${terminalUrl}">View in terminal ${arrow}</a></div>
        </div>
      </section>

      <section class="gl-capabilities gl-container" id="capabilities" aria-labelledby="gl-features-title">
        <div class="gl-section-top"><div><span class="gl-section-eyebrow">02 / CAPABILITIES</span><h2 id="gl-features-title">Built around<br><em>the right questions.</em></h2></div><p>Four research views designed to help you examine the market. No guaranteed setups, no automated orders, and no fabricated certainty.</p></div>
        <div class="gl-features-grid">
          ${feature('01',wave,'Market structure','Examine break of structure, shifts in market structure and related price-action context.','BOS / MSS / TS')}
          ${feature('02',scope,'Liquidity mapping','Track mapped buy-side and sell-side liquidity levels, including higher-timeframe context.','BSL / SSL')}
          ${feature('03',bracket,'Institutional zones','Study detected order blocks and fair value gaps without losing sight of surrounding price action.','OB / FVG / HTF')}
          ${feature('04',cross,'Trade inspector','Tap a supported zone to review its illustrative entry, stop and potential liquidity target, with R:R where valid.','ENTRY / SL / TP / R:R')}
        </div>
      </section>

      <section class="gl-workflow-section" id="workflow" aria-labelledby="gl-workflow-title"><div class="gl-container">
        <div class="gl-section-top"><div><span class="gl-section-eyebrow">03 / THE PROCESS</span><h2 id="gl-workflow-title">From the chart<br><em>to a clear hypothesis.</em></h2></div><p>Professional research starts with observations. Gongola helps you organize them into a structured scenario — not a trade recommendation.</p></div>
        <div class="gl-steps">
          <article class="gl-step"><span>01</span><div><h3>Select a market</h3><p>Choose XAUUSD or BTCUSD and a supported chart timeframe.</p></div></article>
          <article class="gl-step"><span>02</span><div><h3>Read the context</h3><p>Review structure, liquidity, order blocks and fair value gaps.</p></div></article>
          <article class="gl-step"><span>03</span><div><h3>Inspect the scenario</h3><p>Tap a zone for research calculations and the conditions that could invalidate the idea.</p></div></article>
        </div>
      </div></section>

      <section class="gl-last-cta gl-container"><div class="gl-cta-panel"><span class="gl-section-eyebrow">04 / READY TO EXPLORE?</span>
        <h2>Your chart.<br><em>In context.</em></h2>
        <p>Open Gongola Terminal and start from actual available market data — not a simulated demo feed.</p>
        <a class="gl-primary-cta" href="${terminalUrl}">Enter the Terminal ${arrow}</a>
        <div class="gl-cta-corner" aria-hidden="true">G.</div>
      </div></section>
    </main>

    <footer class="gl-footer"><div class="gl-container gl-footer-inner">
      <div class="gl-footer-identity"><span class="gl-logo-mark">G<span class="gl-logo-point">.</span></span><div><strong>GONGOLA</strong><small>TECH LAB · TERMINAL</small></div></div>
      <p>Gongola Terminal is an experimental market-research tool, not financial advice or an execution service. Results and ICT V0.99 parity are not independently verified. Market data availability and accuracy depend on the provider. Trading involves risk.</p>
      <div class="gl-footer-bottom"><span>© ${new Date().getFullYear()} GONGOLA TECH LAB</span><a href="${terminalUrl}">TERMINAL <span aria-hidden="true">↗</span></a><a href="#top">BACK TO TOP ↑</a></div>
    </div></footer>
  </div>`;

  const menu=app.querySelector('.gl-menu-button');
  const navigation=app.querySelector('.gl-nav-links');
  const close=()=>{navigation.classList.remove('gl-menu-open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open menu');};
  menu.addEventListener('click',()=>{
    const open=navigation.classList.toggle('gl-menu-open');
    menu.setAttribute('aria-expanded',String(open));
    menu.setAttribute('aria-label',open?'Close menu':'Open menu');
  });
  navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
}
