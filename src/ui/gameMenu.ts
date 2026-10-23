/** Dialog „Neues Spiel“: freies Spiel mit Einstellungen oder eine Mission. */
import {
  AI_LEVELS,
  MAP,
  SIM,
  START,
  STOCK_LEVELS,
  type AiLevel,
  type StockLevel,
} from '../data/balance';
import { MISSIONS, type Goal, type Mission } from '../data/missions';
import type { NewWorldOptions } from '../sim/world';
import { t, tDyn, type TextKey } from './i18n';
import { icon } from './icons';
import { el } from './panels';

export interface GameOptions {
  seed: string;
  size: number;
  opponents: AiLevel[];
  stock: StockLevel;
  /** Missionsnummer (0 = freies Spiel). */
  mission: number;
}

export function missionById(id: number): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export function missionOptions(m: Mission): GameOptions {
  return { seed: m.seed, size: m.size, opponents: [...m.opponents], stock: m.stock, mission: m.id };
}

export function toWorldOptions(o: GameOptions): NewWorldOptions {
  const m = missionById(o.mission);
  return {
    seed: o.seed,
    size: o.size,
    players: o.opponents.length + 1,
    ai: o.opponents,
    setup: m
      ? { mode: 'mission', mission: m.id, stock: m.stock, goals: m.goals, timeLimit: m.timeLimit }
      : { mode: 'free', mission: 0, stock: o.stock },
  };
}

export function randomSeed(): string {
  return String(Math.floor(Math.random() * 1e6));
}

/** Text eines Spielziels (ohne Fortschritt). */
export function goalLabel(g: Goal): string {
  switch (g.type) {
    case 'conquer':
      return t('goal.conquer');
    case 'produce':
      return t('goal.produce', { ware: tDyn(`ware.${g.ware}`) });
    case 'territory':
      return t('goal.territory');
  }
}

export function goalTarget(g: Goal): number {
  return g.type === 'produce' ? g.amount : g.type === 'territory' ? g.nodes : 0;
}

// Geschaffte Missionen merkt sich nur dieser Browser (Komfort, kein Spielstand).
const DONE_KEY = 'kleine-siedler.missions';

