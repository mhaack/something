/** Werkzeugleiste, Tempoanzeige, Hilfefenster, Pause-Anzeige und Mauszeiger-Hinweis. */
import { t, type TextKey } from './i18n';
import { icon, type IconName } from './icons';
import { el } from './panels';
import type { ToolMode } from './tools';

export interface HudActions {
  setMode(mode: ToolMode): void;
  toggleBuildHelp(): void;
  toggleCongestion(): void;
  toggleMinimap(): void;
  toggleHelp(): void;
  toggleDebug(): void;
  toggleStats(): void;
  togglePause(): void;
  slower(): void;
  faster(): void;
}

export interface HudState {
  mode: ToolMode;
  buildHelp: boolean;
  congestion: boolean;
  minimap: boolean;
  debug: boolean;
  stats: boolean;
  paused: boolean;
  speed: number;
}

interface ToolButton {
  el: HTMLButtonElement;
  active: (s: HudState) => boolean;
}

function button(
  name: IconName,
  label: TextKey,
  key: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = el('button', { className: 'tool' }, [icon(name), el('kbd', { text: key })]);
  b.title = `${t(label)} (${key})`;
  b.setAttribute('aria-label', t(label));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
    b.blur();
  });
  return b;
}

export class Hud {
  private buttons: ToolButton[] = [];
  private speedLabel: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private tip: HTMLElement;
  private hint: HTMLElement;
  private help: HTMLElement;
  private pauseOverlay: HTMLElement;

  constructor(
    root: HTMLElement,
    private actions: HudActions,
  ) {
    // Werkzeugleiste unten
    const toolbar = el('div', { className: 'panel toolbar' });
    const group = (
      items: [IconName, TextKey, string, () => void, (s: HudState) => boolean][],
    ): void => {
      const g = el('div', { className: 'tool-group' });
      for (const [name, label, key, fn, active] of items) {
        const b = button(name, label, key, fn);
        this.buttons.push({ el: b, active });
        g.append(b);
      }
      toolbar.append(g);
    };
    group([
      ['select', 'tool.select', '1', () => actions.setMode('select'), (s) => s.mode === 'select'],
      ['flag', 'tool.flag', '2', () => actions.setMode('flag'), (s) => s.mode === 'flag'],
      ['road', 'tool.road', '3', () => actions.setMode('road'), (s) => s.mode === 'road'],
      [
        'demolish',
        'tool.demolish',
        '4',
        () => actions.setMode('demolish'),
        (s) => s.mode === 'demolish',
      ],
      ['build', 'tool.build', '5', () => actions.setMode('build'), (s) => s.mode === 'build'],
    ]);
    group([
      ['buildHelp', 'tool.buildHelp', 'H', () => actions.toggleBuildHelp(), (s) => s.buildHelp],
      ['congestion', 'tool.congestion', 'V', () => actions.toggleCongestion(), (s) => s.congestion],
      ['minimap', 'tool.minimap', 'M', () => actions.toggleMinimap(), (s) => s.minimap],
    ]);
    group([
      ['stats', 'tool.stats', 'T', () => actions.toggleStats(), (s) => s.stats],
      ['help', 'tool.help', 'F1', () => actions.toggleHelp(), () => !this.help.hidden],
      ['debug', 'tool.debug', 'F3', () => actions.toggleDebug(), (s) => s.debug],
    ]);

    // Tempo oben links
    const timebar = el('div', { className: 'panel timebar' });
    const slower = button('slower', 'tool.slower', '−', () => actions.slower());
    this.pauseBtn = button('pause', 'tool.pause', '␣', () => actions.togglePause());
    const faster = button('faster', 'tool.faster', '+', () => actions.faster());
    this.speedLabel = el('span', { className: 'speed' });
    timebar.append(slower, this.pauseBtn, faster, this.speedLabel);

    this.hint = el('div', { className: 'panel hint' });
    this.hint.hidden = true;
    this.tip = el('div', { className: 'cursor-tip' });
    this.tip.hidden = true;
    this.pauseOverlay = el('div', { className: 'pause-overlay', text: t('hud.pauseBig') });
    this.pauseOverlay.hidden = true;
    this.help = this.buildHelp();
    root.append(toolbar, timebar, this.hint, this.tip, this.pauseOverlay, this.help);
  }

  private buildHelp(): HTMLElement {
    const section = (title: TextKey, keys: TextKey[]): HTMLElement =>
      el('div', { className: 'help-section' }, [
        el('div', { className: 'panel-sub', text: t(title) }),
        el(
          'ul',
          {},
          keys.map((k) => el('li', { text: t(k) })),
        ),
      ]);
    const close = el('button', { className: 'help-close', text: t('help.close') });
    close.addEventListener('click', () => this.actions.toggleHelp());
    const box = el('div', { className: 'panel help-box' }, [
      el('div', { className: 'panel-title', text: t('help.title') }),
      section('help.mouse', [
        'help.m.click',
        'help.m.right',
        'help.m.drag',
        'help.m.wheel',
        'help.m.edge',
      ]),
      section('help.keys', [
        'help.k.tools',
        'help.k.direct',
        'help.k.road',
        'help.k.view',
        'help.k.overlays',
        'help.k.stats',
        'help.k.time',
        'help.k.misc',
      ]),
      close,
    ]);
    const overlay = el('div', { className: 'help-overlay' }, [box]);
    overlay.hidden = true;
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) this.actions.toggleHelp();
    });
    return overlay;
  }

  get helpVisible(): boolean {
    return !this.help.hidden;
  }

  setHelp(visible: boolean): void {
    this.help.hidden = !visible;
  }

  setHint(text: string | null): void {
    this.hint.hidden = !text;
    this.hint.textContent = text ?? '';
  }

  /** Hinweis neben dem Mauszeiger (CSS-Koordinaten), null blendet aus. */
  setTip(text: string | null, cssX: number, cssY: number): void {
    if (!text) {
      this.tip.hidden = true;
      return;
    }
    if (this.tip.textContent !== text) this.tip.textContent = text;
    this.tip.hidden = false;
    const w = this.tip.offsetWidth;
    const x = cssX + 18 + w > window.innerWidth ? cssX - w - 10 : cssX + 18;
    this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(cssY + 14)}px)`;
  }

  update(s: HudState): void {
    for (const b of this.buttons) b.el.classList.toggle('active', b.active(s));
    this.speedLabel.textContent = s.paused ? t('hud.paused') : t('hud.speed', { speed: s.speed });
    this.pauseBtn.replaceChildren(icon(s.paused ? 'play' : 'pause'), el('kbd', { text: '␣' }));
    this.pauseBtn.classList.toggle('active', s.paused);
    this.pauseOverlay.hidden = !s.paused;
  }
}
