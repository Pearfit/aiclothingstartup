function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

/** Chest change from the previous size, in centimeters. Null when either cell is blank. */
export function chestStepCm(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null) return null;
  return round1(current - previous);
}

/**
 * A pit-to-pit grade is a few centimeters. A drop, or a jump past 12 cm,
 * usually means one cell is a full circumference.
 */
export function chestStepLooksMixed(step: number | null): boolean {
  return step !== null && (step < 0 || step > 12);
}
