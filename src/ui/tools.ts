/** Spielerwerkzeuge: Werkzeug-Modi, Kontextaktionen, Straßenbau, Auswahl. Erzeugt nur Befehle. */
import { TRANSPORT } from '../data/balance';
import { JOBS, WARE_TYPES } from '../data/wares';
import type { Command } from '../sim/commands';
import { canPlaceFlag } from '../sim/flags';
import { planRoadSegment, slopeClass, validateRoad } from '../sim/roads';
import type { World } from '../sim/world';
import type { RoadPreview } from '../render/renderer';
import { t, tDyn, type TextKey } from './i18n';
import { wareIcon } from './icons';
import { InfoPanel, Popup, Toast, el, type MenuItem } from './panels';

export type ToolMode = 'select' | 'flag' | 'road' | 'demolish';

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
        if (fid) {
          this.hoverInfo.tip = w.flags[fid].building ? t('msg.removeHQFlag') : t('tip.removeFlag');
        } else if (w.nodeRoad[node]) this.hoverInfo.tip = t('tip.removeRoad');
        break;
      }
      case 'select':
        break;
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
    if (fid) {
      if (w.flags[fid].building) return this.host.toast.show(t('msg.removeHQFlag'));
      this.host.enqueue({ type: 'removeFlag', player: this.me, flag: fid });
      return;
    }
    const rid = w.nodeRoad[node];
    if (rid) this.host.enqueue({ type: 'removeRoad', player: this.me, road: rid });
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
    this.host.popup.show(cssX, cssY, t('tool.flag'), items);
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

  private openBuilding(id: number): void {
    this.host.popup.hide();
    this.host.info.open(t('panel.hq'), () => {
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
        people.append(
          el('tr', {}, [
            el('td', { text: tDyn(`job.${j}`) }),
            el('td', { text: String(b.people[j]) }),
          ]),
        );
      }
      return [
        el('div', { className: 'panel-sub', text: t('panel.wares') }),
        grid,
        el('div', { className: 'panel-sub', text: t('panel.people') }),
        people,
        el('div', {
          className: 'panel-foot',
          text: `${t('panel.outQueue')}: ${b.outQueue.length}`,
        }),
      ];
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
