/** Spielerwerkzeuge: Werkzeug-Modi, Kontextaktionen, Straßenbau, Auswahl. Erzeugt nur Befehle. */
import { TRANSPORT } from '../data/balance';
import { JOBS, WARE_TYPES } from '../data/wares';
import type { Command } from '../sim/commands';
import { canPlaceFlag } from '../sim/flags';
import { planRoadSegment, slopeClass, validateRoad } from '../sim/roads';
import type { World } from '../sim/world';
import type { RoadPreview } from '../render/renderer';
import { t, tDyn, type TextKey } from './i18n';
import { buildingIcon, wareIcon } from './icons';
import { InfoPanel, Popup, Toast, el, type MenuItem } from './panels';
import { BUILDINGS, BUILD_MENU, sizeFits, type BuildingType } from '../data/buildings';
import type { WareType } from '../data/wares';
import { buildSize, canBuild, canSupply } from '../sim/buildings';
import type { Building } from '../sim/entities';
import { searchFlags } from '../sim/routing';
import { isStore } from '../sim/store';
import { buildProgress } from '../sim/workers';
import { availableAttackers, capacity, isAttackable } from '../sim/military';

/** Ist die Gebäudeflagge über Straßen mit einem eigenen Lager verbunden? */
function hasStoreConnection(world: World, b: Building): boolean {
  const res = searchFlags(world, b.flag, b.owner, false, (f) => {
    const s = world.buildings[world.flags[f].building];
    return !!s && s.owner === b.owner && isStore(s);
  });
  return res.found >= 0;
}

function statusText(b: Building, workerHere: boolean): string {
  if (!workerHere) return t('status.noWorker');
  switch (b.status) {
    case 'noResources':
      return t('status.noResources');
    case 'outputBlocked':
      return t('status.outputBlocked');
    case 'waitingInput':
      return t('status.waitingInput');
    case 'noOrders':
      return t('status.noOrders');
    default:
      return t('status.working');
  }
}

export type ToolMode = 'select' | 'flag' | 'road' | 'demolish' | 'build';

export interface ToolHost {
  world(): World;
  player: number;
  enqueue(cmd: Command): void;
  popup: Popup;
  info: InfoPanel;
  toast: Toast;
  setHint(text: string | null): void;
  debugVisible(): boolean;
  onModeChange(): void;
}

export interface HoverInfo {
  tip: string | null;
  ghostFlag: number;
}

export class Tools {
  mode: ToolMode = 'select';
  roadPath: number[] | null = null;
  private segments: number[] = [];
  private tentative: number[] = [];
  private tentativeValid = true;
  /** Straßenbau wurde aus dem Kontextmenü gestartet: danach zurück zu „Auswählen“. */
  private roadFromMenu = false;
  selectedNode = -1;
  selectedWare = 0;
  buildHelp = false;
  congestion = false;
  hoverInfo: HoverInfo = { tip: null, ghostFlag: -1 };
  /** Gebäudevorschau beim Überfahren eines Baumenü-Eintrags. */
  ghostBuilding: { node: number; type: BuildingType } | null = null;

  constructor(private host: ToolHost) {}

  private get world(): World {
    return this.host.world();
  }

  private get me(): number {
    return this.host.player;
  }

  reset(): void {
    this.setMode('select');
    this.selectedNode = -1;
    this.selectedWare = 0;
    this.host.info.close();
    this.host.popup.hide();
  }

  setMode(mode: ToolMode): void {
    this.cancelRoad();
    this.mode = mode;
    this.host.popup.hide();
    const hints: Record<ToolMode, TextKey | null> = {
      select: null,
      flag: 'hint.flag',
      road: 'hint.road',
      demolish: 'hint.demolish',
      build: 'hint.build',
    };
    const h = hints[mode];
    this.host.setHint(h ? t(h) : null);
    this.host.onModeChange();
  }

