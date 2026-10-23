/** Sammelt Maus- und Tastaturzustand für die Spielschleife. */
export interface InputHandlers {
  /** Verschiebung in Gerätepixeln (Ziehen). */
  onDrag(dx: number, dy: number): void;
  onWheel(delta: number, deviceX: number, deviceY: number): void;
  onMove(deviceX: number, deviceY: number): void;
  onClick(deviceX: number, deviceY: number, button: number): void;
  onKey(code: string, e: KeyboardEvent): void;
}

const DRAG_THRESHOLD = 4;

export class Input {
  readonly keys = new Set<string>();
  private dragging = false;
  private dragButton = -1;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  private moved = false;

  constructor(
    el: HTMLElement,
    private h: InputHandlers,
  ) {
    const dpr = (): number => window.devicePixelRatio || 1;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.dragButton = e.button;
      this.moved = false;
      this.downX = this.lastX = e.clientX;
      this.downY = this.lastY = e.clientY;
    });
    el.addEventListener('pointermove', (e) => {
      this.h.onMove(e.clientX * dpr(), e.clientY * dpr());
      if (!this.dragging) return;
      if (
        !this.moved &&
        Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < DRAG_THRESHOLD
      ) {
        return;
      }
      this.moved = true;
      this.h.onDrag((e.clientX - this.lastX) * dpr(), (e.clientY - this.lastY) * dpr());
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    el.addEventListener('pointerup', (e) => {
      if (this.dragging && !this.moved) {
        this.h.onClick(e.clientX * dpr(), e.clientY * dpr(), this.dragButton);
      }
      this.dragging = false;
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.h.onWheel(Math.sign(e.deltaY), e.clientX * dpr(), e.clientY * dpr());
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'F3' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.h.onKey(e.code, e);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Scrollrichtung aus gedrückten Tasten (-1..1 je Achse). */
  scrollAxis(): [number, number] {
    const k = this.keys;
    const x =
      (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) -
      (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const y =
      (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    return [x, y];
  }
}
