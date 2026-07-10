export function intervalToSecs(interval: string): number {
  const n = parseInt(interval, 10);
  if (interval.endsWith('M')) return n * 2_592_000;
  if (interval.endsWith('w')) return n * 604_800;
  if (interval.endsWith('d')) return n * 86_400;
  if (interval.endsWith('h')) return n * 3_600;
  return n * 60; // minutes (default)
}
