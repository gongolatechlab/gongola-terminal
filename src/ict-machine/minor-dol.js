/**
 * Gongola ICT Machine V0.99: closed-candle historical Minor DOL subset.
 * Source: 'Minor DOL: independent timeframe boundary' and 'extend, mitigate,
 * and trim' blocks in the supplied V0.99 Pine (approx. lines 2746–2783,
 * 2991–3195). The 4H/15m preset is the only supported configuration here.
 *
 * Explicit limits: provider 4H candle boundaries are approximated as UTC
 * multiples of 4H (not guaranteed to be FOREXCOM TradingView session bars).
 * Does not reproduce session-level renaming, IDM/IND relabeling, live BUY/SELL
 * labels, cross-timeframe lock, realtime rollback or provider-specific holidays.
 * No entries, alerts, or trade signals.
 */
const FIFTEEN = 15 * 60_000;
const FOUR_HOURS = 4 * 60 * 60_000;

function validate(bars, chartTfMs) {
  if (!Array.isArray(bars) || bars.length === 0) throw new Error('Minor DOL requires historical candles.');
  let previous = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!b || !Number.isSafeInteger(b.time) || b.time % chartTfMs !== 0 || b.time <= previous ||
        ![b.open,b.high,b.low,b.close].every(Number.isFinite) ||
        b.high < Math.max(b.open,b.close,b.low) || b.low > Math.min(b.open,b.close,b.high)) {
      throw new Error(`Invalid 15m candle at index ${i}.`);
    }
    previous = b.time;
  }
}
const trim = (list, cap) => {while (list.length > cap) list.shift();};

/**
 * @returns {{ levels: Array, events: Array, currentDirection: '+'|'-'|null,
 *             activeBSL:number,activeSSL:number,mitigatedBSL:number,
 *             mitigatedSSL:number,counts:Object, boundaries:'UTC-4H' }}
 * `levels` are visible retained levels; `events` are the last 10 BOS/MSS and
 * last 10 TS labels (with TS -> BOS/MSS relabeling on later close reversal).
 * All source bars are closed and chronological. This never invents HTF bars.
 */
