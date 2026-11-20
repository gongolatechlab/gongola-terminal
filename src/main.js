import './style.css'
import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts'

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">G</div>
      <div>
        <strong>GONGOLA</strong>
        <span>ICT TRADING TERMINAL</span>
      </div>
    </div>
    <div class="system-status">
      <span class="status-dot"></span>
      SYSTEM ONLINE
    </div>
  </header>

  <main class="terminal">
    <section class="market-header">
      <div>
        <span class="eyebrow">MARKET ANALYSIS</span>
        <h1>EURUSD</h1>
        <span class="market-subtitle">Euro / US Dollar</span>
      </div>
      <div class="price-block">
        <span class="price" id="current-price">1.08500</span>
        <span class="change">DEMO MARKET DATA</span>
      </div>
    </section>

    <nav class="toolbar">
      <select id="market">
        <option>EURUSD</option>
        <option>GBPUSD</option>
        <option>XAUUSD</option>
        <option>USDCAD</option>
        <option>NAS100</option>
      </select>

      <div class="timeframes">
        <button class="active">15M</button>
        <button>1H</button>
        <button>4H</button>
        <button>1D</button>
      </div>
    </nav>

    <section class="chart-panel">
      <div class="panel-heading">
        <span>PRICE ACTION</span>
        <span class="live-label">SIMULATED DATA</span>
      </div>
      <div id="chart"></div>
    </section>

    <section class="machine-panel">
      <div class="panel-heading">
        <span>ICT MACHINE</span>
        <span class="machine-version">GONGOLA / CORE ENGINE</span>
      </div>

      <div class="machine-grid">
        <div class="metric">
          <span>MARKET BIAS</span>
          <strong class="neutral">PENDING</strong>
        </div>
        <div class="metric">
          <span>MARKET STRUCTURE</span>
          <strong>UNCONFIRMED</strong>
        </div>
        <div class="metric">
          <span>LIQUIDITY</span>
          <strong>NOT ANALYZED</strong>
        </div>
        <div class="metric">
          <span>FVG STATUS</span>
          <strong>NOT ANALYZED</strong>
        </div>
      </div>
    </section>

    <footer>
      GONGOLA TECH LAB · RESEARCH & DEVELOPMENT
      <span>PROTOTYPE 0.1.0</span>
    </footer>
  </main>
`

const chartElement = document.getElementById('chart')

const chart = createChart(chartElement, {
  width: chartElement.clientWidth,
  height: 340,
  layout: {
    background: { type: ColorType.Solid, color: '#0b111a' },
    textColor: '#8b98a9',
  },
  grid: {
    vertLines: { color: '#182331' },
    horzLines: { color: '#182331' },
  },
  rightPriceScale: {
    borderColor: '#253244',
  },
  timeScale: {
    borderColor: '#253244',
    timeVisible: true,
  },
})

const candles = chart.addSeries(CandlestickSeries, {
  upColor: '#16b981',
  downColor: '#ef5350',
  borderUpColor: '#16b981',
  borderDownColor: '#ef5350',
  wickUpColor: '#16b981',
  wickDownColor: '#ef5350',
})

let previous = 1.085

const data = []
const now = Math.floor(Date.now() / 1000)
const start = now - 100 * 900

for (let i = 0; i < 100; i++) {
  const open = previous
  const move = (Math.random() - 0.48) * 0.0015
  const close = open + move

  data.push({
    time: start + i * 900,
    open,
    high: Math.max(open, close) + Math.random() * 0.0005,
    low: Math.min(open, close) - Math.random() * 0.0005,
    close,
  })

  previous = close
}

candles.setData(data)
chart.timeScale().fitContent()

window.addEventListener('resize', () => {
  chart.applyOptions({
    width: chartElement.clientWidth,
  })
})

document.getElementById('current-price').textContent =
  previous.toFixed(5)
