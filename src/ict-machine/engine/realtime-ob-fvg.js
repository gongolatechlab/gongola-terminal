/** Realtime preview adapter for the historical OB/FVG pipeline.
 * Replays from committed closed bars on each preview, matching Pine's rollback
 * at a functional level. It does NOT reproduce all Pine tick-level semantics.
 * Provider-aligned detection and lock candles must be supplied externally.
 */
import {validateCandles} from './pine-foundation.js';
import {replayOBToFVGLifecycle} from './fvg-replay.js';

const clone = x => structuredClone(x);
export class RealtimeOBFVG {
  constructor({detectionBars,obOptions,fvgOptions,lifecycleOptions={}}) {
    if(!Array.isArray(detectionBars)||!obOptions||!fvgOptions) throw new TypeError('Detection bars, OB and FVG options required');
    this.detectionBars=clone(detectionBars);
    // Functions cannot be structuredClone'd. Callbacks must remain pure.
    this.fvgOptions={...fvgOptions};
    this.obOptions={...obOptions};
    this.lifecycleOptions=clone(lifecycleOptions);
    this.closed=[];
    this.lastPreview=null;
  }
  evaluate(bar) {
    const bars=validateCandles([...this.closed,bar]);
    return replayOBToFVGLifecycle(bars,this.detectionBars,this.obOptions,this.fvgOptions,this.lifecycleOptions);
  }
  preview(bar) {
    const result=this.evaluate(bar);
    this.lastPreview={time:bar.time,result};
    return clone(result);
  }
  commit(bar) {
    const result=this.evaluate(bar);
    this.closed.push(clone(bar));
    this.lastPreview=null;
    return clone(result);
  }
  snapshot() { return {closedBars:clone(this.closed),lastPreviewTime:this.lastPreview?.time??null}; }
}
