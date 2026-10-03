// Percentages without floating point. A threshold in the criteria has at most four decimals and is kept as a whole number of
// hundredths of a thousandth of a percent; a ratio of two counts is compared with it by multiplying, so 94.999 percent never
// passes a limit of 95, and a limit such as 99.9 is not read as 99.89999999999999.

export const SCALE = 10000;

// A threshold in percent as a whole number of 1/10000 percent, or null when it has more than four decimals, is below 0 or
// above 100.
export function scaledPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const scaled = Math.round(value * SCALE);
  if (Math.abs(value * SCALE - scaled) > 1e-6) return null;
  return scaled;
}

// Whether part/whole is at least the scaled threshold, in whole numbers. whole must be above zero.
export const atLeast = (part, whole, scaled) => part * 100 * SCALE >= scaled * whole;
// Whether part/whole is at most the scaled threshold.
export const atMost = (part, whole, scaled) => part * 100 * SCALE <= scaled * whole;

// A percentage for a report, cut down to two decimals (never rounded up, so a figure just under a limit is never shown as the
// limit): 94.999 is 94.99%, 100 is 100%, 98.5 is 98.5%.
export function percentText(part, whole) {
  if (whole === 0) return 'n/a';
  const hundredths = Math.floor((part * 10000) / whole);
  const text = (hundredths / 100).toFixed(2).replace(/\.?0+$/, '');
  return `${text}%`;
}

// A threshold for a report: 95 is 95%, 99.9 is 99.9%.
export function thresholdText(scaled) {
  return `${(scaled / SCALE).toFixed(4).replace(/\.?0+$/, '')}%`;
}
