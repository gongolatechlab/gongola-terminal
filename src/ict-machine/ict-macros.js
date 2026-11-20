/**
 * ICT Machine V0.99 macro verticals, enabled default sessions only.
 * Pine source: `show_macro`, `gmt_tz`, `v1..v4`, `vline()` near the end.
 * This computes exact calendar-local bar starts in America/New_York and
 * never invents candles or lines at times with no observed 15-minute bar.
 * Research chart markings only; source's black line colors are replaced by
 * a contrasting display color for the Gongola dark theme.
 */
const FIFTEEN = 15 * 60_000;
const ZONE = 'America/New_York';
export const MACRO_TIMES_NY = Object.freeze(['02:00','05:00','09:00','12:00']);

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
});
function localParts(ms) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(ms))
    .filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { clock:`${parts.hour}:${parts.minute}`, day:`${parts.year}-${parts.month}-${parts.day}` };
}

export function calculateICTMacros(bars, {maxLines = 200} = {}) {
  if (!Array.isArray(bars)) throw new TypeError('ICT macros require a chronological candle array.');
  if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 1000)
    throw new RangeError('Invalid macro retention limit.');
  const markers=[];
  let previous=-Infinity;
  for(let i=0;i<bars.length;i++) {
    const bar=bars[i];
    const time=bar?.time;
    if(!Number.isSafeInteger(time) || time % FIFTEEN !== 0 || time <= previous)
      throw new Error(`Invalid chronological 15-minute candle at index ${i}.`);
    previous=time;
    const local=localParts(time);
    if(!MACRO_TIMES_NY.includes(local.clock)) continue;
    markers.push({time, label:local.clock, localDate:local.day, timezone:ZONE});
    if(markers.length>maxLines) markers.shift();
  }
  return {
    markers, timezone:ZONE, activeTimes:[...MACRO_TIMES_NY],
    supportedTimeframeMinutes:15,
    source:'ICT Machine V0.99 enabled default macro sessions',
  };
}
