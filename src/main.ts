import {
  AI_LEVELS,
  MAP,
  START,
  STOCK_LEVELS,
  VIEW,
  type AiLevel,
  type StockLevel,
} from './data/balance';
import { MISSIONS } from './data/missions';
import { aiCommands } from './ai';
import {
  centerOnNode,
  clampCamera,
  createCamera,
  fitCamera,
  pickNode,
  type Camera,
} from './render/camera';
import { Minimap } from './render/minimap';
import { Renderer } from './render/renderer';
import type { Command, ReplayEntry } from './sim/commands';
import { applyCommand } from './sim/commandHandlers';
import { createWorld, step, type World } from './sim/world';
import { Hud } from './ui/hud';
import { icon } from './ui/icons';
import { InfoPanel, Popup, Toast } from './ui/panels';
import { Tools } from './ui/tools';
import { StatsWindow } from './ui/statsWindow';
import { GameClock } from './ui/clock';
import { DebugOverlay } from './ui/debugOverlay';
import { t } from './ui/i18n';
import {
  GameMenu,
  markMissionDone,
  missionById,
  missionOptions,
  randomSeed,
  toWorldOptions,
  type GameOptions,
} from './ui/gameMenu';
import { GoalsPanel, OutcomeDialog, playerName } from './ui/goalsPanel';
import { Input } from './ui/input';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** Spieloptionen aus der URL (Annahme A5): seed, size, players, ai, stock oder mission. */
function readOptions(): GameOptions {
  const p = new URLSearchParams(location.search);
  const mission = missionById(Number(p.get('mission')));
  if (mission) return missionOptions(mission);
  const size = Number(p.get('size'));
  const players = Number(p.get('players'));
  const level = p.get('ai') as AiLevel;
  const stock = p.get('stock') as StockLevel;
  const total =
    players >= START.MIN_PLAYERS && players <= START.MAX_PLAYERS ? players : START.MIN_PLAYERS + 1;
  return {
    seed: p.get('seed') ?? randomSeed(),
    size: (MAP.SIZES as readonly number[]).includes(size) ? size : MAP.DEFAULT_SIZE,
    opponents: Array.from({ length: total - 1 }, () =>
      AI_LEVELS.includes(level) ? level : 'normal',
    ),
    stock: STOCK_LEVELS.includes(stock) ? stock : 'normal',
    mission: 0,
  };
}

function writeOptions(o: GameOptions): void {
  const url = new URL(location.href);
  for (const k of ['seed', 'size', 'players', 'ai', 'stock', 'mission']) url.searchParams.delete(k);
  if (o.mission) url.searchParams.set('mission', String(o.mission));
  else {
    url.searchParams.set('seed', o.seed);
    url.searchParams.set('size', String(o.size));
    url.searchParams.set('players', String(o.opponents.length + 1));
    if (o.opponents.length) url.searchParams.set('ai', o.opponents[0]);
    url.searchParams.set('stock', o.stock);
  }
  history.replaceState(null, '', url);
}

