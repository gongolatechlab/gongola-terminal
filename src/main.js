import { mountLiveMarket } from './ict-machine/live-market.js';
import './style.css';
import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts';
import { mountICTResearchViewer } from './ict-machine/browser-research.js';

// Research-only interface: no simulated price feed, fake bars, or live signals.
document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">G</div>
      <div><strong>GONGOLA</strong><span>ICT TRADING TERMINAL</span></div>
    </div>
    <div class="system-status" id="system-status">
      <span class="status-dot" style="background:#d9a750;box-shadow:none"></span>
      NO LIVE FEED
    </div>
  </header>

  <main class="terminal">
    <section class="market-header">
      <div>
        <span class="eyebrow">ICT MACHINE · RESEARCH CHART</span>
        <h1 id="market-symbol">XAUUSD <small class="fixed-tf">15M</small></h1>
        <span class="market-subtitle" id="market-name">Gold / US Dollar · FOREXCOM reference</span>
      </div>
      <div class="price-block">
        <span class="price" id="current-price">—</span>
        <span class="change" id="quote-status">NO MARKET DATA LOADED</span>
      </div>
    </section>

    <section class="chart-panel">
      <div class="panel-heading">
        <span>PRICE ACTION &amp; ZONES</span>
        <span class="live-label" id="live-label">NO DATA · NOT LIVE</span>
      </div>
      <div id="research-controls"></div>
      <div class="chart-wrapper" id="chart-wrapper">
        <div id="chart"></div>
        <div class="chart-empty" id="chart-empty">
          <strong>No artificial prices.</strong>
          <span>Import your real 15-minute XAUUSD chart CSV to display candles and ICT research zones.</span>
        </div>
      </div>
      <div class="chart-footnote" id="chart-footnote">No source connected · No trades or alerts generated.</div>
    </section>

    <section class="machine-panel">
      <div class="panel-heading">
        <span>ICT MACHINE · V0.99 RESEARCH</span>
        <span class="machine-version">PARTIAL ENGINE · PARITY UNVERIFIED</span>
      </div>
      <div class="machine-grid">
        <div class="metric"><span>LATEST CONFIRMED OB DIRECTION</span><strong id="ob-direction" class="neutral">—</strong></div>
        <div class="metric"><span>ACTIVE ORDER BLOCKS</span><strong id="ob-count">—</strong></div>
        <div class="metric"><span>VISIBLE FVG DRAWINGS</span><strong id="fvg-count">—</strong></div>
        <div class="metric"><span>LOADED CANDLES</span><strong id="candle-count">—</strong></div>
      </div>
    </section>

    <footer>GONGOLA TECH LAB · VISUAL DEVELOPMENT<span>HISTORICAL RESEARCH ONLY · NO LIVE SIGNALS</span></footer>
  </main>
`;

const extraStyle = document.createElement('style');
extraStyle.textContent = `
  .fixed-tf{font-size:11px;color:#59d9ae;vertical-align:middle;border:1px solid #22584b;border-radius:4px;padding:3px 5px}
  .market-header{gap:18px}.market-header .price{font-size:clamp(16px,3vw,26px)}
  .chart-wrapper{position:relative;min-height:380px}.chart-wrapper #chart{height:clamp(380px,57vh,660px)}
  .chart-empty{position:absolute;z-index:3;top:0;left:0;right:0;bottom:0;background:rgba(11,17,26,.86);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:35px 22px;text-align:center;pointer-events:none}
  .chart-empty strong{font-size:18px;color:#e7eff7}.chart-empty span{line-height:1.65;max-width:370px;color:#a6b9c9}
  .chart-empty[hidden]{display:none}.chart-footnote{padding:9px 14px;border-top:1px solid #202c3b;color:#9daab8;font-size:10px}
  #research-controls{padding:0 12px}
  @media (max-width:550px){.terminal{padding:14px 9px}.market-header{align-items:flex-start}.market-header h1{font-size:23px}.price{font-size:18px}.chart-wrapper #chart{height:470px}.machine-version{font-size:7px}.topbar{padding:0 10px}}
`;
document.head.append(extraStyle);

const chartElement = document.getElementById('chart');
const chart = createChart(chartElement, {
  width: Math.max(320,chartElement.clientWidth),
  height: Math.max(380,chartElement.clientHeight),
  layout:{background:{type:ColorType.Solid,color:'#0b111a'},textColor:'#a7b6c7'},
  grid:{vertLines:{visible:false},horzLines:{visible:false}},
  rightPriceScale:{borderColor:'#2b3a4f'},
  timeScale:{borderColor:'#2b3a4f',timeVisible:true,secondsVisible:false},
  crosshair:{vertLine:{labelBackgroundColor:'#1c4650'},horzLine:{labelBackgroundColor:'#1c4650'}},
});
const candleSeries = chart.addSeries(CandlestickSeries, {
  upColor:'#1ab989',downColor:'#ef5350',
  borderUpColor:'#1ab989',borderDownColor:'#ef5350',
  wickUpColor:'#1ab989',wickDownColor:'#ef5350',
});
candleSeries.setData([]); // Never generate or display artificial candles.

mountICTResearchViewer({chart,candles:candleSeries});

if(typeof ResizeObserver !== 'undefined'){
  new ResizeObserver(()=>chart.applyOptions({width:chartElement.clientWidth,height:chartElement.clientHeight})).observe(chartElement);
}else{
  window.addEventListener('resize',()=>chart.applyOptions({width:chartElement.clientWidth,height:chartElement.clientHeight}));
}

mountLiveMarket();
