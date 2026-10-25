/**
 * Kleines Übersichtsfenster (unten links, wie die Minikarte ein- und ausblendbar): wichtigste
 * Bestände, Siedler, Armee, Gebiet und stillstehende Betriebe auf einen Blick.
 */
import { VIEW } from '../data/balance';
import { FOOD, TOOL_WARES, type WareType } from '../data/wares';
import { buildingActivity } from '../sim/activity';
import { storeConnectedFlags } from '../sim/routing';
import { isStore } from '../sim/store';
import type { World } from '../sim/world';
import { t, tDyn } from './i18n';
import { wareIcon } from './icons';
import { el } from './panels';

const WARES: WareType[] = [
  'wood',
  'planks',
  'stone',
  'coal',
  'ironore',
  'iron',
  'goldore',
  'coins',
];

export class OverviewPanel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private last = 0;

  constructor(parent: HTMLElement) {
    this.body = el('div', { className: 'overview-body' });
    this.root = el('div', { className: 'panel overview' }, [
      el('div', { className: 'panel-title', text: t('overview.title') }),
      this.body,
    ]);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  set visible(v: boolean) {
    if (v === !this.root.hidden) return;
    this.root.hidden = !v;
    this.last = 0;
  }

  update(world: World, player: number): void {
    if (this.root.hidden) return;
    const now = performance.now();
    if (now - this.last < VIEW.PANEL_REFRESH_MS) return;
    this.last = now;
    const stock = world.ledger[player].wares;
    const cell = (icon: HTMLElement | null, value: number | string, title: string): HTMLElement => {
      const c = el('div', { className: 'ov-cell' }, icon ? [icon] : []);
      c.append(el('span', { text: String(value) }));
      c.title = title;
      return c;
    };
    const wares = el(
      'div',
      { className: 'ov-grid' },
      WARES.map((w) => cell(wareIcon(w), stock[w], tDyn(`ware.${w}`))),
    );
    const food = FOOD.reduce((a, f) => a + stock[f], 0);
    const tools = TOOL_WARES.reduce((a, w) => a + stock[w], 0);
    const extra = el('div', { className: 'ov-grid' }, [
      cell(wareIcon('bread'), food, t('overview.food')),
      cell(wareIcon('hammer'), tools, t('overview.tools')),
      cell(wareIcon('sword'), stock.sword, t('overview.swords')),
      cell(wareIcon('shield'), stock.shield, t('overview.shields')),
    ]);

    // Siedler und Armee
    let settlers = 0;
    let carriers = 0;
    let soldiers = 0;
    let rankSum = 0;
    for (const id in world.settlers) {
      const s = world.settlers[id];
      if (s.owner !== player) continue;
      settlers++;
      if (s.job === 'carrier') carriers++;
      if (s.job === 'soldier') {
        soldiers++;
        rankSum += s.rank;
      }
    }
    let buildings = 0;
    let stalled = 0;
    const connected = storeConnectedFlags(world, player);
    for (const id in world.buildings) {
      const b = world.buildings[id];
      if (b.owner !== player) continue;
      buildings++;
      soldiers += b.soldiers.length;
      rankSum += b.soldiers.reduce((a, r) => a + r, 0);
      if (isStore(b)) {
        for (const n of Object.values(b.people)) settlers += n;
        carriers += b.people.carrier;
      }
      if (buildingActivity(world, b, connected.has(b.flag)).kind === 'stalled') stalled++;
    }
    const land = world.owner.reduce((a, o) => a + (o === player ? 1 : 0), 0);
    const rows = el('div', { className: 'ov-rows' }, [
      this.row(t('overview.settlers'), `${settlers} (${t('overview.carriers', { n: carriers })})`),
      this.row(
        t('overview.army'),
        soldiers
          ? `${soldiers} · Ø ${t('overview.rank', { r: (rankSum / soldiers).toFixed(1) })}`
          : '0',
      ),
      this.row(t('overview.land'), String(land)),
      this.row(t('overview.buildings'), String(buildings)),
    ]);
    if (stalled) {
      rows.append(
        el('div', { className: 'ov-row warn' }, [
          el('span', { text: t('overview.stalled') }),
          el('b', { text: String(stalled) }),
        ]),
      );
    }
    this.body.replaceChildren(wares, extra, rows);
  }

  private row(label: string, value: string): HTMLElement {
    return el('div', { className: 'ov-row' }, [
      el('span', { text: label }),
      el('b', { text: value }),
    ]);
  }
}
