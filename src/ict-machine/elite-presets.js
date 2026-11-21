/** Visibility-only ICT chart presets. NEVER change engine calculation filters. */
export const LAYER_KEYS = Object.freeze(['ob', 'fvg', 'htf', 'dol', 'minor', 'structure', 'macro', 'swing']);
export const PRESETS = Object.freeze({
  clean: Object.freeze([]),
  structure: Object.freeze(['ob', 'minor', 'structure']),
  liquidity: Object.freeze(['fvg', 'htf', 'dol', 'minor']),
  full: Object.freeze([...LAYER_KEYS]),
});

export function getPresetVisibility(name) {
  if (!Object.hasOwn(PRESETS, name)) throw new Error(`Unknown visibility preset: ${name}`);
  const show = new Set(PRESETS[name]);
  return Object.fromEntries(LAYER_KEYS.map(key => [key, show.has(key)]));
}

export function matchingPreset(layers) {
  for (const name of ['clean', 'structure', 'liquidity', 'full']) {
    const expected = getPresetVisibility(name);
    if (LAYER_KEYS.every(key => Boolean(layers[key]) === expected[key])) return name;
  }
  return null;
}
