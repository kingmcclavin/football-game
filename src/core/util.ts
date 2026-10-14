export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round1 = (v: number) => Math.round(v * 10) / 10;

export function fmtMoney(millions: number): string {
  if (millions >= 1) return `$${millions.toFixed(millions >= 10 ? 1 : 2)}M`;
  return `$${Math.round(millions * 1000)}K`;
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function pct(a: number, b: number): string {
  if (!b) return '0.0';
  return ((a / b) * 100).toFixed(1);
}

export function sum(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}

export function deepClone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

export function heightStr(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