  preview(): RoadPreview | null {
    if (!this.roadPath) return null;
    return { path: this.roadPath, tentative: this.tentative, valid: this.tentativeValid };
  }

  /** Aktualisiert Straßenvorschau, Geisterflagge und Hinweistext für den Knoten unter der Maus. */
  hover(node: number): void {
    const w = this.world;
    this.hoverInfo = { tip: null, ghostFlag: -1 };
    if (this.roadPath) {
      this.tentative = [];
      if (node < 0) return;
      const last = this.roadPath[this.roadPath.length - 1];
      if (node === last) {
        if (this.roadPath.length >= 2 && !w.nodeFlag[node]) {
          this.hoverInfo = { tip: t('tip.roadFinish'), ghostFlag: node };
        }
        return;
      }
      const seg = planRoadSegment(w, this.me, this.roadPath, node);
      this.tentative = seg ?? [];
      this.tentativeValid = !!seg;
      if (!seg) {
        this.hoverInfo.tip = t('msg.road.noPath');
        return;
      }
      const all = [last, ...seg];
      let steep = false;
      for (let k = 1; k < all.length; k++)
        if (slopeClass(w, all[k - 1], all[k]) === 2) steep = true;
      const tip = w.nodeFlag[node] ? t('tip.roadFinishFlag') : t('tip.roadExtend');
      this.hoverInfo.tip = steep ? `${tip} · ${t('tip.roadSteep')}` : tip;
      return;
    }
    if (node < 0) return;
    switch (this.mode) {
      case 'flag': {
        const r = canPlaceFlag(w, this.me, node);
        this.hoverInfo =
          r === 'ok'
            ? { tip: t('tip.placeFlag'), ghostFlag: node }
            : { tip: t(`msg.flag.${r}` as TextKey), ghostFlag: -1 };
        break;
      }
      case 'road': {
        const f = w.flags[w.nodeFlag[node]];
        this.hoverInfo.tip = f && f.owner === this.me ? t('tip.roadStart') : t('tip.pickStartFlag');
        break;
      }
      case 'demolish': {
        const fid = w.nodeFlag[node];
        const bid = w.nodeBuilding[node] || (fid ? w.flags[fid].building : 0);
        if (bid) {
          this.hoverInfo.tip =
            w.buildings[bid].type === 'hq'
              ? t('msg.removeHQ')
              : t('tip.removeBuilding', { name: tDyn(`building.${w.buildings[bid].type}`) });
        } else if (fid) this.hoverInfo.tip = t('tip.removeFlag');
        else if (w.nodeRoad[node]) this.hoverInfo.tip = t('tip.removeRoad');
        break;
      }
      case 'build': {
        const size = buildSize(w, this.me, node);
        this.hoverInfo.tip = size
          ? t('tip.buildHere', { size: tDyn(`size.${size}`) })
          : t('tip.noBuild');
        break;
      }
      case 'select': {
        const eb = w.buildings[w.nodeBuilding[node]];
        if (eb && eb.owner !== this.me && isAttackable(w, this.me, eb)) {
          this.hoverInfo.tip = t('tip.enemy');
          break;
        }
        const sign = w.signs.find((g) => g.node === node && g.until > w.tick);
        if (sign) {
          const res = tDyn(`resource.${sign.resource}`);
          this.hoverInfo.tip = t('tip.sign', {
            what: sign.resource
              ? t(sign.rich ? 'tip.signRich' : 'tip.signPoor', { res })
              : t('tip.signNone'),
          });
        }
        break;
      }
    }
  }

  // --- Aktionen ---------------------------------------------------------------------------

  placeFlag(node: number): void {
    const r = canPlaceFlag(this.world, this.me, node);
    if (r !== 'ok') return this.host.toast.show(t(`msg.flag.${r}` as TextKey));
    this.host.enqueue({ type: 'placeFlag', player: this.me, node });
  }

