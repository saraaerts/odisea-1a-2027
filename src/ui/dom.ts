export const html = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
export function show(id: string, shown: boolean) { const el = byId(id); if (el) el.hidden = !shown; }
export function label(id: string, value: unknown) { const el = byId(id); if (el && el.textContent !== String(value)) el.textContent = String(value); }
export function fill(id: string, value: string) {
  const el = byId(id);
  if (el && el.dataset.rendered !== value) { el.innerHTML = value; el.dataset.rendered = value; }
}
export const clock = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1).replace('.', ',') + ' s';
export function station(code: string) { return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 18); }
export function invite() { return Array.from(crypto.getRandomValues(new Uint8Array(6)), (v) => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[v % 32]).join(''); }
