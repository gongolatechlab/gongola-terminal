/** V0.99 OB subset, transcribed from Pine lines 1291-1552.
 * Input `recent` is newest-first, 5 completed detection-TF candles (Pine obtf arrays).
 * Swing records and ATR must be supplied by upstream Pine-compatible modules.
 * All times UTC milliseconds; chartBarIndex is Pine bar_index equivalent.
 */
const up = b => b.close > b.open;
const down = b => b.close < b.open;
export function obPattern(recent, direction) {
  if (!Array.isArray(recent) || recent.length < 5) return false;
  const [a,b,c,d,e] = recent;
  if (direction === '-') return (
    (down(b)&&up(c)&&up(d)&&up(e)) || (up(b)&&up(c)&&up(d)) ||
    (up(b)&&up(c)&&up(a)) || (up(b)&&down(c)&&up(d)) ||
    (down(b)&&up(c)&&up(d)) || (up(b)&&up(c)) ||
    (up(b)&&b.low<c.low&&up(c))
  );
  if (direction === '+') return (
    (up(b)&&down(c)&&down(d)&&down(e)) || (down(b)&&down(c)&&down(d)) ||
    (down(b)&&down(c)&&down(a)) || (down(b)&&up(c)&&down(d)) ||
    (up(b)&&down(c)&&down(d)) || (down(b)&&down(c)) ||
    (down(b)&&b.high>c.high&&down(c))
  );
  throw new Error('direction must be + or -');
}
export function obLevel(recent, direction) {
  if (!Array.isArray(recent) || recent.length < 5) return null;
  const [,b,c,d,e] = recent;
  if (direction === '-') {
    if (up(b)&&b.low<c.low&&up(c)&&down(d)&&down(e)) return e.low;
    if (up(b)&&b.low<c.low&&up(c)&&down(d)) return d.low;
    if (up(b)&&up(c)&&up(d)) return d.low;
    if (down(b)&&up(c)&&up(d)) return c.low;
    if (up(b)&&down(c)&&up(d)) return c.low;
    if (up(b)&&up(c)) return c.low;
  } else if (direction === '+') {
    if (down(b)&&b.high>c.high&&down(c)&&up(d)&&up(e)) return e.high;
    if (down(b)&&b.high>c.high&&down(c)&&up(d)) return d.high;
    if (down(b)&&down(c)&&down(d)) return d.high;
    if (up(b)&&down(c)&&down(d)) return c.high;
    if (down(b)&&up(c)&&down(d)) return c.high;
    if (down(b)&&down(c)) return c.high;
  } else throw new Error('direction must be + or -');
  return null;
}
export function isConfirmedOBSwing(swings, direction, time, price, detectTfMs, minTick) {
  const side = direction === '-' ? 'highs' : 'lows';
  return (swings?.[side] ?? []).some(s => s.time >= time && s.time < time + detectTfMs && Math.abs(s.price-price) <= minTick);
}
export function initialOBState() { return {pendingBear:[], pendingBull:[], bearBoxes:[], bullBoxes:[], lastOBDir:null, nextId:1}; }
/** One chart-bar step. `newDetection` is true only on Pine timeframe.change(obDetectTF).
 * `recent` includes the newly received PREVIOUS closed detection candle at index 0.
 * `checkClose` is chart close or locked TF previous close (caller supplies Pine gate).
 * `cut` is Pine historical cutoff; `sessionValid` is Pine session check.
 */
export function stepOB(state, context, config={}) {
  const s = structuredClone(state);
  const {chartBarIndex, time, close, recent, newDetection=false, cut=true, atr=null,
    swings={highs:[],lows:[]}, minTick, detectTfMs, checkClose=close,
    sessionValid=true, minorDirection=null, hhllHighTime=null, hhllLowTime=null,
    structDirection=null, structTime=null} = context;
  const c = {showOB:true, deadline:5, maxCount:70, atrFilter:true, atrMultiplier:3,
    swingFilter:true, hhllFilter:false, structFilter:false, sessionFilter:false,
    extend:true, freezeBars:20, chartTfMs:900000, ...config};
  if (!Number.isInteger(chartBarIndex)||!Number.isSafeInteger(time)||!Number.isFinite(close)||
      !Number.isFinite(minTick)||minTick<0||!Number.isFinite(detectTfMs)||detectTfMs<=0) throw new Error('Invalid OB context');
  const events=[];
  if (c.showOB && cut && newDetection && recent?.length>=5) {
    for (const direction of ['-','+']) {
      if (!obPattern(recent,direction)) continue;
      const top = direction==='-' ? recent[1].high : obLevel(recent,direction);
      const bottom = direction==='-' ? obLevel(recent,direction) : recent[1].low;
      if (top===null||bottom===null) continue;
      if (c.atrFilter && !(Number.isFinite(atr) && top-bottom<=c.atrMultiplier*atr)) continue;
      const swTime=recent[1].time, swPrice=direction==='-'?top:bottom;
      const hhllTime=direction==='-'?hhllHighTime:hhllLowTime;
      const hhllOK=!c.hhllFilter || (hhllTime!==null&&hhllTime>=swTime&&hhllTime<swTime+detectTfMs);
      const candidate={top,bottom,createdBar:chartBarIndex,leftTime:recent[4].time,hhllOK,swTime,swPrice};
      (direction==='-'?s.pendingBear:s.pendingBull).push(candidate);
      events.push({type:'candidate',direction,...candidate});
    }
  }
  // Pine processes bearish candidates first, then bullish; latest confirmation wins.
  let newDir=null;
  if (c.showOB) for (const [direction,key,boxKey] of [['-','pendingBear','bearBoxes'],['+','pendingBull','bullBoxes']]) {
    const pending=s[key];
    for (let i=0;i<pending.length;) {
      const p=pending[i];
      if (chartBarIndex-p.createdBar>c.deadline) {
        pending.splice(i,1); events.push({type:'expired',direction,...p}); continue;
      }
      const broken=direction==='-'?checkClose<p.bottom:checkClose>p.top;
      const eligible=broken && (!c.sessionFilter||sessionValid) && p.hhllOK &&
        (!c.structFilter||minorDirection===direction) &&
        (!c.swingFilter||isConfirmedOBSwing(swings,direction,p.swTime,p.swPrice,detectTfMs,minTick));
      // Source computes obCheckGate but does not use it in f_confirmOBs.
      if (eligible) {
        const box={id:s.nextId++,direction,top:p.top,bottom:p.bottom,leftTime:p.leftTime,
          rightTime:time,confirmedTime:time,validated:false};
        s[boxKey].push(box); pending.splice(i,1); newDir=direction;
        events.push({type:'confirmed',box:structuredClone(box)}); continue;
      }
      i++;
    }
  }
  if(newDir!==null) s.lastOBDir=newDir;
  for (const [direction,key] of [['-','bearBoxes'],['+','bullBoxes']]) {
    for(let i=s[key].length-1;i>=0;i--) {
      const b=s[key][i];
      if(!b.validated && structDirection===direction && structTime!==null && structTime>b.confirmedTime) b.validated=true;
      const mitigated=direction==='-'?close>b.top:close<b.bottom;
      if(mitigated) {s[key].splice(i,1); events.push({type:'deleted',reason:'mitigated',boxId:b.id});}
      else b.rightTime=c.extend?time:Math.min(time,b.confirmedTime+c.freezeBars*c.chartTfMs);
    }
    while(s[key].length>c.maxCount) {
      const b=s[key].shift(); events.push({type:'deleted',reason:'display-limit',boxId:b.id});
    }
  }
  return {state:s,events};
}
