/** Statistik-Fenster: Warenbestand, Verlaufsdiagramm, Siedler nach Beruf, Werkzeug-Prioritäten. */
import { DISTRIBUTION, SIM, STATS, TOOLS, WEAPONS } from '../data/balance';
import {
  DISTRIBUTION_GROUPS,
  DISTRIBUTION_GROUP_IDS,
  type DistributionGroupId,
} from '../data/distribution';
import {
  JOBS,
  JOB_TOOLS,
  TOOL_WARES,
  WARE_TYPES,
  WEAPON_WARES,
  type Job,
  type WareType,
  type WeaponWare,
} from '../data/wares';
import type { Command } from '../sim/commands';
import { canSupply, neededJob } from '../sim/buildings';
import { isStore } from '../sim/store';
import type { World } from '../sim/world';
import { t, tDyn } from './i18n';
import { icon, wareIcon } from './icons';
import { el } from './panels';

type Tab = 'wares' | 'history' | 'people' | 'tools' | 'distribution';

/** Kategoriepalette (dunkle Stufen, gegen den Panel-Hintergrund validiert). */
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];
const MAX_SERIES = SERIES.length;
const CHART_BG = '#1e150c';
const GRID = 'rgba(246, 234, 208, 0.12)';
const AXIS_TEXT = '#cdb894';
const TEXT = '#f6ead0';

export class StatsWindow {
  private root: HTMLElement;
  private body: HTMLElement;
  private tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'wares';
  private selected: WareType[] = ['planks', 'stone', 'wood', 'iron'];
  private mode: 'stock' | 'rate' = 'stock';
  private last = 0;
  private sliders = new Map<string, HTMLInputElement>();
  private hoverX = -1;