  startRoad(node: number, fromMenu = false): void {
    const f = this.world.flags[this.world.nodeFlag[node]];
    if (!f || f.owner !== this.me) return this.host.toast.show(t('msg.road.noStartFlag'));
    this.host.popup.hide();
    this.roadFromMenu = fromMenu;
    this.roadPath = [node];
    this.segments = [];
    this.tentative = [];
    this.host.setHint(t('hud.roadMode'));
  }

  cancelRoad(): void {
    const wasActive = !!this.roadPath;
    this.roadPath = null;
    this.segments = [];
    this.tentative = [];
    if (!wasActive) return;
    if (this.roadFromMenu) {
      this.roadFromMenu = false;
      this.host.setHint(null);
    } else {
      this.host.setHint(this.mode === 'road' ? t('hint.road') : null);
    }
  }

  private finishRoad(): void {
    const path = this.roadPath;
    if (!path) return;
    const r = validateRoad(this.world, this.me, path);
    if (r !== 'ok') return this.host.toast.show(t(`msg.road.${r}` as TextKey));
    this.host.enqueue({ type: 'buildRoad', player: this.me, path, autoFlags: true });
    this.cancelRoad();
  }

  private extendRoad(node: number): void {
    const path = this.roadPath!;
    const last = path[path.length - 1];
    if (node === last) {
      if (path.length >= 2) this.finishRoad();
      return;
    }
    if (node === path[0] && path.length === 1) return this.cancelRoad();
    const seg = planRoadSegment(this.world, this.me, path, node);
    if (!seg) return this.host.toast.show(t('msg.road.noPath'));
    this.segments.push(seg.length);
    path.push(...seg);
    this.tentative = [];
    if (this.world.nodeFlag[node]) this.finishRoad();
  }

  undoSegment(): void {
    if (!this.roadPath) return;
    const n = this.segments.pop();
    if (n === undefined) return this.cancelRoad();
    this.roadPath.splice(this.roadPath.length - n, n);
  }

  removeAt(node: number): void {
    const w = this.world;
    const fid = w.nodeFlag[node];
    const bid = w.nodeBuilding[node];
    if (bid) return this.removeBuilding(bid);
    if (fid) {
      const b = w.buildings[w.flags[fid].building];
      if (b && b.type === 'hq') return this.host.toast.show(t('msg.removeHQFlag'));
      this.host.enqueue({ type: 'removeFlag', player: this.me, flag: fid });
      return;
    }
    const rid = w.nodeRoad[node];
    if (rid) this.host.enqueue({ type: 'removeRoad', player: this.me, road: rid });
  }

  removeBuilding(id: number): void {
    const b = this.world.buildings[id];
    if (!b || b.owner !== this.me) return;
    if (b.type === 'hq') return this.host.toast.show(t('msg.removeHQ'));
    this.host.enqueue({ type: 'removeBuilding', player: this.me, building: id });
    this.host.info.close();
  }

  placeBuilding(node: number, type: BuildingType): void {
    const r = canBuild(this.world, this.me, node, type);
    if (r !== 'ok') return this.host.toast.show(t(`msg.build.${r}` as TextKey));
    this.host.enqueue({ type: 'placeBuilding', player: this.me, node, building: type });
  }

  /** Menüeinträge für alle Gebäude, die auf den Platz passen. */
  private buildItems(node: number): MenuItem[] {
    const size = buildSize(this.world, this.me, node);
    const items: MenuItem[] = [];
    for (const type of BUILD_MENU) {
      const def = BUILDINGS[type];
      if (!sizeFits(def.size, size)) continue;
      const cost = [
        def.cost.planks ? t('cost.planks', { n: def.cost.planks }) : '',
        def.cost.stone ? t('cost.stone', { n: def.cost.stone }) : '',
      ]
        .filter(Boolean)
        .join(' · ');
      items.push({
        label: tDyn(`building.${type}`),
        key: cost,
        icon: buildingIcon(type, this.world.players[this.me].color),
        section: tDyn(`group.${def.group}`),
        action: () => this.placeBuilding(node, type),
        onHover: (on) => (this.ghostBuilding = on ? { node, type } : null),
      });
    }
    return items;
  }

