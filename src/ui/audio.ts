/**
 * Ton: alle Geräusche und die Musik entstehen zur Laufzeit mit WebAudio (keine Audiodateien).
 * Spielereignisse werden nach Entfernung zur Bildmitte leiser und im Stereobild verteilt.
 */
import { AUDIO } from '../data/balance';
import type { SimEvent, SimEventType } from '../sim/events';
import { nodeX, nodeY } from '../sim/geometry';
import type { GameMap } from '../sim/map';

export type SoundName =
  | 'click'
  | 'place'
  | 'road'
  | 'demolish'
  | 'warn'
  | 'built'
  | 'chop'
  | 'stone'
  | 'harvest'
  | 'attack'
  | 'hit'
  | 'death'
  | 'conquered'
  | 'burned'
  | 'found'
  | 'promoted'
  | 'won'
  | 'lost';

/** Sichtbereich in Knoten (für Lautstärke und Stereo). */
export interface Listener {
  x: number;
  y: number;
  /** Halbe Breite des sichtbaren Bereichs in Knoten. */
  halfWidth: number;
  /** Zeilenhöhe im Verhältnis zur Spaltenbreite (Bildschirmabstand). */
  aspect: number;
}

const EVENT_SOUND: Record<SimEventType, SoundName> = {
  built: 'built',
  chop: 'chop',
  stone: 'stone',
  harvest: 'harvest',
  attack: 'attack',
  hit: 'hit',
  death: 'death',
  conquered: 'conquered',
  burned: 'burned',
  found: 'found',
  promoted: 'promoted',
  defeated: 'conquered',
};

/** Geräusche, die nur für den eigenen Spieler oder überall hörbar sind. */
const ALWAYS: ReadonlySet<SimEventType> = new Set(['attack', 'conquered', 'defeated']);

