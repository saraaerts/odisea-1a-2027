import { settings } from './profile.ts';
let ctx: AudioContext | null = null;
export function armAudio() {
  if (settings.muted) return;
  const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Audio) {
    try { ctx ??= new Audio(); void ctx.resume().catch(() => {}); } catch { /* sin audio */ }
  }
}
export function beep(kind: string) {
  if (settings.muted || ctx?.state !== 'running') return;
  const sounds: Record<string, [number, number, number]> = { ok: [440, 660, .12], err: [160, 110, .16], fail: [190, 80, .3], help: [350, 840, .28], out: [420, 310, .16], clear: [300, 760, .5], boom: [110, 40, .45] };
  const [a, b, d] = sounds[kind] ?? sounds.ok;
  const time = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = kind === 'fail' || kind === 'boom' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(a, time);
  osc.frequency.exponentialRampToValueAtTime(b, time + d);
  gain.gain.setValueAtTime(.0001, time);
  gain.gain.exponentialRampToValueAtTime(.065, time + .02);
  gain.gain.exponentialRampToValueAtTime(.0001, time + d);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time); osc.stop(time + d + .01);
}
