import { VIEW } from '../data/balance';

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

/** Kontextmenü an der Mausposition. */
export class Popup {
  constructor(private el: HTMLElement) {
    el.hidden = true;
    window.addEventListener('pointerdown', (e) => {
      if (!el.hidden && !el.contains(e.target as Node)) this.hide();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(cssX: number, cssY: number, title: string, items: MenuItem[]): void {
    this.el.replaceChildren();
    const h = document.createElement('div');
    h.className = 'panel-title';
    h.textContent = title;
    this.el.append(h);
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.disabled = !!it.disabled;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
        it.action();
      });
      this.el.append(b);
    }
    this.el.hidden = false;
    const r = this.el.getBoundingClientRect();
    this.el.style.left = `${Math.min(cssX + 8, window.innerWidth - r.width - 8)}px`;
    this.el.style.top = `${Math.min(cssY + 8, window.innerHeight - r.height - 8)}px`;
  }

  hide(): void {
    this.el.hidden = true;
  }
}

/** Infofenster, dessen Inhalt regelmäßig neu aufgebaut wird. */
export class InfoPanel {
  private render: (() => HTMLElement | null) | null = null;
  private last = 0;

  constructor(private el: HTMLElement) {
    el.hidden = true;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(render: () => HTMLElement | null): void {
    this.render = render;
    this.el.hidden = false;
    this.refresh(true);
  }

  close(): void {
    this.render = null;
    this.el.hidden = true;
  }

  refresh(force = false): void {
    if (!this.render) return;
    const now = performance.now();
    if (!force && now - this.last < VIEW.PANEL_REFRESH_MS) return;
    this.last = now;
    const content = this.render();
    if (!content) return this.close();
    this.el.replaceChildren(content);
  }
}

/** Kurzmeldungen am oberen Bildschirmrand. */
export class Toast {
  private timer = 0;

  constructor(private el: HTMLElement) {
    el.hidden = true;
  }

  show(text: string): void {
    this.el.textContent = text;
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.el.hidden = true), VIEW.TOAST_MS);
  }
}

/** Kleiner DOM-Baukasten für Panelinhalte. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string } = {},
  children: (HTMLElement | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.className) e.className = props.className;
  if (props.text !== undefined) e.textContent = props.text;
  e.append(...children);
  return e;
}
