/**
 * Read-only historical drawing inspection. Does not modify the V0.99 OB/FVG
 * engine or change its active/mitigated state. Deleted OBs are recovered only
 * from confirmed/deleted event pairs. Deleted FVG drawings remain in lifecycle
 * history and are not interpreted as active signals.
 */
export function archivedOrderBlocks(obResult, bars) {
  if (!Array.isArray(obResult?.events) || !Array.isArray(bars)) return [];
  const confirmed = new Map();
  const removed = [];
  for (const e of obResult.events) {
    if (e.source !== 'ob') continue;
    if (e.type === 'confirmed' && e.box && Number.isInteger(e.box.id)) {
      confirmed.set(e.box.id, e.box);
    }
    if (e.type === 'deleted' && Number.isInteger(e.boxId)) {
      const box = confirmed.get(e.boxId);
      if (!box) continue;
      if (!Number.isInteger(e.chartBar) || !bars[e.chartBar]) continue;
      const endTime = bars[e.chartBar].time;
      if (![box.leftTime, box.top, box.bottom, endTime].every(Number.isFinite)) continue;
      if (endTime <= box.leftTime || box.top <= box.bottom) continue;
      removed.push({id:box.id, direction:box.direction,
        left:box.leftTime, right:endTime, top:box.top,bottom:box.bottom,
        reason:e.reason, removedAt:endTime});
      confirmed.delete(e.boxId);
    }
  }
  return removed;
}

export function archivedFairValueGaps(lifecycle) {
  if (!Array.isArray(lifecycle?.drawings)) return [];
  return lifecycle.drawings.filter(d => d.deleted === true &&
    [d.left,d.right,d.top,d.bottom].every(Number.isFinite) &&
    d.top > d.bottom && d.right > d.left).map(d=>({
      id:d.id,kind:d.kind,left:d.left,right:d.right,
      top:d.top,bottom:d.bottom,
      reason:'drawing-deleted'
    }));
}

/** Proximity should follow the viewed historical prices, not today's close. */
export function zoneNearPrice(bounds, referencePrice, radius) {
  if (!Number.isFinite(referencePrice) || !Number.isFinite(radius) || radius < 0 ||
      !Number.isFinite(bounds?.top) || !Number.isFinite(bounds?.bottom)) return false;
  if (bounds.top <= bounds.bottom) return false;
  return bounds.top >= referencePrice - radius && bounds.bottom <= referencePrice + radius;
}