export function completedMissions(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

export function markMissionDone(id: number): void {
  try {
    const done = new Set(completedMissions());
    done.add(id);
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    // Ohne Speicher geht nur die Markierung verloren.
  }
}

type Tab = 'free' | 'missions';

export class GameMenu {
  private root: HTMLElement;
  private body: HTMLElement;
  private tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'free';
  private free: GameOptions;
  private level: AiLevel;

  constructor(
    parent: HTMLElement,
    current: GameOptions,
    private start: (o: GameOptions) => void,
  ) {
    this.free = { ...current, mission: 0, opponents: [...current.opponents] };
    this.level = current.opponents[0] ?? 'normal';
    const close = el('button', { className: 'panel-close' }, [icon('close')]);
    close.title = t('menu.cancel');
    close.addEventListener('click', () => this.toggle(false));
    const tabRow = el('div', { className: 'tabs' });
    for (const tab of ['free', 'missions'] as Tab[]) {
      const b = el('button', { className: 'tab', text: t(`menu.tab.${tab}`) });
      b.addEventListener('click', () => this.show(tab));
      this.tabs.set(tab, b);
      tabRow.append(b);
    }
    this.body = el('div', { className: 'menu-body' });
    const box = el('div', { className: 'panel stats-box menu-box' }, [
      el('div', { className: 'panel-head' }, [
        el('div', { className: 'panel-title', text: t('menu.title') }),
        close,
      ]),
      tabRow,
      this.body,
    ]);
    this.root = el('div', { className: 'stats-overlay' }, [box]);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.toggle(false);
    });
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(on = !this.visible, tab?: Tab): void {
    this.root.hidden = !on;
    if (on) this.show(tab ?? this.tab);
  }

  private show(tab: Tab): void {
    this.tab = tab;
    for (const [k, b] of this.tabs) b.classList.toggle('active', k === tab);
    this.body.replaceChildren(...(tab === 'free' ? this.freeTab() : this.missionsTab()));
  }

  private chips<T>(
    label: TextKey,
    values: readonly T[],
    name: (v: T) => string,
    get: () => T,
    set: (v: T) => void,
  ): HTMLElement {
    const row = el('div', { className: 'chips' });
    const render = (): void => {
      row.replaceChildren(
        ...values.map((v) => {
          const b = el('button', { className: 'chip', text: name(v) });
          b.classList.toggle('active', v === get());
          b.addEventListener('click', () => {
            set(v);
            render();
          });
          return b;
        }),
      );
    };
    render();
    return el('div', { className: 'menu-row' }, [
      el('div', { className: 'panel-sub', text: t(label) }),
      row,
    ]);
  }

  private freeTab(): HTMLElement[] {
    const o = this.free;
    const counts = Array.from({ length: START.MAX_PLAYERS }, (_, i) => i);
    const seed = el('input', { className: 'menu-seed' });
    seed.type = 'text';
    seed.value = o.seed;
    seed.addEventListener('input', () => (o.seed = seed.value.trim() || o.seed));
    const dice = el('button', { className: 'chip', text: t('menu.random') });
    dice.addEventListener('click', () => {
      o.seed = randomSeed();
      seed.value = o.seed;
    });
    const go = el('button', { className: 'menu-start', text: t('menu.start') });
    go.addEventListener('click', () => {
      this.toggle(false);
      this.start({ ...o, opponents: [...o.opponents] });
    });
    return [
      this.chips(
        'menu.size',
        MAP.SIZES,
        (n) => t('menu.sizeValue', { n }),
        () => o.size,
        (n) => (o.size = n),
      ),
      this.chips(
        'menu.opponents',
        counts,
        (n) => String(n),
        () => o.opponents.length,
        (n) => (o.opponents = Array.from({ length: n }, () => this.level)),
      ),
      this.chips(
        'menu.level',
        AI_LEVELS,
        (l) => t(`level.${l}`),
        () => this.level,
        (l) => {
          this.level = l;
          o.opponents = o.opponents.map(() => l);
        },
      ),
      this.chips(
        'menu.stock',
        STOCK_LEVELS,
        (s) => t(`stock.${s}`),
        () => o.stock,
        (s) => (o.stock = s),
      ),
      el('div', { className: 'menu-row' }, [
        el('div', { className: 'panel-sub', text: t('menu.seed') }),
        el('div', { className: 'chips' }, [seed, dice]),
      ]),
      el('p', { className: 'menu-note', text: t('menu.freeGoal') }),
      el('div', { className: 'menu-actions' }, [go]),
    ];
  }

  private missionsTab(): HTMLElement[] {
    const done = new Set(completedMissions());
    return MISSIONS.map((m) => {
      const title = el('div', { className: 'mission-title' }, [
        el('span', { text: `${m.id}. ${tDyn(`mission.${m.id}.title`)}` }),
      ]);
      if (done.has(m.id))
        title.append(el('span', { className: 'mission-done', text: `✓ ${t('menu.done')}` }));
      const facts = el('ul', { className: 'mission-goals' }, [
        ...m.goals.map((g) => {
          const n = goalTarget(g);
          return el('li', { text: n ? `${goalLabel(g)}: ${n}` : goalLabel(g) });
        }),
        el('li', {
          text: m.opponents.length
            ? t('menu.missionOpponents', {
                list: m.opponents.map((l) => t(`level.${l}`)).join(', '),
              })
            : t('menu.noOpponents'),
        }),
      ]);
      if (m.timeLimit) {
        facts.append(
          el('li', { text: t('menu.timeLimit', { min: m.timeLimit / SIM.TICKS_PER_SECOND / 60 }) }),
        );
      }
      const go = el('button', { className: 'menu-start', text: t('menu.startMission') });
      go.addEventListener('click', () => {
        this.toggle(false);
        this.start(missionOptions(m));
      });
      return el('div', { className: 'mission' }, [
        title,
        el('p', { className: 'menu-note', text: tDyn(`mission.${m.id}.text`) }),
        facts,
        el('div', { className: 'menu-actions' }, [go]),
      ]);
    });
  }
}
