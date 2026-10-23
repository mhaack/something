/** Spielerwerkzeuge: Kontextaktionen, Straßenbau-Modus, Auswahl. Erzeugt nur Befehle. */
import { TRANSPORT } from '../data/balance';
import { JOBS, WARE_TYPES } from '../data/wares';
import type { Command } from '../sim/commands';
import { canPlaceFlag } from '../sim/flags';
import { planRoadSegment, validateRoad } from '../sim/roads';
import type { World } from '../sim/world';
import type { RoadPreview } from '../render/renderer';
import { t, tDyn, type TextKey } from './i18n';
import { InfoPanel, Popup, Toast, el, type MenuItem } from './panels';

export interface ToolHost {
  world(): World;
  player: number;
  enqueue(cmd: Command): void;
  popup: Popup;
  info: InfoPanel;
  toast: Toast;
  setHint(text: string | null): void;
  debugVisible(): boolean;
}

export class Tools {
  roadPath: number[] | null = null;
  private segments: number[] = [];
  private tentative: number[] = [];
  private tentativeValid = true;
  selectedNode = -1;
  selectedWare = 0;
  buildHelp = false;
  congestion = false;

  constructor(private host: ToolHost) {}

  private get world(): World {
    return this.host.world();
  }

  reset(): void {
    this.cancelRoad();
    this.selectedNode = -1;
    this.selectedWare = 0;
    this.host.info.close();
    this.host.popup.hide();
  }

  preview(): RoadPreview | null {
    if (!this.roadPath) return null;
    return { path: this.roadPath, tentative: this.tentative, valid: this.tentativeValid };
  }

  hover(node: number): void {
    if (!this.roadPath || node < 0) {
      this.tentative = [];
      return;
    }
    const last = this.roadPath[this.roadPath.length - 1];
    if (node === last) {
      this.tentative = [];
      return;
    }
    const seg = planRoadSegment(this.world, this.host.player, this.roadPath, node);
    this.tentative = seg ?? [];
    this.tentativeValid = !!seg;
  }

  // --- Aktionen ---------------------------------------------------------------------------

  placeFlag(node: number): void {
    const r = canPlaceFlag(this.world, this.host.player, node);
    if (r !== 'ok') return this.host.toast.show(t(`msg.flag.${r}` as TextKey));
    this.host.enqueue({ type: 'placeFlag', player: this.host.player, node });
  }

  startRoad(node: number): void {
    const f = this.world.flags[this.world.nodeFlag[node]];
    if (!f || f.owner !== this.host.player) return this.host.toast.show(t('msg.road.noStartFlag'));
    this.host.popup.hide();
    this.roadPath = [node];
    this.segments = [];
    this.tentative = [];
    this.host.setHint(t('hud.roadMode'));
  }

  cancelRoad(): void {
    this.roadPath = null;
    this.segments = [];
    this.tentative = [];
    this.host.setHint(null);
  }