  private openBuildMenu(node: number, cssX: number, cssY: number): void {
    const items = this.buildItems(node);
    if (items.length === 0) return this.host.toast.show(t('tip.noBuild'));
    this.host.popup.show(cssX, cssY, t('tool.build'), items, () => (this.ghostBuilding = null));
  }

  sendGeologist(node: number): void {
    const w = this.world;
    const fid = w.nodeFlag[node];
    if (!fid) return;
    const ok = Object.values(w.buildings).some(
      (b) => b.owner === this.me && isStore(b) && canSupply(b, 'geologist'),
    );
    if (!ok) return this.host.toast.show(t('msg.noGeologist'));
    this.host.enqueue({ type: 'sendGeologist', player: this.me, flag: fid });
  }

  sendWare(node: number): void {
    const fid = this.world.nodeFlag[node];
    if (!fid) return;
    const hq = this.world.buildings[this.world.players[this.me].hq];
    if (!hq || !WARE_TYPES.some((x) => hq.stock[x] > 0)) {
      return this.host.toast.show(t('msg.noWare'));
    }
    this.host.enqueue({ type: 'sendWare', player: this.me, flag: fid });
  }

  // --- Eingabe ----------------------------------------------------------------------------

  click(node: number, button: number, cssX: number, cssY: number): void {
    if (this.roadPath) {
      if (button === 2) return this.undoSegment();
      if (node >= 0) this.extendRoad(node);
      return;
    }
    if (button === 2) {
      if (this.mode !== 'select') this.setMode('select');
      this.host.popup.hide();
      return;
    }
    if (button !== 0 || node < 0) return;
    switch (this.mode) {
      case 'flag':
        return this.placeFlag(node);
      case 'road':
        return this.startRoad(node);
      case 'demolish':
        return this.removeAt(node);
      case 'build':
        this.selectedNode = node;
        return this.openBuildMenu(node, cssX, cssY);
      case 'select':
        return this.selectClick(node, cssX, cssY);
    }
  }

  private selectClick(node: number, cssX: number, cssY: number): void {
    this.selectedNode = node;
    const w = this.world;
    const items: MenuItem[] = [];
    const bid = w.nodeBuilding[node];
    const fid = w.nodeFlag[node];
    const rid = w.nodeRoad[node];
    if (bid) {
      this.openBuilding(bid);
      return;
    }
    if (fid) {
      const f = w.flags[fid];
      if (this.host.debugVisible()) this.selectedWare = f.wares[0] ?? 0;
      this.openFlag(fid);
      if (f.owner !== this.me) return;
      items.push({
        label: t('action.buildRoad'),
        key: 'R',
        action: () => this.startRoad(node, true),
      });
      items.push({
        label: t('action.sendGeologist'),
        key: 'J',
        action: () => this.sendGeologist(node),
      });
      items.push({ label: t('action.sendWare'), key: 'G', action: () => this.sendWare(node) });
      if (!f.building) {
        items.push({
          label: t('action.removeFlag'),
          key: 'Entf',
          action: () => this.removeAt(node),
        });
      }
      this.host.popup.show(cssX, cssY, t('panel.flag'), items);
      return;
    }
    if (rid) {
      this.openRoad(rid);
      if (w.roads[rid].owner !== this.me) return;
      const ok = canPlaceFlag(w, this.me, node) === 'ok';
      items.push({
        label: t('action.placeFlag'),
        key: 'F',
        action: () => this.placeFlag(node),
        disabled: !ok,
      });
      items.push({ label: t('action.removeRoad'), key: 'Entf', action: () => this.removeAt(node) });
      this.host.popup.show(cssX, cssY, t('panel.road'), items);
      return;
    }
    this.host.info.close();
    const r = canPlaceFlag(w, this.me, node);
    if (r !== 'ok') {
      this.host.popup.hide();
      return this.host.toast.show(t(`msg.flag.${r}` as TextKey));
    }
    items.push({ label: t('action.placeFlag'), key: 'F', action: () => this.placeFlag(node) });
    items.push(...this.buildItems(node));
    this.host.popup.show(cssX, cssY, t('panel.place'), items, () => (this.ghostBuilding = null));
  }

