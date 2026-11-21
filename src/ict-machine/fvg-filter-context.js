/**
 * V0.99 regular FVG filter dependencies; this is NOT the trade-signal branch.
 * Source: supplied The ICT Machine V0.99 Pine, regular FVG and Minor DOL
 * declarations. FVG processing is above the Minor DOL block in the source.
 * 4H period boundaries are UTC-aligned placeholders until exchange parity.
 */
import { calculateMinorDOL } from './minor-dol.js';

export function normalizeFVGFilterSettings({
  fvgMinorFilter=false, fvgSessionFilter=false,
  fvgDisplacement=0.5, fvgWideGap=18
}={}) {
  if(typeof fvgMinorFilter!=='boolean'||typeof fvgSessionFilter!=='boolean')
    throw new TypeError('FVG direction/session filter toggles must be boolean');
  if(!Number.isFinite(fvgDisplacement)||fvgDisplacement<0.01||fvgDisplacement>10)
    throw new RangeError('FVG displacement must be between 0.01 and 10');
  if(!Number.isFinite(fvgWideGap)||fvgWideGap<1||fvgWideGap>1000)
    throw new RangeError('FVG wide-gap limit must be between 1 and 1000');
  return {fvgMinorFilter,fvgSessionFilter,fvgDisplacement,fvgWideGap};
}

/**
 * Returns last FVG-filter direction known strictly before candle i opens.
 * It includes Minor DOL BOS/MSS and Turtle Soup, but not generic IDM/IND.
 * Source's current-bar Minor DOL update follows the regular FVG block.
 */
export function makeFVGMinorDirectionAt(bars,{timeframeMinutes=15,boundaryOffsetMs=0}={}) {
  const chartTfMs=timeframeMinutes*60_000;
  if(![5,15].includes(timeframeMinutes))throw new RangeError('Only 5M/15M chart timeframes supported');
  const snapshots=calculateMinorDOL(bars,{chartTfMs,boundaryOffsetMs}).snapshots;
  return (i)=>{
    if(!Number.isInteger(i)||i<0||i>=bars.length)throw new RangeError('Invalid FVG chart-bar index');
    // The immediate preceding snapshot has ended at or before bar i opens.
    if(i===0||snapshots[i-1].end>bars[i].time)return null;
    return snapshots[i-1].lastFvgFilterDir;
  };
}
