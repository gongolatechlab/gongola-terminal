// Gongola ICT Machine integration gate.
// Disabled by default. No trading signals are generated.

export const ICT_MACHINE_ENABLED = false;

export function inspectICTMachine({
  enabled = ICT_MACHINE_ENABLED,
  source = 'simulated',
  candles = [],
} = {}) {
  if (!enabled) {
    return {
      status: 'disabled',
      signals: [],
    };
  }

  if (source !== 'verified') {
    return {
      status: 'unverified-data',
      signals: [],
    };
  }

  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      status: 'invalid-data',
      signals: [],
    };
  }

  return {
    status: 'engine-not-connected',
    signals: [],
  };
}