  private finishRoad(): void {
    const path = this.roadPath;
    if (!path) return;
    const r = validateRoad(this.world, this.host.player, path);
    if (r !== 'ok') return this.host.toast.show(t(`msg.road.${r}` as TextKey));
    this.host.enqueue({ type: 'buildRoad', player: this.host.player, path, autoFlags: true });
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
    const seg = planRoadSegment(this.world, this.host.player, path, node);
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
      this.host.enqueue({ type: 'removeFlag', player: this.host.player, flag: fid });
      return;
    }
    const rid = w.nodeRoad[node];
    if (rid) this.host.enqueue({ type: 'removeRoad', player: this.host.player, road: rid });
  }

  sendWare(node: number): void {
    const fid = this.world.nodeFlag[node];
    if (!fid) return;
    const hq = this.world.buildings[this.world.players[this.host.player].hq];
    if (!hq || !WARE_TYPES.some((x) => hq.stock[x] > 0))
      return this.host.toast.show(t('msg.noWare'));
    this.host.enqueue({ type: 'sendWare', player: this.host.player, flag: fid });
  }

  // --- Eingabe ----------------------------------------------------------------------------

  click(node: number, button: number, cssX: number, cssY: number): void {
    if (this.roadPath) {
      if (button === 2) return this.cancelRoad();
      if (node >= 0) this.extendRoad(node);
      return;
    }
    if (button !== 0 || node < 0) return;
    this.selectedNode = node;
    const w = this.world;
    const me = this.host.player;
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
      if (f.owner !== me) return;
      items.push({ label: t('action.buildRoad'), action: () => this.startRoad(node) });
      items.push({ label: t('action.sendWare'), action: () => this.sendWare(node) });
      if (!f.building)
        items.push({ label: t('action.removeFlag'), action: () => this.removeAt(node) });
      this.host.popup.show(cssX, cssY, t('panel.flag'), items);
      return;
    }
    if (rid) {
      this.openRoad(rid);
      if (w.roads[rid].owner !== me) return;
      const ok = canPlaceFlag(w, me, node) === 'ok';
      items.push({
        label: t('action.placeFlag'),
        action: () => this.placeFlag(node),
        disabled: !ok,
      });
      items.push({ label: t('action.removeRoad'), action: () => this.removeAt(node) });
      this.host.popup.show(cssX, cssY, t('panel.road'), items);
      return;
    }
    this.host.info.close();
    const r = canPlaceFlag(w, me, node);
    if (r !== 'ok') {
      this.host.popup.hide();
      return this.host.toast.show(t(`msg.flag.${r}` as TextKey));
    }
    items.push({ label: t('action.placeFlag'), action: () => this.placeFlag(node) });
    this.host.popup.show(cssX, cssY, t('panel.flag'), items);
  }

  /** Tastenkürzel. Liefert true, wenn die Taste verbraucht wurde. */
  key(code: string, hoverNode: number): boolean {
    switch (code) {
      case 'Escape':
        if (this.roadPath) this.cancelRoad();
        else {
          this.host.popup.hide();
          this.host.info.close();
          this.selectedNode = -1;
        }
        return true;
      case 'Backspace':
        this.undoSegment();
        return true;
      case 'KeyF':
        if (hoverNode >= 0) this.placeFlag(hoverNode);
        return true;
      case 'KeyR':
        if (hoverNode >= 0) this.startRoad(hoverNode);
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
    this.host.info.open(() => {
      const b = this.world.buildings[id];
      if (!b) return null;
      const wares = el('table', { className: 'stock' });
      for (const ty of WARE_TYPES) {
        if (b.stock[ty] <= 0) continue;
        wares.append(
          el('tr', {}, [
            el('td', { text: tDyn(`ware.${ty}`) }),
            el('td', { text: String(b.stock[ty]) }),
          ]),
        );
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
      return el('div', {}, [
        el('div', { className: 'panel-title', text: t('panel.hq') }),
        el('div', { className: 'panel-sub', text: t('panel.wares') }),
        wares,
        el('div', { className: 'panel-sub', text: t('panel.people') }),
        people,
        el('div', { text: `${t('panel.outQueue')}: ${b.outQueue.length}` }),
      ]);
    });
  }

  private openFlag(id: number): void {
    this.host.info.open(() => {
      const f = this.world.flags[id];
      if (!f) return null;
      const list = el('div', { className: 'ware-list' });
      for (const wid of f.wares) {
        const w = this.world.wares[wid];
        list.append(el('div', { text: tDyn(`ware.${w.type}`) }));
      }
      return el('div', {}, [
        el('div', { className: 'panel-title', text: t('panel.flag') }),
        el('div', {
          text: t('panel.wareCount', { n: f.wares.length, max: TRANSPORT.FLAG_CAPACITY }),
        }),
        list,
      ]);
    });
  }

  private openRoad(id: number): void {
    this.host.info.open(() => {
      const r = this.world.roads[id];
      if (!r) return null;
      const carrier = r.carriers[0] ? this.world.settlers[r.carriers[0]] : undefined;
      const lines = [
        el('div', { className: 'panel-title', text: t('panel.road') }),
        el('div', { text: t('panel.length', { n: r.path.length - 1 }) }),
        el('div', {
          text:
            carrier && carrier.state !== 'toRoad'
              ? t('panel.carrierPresent')
              : t('panel.carrierMissing'),
        }),
      ];
      if (r.busy) lines.push(el('div', { text: `${t('panel.busy')} (${t('panel.donkey')})` }));
      return el('div', {}, lines);
    });
  }
}