export function calculateMinorDOL(bars, {
  periodMs = FOUR_HOURS,
  maxUnmitigated = 20,
  maxMitigated = 5,
  maxBOSLabels = 10,
  maxTSLabels = 10,
  minBarsBOS = 3,
  boundaryOffsetMs = 0,
  chartTfMs = FIFTEEN,
} = {}) {
  if (![5 * 60_000, FIFTEEN].includes(chartTfMs)) {
    throw new Error('Minor DOL context requires 5M or 15M chart candles.');
  }
  validate(bars, chartTfMs);
  if (periodMs !== FOUR_HOURS) throw new Error('Only 4-hour Minor DOL is supported in this build.');
  for (const [name,value] of Object.entries({maxUnmitigated,maxMitigated,maxBOSLabels,maxTSLabels,minBarsBOS})) {
    if (!Number.isInteger(value) || value < (name === 'maxUnmitigated' ? 1 : 0) || value > 500) {
      throw new RangeError(`Invalid ${name}.`);
    }
  }
  if (!Number.isInteger(boundaryOffsetMs) || boundaryOffsetMs % chartTfMs !== 0 ||
      boundaryOffsetMs < 0 || boundaryOffsetMs >= FOUR_HOURS) {
    throw new RangeError('Invalid 4H boundary offset.');
  }

  const active = {BSL: [], SSL: []};
  const mitigated = {BSL: [], SSL: []};
  const bosLabels = [], tsLabels = [];
  const lastTSEvent = {BSL: null, SSL: null};
  const watches = {BSL: null, SSL: null};
  const counts = {levelsCreated:0, levelsMitigated:0, BOS:0, MSS:0, TS:0, TSReversed:0};
  let currentDirection = null;
  let lastFvgFilterDir = null;
  let lastStructBreakDirTime = null;
  const snapshots = [];
  let period = null, extrema = null;
  let lastTime = null;

  function create(type, price, highLowIndex, highLowTime, boundaryTime) {
    const level = {
      type, price, anchorTime:highLowTime, formBar:highLowIndex, formTime:highLowTime,
      startTime:boundaryTime, endTime:boundaryTime, mitigated:false, touchedAt:null,
      boundary:'UTC-4H',
    };
    active[type].push(level);
    trim(active[type],maxUnmitigated);
    counts.levelsCreated++;
  }

  function recordBreak(type, watch, eventBarIndex, eventTime, {relabel = null} = {}) {
    const direction = type === 'BSL' ? '+' : '-';
    const classification = relabel
      ? (relabel.wasMSSAtTS ? 'MSS' : 'BOS')
      : (currentDirection === (direction === '+' ? '-' : '+') ? 'MSS' : 'BOS');
    const label = direction + classification;
    let event;
    if (relabel) {
      event = relabel;
      event.label = label;
      event.type = classification;
      event.direction = direction;
      event.convertedAt = eventTime;
      event.status = 'converted-ts';
      const idx = tsLabels.indexOf(event);
      if (idx !== -1) tsLabels.splice(idx,1);
      counts.TSReversed++;
      counts.TS--;
    } else {
      event = {
        type:classification, label, direction, price:watch.price,
        time:eventTime, originTime:watch.level.formTime, resolutionTime:eventTime,
        status:'confirmed-close',
      };
    }
    bosLabels.push(event);
    trim(bosLabels,maxBOSLabels);
    counts[classification]++;
    currentDirection = direction;
    lastFvgFilterDir = direction;
    lastStructBreakDirTime = eventTime;
    return event;
  }

  function recordTS(type, watch, b) {
    const direction = type === 'BSL' ? '-' : '+';
    const event = {
      type:'TS', label:direction+'TS', direction, price:watch.price,
      time:b.time, originTime:watch.level.formTime,
      resolutionTime:b.time, status:'rejection-close',
      wasMSSAtTS: currentDirection === (type === 'BSL' ? '-' : '+'),
    };
    tsLabels.push(event);
    trim(tsLabels,maxTSLabels);
    counts.TS++;
    // Turtle Soup updates lastFvgFilterDir without changing lastStructBreakDir.
    lastFvgFilterDir = direction;
    // Pine keeps only the most recent pending TS reversal reference per side.
    lastTSEvent[type] = event;
  }

  for (let i = 0; i < bars.length; i++) {
    const b=bars[i];
    const key = Math.floor((b.time - boundaryOffsetMs)/FOUR_HOURS);
    if (key !== period) {
      if (extrema) {
        create('BSL', extrema.high, extrema.highIndex, extrema.highTime, b.time);
        create('SSL', extrema.low, extrema.lowIndex, extrema.lowTime, b.time);
      }
      period=key;
      extrema={high:b.high,low:b.low,highIndex:i,lowIndex:i,highTime:b.time,lowTime:b.time};
    } else {
      if (b.high>extrema.high) {extrema.high=b.high;extrema.highIndex=i;extrema.highTime=b.time;}
      if (b.low<extrema.low) {extrema.low=b.low;extrema.lowIndex=i;extrema.lowTime=b.time;}
    }
    // Extend all *currently active* levels to this candle, then freeze at
    // the first wick touch. The source evaluates BSL side then SSL side.
    for (const type of ['BSL','SSL']) {
      const list=active[type];
      for (let j=0;j<list.length;) {
        const item=list[j];
        item.endTime=b.time;
        const wickTouch = type === 'BSL' ? b.high >= item.price : b.low <= item.price;
        if (!wickTouch) {j++;continue;}
        list.splice(j,1);
        item.mitigated=true;
        item.touchedAt=b.time;
        mitigated[type].push(item);
        trim(mitigated[type],maxMitigated);
        counts.levelsMitigated++;
        // Later touches supersede the prior side watch (V0.99).
        watches[type]={price:item.price,level:item,touchIndex:i};
      }
    }

    // Each watch is resolved AFTER both mitigation loops on the same bar.
    // TS condition uses the chart candle's close; a BOS uses the original
    // extreme formation bar plus minBarsBOS, not the wick-touch bar.
    for (const type of ['BSL','SSL']) {
      const w=watches[type];
      if (!w) continue;
      const breakout = type==='BSL' ? b.close > w.price : b.close < w.price;
      const rejection = type==='BSL' ? b.close < w.price : b.close > w.price;
      if (breakout && i >= w.level.formBar + minBarsBOS) {
        recordBreak(type,w,i,b.time);
        watches[type]=null;
      } else if (rejection) {
        recordTS(type,w,b);
        watches[type]=null;
      }
    }
    // An existing TS may be relabeled when later closing through its level.
    // The latest TS is a mutable label rather than a fresh signal in Pine.
    for (const type of ['BSL','SSL']) {
      const event=lastTSEvent[type];
      if (!event) continue;
      const reversed = type==='BSL' ? b.close > event.price : b.close < event.price;
      if (reversed) {
        const fakeWatch={price:event.price,level:{formTime:event.originTime}};
        recordBreak(type,fakeWatch,i,b.time,{relabel:event});
        lastTSEvent[type]=null;
      }
    }
    // This snapshot is the POST-bar state. The OB engine on bar N must only
    // read the snapshot from bars that CLOSED before bar N opened, because
    // Pine executes its OB engine earlier than the Minor DOL block.
    snapshots.push({
      time:b.time, end:b.time + chartTfMs,
      highTime:extrema.highTime, lowTime:extrema.lowTime,
      lastFvgFilterDir, lastStructBreakDir:currentDirection,
      lastStructBreakDirTime,
    });
    lastTime=b.time;
  }
  return {
    levels:[...active.BSL,...active.SSL,...mitigated.BSL,...mitigated.SSL],
    events:[...bosLabels,...tsLabels].sort((a,b) => a.time-b.time),
    currentDirection,
    activeBSL:active.BSL.length,activeSSL:active.SSL.length,
    mitigatedBSL:mitigated.BSL.length,mitigatedSSL:mitigated.SSL.length,
    counts, snapshots, boundaries:'UTC-4H', lastTime,
  };
}
