export function mountLiveMarket() {
  const research = document.querySelector('.chart-panel');
  if (!research) return;

  const panel = document.createElement('section');
  panel.className = 'chart-panel';
  panel.id = 'live-market-panel';

  panel.innerHTML = `
    <div class="panel-heading">
      <span>FOREXCOM:XAUUSD · 15M</span>
      <span class="live-label">TRADINGVIEW MARKET DATA</span>
    </div>
    <div style="height:550px;width:100%">
      <div class="tradingview-widget-container"
           style="height:100%;width:100%">
        <div class="tradingview-widget-container__widget"
             style="height:calc(100% - 28px);width:100%">
        </div>
        <div class="tradingview-widget-copyright"
             style="height:28px;padding:5px 10px">
          <a href="https://www.tradingview.com/symbols/XAUUSD/"
             target="_blank" rel="noopener noreferrer">
            XAUUSD chart
          </a> by TradingView
        </div>
      </div>
    </div>
    <div class="chart-footnote">
      External market chart. ICT engine data connection is separate.
    </div>
  `;

  research.before(panel);

  const script = document.createElement('script');
  script.async = true;
  script.src =
    'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

  script.textContent = JSON.stringify({
    autosize: true,
    symbol: 'FOREXCOM:XAUUSD',
    interval: '15',
    timezone: 'America/New_York',
    theme: 'dark',
    style: '1',
    locale: 'en',
    hide_top_toolbar: false,
    hide_side_toolbar: false,
    allow_symbol_change: false,
    save_image: true
  });

  panel.querySelector('.tradingview-widget-container')
    .append(script);
}