class Game {
  world: World;
  cam: Camera = createCamera();
  clock = new GameClock();
  renderer: Renderer;
  minimap: Minimap;
  debug = new DebugOverlay($('debug'));
  input: Input;
  pending: Command[] = [];
  /** Alle angewendeten Befehle mit Tick (Grundlage für Replays). */
  replay: ReplayEntry[] = [];
  hoverNode = -1;
  popup = new Popup($('popup'));
  info = new InfoPanel($('info'), icon('close'), t('action.close'));
  hud: Hud;
  stats: StatsWindow;
  toast = new Toast($('toast'));
  tools: Tools;
  options: GameOptions;
  menu: GameMenu;
  goals = new GoalsPanel(document.body);
  outcome = new OutcomeDialog(document.body);
  private outcomeShown = false;
  private defeatedSeen = new Set<number>();
  private mouseX = -1;
  private mouseY = -1;
  private lastFrame = performance.now();
  private fps = 60;
  private frameMs = 0;
  private tickMs = 0;
  private minimapVisible = true;
  private minimapRevision = 0;
  private minimapBuilt = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.options = readOptions();
    this.world = createWorld(toWorldOptions(this.options));
    this.menu = new GameMenu(document.body, this.options, (o) => this.startGame(o));
    this.hud = new Hud(document.body, {
      setMode: (m) => this.tools.setMode(m),
      toggleBuildHelp: () => this.onKey('KeyH'),
      toggleCongestion: () => this.onKey('KeyV'),
      toggleMinimap: () => this.onKey('KeyM'),
      toggleHelp: () => this.onKey('F1'),
      toggleDebug: () => this.onKey('F3'),
      toggleStats: () => this.onKey('KeyT'),
      togglePause: () => this.onKey('Space'),
      slower: () => this.onKey('Minus'),
      faster: () => this.onKey('Equal'),
      newGame: () => this.onKey('KeyN'),
    });
    this.tools = new Tools({
      world: () => this.world,
      player: 0,
      enqueue: (c) => this.pending.push(c),
      popup: this.popup,
      info: this.info,
      toast: this.toast,
      setHint: (text) => this.hud.setHint(text),
      debugVisible: () => this.debug.visible,
      onModeChange: () => {
        this.canvas.dataset.mode = this.tools.mode;
        this.updateHud();
      },
    });
    this.stats = new StatsWindow(
      document.body,
      () => this.world,
      0,
      (c) => this.pending.push(c),
    );
    this.renderer = new Renderer(canvas, this.world);
    this.minimap = new Minimap($('minimap') as HTMLCanvasElement, this.world);
    this.input = new Input(canvas, {
      onDrag: (dx, dy) => {
        this.cam.x -= dx / this.cam.scale;
        this.cam.y -= dy / this.cam.scale;
        clampCamera(this.cam, this.world.map);
      },
      onWheel: (delta, x, y) => this.zoomAt(delta > 0 ? -1 : 1, x, y),
      onMove: (x, y) => {
        this.mouseX = x;
        this.mouseY = y;
      },
      onClick: (x, y, button) => {
        const dpr = window.devicePixelRatio || 1;
        const n = this.pick(x, y);
        this.tools.click(n, button, x / dpr, y / dpr);
      },
      onKey: (code) => this.onKey(code),
      onLeave: () => {
        this.mouseX = this.mouseY = -1;
      },
    });
    this.setupMinimapInput();
    $('minimap-title').textContent = t('hud.minimap');
    this.canvas.dataset.mode = 'select';
    window.addEventListener('resize', () => this.resize());
    this.resize();
    centerOnNode(this.cam, this.world.map, this.world.players[0].hqNode);
    this.updateHud();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  startGame(o: GameOptions): void {
    this.options = o;
    writeOptions(o);
    this.world = createWorld(toWorldOptions(o));
    this.pending = [];
    this.replay = [];
    this.outcomeShown = false;
    this.defeatedSeen.clear();
    this.outcome.hide();
    this.clock.paused = false;
    this.tools.reset();
    this.renderer.setWorld(this.world);
    this.minimap.setWorld(this.world);
    this.resize();
    centerOnNode(this.cam, this.world.map, this.world.players[0].hqNode);
    this.updateHud();
  }

  /** Spielende und besiegte Gegner melden. */
  private checkOutcome(): void {
    for (const p of this.world.players) {
      if (p.id === 0 || !p.defeated || this.defeatedSeen.has(p.id)) continue;
      this.defeatedSeen.add(p.id);
      this.toast.show(t('toast.defeatedOpponent', { color: playerName(this.world, p.id) }));
    }
    const o = this.world.outcome;
    if (!o || this.outcomeShown) return;
    this.outcomeShown = true;
    this.clock.paused = true;
    const mission = this.world.setup.mission;
    if (o.result === 'won' && mission) markMissionDone(mission);
    const next = MISSIONS.find((m) => m.id === mission + 1);
    this.outcome.show(this.world, {
      continuePlaying: () => {
        this.clock.paused = false;
        this.updateHud();
      },
      newGame: () => this.menu.toggle(true),
      nextMission: mission && next ? () => this.startGame(missionOptions(next)) : null,
    });
    this.updateHud();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    fitCamera(this.cam, window.innerWidth * dpr, window.innerHeight * dpr);
    this.renderer.resize(this.cam);
    this.canvas.style.width = `${(this.cam.width * this.cam.scale) / dpr}px`;
    this.canvas.style.height = `${(this.cam.height * this.cam.scale) / dpr}px`;
    const mm = $('minimap') as HTMLCanvasElement;
    const k = Math.max(1, Math.floor(VIEW.MINIMAP_MAX_PIXELS / this.minimap.pixelWidth));
    const cssW = Math.min(VIEW.MINIMAP_MAX_PIXELS, this.minimap.pixelWidth * k);
    mm.style.width = `${cssW}px`;
    mm.style.height = `${(cssW * this.minimap.pixelHeight) / this.minimap.pixelWidth}px`;
    clampCamera(this.cam, this.world.map);
  }

