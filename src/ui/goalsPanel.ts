/** Zielanzeige (oben links) und Fenster für Sieg und Niederlage. */
import { SIM } from '../data/balance';
import { goalProgress } from '../sim/outcome';
import type { World } from '../sim/world';
import { goalLabel } from './gameMenu';
import { t, tDyn } from './i18n';
import { el } from './panels';
import { PLAYER_COLORS } from '../render/palette';

export function formatTime(ticks: number): string {
  const s = Math.max(0, Math.floor(ticks / SIM.TICKS_PER_SECOND));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function playerName(world: World, id: number): string {
  return tDyn(`color.${world.players[id].color}`);
}

function swatch(world: World, id: number): HTMLElement {
  const c = PLAYER_COLORS[world.players[id].color];
  const s = el('span', { className: 'swatch' });
  s.style.background = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return s;
}

export class GoalsPanel {
  readonly root: HTMLElement;
  private last = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', { className: 'panel goals' });
    parent.append(this.root);
  }

  /** Baut den Inhalt nur neu, wenn sich die Anzeige geändert hat. */
  update(world: World): void {
    const { setup } = world;
    const rows: [string, string, boolean][] = setup.goals.map((g) => {
      const p = goalProgress(world, g);
      const text =
        g.type === 'conquer'
          ? `${p.value}/${p.target}`
          : `${Math.min(p.value, p.target)}/${p.target}`;
      return [goalLabel(g), text, p.value >= p.target];
    });
    const title =
      setup.mode === 'mission'
        ? t('goals.mission', { n: setup.mission, title: tDyn(`mission.${setup.mission}.title`) })
        : t('goals.free');
    const time = setup.timeLimit
      ? t('goals.timeLeft', { time: formatTime(setup.timeLimit - world.tick) })
      : '';
    const opponents = world.players.filter((p) => p.id !== 0);
    const key = JSON.stringify([title, rows, time, opponents.map((p) => p.defeated)]);
    if (key === this.last) return;
    this.last = key;
    const body: HTMLElement[] = [el('div', { className: 'panel-title', text: title })];
    if (!rows.length) body.push(el('div', { className: 'goal dim', text: t('goals.endless') }));
    for (const [label, value, done] of rows) {
      const row = el('div', { className: 'goal' }, [
        el('span', { text: `${done ? '✓' : '•'} ${label}` }),
        el('span', { className: 'goal-value', text: value }),
      ]);
      row.classList.toggle('done', done);
      body.push(row);
    }
    if (time) body.push(el('div', { className: 'goal warn', text: time }));
    for (const p of opponents) {
      const row = el('div', { className: 'goal opponent' }, [
        swatch(world, p.id),
        el('span', {
          text: t('goals.opponent', {
            color: playerName(world, p.id),
            level: p.ai ? t(`level.${p.ai}`) : '–',
          }),
        }),
      ]);
      if (p.defeated)
        row.append(el('span', { className: 'goal-value', text: t('goals.defeated') }));
      row.classList.toggle('done', p.defeated);
      body.push(row);
    }
    this.root.replaceChildren(...body);
  }
}

export interface OutcomeActions {
  continuePlaying: () => void;
  newGame: () => void;
  nextMission: (() => void) | null;
}

/** Modales Fenster nach Spielende. */
export class OutcomeDialog {
  private root: HTMLElement;
  private box: HTMLElement;

  constructor(parent: HTMLElement) {
    this.box = el('div', { className: 'panel help-box outcome-box' });
    this.root = el('div', { className: 'help-overlay' }, [this.box]);
    this.root.hidden = true;
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
  }

  show(world: World, actions: OutcomeActions): void {
    const o = world.outcome;
    if (!o) return;
    const won = o.result === 'won';
    const text =
      o.reason === 'goals'
        ? t('outcome.goals', { time: formatTime(o.tick) })
        : o.reason === 'time'
          ? t('outcome.time')
          : t('outcome.defeated');
    const button = (label: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', { className: 'help-close', text: label });
      b.addEventListener('click', () => {
        this.hide();
        fn();
      });
      return b;
    };
    const buttons = [button(t('outcome.continue'), actions.continuePlaying)];
    if (won && actions.nextMission)
      buttons.push(button(t('outcome.nextMission'), actions.nextMission));
    buttons.push(button(t('outcome.newGame'), actions.newGame));
    this.box.replaceChildren(
      el('div', {
        className: `outcome-title ${won ? 'won' : 'lost'}`,
        text: t(won ? 'outcome.won' : 'outcome.lost'),
      }),
      el('p', { text }),
      el('div', { className: 'menu-actions' }, buttons),
    );
    this.root.hidden = false;
  }
}
