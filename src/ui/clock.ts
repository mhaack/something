import { SIM } from '../data/balance';

/**
 * Feste Tickrate mit entkoppeltem Rendering. Tempo und Pause ändern nur, wie viele Ticks pro
 * vergangener Echtzeit ausgeführt werden.
 */
export class GameClock {
  private acc = 0;
  speedIndex = 0;
  paused = false;

  get speed(): number {
    return SIM.SPEEDS[this.speedIndex];
  }

  get tickMs(): number {
    return 1000 / SIM.TICKS_PER_SECOND;
  }

  faster(): void {
    this.speedIndex = Math.min(SIM.SPEEDS.length - 1, this.speedIndex + 1);
  }

  slower(): void {
    this.speedIndex = Math.max(0, this.speedIndex - 1);
  }

  /** Liefert die Zahl auszuführender Ticks für `dtMs` Echtzeit. */
  advance(dtMs: number): number {
    if (this.paused) return 0;
    this.acc += dtMs * this.speed;
    let ticks = Math.floor(this.acc / this.tickMs);
    this.acc -= ticks * this.tickMs;
    if (ticks > SIM.MAX_TICKS_PER_FRAME) {
      ticks = SIM.MAX_TICKS_PER_FRAME;
      this.acc = 0;
    }
    return ticks;
  }

  /** Interpolationsanteil zwischen letztem und nächstem Tick in [0,1). */
  get alpha(): number {
    return this.paused ? 0 : this.acc / this.tickMs;
  }
}