  private zoomAt(dir: number, deviceX: number, deviceY: number): void {
    const z = Math.max(0, Math.min(VIEW.ZOOM_BASE_WIDTHS.length - 1, this.cam.zoom + dir));
    if (z === this.cam.zoom) return;
    const wx = this.cam.x + deviceX / this.cam.scale;
    const wy = this.cam.y + deviceY / this.cam.scale;
    this.cam.zoom = z;
    this.resize();
    this.cam.x = wx - deviceX / this.cam.scale;
    this.cam.y = wy - deviceY / this.cam.scale;
    clampCamera(this.cam, this.world.map);
  }

  private pick(deviceX: number, deviceY: number): number {
    return pickNode(
      this.world.map,
      this.cam.x + deviceX / this.cam.scale,
      this.cam.y + deviceY / this.cam.scale,
    );
  }

  private applyPending(): Command[] {
    const cmds = this.pending;
    this.pending = [];
    for (const c of cmds) this.replay.push({ tick: this.world.tick, command: c });
    return cmds;
  }

  /** Spielerbefehle und KI-Befehle für den nächsten Tick (beide landen im Replay). */
  private tickCommands(): Command[] {
    const cmds = this.applyPending();
    for (const c of aiCommands(this.world)) {
      this.replay.push({ tick: this.world.tick, command: c });
      cmds.push(c);
    }
    return cmds;
  }

  private onKey(code: string): void {
    if (this.menu.visible) {
      if (code === 'Escape' || code === 'KeyN') this.menu.toggle(false);
      this.updateHud();
      return;
    }
    if (this.outcome.visible) return;
    if (this.stats.visible && (code === 'Escape' || code === 'KeyT')) {
      this.stats.toggle(false);
      this.updateHud();
      return;
    }
    if (this.hud.helpVisible && (code === 'Escape' || code === 'F1')) {
      this.hud.setHelp(false);
      this.updateHud();
      return;
    }
    if (this.tools.key(code, this.hoverNode)) {
      this.updateHud();
      return;
    }
    switch (code) {
      case 'Space':
        this.clock.paused = !this.clock.paused;
        break;
      case 'Equal':
      case 'NumpadAdd':
      case 'BracketRight':
        this.clock.faster();
        break;
      case 'Minus':
      case 'NumpadSubtract':
      case 'Slash':
        this.clock.slower();
        break;
      case 'F3':
        this.debug.toggle();
        break;
      case 'KeyT':
        this.stats.toggle(true);
        break;
      case 'F1':
        this.hud.setHelp(!this.hud.helpVisible);
        break;
      case 'KeyM':
        this.minimapVisible = !this.minimapVisible;
        $('minimap-panel').hidden = !this.minimapVisible;
        break;
      case 'KeyN':
        this.menu.toggle(true);
        break;
      case 'PageUp':
        this.zoomAt(1, window.innerWidth / 2, window.innerHeight / 2);
        break;
      case 'PageDown':
        this.zoomAt(-1, window.innerWidth / 2, window.innerHeight / 2);
        break;
    }
    this.updateHud();
  }

  private setupMinimapInput(): void {
    const mm = $('minimap') as HTMLCanvasElement;
    let down = false;
    const jump = (e: PointerEvent): void => {
      const r = mm.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.minimap.pixelWidth;
      const py = ((e.clientY - r.top) / r.height) * this.minimap.pixelHeight;
      const [wx, wy] = this.minimap.toWorld(px, py);
      this.cam.x = wx - this.cam.width / 2;
      this.cam.y = wy - this.cam.height / 2;
      clampCamera(this.cam, this.world.map);
    };
    mm.addEventListener('pointerdown', (e) => {
      down = true;
      mm.setPointerCapture(e.pointerId);
      jump(e);
    });
    mm.addEventListener('pointermove', (e) => down && jump(e));
    mm.addEventListener('pointerup', () => (down = false));
  }

