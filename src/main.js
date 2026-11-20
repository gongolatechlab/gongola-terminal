import './style.css'
import { createChart, CandlestickSeries, ColorType, createSeriesMarkers } from 'lightweight-charts'
import {
  MARKETS,
  TIMEFRAMES,
  getSimulatedCandles,
  getLatestPrice,
  formatPrice,
} from './market-data.js'
import { prepareChartData } from './prepare-data.js'

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
        <h1 id="market-symbol">EURUSD</h1>
        <span class="market-subtitle" id="market-name">Euro / US Dollar</span>
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

const state = {
  symbol: 'EURUSD',
  timeframeMinutes: 15,
}

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

const markersPlugin = createSeriesMarkers(candles, [])

const symbolEl = document.getElementById('market-symbol')
const nameEl = document.getElementById('market-name')
const priceEl = document.getElementById('current-price')
const statusLabel = document.querySelector('.live-label')

function render() {
  const rawData = getSimulatedCandles(state.symbol, state.timeframeMinutes)
  const prepared = prepareChartData(rawData)

  if (!prepared.valid) {
    candles.setData([])
    markersPlugin.setMarkers([])
    symbolEl.textContent = MARKETS[state.symbol].symbol
    nameEl.textContent = MARKETS[state.symbol].name
    priceEl.textContent = '—'
    statusLabel.textContent = `DATA VALIDATION ERROR (${prepared.errors.length} errors)`
    statusLabel.style.color = '#ef5350'
    return
  }

  candles.setData(prepared.candles)
  chart.timeScale().fitContent()

  const markers = prepared.swings.map((swing) => ({
    time: swing.time,
    position: swing.type === 'high' ? 'aboveBar' : 'belowBar',
    color: swing.type === 'high' ? '#ef5350' : '#16b981',
    shape: swing.type === 'high' ? 'arrowDown' : 'arrowUp',
    text: swing.type === 'high' ? 'SH' : 'SL',
  }))
  markersPlugin.setMarkers(markers)

  const market = MARKETS[state.symbol]
  const latest = getLatestPrice(prepared.candles)

  symbolEl.textContent = market.symbol
  nameEl.textContent = market.name
  priceEl.textContent = formatPrice(latest, state.symbol)
  statusLabel.textContent = 'SIMULATED DATA'
  statusLabel.style.color = ''
}

document.getElementById('market').addEventListener('change', (e) => {
  state.symbol = e.target.value
  render()
})

const tfButtons = Array.from(document.querySelectorAll('.timeframes button'))
tfButtons.forEach((btn, index) => {
  btn.addEventListener('click', () => {
    tfButtons.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    state.timeframeMinutes = TIMEFRAMES[index].minutes
    render()
  })
})

render()

window.addEventListener('resize', () => {
  chart.applyOptions({
    width: chartElement.clientWidth,
  })
})
