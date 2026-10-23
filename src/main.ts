import { MAP, START, VIEW } from './data/balance';
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
import { InfoPanel, Popup, Toast } from './ui/panels';
import { Tools } from './ui/tools';
import { GameClock } from './ui/clock';
import { DebugOverlay } from './ui/debugOverlay';
import { t } from './ui/i18n';
import { Input } from './ui/input';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function readOptions(): { seed: string; size: number; players: number } {
  const p = new URLSearchParams(location.search);
  const size = Number(p.get('size'));
  const players = Number(p.get('players'));
  return {
    seed: p.get('seed') ?? String(Math.floor(Math.random() * 1e6)),
    size: (MAP.SIZES as readonly number[]).includes(size) ? size : MAP.DEFAULT_SIZE,
    players:
      players >= START.MIN_PLAYERS && players <= START.MAX_PLAYERS
        ? players
        : START.MIN_PLAYERS + 1,
  };
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
  info = new InfoPanel($('info'));
  toast = new Toast($('toast'));
  tools: Tools;
  private mouseX = -1;
  private mouseY = -1;
  private lastFrame = performance.now();
  private fps = 60;
  private frameMs = 0;
  private tickMs = 0;
  private minimapVisible = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.world = createWorld(readOptions());
    this.tools = new Tools({
      world: () => this.world,
      player: 0,
      enqueue: (c) => this.pending.push(c),
      popup: this.popup,
      info: this.info,
      toast: this.toast,
      setHint: (text) => {
        $('help').textContent = text ?? t('hud.help');
        $('help').classList.toggle('mode', !!text);
      },
      debugVisible: () => this.debug.visible,
    });
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
    });
    this.setupMinimapInput();
    $('minimap-title').textContent = t('hud.minimap');
    $('help').textContent = t('hud.help');
    window.addEventListener('resize', () => this.resize());
    this.resize();
    centerOnNode(this.cam, this.world.map, this.world.players[0].hqNode);
    this.updateHud();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  private newMap(): void {
    const opts = readOptions();
    opts.seed = String(Math.floor(Math.random() * 1e6));
    const url = new URL(location.href);
    url.searchParams.set('seed', opts.seed);
    history.replaceState(null, '', url);
    this.world = createWorld(opts);
    this.pending = [];
    this.replay = [];
    this.tools.reset();
    this.renderer.setWorld(this.world);
    this.minimap.setWorld(this.world);
    this.resize();
    centerOnNode(this.cam, this.world.map, this.world.players[0].hqNode);
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

  private onKey(code: string): void {
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
      case 'KeyM':
        this.minimapVisible = !this.minimapVisible;
        $('minimap-panel').hidden = !this.minimapVisible;
        break;
      case 'KeyN':
        this.newMap();
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
    $('hud-status').textContent = this.clock.paused
      ? t('hud.paused')
      : t('hud.speed', { speed: this.clock.speed });
    $('hud-seed').textContent = t('hud.seed', { seed: this.world.seed });
    const modes: string[] = [];
    if (this.tools.buildHelp) modes.push(t('hud.buildHelp'));
    if (this.tools.congestion) modes.push(t('hud.congestion'));
    $('hud-modes').textContent = modes.join(' · ');
  }

  private frame(ts: number): void {
    const dt = Math.min(250, ts - this.lastFrame);
    this.lastFrame = ts;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1000 / dt : 60) * 0.05;

    // Tastatur-Scrollen
    const [ax, ay] = this.input.scrollAxis();
    if (ax || ay) {
      const d = (VIEW.KEY_SCROLL_SPEED * dt) / 1000;
      this.cam.x += ax * d;
      this.cam.y += ay * d;
      clampCamera(this.cam, this.world.map);
    }

    // Simulation
    const ticks = this.clock.advance(dt);
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) step(this.world, this.applyPending());
    // In der Pause werden Befehle sofort angewendet (entspricht dem Beginn des nächsten Ticks).
    if (ticks === 0 && this.pending.length > 0) {
      for (const c of this.applyPending()) applyCommand(this.world, c);
    }
    if (ticks > 0) this.tickMs = (performance.now() - t0) / ticks;

    // Rendering
    const r0 = performance.now();
    const hover = this.mouseX >= 0 ? this.pick(this.mouseX, this.mouseY) : -1;
    if (hover !== this.hoverNode || this.tools.roadPath) this.tools.hover(hover);
    this.hoverNode = hover;
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
    });
    this.info.refresh();
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
