import { VIEW } from '../data/balance';

export interface MenuItem {
  label: string;
  /** Tastenkürzel zur Anzeige. */
  key?: string;
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
      b.append(el('span', { text: it.label }));
      if (it.key) b.append(el('kbd', { text: it.key }));
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

/** Infofenster mit festem Kopf (Titel, Schließen) und regelmäßig neu aufgebautem Inhalt. */
export class InfoPanel {
  private render: (() => HTMLElement[] | null) | null = null;
  private last = 0;
  private title: HTMLElement;
  private body: HTMLElement;

  constructor(
    private root: HTMLElement,
    closeIcon: HTMLElement,
    closeLabel: string,
  ) {
    root.hidden = true;
    this.title = el('div', { className: 'panel-title' });
    const close = el('button', { className: 'panel-close' }, [closeIcon]);
    close.title = closeLabel;
    close.addEventListener('click', () => this.close());
    this.body = el('div', { className: 'panel-body' });
    root.append(el('div', { className: 'panel-head' }, [this.title, close]), this.body);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  open(title: string, render: () => HTMLElement[] | null): void {
    this.title.textContent = title;
    this.render = render;
    this.root.hidden = false;
    this.refresh(true);
  }

  close(): void {
    this.render = null;
    this.root.hidden = true;
  }

  refresh(force = false): void {
    if (!this.render) return;
    const now = performance.now();
    if (!force && now - this.last < VIEW.PANEL_REFRESH_MS) return;
    this.last = now;
    const content = this.render();
    if (!content) return this.close();
    this.body.replaceChildren(...content);
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
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
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