  constructor(
    parent: HTMLElement,
    private world: () => World,
    private player: number,
    private enqueue: (c: Command) => void,
  ) {
    const close = el('button', { className: 'panel-close' }, [icon('close')]);
    close.title = t('action.close');
    close.addEventListener('click', () => this.toggle(false));
    const tabRow = el('div', { className: 'tabs' });
    for (const tab of ['wares', 'history', 'people', 'tools', 'distribution'] as Tab[]) {
      const b = el('button', { className: 'tab', text: t(`stats.tab.${tab}`) });
      b.addEventListener('click', () => this.show(tab));
      this.tabs.set(tab, b);
      tabRow.append(b);
    }
    this.body = el('div', { className: 'stats-body' });
    const box = el('div', { className: 'panel stats-box' }, [
      el('div', { className: 'panel-head' }, [
        el('div', { className: 'panel-title', text: t('stats.title') }),
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

  toggle(on = !this.visible): void {
    this.root.hidden = !on;
    if (on) this.show(this.tab);
  }

  private show(tab: Tab): void {
    this.tab = tab;
    for (const [k, b] of this.tabs) b.classList.toggle('active', k === tab);
    this.sliders.clear();
    this.render(true);
  }

  /** Wird pro Frame aufgerufen; baut den Inhalt gedrosselt neu auf. */
  refresh(): void {
    if (!this.visible) return;
    const now = performance.now();
    if (now - this.last < 500) return;
    this.render(false);
  }

  private render(full: boolean): void {
    this.last = performance.now();
    const w = this.world();
    switch (this.tab) {
      case 'wares':
        return this.body.replaceChildren(this.waresTable(w));
      case 'history':
        if (full) this.body.replaceChildren(...this.historyView());
        return this.drawChart();
      case 'people':
        return this.body.replaceChildren(...this.peopleView(w));
      case 'tools':
        if (full || this.sliders.size === 0) this.body.replaceChildren(...this.toolsView(w));
        else this.updateSliders(w);
        return;
      case 'distribution':
        if (full || this.sliders.size === 0) this.body.replaceChildren(...this.distributionView(w));
        else this.updateDistribution(w);
        return;
    }
  }

  // --- Waren ---------------------------------------------------------------------------

  private waresTable(w: World): HTMLElement {
    const st = w.stats[this.player];
    const ledger = w.ledger[this.player].wares;
    const table = el('table', { className: 'stats-table' });
    table.append(
      el('tr', {}, [
        el('th', { text: t('stats.col.ware') }),
        el('th', { text: t('stats.col.stock') }),
        el('th', { text: t('stats.col.produced') }),
        el('th', { text: t('stats.col.consumed') }),
      ]),
    );
    for (const ty of WARE_TYPES) {
      table.append(
        el('tr', {}, [
          el('td', {}, [
            el('span', { className: 'ware-name' }, [wareIcon(ty), tDyn(`ware.${ty}`)]),
          ]),
          el('td', { text: String(ledger[ty]) }),
          el('td', { text: String(st.produced[ty]) }),
          el('td', { text: String(st.consumed[ty]) }),
        ]),
      );
    }
    return table;
  }

  // --- Verlauf -------------------------------------------------------------------------

  private chart: HTMLCanvasElement | null = null;
  private tip: HTMLElement | null = null;
  private legend: HTMLElement | null = null;

  private historyView(): HTMLElement[] {
    const modes = el('div', { className: 'chips' });
    for (const m of ['stock', 'rate'] as const) {
      const b = el('button', {
        className: m === this.mode ? 'chip active' : 'chip',
        text: t(`stats.mode.${m}`),
      });
      b.addEventListener('click', () => {
        this.mode = m;
        this.show('history');
      });
      modes.append(b);
    }
    const picker = el('div', { className: 'chips ware-picker' });
    for (const ty of WARE_TYPES) {
      const idx = this.selected.indexOf(ty);
      const b = el('button', { className: idx >= 0 ? 'chip active' : 'chip' }, [wareIcon(ty)]);
      b.title = tDyn(`ware.${ty}`);
      if (idx >= 0) b.style.borderColor = SERIES[idx];
      b.addEventListener('click', () => {
        const i = this.selected.indexOf(ty);
        if (i >= 0) this.selected.splice(i, 1);
        else if (this.selected.length < MAX_SERIES) this.selected.push(ty);
        this.show('history');
      });
      picker.append(b);
    }
    this.chart = document.createElement('canvas');
    this.chart.className = 'chart';
    this.chart.addEventListener('pointermove', (e) => {
      const r = this.chart!.getBoundingClientRect();
      this.hoverX = e.clientX - r.left;
      this.drawChart();
    });
    this.chart.addEventListener('pointerleave', () => {
      this.hoverX = -1;
      this.drawChart();
    });
    this.tip = el('div', { className: 'chart-tip' });
    this.tip.hidden = true;
    this.legend = el('div', { className: 'legend' });
    const wrap = el('div', { className: 'chart-wrap' }, [this.chart, this.tip]);
    return [
      modes,
      el('div', { className: 'panel-sub', text: t('stats.pick', { n: MAX_SERIES }) }),
      picker,
      this.legend,
      wrap,
    ];
  }

  /** Werte je Serie: Bestand oder Produktion pro Minute zwischen zwei Stichproben. */
  private seriesValues(ty: WareType): { minute: number; value: number }[] {
    const samples = this.world().stats[this.player].samples;
    const k = WARE_TYPES.indexOf(ty);
    const perMinute = (SIM.TICKS_PER_SECOND * 60) / STATS.SAMPLE_INTERVAL_TICKS;
    const out: { minute: number; value: number }[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const minute = s.tick / (SIM.TICKS_PER_SECOND * 60);
      if (this.mode === 'stock') out.push({ minute, value: s.stock[k] });
      else if (i > 0)
        out.push({ minute, value: (s.produced[k] - samples[i - 1].produced[k]) * perMinute });
    }
    return out;
  }

  private drawChart(): void {
    const canvas = this.chart;
    if (!canvas || !canvas.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 520;
    const cssH = canvas.clientHeight || 220;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = CHART_BG;
    ctx.fillRect(0, 0, cssW, cssH);
    const series = this.selected.map((ty, i) => ({
      ty,
      color: SERIES[i],
      data: this.seriesValues(ty),
    }));
    this.legend?.replaceChildren(
      ...series.map((s) =>
        el('span', { className: 'legend-item' }, [
          el('span', { className: 'swatch' }),
          wareIcon(s.ty),
          tDyn(`ware.${s.ty}`),
        ]),
      ),
    );
    this.legend
      ?.querySelectorAll<HTMLElement>('.swatch')
      .forEach((sw, i) => (sw.style.background = series[i].color));
    const points = series.flatMap((s) => s.data);
    ctx.font = '11px Trebuchet MS, sans-serif';
    if (points.length < 2) {
      ctx.fillStyle = AXIS_TEXT;
      ctx.fillText(t('stats.noData'), 12, cssH / 2);
      if (this.tip) this.tip.hidden = true;
      return;
    }
    const pad = { l: 40, r: 70, t: 10, b: 24 };
    const x0 = Math.min(...points.map((p) => p.minute));
    const x1 = Math.max(...points.map((p) => p.minute));
    const yMax = niceMax(Math.max(1, ...points.map((p) => p.value)));
    const px = (m: number): number =>
      pad.l + ((m - x0) / Math.max(1e-6, x1 - x0)) * (cssW - pad.l - pad.r);
    const py = (v: number): number => cssH - pad.b - (v / yMax) * (cssH - pad.t - pad.b);
    // Raster und Achsen (zurückhaltend)
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.fillStyle = AXIS_TEXT;
    ctx.textAlign = 'right';
    for (let k = 0; k <= 4; k++) {
      const v = (yMax * k) / 4;
      const y = Math.round(py(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(cssW - pad.r, y);
      ctx.stroke();
      ctx.fillText(formatValue(v), pad.l - 6, y + 4);
    }
    for (let k = 0; k <= 4; k++) {
      const m = x0 + ((x1 - x0) * k) / 4;
      ctx.textAlign = k === 0 ? 'left' : k === 4 ? 'right' : 'center';
      ctx.fillText(t('stats.minuteShort', { m: Math.round(m) }), px(m), cssH - 6);
    }
    // Linien (2 px)
    for (const s of series) {
      if (s.data.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.data.forEach((p, i) =>
        i ? ctx.lineTo(px(p.minute), py(p.value)) : ctx.moveTo(px(p.minute), py(p.value)),
      );
      ctx.stroke();
    }
    // Direkte Beschriftung am Linienende, überlappungsfrei innerhalb der Zeichenfläche
    const labels = series
      .filter((s) => s.data.length > 0)
      .map((s) => {
        const lastP = s.data[s.data.length - 1];
        return {
          text: `${tDyn(`ware.${s.ty}`)} ${formatValue(lastP.value)}`,
          y: py(lastP.value) + 4,
        };
      })
      .sort((a, b) => a.y - b.y);
    const minY = pad.t + 10;
    const maxY = cssH - pad.b;
    for (let k = 0; k < labels.length; k++) {
      labels[k].y = Math.max(labels[k].y, minY, k ? labels[k - 1].y + 12 : minY);
    }
    for (let k = labels.length - 1; k >= 0; k--) {
      labels[k].y = Math.min(labels[k].y, k < labels.length - 1 ? labels[k + 1].y - 12 : maxY);
    }
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'left';
    for (const l of labels) ctx.fillText(l.text, cssW - pad.r + 6, l.y);
    // Fadenkreuz und Tooltip
    if (this.hoverX >= pad.l && this.hoverX <= cssW - pad.r && this.tip) {
      const minute = x0 + ((this.hoverX - pad.l) / (cssW - pad.l - pad.r)) * (x1 - x0);
      const ref = series.find((s) => s.data.length > 0)!.data;
      let best = ref[0];
      for (const p of ref)
        if (Math.abs(p.minute - minute) < Math.abs(best.minute - minute)) best = p;
      const hx = Math.round(px(best.minute)) + 0.5;
      ctx.strokeStyle = 'rgba(246, 234, 208, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, pad.t);
      ctx.lineTo(hx, cssH - pad.b);
      ctx.stroke();
      const rows = series.map((s) => {
        const p = s.data.find((q) => q.minute === best.minute);
        if (p) {
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(hx, py(p.value), 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = CHART_BG;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        return `${tDyn(`ware.${s.ty}`)}: ${p ? formatValue(p.value) : '–'}`;
      });
      this.tip.textContent = [t('stats.minuteShort', { m: best.minute.toFixed(1) }), ...rows].join(
        '\n',
      );
      this.tip.hidden = false;
      this.tip.style.left = `${Math.min(hx + 12, cssW - 150)}px`;
      this.tip.style.top = `${pad.t + 4}px`;
    } else if (this.tip) {
      this.tip.hidden = true;
    }
  }

  // --- Siedler -------------------------------------------------------------------------

  private peopleView(w: World): HTMLElement[] {
    const inStore: Record<string, number> = {};
    const active: Record<string, number> = {};
    for (const id in w.buildings) {
      const b = w.buildings[id];
      if (b.owner !== this.player) continue;
      for (const j of JOBS) inStore[j] = (inStore[j] ?? 0) + b.people[j];
    }
    for (const id in w.settlers) {
      const s = w.settlers[id];
      if (s.owner === this.player) active[s.job] = (active[s.job] ?? 0) + 1;
    }
    const table = el('table', { className: 'stats-table' });
    table.append(
      el('tr', {}, [
        el('th', { text: t('stats.people.job') }),
        el('th', { text: t('stats.people.count') }),
        el('th', { text: t('stats.people.idle') }),
      ]),
    );
    for (const j of JOBS) {
      const total = (inStore[j] ?? 0) + (active[j] ?? 0);
      if (!total) continue;
      table.append(
        el('tr', {}, [
          el('td', { text: tDyn(`job.${j}`) }),
          el('td', { text: String(total) }),
          el('td', { text: String(inStore[j] ?? 0) }),
        ]),
      );
    }
    // Arbeitsplätze, die mangels Werkzeug unbesetzt bleiben
    const missing = new Map<string, number>();
    const stores = Object.values(w.buildings).filter((b) => b.owner === this.player && isStore(b));
    for (const id in w.buildings) {
      const b = w.buildings[id];
      if (b.owner !== this.player || w.settlers[b.worker]) continue;
      const job = neededJob(b) as Job | null;
      const tool = job ? JOB_TOOLS[job] : null;
      if (!job || !tool || stores.some((s) => canSupply(s, job))) continue;
      missing.set(tool, (missing.get(tool) ?? 0) + 1);
    }
    const list = el('div', { className: 'missing-tools' });
    if (missing.size === 0) list.append(el('div', { text: t('stats.missingNone') }));
    for (const [tool, n] of missing) {
      list.append(
        el('div', { className: 'warn ware-name' }, [
          wareIcon(tool as WareType),
          t('stats.missingRow', { tool: tDyn(`ware.${tool}`), n }),
        ]),
      );
    }
    const ledger = w.ledger[this.player].wares;
    const byRank = [0, 0, 0, 0, 0];
    for (const id in w.buildings) {
      const b = w.buildings[id];
      if (b.owner === this.player) for (const r of b.soldiers) byRank[r]++;
    }
    for (const id in w.settlers) {
      const s = w.settlers[id];
      if (s.owner === this.player && s.job === 'soldier') byRank[s.rank]++;
    }
    const ranks = el('div', { className: 'ranks' });
    byRank.forEach((n, r) => {
      const pill = el('span', {
        className: `rank rank-${r}`,
        text: t('stats.rankRow', { rank: tDyn(`rank.${r}`), n }),
      });
      ranks.append(pill);
    });
    return [
      table,
      el('div', { className: 'panel-sub', text: t('stats.missingTools') }),
      list,
      el('div', { className: 'panel-sub', text: t('stats.soldiers') }),
      ranks,
      el('div', { text: t('stats.weapons', { s: ledger.sword, h: ledger.shield }) }),
    ];
  }

  // --- Werkzeuge -----------------------------------------------------------------------

  private toolsView(w: World): HTMLElement[] {
    const p = w.players[this.player];
    const grid = el('div', { className: 'tool-sliders' });
    for (const tool of TOOL_WARES) {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(TOOLS.PRIORITY_MAX);
      input.value = String(p.toolPriority[tool]);
      const value = el('span', { className: 'slider-value', text: input.value });
      input.addEventListener('input', () => {
        value.textContent = input.value;
        this.enqueue({
          type: 'setToolPriority',
          player: this.player,
          tool,
          value: Number(input.value),
        });
      });
      this.sliders.set(tool, input);
      const stock = el('span', {
        className: 'slider-stock',
        text: `× ${w.ledger[this.player].wares[tool]}`,
      });
      stock.dataset.tool = tool;
      grid.append(
        el('div', { className: 'slider-row' }, [
          el('span', { className: 'ware-name' }, [wareIcon(tool), tDyn(`ware.${tool}`)]),
          input,
          value,
          stock,
        ]),
      );
    }
    // Waffen: eigene Regler für die Waffenschmiede, dazu die möglichen neuen Soldaten.
    const weapons = el('div', { className: 'tool-sliders' });
    for (const weapon of WEAPON_WARES) {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(WEAPONS.PRIORITY_MAX);
      input.value = String(p.weaponPriority[weapon]);
      const value = el('span', { className: 'slider-value', text: input.value });
      input.addEventListener('input', () => {
        value.textContent = input.value;
        this.enqueue({
          type: 'setWeaponPriority',
          player: this.player,
          weapon,
          value: Number(input.value),
        });
      });
      this.sliders.set(`w:${weapon}`, input);
      const stock = el('span', {
        className: 'slider-stock',
        text: `× ${w.ledger[this.player].wares[weapon]}`,
      });
      stock.dataset.tool = weapon;
      weapons.append(
        el('div', { className: 'slider-row' }, [
          el('span', { className: 'ware-name' }, [wareIcon(weapon), tDyn(`ware.${weapon}`)]),
          input,
          value,
          stock,
        ]),
      );
    }
    const recruits = el('div', { className: 'panel-foot recruits' });
    recruits.dataset.recruits = '1';
    recruits.textContent = this.recruitText(w);
    return [
      el('div', { className: 'panel-foot', text: t('stats.toolsHint') }),
      grid,
      el('div', { className: 'panel-sub', text: t('stats.weaponsTitle') }),
      el('div', { className: 'panel-foot', text: t('stats.weaponsHint') }),
      weapons,
      recruits,
    ];
  }

  private recruitText(w: World): string {
    const l = w.ledger[this.player].wares;
    return t('stats.recruits', { n: Math.min(l.sword, l.shield) });
  }

  // --- Verteilung ----------------------------------------------------------------------

  private distributionView(w: World): HTMLElement[] {
    const p = w.players[this.player];
    const out: HTMLElement[] = [el('div', { className: 'panel-foot', text: t('stats.distHint') })];
    for (const g of DISTRIBUTION_GROUP_IDS) {
      const group = DISTRIBUTION_GROUPS[g];
      out.push(
        el('div', { className: 'panel-sub dist-head' }, [
          ...group.wares.map((ware) => wareIcon(ware)),
          t(`stats.dist.${g}`),
        ]),
      );
      const grid = el('div', { className: 'tool-sliders' });
      for (const building of group.consumers) {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = String(DISTRIBUTION.MAX);
        input.value = String(p.distribution[g][building]);
        const value = el('span', { className: 'slider-value', text: input.value });
        input.addEventListener('input', () => {
          value.textContent = input.value;
          this.enqueue({
            type: 'setDistribution',
            player: this.player,
            group: g,
            building,
            value: Number(input.value),
          });
        });
        this.sliders.set(`${g}:${building}`, input);
        grid.append(
          el('div', { className: 'slider-row' }, [
            el('span', { className: 'ware-name', text: tDyn(`building.${building}`) }),
            input,
            value,
            el('span'),
          ]),
        );
      }
      out.push(grid);
    }
    return out;
  }

  private updateDistribution(w: World): void {
    const p = w.players[this.player];
    for (const [key, input] of this.sliders) {
      const [g, building] = key.split(':') as [DistributionGroupId, string];
      if (document.activeElement !== input) input.value = String(p.distribution[g][building]);
    }
  }

  private updateSliders(w: World): void {
    const p = w.players[this.player];
    for (const [key, input] of this.sliders) {
      if (document.activeElement === input) continue;
      input.value = key.startsWith('w:')
        ? String(p.weaponPriority[key.slice(2) as WeaponWare])
        : String(p.toolPriority[key as keyof typeof p.toolPriority]);
    }
    const recruits = this.body.querySelector<HTMLElement>('[data-recruits]');
    if (recruits) recruits.textContent = this.recruitText(w);
    this.body.querySelectorAll<HTMLElement>('.slider-stock').forEach((s) => {
      s.textContent = `× ${w.ledger[this.player].wares[s.dataset.tool as WareType]}`;
    });
  }
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
