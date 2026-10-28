/** Numbers print without float noise, so 0.1 + 0.2 reads 0.3. */
export function formatFigure(value: unknown): string {
  return typeof value === 'number' ? String(+value.toPrecision(6)) : String(value ?? '');
}