  /** Tastenkürzel. Liefert true, wenn die Taste verbraucht wurde. */
  key(code: string, hoverNode: number): boolean {
    switch (code) {
      case 'Escape':
        if (this.roadPath) this.cancelRoad();
        else if (this.mode !== 'select') this.setMode('select');
        else {
          this.host.popup.hide();
          this.host.info.close();
          this.selectedNode = -1;
        }
        return true;
      case 'Backspace':
        this.undoSegment();
        return true;
      case 'Digit1':
        this.setMode('select');
        return true;
      case 'Digit2':
        this.setMode('flag');
        return true;
      case 'Digit3':
        this.setMode('road');
        return true;
      case 'Digit4':
        this.setMode('demolish');
        return true;
      case 'Digit5':
        this.setMode('build');
        return true;
      case 'KeyF':
        if (hoverNode >= 0) this.placeFlag(hoverNode);
        return true;
      case 'KeyR':
        if (hoverNode >= 0) this.startRoad(hoverNode, this.mode !== 'road');
        return true;
      case 'Delete':
        if (hoverNode >= 0) this.removeAt(hoverNode);
        return true;
      case 'KeyG':
        if (hoverNode >= 0) this.sendWare(hoverNode);
        return true;
      case 'KeyJ':
        if (hoverNode >= 0) this.sendGeologist(hoverNode);
        return true;
      case 'KeyH':
        this.buildHelp = !this.buildHelp;
        return true;
      case 'KeyV':
        this.congestion = !this.congestion;
        return true;
    }
    return false;
  }

  // --- Infofenster ------------------------------------------------------------------------

  private attackCount = 0;