  private updateHud(): void {
    this.hud.update({
      mode: this.tools.mode,
      buildHelp: this.tools.buildHelp,
      congestion: this.tools.congestion,
      minimap: this.minimapVisible,
      debug: this.debug.visible,
      stats: this.stats?.visible ?? false,
      menu: this.menu?.visible ?? false,
      paused: this.clock.paused,
      speed: this.clock.speed,
    });
  }

  private frame(ts: number): void {
    const dt = Math.min(250, ts - this.lastFrame);
    this.lastFrame = ts;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1000 / dt : 60) * 0.05;

    // Tastatur- und Randscrollen
    let [ax, ay] = this.input.scrollAxis();
    if (this.mouseX >= 0 && !this.input.isDragging && document.hasFocus()) {
      const dpr = window.devicePixelRatio || 1;
      const m = VIEW.EDGE_SCROLL_MARGIN * dpr;
      if (this.mouseX < m) ax = -1;
      else if (this.mouseX > window.innerWidth * dpr - m) ax = 1;
      if (this.mouseY < m) ay = -1;
      else if (this.mouseY > window.innerHeight * dpr - m) ay = 1;
    }
    if (ax || ay) {
      const d = (VIEW.KEY_SCROLL_SPEED * dt) / 1000;
      this.cam.x += ax * d;
      this.cam.y += ay * d;
      clampCamera(this.cam, this.world.map);
    }

    // Simulation
    const ticks = this.clock.advance(dt);
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) step(this.world, this.tickCommands());
    // In der Pause werden Befehle sofort angewendet (entspricht dem Beginn des nächsten Ticks).
    if (ticks === 0 && this.pending.length > 0) {
      for (const c of this.applyPending()) applyCommand(this.world, c);
    }
    if (ticks > 0) this.tickMs = (performance.now() - t0) / ticks;

    // Rendering
    const r0 = performance.now();
    const hover = this.mouseX >= 0 ? this.pick(this.mouseX, this.mouseY) : -1;
    this.tools.hover(hover);
    this.hoverNode = hover;
    const dpr = window.devicePixelRatio || 1;
    this.hud.setTip(
      hover >= 0 ? this.tools.hoverInfo.tip : null,
      this.mouseX / dpr,
      this.mouseY / dpr,
    );
    this.renderer.draw(this.cam, this.clock.alpha, {
      hoverNode: this.hoverNode,
      player: 0,
      animMs: ts,
      roadPreview: this.tools.preview(),
      buildHelp: this.tools.buildHelp,
      congestion: this.tools.congestion,
      debug: this.debug.visible,
      selectedWare: this.tools.selectedWare,
      selectedNode: this.tools.selectedNode,
      ghostFlag: this.tools.hoverInfo.ghostFlag,
      ghostBuilding: this.tools.ghostBuilding,
    });
    // Minikarte nach Kartenänderungen (Bäume, Felsen, Planieren) gedrosselt neu aufbauen.
    if (this.world.mapRevision !== this.minimapRevision && ts - this.minimapBuilt > 1500) {
      this.minimap.rebuild();
      this.minimapRevision = this.world.mapRevision;
      this.minimapBuilt = ts;
    }
    this.info.refresh();
    this.stats.refresh();
    this.goals.root.hidden = this.debug.visible;
    if (!this.debug.visible) this.goals.update(this.world);
    this.checkOutcome();
    if (this.minimapVisible) this.minimap.draw(this.cam);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - r0) * 0.1;
    this.debug.update(this.world, this.cam, {
      fps: this.fps,
      frameMs: this.frameMs,
      tickMs: this.tickMs,
      render: this.renderer.stats,
      hoverNode: this.hoverNode,
      selectedWare: this.tools.selectedWare,
    });
    requestAnimationFrame((n) => this.frame(n));
  }
}

const game = new Game($('game') as HTMLCanvasElement);
// Für Entwicklertests im Browser (nur im Dev-Server).
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
