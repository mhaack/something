/** Binärer Min-Heap über (Priorität, Wert). Bei gleicher Priorität gewinnt der frühere Eintrag. */
export class MinHeap {
  private prio: number[] = [];
  private vals: number[] = [];
  private order: number[] = [];
  private counter = 0;

  get size(): number {
    return this.vals.length;
  }

  push(priority: number, value: number): void {
    this.prio.push(priority);
    this.vals.push(value);
    this.order.push(this.counter++);
    this.up(this.vals.length - 1);
  }

  /** Entnimmt den Wert mit kleinster Priorität. */
  pop(): [number, number] {
    const p = this.prio[0];
    const v = this.vals[0];
    const lp = this.prio.pop()!;
    const lv = this.vals.pop()!;
    const lo = this.order.pop()!;
    if (this.vals.length > 0) {
      this.prio[0] = lp;
      this.vals[0] = lv;
      this.order[0] = lo;
      this.down(0);
    }
    return [p, v];
  }

  private less(a: number, b: number): boolean {
    return (
      this.prio[a] < this.prio[b] ||
      (this.prio[a] === this.prio[b] && this.order[a] < this.order[b])
    );
  }

  private swap(a: number, b: number): void {
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
    [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]];
    [this.order[a], this.order[b]] = [this.order[b], this.order[a]];
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  private down(i: number): void {
    const n = this.vals.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