  private openBuilding(id: number): void {
    this.host.popup.hide();
    const b0 = this.world.buildings[id];
    if (!b0) return;
    if (b0.owner !== this.me) return this.openEnemy(id);
    if (isStore(b0)) return this.openStore(id);
    const title = b0.site
      ? t('panel.site', { name: tDyn(`building.${b0.type}`) })
      : tDyn(`building.${b0.type}`);
    this.host.info.open(title, () => {
      const w = this.world;
      const b = w.buildings[id];
      if (!b) return null;
      const def = BUILDINGS[b.type];
      const rows: HTMLElement[] = [];
      const connected = hasStoreConnection(w, b);
      const worker = w.settlers[b.worker];
      const workerHere = !!worker && worker.home === b.id && worker.state !== 'toBuilding';
      if (b.site) {
        const p = Math.round(buildProgress(w, b) * 100);
        rows.push(el('div', { className: 'progress' }, [el('div', { className: 'bar' })]));
        (rows[0].firstChild as HTMLElement).style.width = `${p}%`;
        rows.push(
          el('div', {
            text: b.site.stage === 'level' ? t('status.leveling') : t('status.building', { p }),
          }),
        );
        const mats = el('div', { className: 'ware-grid' });
        for (const type of ['planks', 'stone'] as const) {
          const need = type === 'planks' ? def.cost.planks : def.cost.stone;
          if (!need) continue;
          const used = type === 'planks' ? b.site.usedPlanks : b.site.usedStone;
          mats.append(
            el('div', { className: 'ware-cell' }, [
              wareIcon(type),
              el('span', { text: `${used + b.stock[type]}/${need}` }),
            ]),
          );
        }
        rows.push(el('div', { className: 'panel-sub', text: t('panel.material') }), mats);
      } else {
        rows.push(
          el('div', { className: `status status-${b.status}`, text: statusText(b, workerHere) }),
        );
        const inputs = Object.entries(def.inputs) as [WareType, number][];
        if (inputs.length) {
          const grid = el('div', { className: 'ware-grid' });
          for (const [type, max] of inputs) {
            grid.append(
              el('div', { className: 'ware-cell' }, [
                wareIcon(type),
                el('span', { text: `${b.stock[type]}/${max}` }),
              ]),
            );
          }
          rows.push(
            el('div', {
              className: 'panel-sub',
              text: def.kind === 'mine' ? t('panel.food') : t('panel.inputs'),
            }),
            grid,
          );
        }
        if (def.producesJob) {
          rows.push(
            el('div', { className: 'panel-foot', text: t('panel.bred', { n: b.produced }) }),
          );
        }
        if (def.output) {
          rows.push(
            el('div', { className: 'panel-foot' }, [
              wareIcon(def.output),
              el('span', { text: t('panel.produced', { n: b.produced }) }),
            ]),
          );
        }
      }
      const job = b.site ? (b.site.stage === 'level' ? 'leveler' : 'builder') : def.worker;
      if (job) {
        rows.push(
          el('div', {
            className: 'panel-foot',
            text: `${tDyn(`job.${job}`)}: ${
              workerHere ? t('panel.present') : worker ? t('panel.onTheWay') : t('panel.missing')
            }`,
          }),
        );
      }
      if (def.kind === 'military' && !b.site) rows.unshift(...this.garrisonRows(b));
      if (!connected) rows.push(el('div', { className: 'warn', text: t('msg.noStoreConnection') }));
      if (b.owner === this.me) {
        const btn = el('button', { className: 'panel-action', text: t('action.removeBuilding') });
        btn.addEventListener('click', () => this.removeBuilding(id));
        rows.push(btn);
      }
      return rows;
    });
  }

  /** Besatzung mit Rangabzeichen. */
  private garrisonRows(b: Building): HTMLElement[] {
    const ranks = el('div', { className: 'ranks' });
    for (const r of [...b.soldiers].sort((x, y) => y - x)) {
      const pill = el('span', { className: `rank rank-${r}`, text: String(r) });
      pill.title = tDyn(`rank.${r}`);
      ranks.append(pill);
    }
    const head =
      b.type === 'hq'
        ? t('panel.garrisonHQ', { n: b.soldiers.length })
        : t('panel.garrison', { n: b.soldiers.length, max: capacity(b) });
    const rows = [el('div', { className: 'panel-sub', text: head }), ranks];
    if (b.type !== 'hq' && b.soldiers.length === 0) {
      rows.push(el('div', { className: 'warn', text: t('panel.noSoldiers') }));
    }
    return rows;
  }

  /** Feindliches Gebäude: Besatzung und Angriff planen. */
  private openEnemy(id: number): void {
    const b0 = this.world.buildings[id];
    this.attackCount = availableAttackers(this.world, this.me, b0);
    this.host.info.open(t('panel.enemy', { name: tDyn(`building.${b0.type}`) }), () => {
      const w = this.world;
      const b = w.buildings[id];
      if (!b || b.owner === this.me) return null;
      if (!isAttackable(w, this.me, b)) return [];
      const avail = availableAttackers(w, this.me, b);
      this.attackCount = Math.max(avail ? 1 : 0, Math.min(this.attackCount, avail));
      const rows: HTMLElement[] = [
        el('div', { text: t('panel.defenders', { n: b.soldiers.length }) }),
        el('div', {
          className: avail ? '' : 'warn',
          text: avail ? t('panel.attackers', { n: avail }) : t('panel.noAttackers'),
        }),
      ];
      if (avail > 0) {
        const fewer = el('button', { className: 'chip', text: '−' });
        fewer.title = t('action.fewer');
        fewer.addEventListener('click', () => {
          this.attackCount = Math.max(1, this.attackCount - 1);
          this.host.info.refresh(true);
        });
        const more = el('button', { className: 'chip', text: '+' });
        more.title = t('action.more');
        more.addEventListener('click', () => {
          this.attackCount = Math.min(avail, this.attackCount + 1);
          this.host.info.refresh(true);
        });
        const go = el('button', {
          className: 'panel-action attack',
          text: t('action.attack', { n: this.attackCount }),
        });
        go.addEventListener('click', () => {
          this.host.enqueue({
            type: 'attack',
            player: this.me,
            target: id,
            soldiers: this.attackCount,
          });
          this.host.toast.show(t('msg.attackStarted', { n: this.attackCount }));
        });
        rows.push(el('div', { className: 'attack-row' }, [fewer, more]), go);
      }
      return rows;
    });
  }

