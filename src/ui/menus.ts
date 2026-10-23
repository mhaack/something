/** Hauptmenü, Spielmenü (Esc) und Einstellungen. */
import { t, type TextKey } from './i18n';
import { icon } from './icons';
import { el } from './panels';
import type { Settings } from './settings';

function button(label: string, fn: () => void, cls = 'menu-big'): HTMLButtonElement {
  const b = el('button', { className: cls, text: label });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  return b;
}

/** Modales Fenster mit Titel und Schließen-Knopf (Grundlage der Menüs). */
class Overlay {
  protected root: HTMLElement;
  protected body: HTMLElement;
  onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, title: string, cls: string, closable = true) {
    const head: HTMLElement[] = [el('div', { className: 'panel-title', text: title })];
    if (closable) {
      const close = el('button', { className: 'panel-close' }, [icon('close')]);
      close.title = t('action.close');
      close.addEventListener('click', () => this.hide());
      head.push(close);
    }
    this.body = el('div', { className: 'menu-body' });
    const box = el('div', { className: `panel stats-box ${cls}` }, [
      el('div', { className: 'panel-head' }, head),
      this.body,
    ]);
    this.root = el('div', { className: 'stats-overlay' }, [box]);
    this.root.hidden = true;
    if (closable) {
      this.root.addEventListener('pointerdown', (e) => {
        if (e.target === this.root) this.hide();
      });
    }
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.onClose?.();
  }
}

export interface MenuActions {
  newGame(): void;
  missions(): void;
  load(): void;
  save(): void;
  settings(): void;
  help(): void;
  toMainMenu(): void;
  resume(): void;
}

/** Spielmenü während einer Partie (Esc). */
export class PauseMenu extends Overlay {
  constructor(parent: HTMLElement, a: MenuActions) {
    super(parent, t('menu.pauseTitle'), 'pause-box');
    this.body.append(
      button(t('menu.resume'), () => this.hide()),
      button(t('save.titleSave'), () => {
        this.hide();
        a.save();
      }),
      button(t('save.titleLoad'), () => {
        this.hide();
        a.load();
      }),
      button(t('menu.title'), () => {
        this.hide();
        a.newGame();
      }),
      button(t('menu.settings'), () => {
        this.hide();
        a.settings();
      }),
      button(t('menu.mainMenu'), () => {
        this.hide();
        a.toMainMenu();
      }),
    );
  }
}

/** Startbildschirm; im Hintergrund läuft eine Partie zwischen Computerspielern. */
export class MainMenu {
  private root: HTMLElement;

  constructor(parent: HTMLElement, a: MenuActions) {
    const list = el('div', { className: 'main-menu-buttons' }, [
      button(t('menu.tab.free'), () => a.newGame()),
      button(t('menu.tab.missions'), () => a.missions()),
      button(t('save.titleLoad'), () => a.load()),
      button(t('menu.settings'), () => a.settings()),
      button(t('menu.controls'), () => a.help()),
    ]);
    this.root = el('div', { className: 'main-menu' }, [
      el('div', { className: 'main-title', text: t('game.title') }),
      el('div', { className: 'main-subtitle', text: t('menu.subtitle') }),
      list,
      el('div', { className: 'main-foot', text: t('menu.foot') }),
    ]);
    this.root.hidden = true;
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
    document.body.classList.toggle('in-menu', v);
  }
}

/** Einstellungen: Lautstärke, Musik, automatisches Speichern, Randscrollen. */
export class SettingsDialog extends Overlay {
  constructor(
    parent: HTMLElement,
    private get: () => Settings,
    private set: (s: Settings) => void,
  ) {
    super(parent, t('menu.settings'), 'menu-box');
  }

  override show(): void {
    this.render();
    super.show();
  }

  private render(): void {
    const s = this.get();
    const slider = (label: TextKey, value: number, apply: (v: number) => void): HTMLElement => {
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(value * 100));
      const out = el('span', { className: 'slider-value', text: `${input.value} %` });
      input.addEventListener('input', () => {
        out.textContent = `${input.value} %`;
        apply(Number(input.value) / 100);
      });
      return el('div', { className: 'slider-row settings-row' }, [
        el('span', { text: t(label) }),
        input,
        out,
      ]);
    };
    const check = (label: TextKey, value: boolean, apply: (v: boolean) => void): HTMLElement => {
      const input = el('input');
      input.type = 'checkbox';
      input.checked = value;
      input.addEventListener('change', () => apply(input.checked));
      const l = el('label', { className: 'check-row' }, [input, el('span', { text: t(label) })]);
      return l;
    };
    const update = (patch: Partial<Settings>): void => this.set({ ...this.get(), ...patch });
    this.body.replaceChildren(
      slider('settings.sfx', s.sfx, (v) => update({ sfx: v })),
      slider('settings.music', s.music, (v) => update({ music: v })),
      check('settings.muted', s.muted, (v) => update({ muted: v })),
      check('settings.autosave', s.autosave, (v) => update({ autosave: v })),
      check('settings.edgeScroll', s.edgeScroll, (v) => update({ edgeScroll: v })),
    );
  }
}