/** Kleiner Zufallsgenerator nur für Klangvarianten und Melodien (nicht spielrelevant). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  private rand = lcg(7);
  private musicTimer = 0;
  private musicTime = 0;
  private bar = 0;
  sfxVolume: number = AUDIO.DEFAULT_SFX;
  musicVolume: number = AUDIO.DEFAULT_MUSIC;
  muted = false;

  /** Erst nach einer Nutzeraktion erlaubt der Browser Ton. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    const r = lcg(1);
    for (let i = 0; i < len; i++) data[i] = r() * 2 - 1;
    this.applyVolumes();
    this.startMusic();
  }

  setVolumes(sfx: number, music: number, muted: boolean): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfx || !this.music) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.sfxVolume, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicVolume * AUDIO.MUSIC_LEVEL, t, 0.2);
  }

  /** Spielt die Ereignisse eines Frames ab, gewichtet nach Abstand zur Bildmitte. */
  events(events: readonly SimEvent[], map: GameMap, me: number, ear: Listener): void {
    if (!this.ctx || this.muted) return;
    for (const e of events) {
      const always = ALWAYS.has(e.type) && (e.player === me || e.data === me);
      const dx = nodeX(map, e.node) - ear.x;
      const dy = (nodeY(map, e.node) - ear.y) * ear.aspect;
      const d = Math.hypot(dx, dy) / Math.max(1, ear.halfWidth);
      if (!always && d > AUDIO.HEARING_RANGE) continue;
      const gain = always ? 1 : Math.max(0, 1 - d / AUDIO.HEARING_RANGE);
      const pan = Math.max(-1, Math.min(1, dx / Math.max(1, ear.halfWidth)));
      this.play(EVENT_SOUND[e.type], gain, always ? 0 : pan);
    }
  }

  play(name: SoundName, gain = 1, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted || gain <= 0.01) return;
    const now = performance.now();
    const gap = AUDIO.MIN_GAP_MS[name] ?? AUDIO.DEFAULT_GAP_MS;
    if (now - (this.last.get(name) ?? -1e9) < gap) return;
    this.last.set(name, now);
    const out = ctx.createGain();
    out.gain.value = gain;
    let dest: AudioNode = out;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      p.connect(this.sfx);
    } else out.connect(this.sfx);
    dest = out;
    const t = ctx.currentTime + 0.005;
    const v = 0.9 + this.rand() * 0.2;
    switch (name) {
      case 'click':
        this.tone(dest, 'square', 880, t, 0.04, 0.12);
        break;
      case 'place':
        this.knock(dest, t, 0.5, v);
        this.knock(dest, t + 0.09, 0.4, v * 1.1);
        break;
      case 'road':
        this.noiseHit(dest, t, 0.08, 900, 2, 0.25);
        break;
      case 'demolish':
        this.noiseHit(dest, t, 0.35, 400, 1, 0.5);
        this.tone(dest, 'sine', 90, t, 0.3, 0.4, 50);
        break;
      case 'warn':
        this.tone(dest, 'square', 330, t, 0.09, 0.15);
        this.tone(dest, 'square', 262, t + 0.12, 0.12, 0.15);
        break;
      case 'built':
        [523, 659, 784].forEach((f, i) => this.tone(dest, 'triangle', f, t + i * 0.09, 0.25, 0.25));
        break;
      case 'chop':
        this.noiseHit(dest, t, 0.07, 1400 * v, 3, 0.45);
        this.tone(dest, 'sine', 160 * v, t, 0.08, 0.35, 90);
        break;
      case 'stone':
        this.noiseHit(dest, t, 0.05, 3200 * v, 6, 0.35);
        this.tone(dest, 'square', 1900 * v, t, 0.03, 0.08);
        break;
      case 'harvest':
        this.noiseSweep(dest, t, 0.3, 600, 2400, 0.18);
        break;
      case 'attack':
        this.horn(dest, t);
        break;
      case 'hit':
        for (const f of [523, 1347, 2113]) this.tone(dest, 'square', f * v, t, 0.12, 0.07);
        this.noiseHit(dest, t, 0.04, 2500, 2, 0.2);
        break;
      case 'death':
        this.tone(dest, 'sawtooth', 220, t, 0.45, 0.18, 80);
        break;
      case 'conquered':
        [392, 523, 659, 784].forEach((f, i) =>
          this.tone(dest, 'square', f, t + i * 0.12, 0.2, 0.12),
        );
        break;
      case 'burned':
        this.noiseHit(dest, t, 1.2, 280, 0.7, 0.45);
        break;
      case 'found':
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          this.tone(dest, 'sine', f, t + i * 0.06, 0.18, 0.15),
        );
        break;
      case 'promoted':
        this.tone(dest, 'triangle', 659, t, 0.12, 0.2);
        this.tone(dest, 'triangle', 988, t + 0.1, 0.2, 0.2);
        break;
      case 'won':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
          this.tone(dest, 'square', f, t + i * 0.16, i === 5 ? 0.8 : 0.18, 0.14),
        );
        break;
      case 'lost':
        [392, 349, 311, 262].forEach((f, i) =>
          this.tone(dest, 'triangle', f, t + i * 0.3, 0.45, 0.22),
        );
        break;
    }
  }

  // --- Bausteine -------------------------------------------------------------------------------

  private tone(
    dest: AudioNode,
    type: OscillatorType,
    freq: number,
    t: number,
    dur: number,
    vol: number,
    endFreq?: number,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(
    dest: AudioNode,
    t: number,
    dur: number,
    freq: number,
    q: number,
    vol: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + this.rand() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, this.rand() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private noiseSweep(
    dest: AudioNode,
    t: number,
    dur: number,
    from: number,
    to: number,
    vol: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, this.rand() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private knock(dest: AudioNode, t: number, vol: number, v: number): void {
    this.tone(dest, 'sine', 220 * v, t, 0.07, vol, 120);
    this.noiseHit(dest, t, 0.04, 1200 * v, 3, vol * 0.5);
  }

  private horn(dest: AudioNode, t: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    f.connect(dest);
    this.tone(f, 'sawtooth', 196, t, 0.35, 0.22);
    this.tone(f, 'sawtooth', 294, t + 0.3, 0.6, 0.22);
  }

  // --- Musik ----------------------------------------------------------------------------------

  private startMusic(): void {
    if (!this.ctx || this.musicTimer) return;
    this.musicTime = this.ctx.currentTime + 0.5;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 200);
  }

  /** Plant Takte im Voraus: Bordun im Bass, dazu eine gezupfte Melodie in d-dorisch. */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const beat = 60 / AUDIO.MUSIC_BPM;
    while (this.musicTime < ctx.currentTime + 1) {
      const bar = this.bar++;
      const phrase = Math.floor(bar / 4) % 4;
      const r = lcg(1000 + (bar % 4) + phrase * 17);
      const root = [0, 0, 5, 3][phrase];
      const scale = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15];
      // Bordun (Quinte) über den ganzen Takt.
      for (const st of [root - 12, root - 5]) {
        this.pluck(this.music, 146.83 * 2 ** (st / 12), this.musicTime, beat * 4, 0.06, 'triangle');
      }
      // Melodie: Achtel und Viertel, schrittweise mit gelegentlichen Sprüngen.
      let idx = 4;
      let t = this.musicTime;
      const end = this.musicTime + beat * 4;
      while (t < end - 0.01) {
        const len = r() < 0.6 ? beat / 2 : beat;
        if (r() > 0.18) {
          idx = Math.max(0, Math.min(scale.length - 1, idx + Math.round((r() - 0.5) * 4)));
          this.pluck(
            this.music,
            293.66 * 2 ** ((scale[idx] + root) / 12),
            t,
            len * 1.8,
            0.07,
            'triangle',
          );
        }
        t += len;
      }
      this.musicTime = end;
    }
  }

  private pluck(
    dest: AudioNode,
    freq: number,
    t: number,
    dur: number,
    vol: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
