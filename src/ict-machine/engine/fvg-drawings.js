/** Source-derived regular FVG geometry and per-array retention.
 * Coordinates are UTC milliseconds (xloc.bar_time), not chart indices.
 * This deliberately does not emulate TradingView's global object garbage collector.
 */
export function regularFVGGeometry({formationTime, createdTime, timeframeMultiplier, top, bottom, extendFVG=false}) {
  if (![formationTime,createdTime,timeframeMultiplier,top,bottom].every(Number.isFinite) || timeframeMultiplier<=0 || top<=bottom) throw new Error('Invalid FVG geometry');
  return {
    left: formationTime,
    right: formationTime + 7*60_000*timeframeMultiplier,
    top,bottom,
    xloc:'bar_time',
    extend:extendFVG?'right':'none',
    // Conversion drawings start at the conversion candle, unlike regular FVGs.
    inverseLeft:createdTime,
    inverseRight:createdTime + 7*60_000*timeframeMultiplier
  };
}

/** Mirrors the four regular/inverse FVG while-loops in V0.99.
 * Oldest tracked boxes are deleted; previously untracked drawings are untouched.
 */
export function enforceFVGDisplayLimits(tracked, drawings, maxFVGtoShow, bar, events) {
  if (!Number.isInteger(maxFVGtoShow)||maxFVGtoShow<1) throw new RangeError('Invalid max FVG display count');
  for (const kind of ['bullish','bearish','inverseBullish','inverseBearish']) {
    while(tracked[kind].length>maxFVGtoShow){
      const id=tracked[kind].shift();
      const drawing=drawings.get(id);
      drawing.deleted=true;
      events.push({type:'drawing-untracked',bar,id,kind,reason:'display-limit'});
      events.push({type:'drawing-deleted',bar,id,kind,reason:'display-limit'});
    }
  }
}