  private openStore(id: number): void {
    const b0 = this.world.buildings[id];
    this.host.info.open(tDyn(`building.${b0.type}`), () => {
      const b = this.world.buildings[id];
      if (!b) return null;
      const grid = el('div', { className: 'ware-grid' });
      for (const ty of WARE_TYPES) {
        const cell = el('div', { className: b.stock[ty] > 0 ? 'ware-cell' : 'ware-cell empty' }, [
          wareIcon(ty),
          el('span', { text: String(b.stock[ty]) }),
        ]);
        cell.title = tDyn(`ware.${ty}`);
        grid.append(cell);
      }
      const people = el('table', { className: 'stock' });
      for (const j of JOBS) {
        if (!b.people[j] && j !== 'carrier') continue;
        people.append(
          el('tr', {}, [
            el('td', { text: tDyn(`job.${j}`) }),
            el('td', { text: String(b.people[j]) }),
          ]),
        );
      }
      const rows: HTMLElement[] = [
        ...(b.type === 'hq' ? this.garrisonRows(b) : []),
        el('div', { className: 'panel-sub', text: t('panel.wares') }),
        grid,
        el('div', { className: 'panel-sub', text: t('panel.people') }),
        people,
        el('div', {
          className: 'panel-foot',
          text: `${t('panel.outQueue')}: ${b.outQueue.length}`,
        }),
      ];
      if (b.type !== 'hq' && b.owner === this.me) {
        const btn = el('button', { className: 'panel-action', text: t('action.removeBuilding') });
        btn.addEventListener('click', () => this.removeBuilding(id));
        rows.push(btn);
      }
      return rows;
    });
  }

  private openFlag(id: number): void {
    this.host.info.open(t('panel.flag'), () => {
      const f = this.world.flags[id];
      if (!f) return null;
      const slots = el('div', { className: 'flag-slots' });
      for (let k = 0; k < TRANSPORT.FLAG_CAPACITY; k++) {
        const w = this.world.wares[f.wares[k]];
        const slot = el('div', { className: 'flag-slot' }, w ? [wareIcon(w.type)] : []);
        if (w) slot.title = tDyn(`ware.${w.type}`);
        slots.append(slot);
      }
      return [
        el('div', {
          text: t('panel.wareCount', { n: f.wares.length, max: TRANSPORT.FLAG_CAPACITY }),
        }),
        slots,
      ];
    });
  }

  private openRoad(id: number): void {
    this.host.info.open(t('panel.road'), () => {
      const r = this.world.roads[id];
      if (!r) return null;
      const carrier = r.carriers[0] ? this.world.settlers[r.carriers[0]] : undefined;
      const lines = [
        el('div', { text: t('panel.length', { n: r.path.length - 1 }) }),
        el('div', {
          text:
            carrier && carrier.state !== 'toRoad'
              ? t('panel.carrierPresent')
              : t('panel.carrierMissing'),
        }),
      ];
      if (r.busy) lines.push(el('div', { text: `${t('panel.busy')} (${t('panel.donkey')})` }));
      return lines;
    });
  }
}
