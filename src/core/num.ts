/**
 * P27 part 3: the largest and smallest of a list, safe for lists of any length (Math.max(...list) overflows
 * the call stack past about 100,000 items).
 */
export function maxOf<T>(list: readonly T[], f: (x: T) => number, start = Number.NEGATIVE_INFINITY): number {
  let m = start;
  for (const x of list) {
    const v = f(x);
    if (v > m) m = v;
  }
  return m;
}

export function minOf<T>(list: readonly T[], f: (x: T) => number, start = Number.POSITIVE_INFINITY): number {
  let m = start;
  for (const x of list) {
    const v = f(x);
    if (v < m) m = v;
  }
  return m;
}
