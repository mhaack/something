import { MAP, TRANSPORT, TREES, VIEW } from '../data/balance';
import { MapObject, Terrain } from '../data/terrain';
import type { Settler } from '../sim/entities';
import { canPlaceFlag } from '../sim/flags';
import { DIRS, neighbor } from '../sim/geometry';
import { slopeClass } from '../sim/roads';
import { buildSize } from '../sim/buildings';
import { buildProgress } from '../sim/workers';
import { treeStage, treeVariant } from '../sim/trees';
import type { BuildingType } from '../data/buildings';
import type { Building } from '../sim/entities';
import { hash2 } from '../sim/rng';
import { plannedRoute, waitingFor } from '../sim/routing';
import type { World } from '../sim/world';
import { nodeWorldX, nodeWorldY, type Camera } from './camera';
import { HEIGHT_PX, TH, TW } from './constants';
import { PLAYER_COLORS } from './palette';
import {
  FLAG_FRAMES,
  ROCK_SIZES,
  TREE_FRAMES,
  WALK_FRAMES,
  WORK_FRAMES,
  buildSprites,
  type Sprite,
  type SpriteSet,
} from './sprites';
import { TerrainCache } from './terrainCache';

export interface RenderStats {
  chunksDrawn: number;
  objectsDrawn: number;
  settlersDrawn: number;
  cachedChunks: number;
}

export interface RoadPreview {
  path: number[];
  tentative: number[];
  valid: boolean;
}

export interface RenderOptions {
  hoverNode: number;
  /** Spieler, aus dessen Sicht gezeichnet wird (Bauhilfe). */
  player: number;
  animMs: number;
  roadPreview: RoadPreview | null;
  buildHelp: boolean;
  congestion: boolean;
  debug: boolean;
  selectedWare: number;
  selectedNode: number;
  /** Knoten für eine halbtransparente Vorschauflagge (-1 = keine). */
  ghostFlag: number;
  /** Halbtransparente Gebäudevorschau. */
  ghostBuilding: { node: number; type: BuildingType } | null;
}

/** Ablageplätze der Waren um den Flaggenmast (relativ zum Knoten). */
const WARE_SLOTS: [number, number][] = [
  [-5, 1],
  [5, 1],
  [-9, -1],
  [9, -1],
  [-5, -3],
  [5, -3],
  [-9, 3],
  [9, 3],
  [-13, 1],
  [13, 1],
];

const DIGITS = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
  '111100111001111',
  '111100111101111',
  '111001010010010',
  '111101111101111',
  '111101111001111',
];

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private terrain: TerrainCache;
  private sprites: SpriteSet;
  private alpha = 0;
  private anim = 0;
  private revision = -1;
  private heightsSeen: Int16Array = new Int16Array(0);
  stats: RenderStats = { chunksDrawn: 0, objectsDrawn: 0, settlersDrawn: 0, cachedChunks: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    private world: World,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.terrain = new TerrainCache(world.map);
    this.sprites = buildSprites(PLAYER_COLORS);
  }

  setWorld(world: World): void {
    this.world = world;
    this.terrain = new TerrainCache(world.map);
    this.revision = -1;
  }

  /** Erkennt geänderte Höhen (Planierer) und verwirft betroffene Terrain-Chunks. */
  private syncMap(): void {
    const w = this.world;
    if (w.mapRevision === this.revision) return;
    const h = w.map.heights;
    if (this.heightsSeen.length !== h.length || this.revision < 0) {
      this.heightsSeen = Int16Array.from(h);
    } else {
      const changed: number[] = [];
      for (let i = 0; i < h.length; i++) {
        if (h[i] !== this.heightsSeen[i]) {
          changed.push(i);
          this.heightsSeen[i] = h[i];
        }
      }
      if (changed.length) this.terrain.invalidateNodes(changed);
    }
    this.revision = w.mapRevision;
  }

  get terrainCache(): TerrainCache {
    return this.terrain;
  }

  resize(cam: Camera): void {
    if (this.canvas.width !== cam.width || this.canvas.height !== cam.height) {
      this.canvas.width = cam.width;
      this.canvas.height = cam.height;
    }
  }

  draw(cam: Camera, alpha: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    this.alpha = alpha;
    this.anim = opts.animMs;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cam.width, cam.height);
    const camX = Math.round(cam.x);
    const camY = Math.round(cam.y);
    this.syncMap();
    this.drawTerrain(cam, camX, camY);
    this.drawWater(cam, camX, camY, opts.animMs);
    this.drawRoads(cam, camX, camY, opts);
    if (opts.roadPreview) this.drawRoadPreview(camX, camY, opts.roadPreview);
    this.drawScene(cam, camX, camY, opts);
    if (opts.congestion) this.drawCongestion(camX, camY);
    if (opts.debug) this.drawDebug(camX, camY, opts);
    this.stats.cachedChunks = this.terrain.size;
  }

  private nodePos(i: number, camX: number, camY: number): [number, number] {
    const map = this.world.map;
    const x = i % map.width;
    const y = (i / map.width) | 0;
    return [nodeWorldX(x, y) - camX, nodeWorldY(y, map.heights[i]) - camY];
  }

  private drawTerrain(cam: Camera, camX: number, camY: number): void {
    const t = this.terrain;
    t.beginFrame();
    const n = t.chunkSize;
    const maxH = MAP.MAX_HEIGHT * HEIGHT_PX;
    const cx0 = Math.max(0, Math.floor((camX - TW) / (n * TW)));
    const cx1 = Math.min(t.chunksX - 1, Math.floor((camX + cam.width + TW) / (n * TW)));
    const cy0 = Math.max(0, Math.floor((camY - 2 * TH) / (n * TH)));
    const cy1 = Math.min(t.chunksY - 1, Math.floor((camY + cam.height + maxH) / (n * TH)));
    let drawn = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = t.get(cx, cy);
        if (!c) continue;
        this.ctx.drawImage(c.canvas, c.x - camX, c.y - camY);
        drawn++;
      }
    }
    this.stats.chunksDrawn = drawn;
  }

  /** Pixel-Linie mit quadratischem Pinsel (Bresenham). */
  private line(x0: number, y0: number, x1: number, y1: number, size: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const o = size >> 1;
    for (;;) {
      ctx.fillRect(x0 - o, y0 - o, size, size);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  private onScreen(x: number, y: number, margin = 40): boolean {
    return (
      x > -margin &&
      y > -margin &&
      x < this.canvas.width + margin &&
      y < this.canvas.height + margin
    );
  }

  private drawRoads(_cam: Camera, camX: number, camY: number, opts: RenderOptions): void {
    for (const id in this.world.roads) {
      const r = this.world.roads[id];
      const pts = r.path.map((n) => this.nodePos(n, camX, camY));
      if (!pts.some(([x, y]) => this.onScreen(x, y))) continue;
      const edge = r.busy ? '#5e5a50' : '#5a4224';
      const fill = r.busy ? '#a8a294' : '#9a7444';
      for (let i = 1; i < pts.length; i++) {
        this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 4, edge);
      }
      for (let i = 1; i < pts.length; i++) {
        this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 2, fill);
      }
      if (r.busy) {
        this.ctx.fillStyle = '#76726a';
        for (let i = 1; i < pts.length; i++) {
          const mx = (pts[i - 1][0] + pts[i][0]) >> 1;
          const my = (pts[i - 1][1] + pts[i][1]) >> 1;
          this.ctx.fillRect(mx, my, 1, 1);
        }
      }
      if (opts.congestion) {
        const load = waitingFor(this.world, r.flagA, r.id) + waitingFor(this.world, r.flagB, r.id);
        if (load > 0) {
          const c = load >= 6 ? '#ff3020' : load >= 3 ? '#ffa020' : '#e0e040';
          for (let i = 1; i < pts.length; i++) {
            this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 1, c);
          }
        }
      }
    }
  }

  private drawRoadPreview(camX: number, camY: number, p: RoadPreview): void {
    const all = [...p.path, ...p.tentative];
    const colors = ['#f0f0f0', '#f0d040', '#f06030'];
    for (let i = 1; i < all.length; i++) {
      const [x0, y0] = this.nodePos(all[i - 1], camX, camY);
      const [x1, y1] = this.nodePos(all[i], camX, camY);
      const committed = i < p.path.length;
      const c = colors[slopeClass(this.world, all[i - 1], all[i])];
      this.line(x0, y0, x1, y1, committed ? 3 : 1, p.valid || committed ? c : '#ff2020');
    }
    for (const n of all) {
      const [x, y] = this.nodePos(n, camX, camY);
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(x - 1, y - 1, 3, 3);
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(x, y, 1, 1);
    }
  }

  private blit(s: Sprite, x: number, y: number): void {
    this.ctx.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay));
  }

  /** Interpolierte Bildschirmposition eines Siedlers. */
  settlerPos(s: Settler, camX: number, camY: number): [number, number] {
    const [x0, y0] = this.nodePos(s.node, camX, camY);
    if (s.next < 0) return [x0, y0];
    const [x1, y1] = this.nodePos(s.next, camX, camY);
    const t = Math.min(1, (s.progress + this.alpha) / Math.max(1, s.stepTicks));
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  }

  /** Zeichnet Objekte, Gebäude, Flaggen, Grenzen und Siedler zeilenweise von hinten nach vorn. */
  private drawScene(cam: Camera, camX: number, camY: number, opts: RenderOptions): void {
    const world = this.world;
    const map = world.map;
    const maxH = MAP.MAX_HEIGHT * HEIGHT_PX;
    const y0 = Math.max(0, Math.floor((camY - TH) / TH));
    const y1 = Math.min(map.height - 1, Math.ceil((camY + cam.height + maxH + 4 * TH) / TH));
    const x0 = Math.max(0, Math.floor((camX - 2 * TW) / TW));
    const x1 = Math.min(map.width - 1, Math.ceil((camX + cam.width + 2 * TW) / TW));

    // Siedler nach Zeile einsortieren (Zeile des näheren Knotens).
    const buckets = new Map<number, Settler[]>();
    for (const id in world.settlers) {
      const s = world.settlers[id];
      const n = s.next >= 0 && s.progress * 2 >= s.stepTicks ? s.next : s.node;
      const row = (n / map.width) | 0;
      if (row < y0 || row > y1) continue;
      let b = buckets.get(row);
      if (!b) buckets.set(row, (b = []));
      b.push(s);
    }

    const flagFrame = Math.floor(opts.animMs / 180) % FLAG_FRAMES;
    let objects = 0;
    let settlers = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.width + x;
        const [sx, sy] = this.nodePos(i, camX, camY);
        if (opts.buildHelp && world.owner[i] === opts.player) this.drawBuildHelp(i, sx, sy, opts);
        if (i === opts.hoverNode || i === opts.selectedNode)
          this.drawCursor(sx, sy, i === opts.selectedNode);
        const owner = world.owner[i];
        if (owner >= 0 && this.isBorder(i, owner)) {
          this.blit(this.sprites.borderPosts[world.players[owner].color], sx, sy);
        }
        const obj = map.objects[i];
        if (obj === MapObject.None && !world.nodeRoad[i] && !world.nodeFlag[i]) {
          if (!world.nodeBuilding[i]) this.drawDecoration(i, x, y, sx, sy);
        }
        if (i === opts.ghostFlag) {
          this.ctx.globalAlpha = 0.55;
          this.blit(this.sprites.flags[world.players[opts.player].color][0], sx, sy);
          this.ctx.globalAlpha = 1;
        }
        if (obj === MapObject.Tree) {
          const data = map.objectData[i];
          const stage = treeStage(data);
          if (stage < TREES.MATURE_STAGE) {
            this.blit(this.sprites.saplings[treeVariant(data)][Math.min(2, stage)], sx, sy);
          } else {
            const phase =
              Math.floor(opts.animMs / 420 + hash2(x, y, 3) * TREE_FRAMES) % TREE_FRAMES;
            this.blit(this.sprites.trees[treeVariant(data)][phase], sx, sy);
          }
          objects++;
        } else if (obj === MapObject.Rock) {
          const size = Math.min(
            ROCK_SIZES - 1,
            Math.floor((map.objectData[i] * ROCK_SIZES) / (MAP.ROCK_STONE_MAX + 1)),
          );
          this.blit(this.sprites.rocks[i & 1][size], sx, sy);
          objects++;
        }
        const bid = world.nodeBuilding[i];
        if (bid) {
          const b = world.buildings[bid];
          if (b && b.node === i) {
            this.drawBuilding(b, sx, sy, opts);
            objects++;
          }
        } else if (opts.ghostBuilding && opts.ghostBuilding.node === i) {
          this.ctx.globalAlpha = 0.5;
          const color = world.players[opts.player].color;
          this.blit(this.sprites.buildings[opts.ghostBuilding.type][color], sx, sy);
          this.ctx.globalAlpha = 1;
        }
        const fid = world.nodeFlag[i];
        if (fid) {
          const f = world.flags[fid];
          const color = world.players[f.owner].color;
          this.blit(this.sprites.flags[color][(flagFrame + fid) % FLAG_FRAMES], sx, sy);
          f.wares.forEach((wid, k) => {
            const slot = WARE_SLOTS[k % WARE_SLOTS.length];
            this.blit(this.sprites.wares[world.wares[wid].type], sx + slot[0], sy + slot[1] + 3);
          });
          objects++;
        }
      }
      const row = buckets.get(y);
      if (row) for (const s of row) settlers += this.drawSettler(s, camX, camY);
    }
    this.stats.objectsDrawn = objects;
    this.stats.settlersDrawn = settlers;
  }

  private isBorder(i: number, owner: number): boolean {
    const w = this.world;
    for (const d of DIRS) {
      const n = neighbor(w.map, i, d);
      if (n >= 0 && w.owner[n] !== owner) return true;
    }
    return false;
  }

  private drawSettler(s: Settler, camX: number, camY: number): number {
    const [x, y] = this.settlerPos(s, camX, camY);
    if (!this.onScreen(x, y)) return 0;
    const onSite = s.state === 'building' || s.state === 'leveling';
    // Siedler im Gebäudeinneren nicht zeichnen (Bauleute auf der Baustelle schon).
    if (s.next < 0 && this.world.nodeBuilding[s.node] && !onSite) return 0;
    let facingLeft = false;
    if (s.next >= 0) {
      const [nx] = this.nodePos(s.next, camX, camY);
      const [ox] = this.nodePos(s.node, camX, camY);
      facingLeft = nx < ox;
    } else if (s.targetNode >= 0) {
      const [tx] = this.nodePos(s.targetNode, camX, camY);
      facingLeft = tx < x;
    }
    const moving = s.next >= 0;
    const frame = moving
      ? Math.floor(((s.progress + this.alpha) / Math.max(1, s.stepTicks)) * WALK_FRAMES * 2) %
        WALK_FRAMES
      : 0;
    const dir = facingLeft ? 1 : 0;
    const ware = s.ware ? this.world.wares[s.ware] : undefined;
    if (s.job === 'donkey') {
      this.blit(this.sprites.donkeys[dir][frame], x, y);
      if (ware) this.blit(this.sprites.wares[ware.type], x - (facingLeft ? -1 : 1), y - 7);
      return 1;
    }
    const color = this.world.players[s.owner].color;
    const fig = this.sprites.figures[s.job];
    const working = s.next < 0 && (s.state === 'harvest' || (onSite && s.wait > 0));
    if (working) {
      const wf = Math.floor(this.anim / 260 + s.id) % WORK_FRAMES;
      const ox = onSite ? 10 : 0;
      this.blit(fig.work[color][onSite ? 1 : dir][wf], x + ox, y + (onSite ? 6 : 0));
    } else {
      this.blit((ware ? fig.carry : fig.walk)[color][dir][frame], x, y);
      if (ware) this.blit(this.sprites.wares[ware.type], x, y - 15 + (frame % 2));
    }
    return 1;
  }

  /** Bauhilfe: Symbol für die größte mögliche Bebauung (Flagge, klein, mittel, groß, Mine). */
  private drawBuildHelp(i: number, sx: number, sy: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    const size = buildSize(this.world, opts.player, i);
    if (!size) {
      if (canPlaceFlag(this.world, opts.player, i) !== 'ok') return;
      ctx.fillStyle = '#20180c';
      ctx.fillRect(sx - 1, sy - 6, 1, 7);
      ctx.fillStyle = '#f0d040';
      ctx.fillRect(sx, sy - 6, 3, 2);
      return;
    }
    const dim = size === 'large' ? 7 : size === 'medium' ? 5 : 3;
    const color =
      size === 'mine'
        ? '#c08040'
        : size === 'large'
          ? '#f0d040'
          : size === 'medium'
            ? '#f0e070'
            : '#f8f0b0';
    // Häuschen-Symbol: dunkler Rahmen, helle Füllung, Dach
    ctx.fillStyle = '#20180c';
    ctx.fillRect(sx - (dim >> 1) - 1, sy - dim - 1, dim + 2, dim + 2);
    ctx.fillStyle = color;
    ctx.fillRect(sx - (dim >> 1), sy - dim, dim, dim);
    ctx.fillStyle = '#b03020';
    ctx.fillRect(sx - (dim >> 1), sy - dim - 2, dim, 2);
  }

  /** Gebäude, Baustelle (Absteckung, wachsender Bau mit Gerüst, Material) und Statussymbol. */
  private drawBuilding(b: Building, sx: number, sy: number, opts: RenderOptions): void {
    const color = this.world.players[b.owner].color;
    const sprite = this.sprites.buildings[b.type][color];
    if (!b.site) {
      this.blit(sprite, sx, sy);
      if (b.status === 'noResources' || b.status === 'outputBlocked') {
        const icon = this.sprites.statusIcons[b.status === 'noResources' ? 0 : 1];
        const bob = Math.floor(opts.animMs / 400) % 2;
        this.blit(icon, sx, sy - sprite.ay - 2 - bob);
      }
      return;
    }
    if (b.site.stage === 'level') {
      this.blit(this.sprites.stakes, sx, sy);
      return;
    }
    const p = buildProgress(this.world, b);
    const visible = Math.round(sprite.h * p);
    if (visible > 0) {
      const top = Math.round(sy - sprite.ay) + (sprite.h - visible);
      this.ctx.drawImage(
        sprite.canvas,
        0,
        sprite.h - visible,
        sprite.w,
        visible,
        Math.round(sx - sprite.ax),
        top,
        sprite.w,
        visible,
      );
    }
    this.blit(this.sprites.scaffolds[b.type], sx, sy);
    // Angeliefertes Material neben der Baustelle
    let k = 0;
    for (const type of ['planks', 'stone'] as const) {
      for (let n = 0; n < Math.min(4, b.stock[type]); n++, k++) {
        this.blit(this.sprites.wares[type], sx - 14 - (k % 2) * 7, sy + 2 - (k >> 1) * 3);
      }
    }
  }

  /** Rautenförmige Knotenmarkierung mit dunklem Schatten. */
  private drawCursor(sx: number, sy: number, selected: boolean): void {
    const ctx = this.ctx;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 6; k++) pts.push([sx - 6 + k, sy - (k >> 1)], [sx - 6 + k, sy + (k >> 1)]);
    for (let k = 0; k <= 6; k++) pts.push([sx + k, sy - 3 + (k >> 1)], [sx + k, sy + 3 - (k >> 1)]);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (const [x, y] of pts) ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = selected ? '#f8d848' : '#ffffff';
    for (const [x, y] of pts) ctx.fillRect(x, y, 1, 1);
  }

  /** Kleine Zierelemente (Gras, Blumen, Steine) – rein optisch, aus Knotenhash abgeleitet. */
  private drawDecoration(i: number, x: number, y: number, sx: number, sy: number): void {
    const map = this.world.map;
    const d = hash2(x, y, 4242);
    if (d > 0.3) return;
    const t = map.terrain[2 * i];
    let kind = -1;
    if (t >= Terrain.Meadow1 && t <= Terrain.Meadow3) {
      kind =
        d < 0.16
          ? d < 0.08
            ? 0
            : 1
          : d < 0.24
            ? 2 + (((d * 1000) % 3) | 0)
            : d < 0.27
              ? 6
              : d < 0.28
                ? 7
                : -1;
    } else if (t === Terrain.Mountain) kind = d < 0.14 ? 5 : -1;
    else if (t === Terrain.Desert) kind = d < 0.1 ? 8 : d < 0.14 ? 5 : -1;
    else if (t === Terrain.Swamp) kind = d < 0.2 ? 9 : -1;
    if (kind < 0) return;
    const ox = Math.round((hash2(x, y, 77) - 0.5) * 18);
    const oy = Math.round((hash2(x, y, 78) - 0.5) * 8);
    this.blit(this.sprites.decorations[kind], sx + ox, sy + oy + 2);
  }

  /** Animierte Lichtreflexe auf offenem Wasser. */
  private drawWater(cam: Camera, camX: number, camY: number, animMs: number): void {
    const map = this.world.map;
    const ctx = this.ctx;
    const y0 = Math.max(0, Math.floor(camY / TH) - 1);
    const y1 = Math.min(map.height - 1, Math.ceil((camY + cam.height) / TH) + 1);
    const x0 = Math.max(0, Math.floor(camX / TW) - 1);
    const x1 = Math.min(map.width - 1, Math.ceil((camX + cam.width) / TW) + 1);
    const t = animMs / 1000;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.width + x;
        if (map.terrain[2 * i] !== Terrain.Water || map.terrain[2 * i + 1] !== Terrain.Water)
          continue;
        const [sx, sy] = this.nodePos(i, camX, camY);
        for (let k = 0; k < 3; k++) {
          const h = hash2(x * 2 + k, y, 555);
          const period = 2.5 + h * 2.5;
          const phase = (t / period + h) % 1;
          if (phase > 0.45) continue;
          const len = phase < 0.1 ? 2 : phase < 0.25 ? 4 : 2;
          const px = sx + Math.round(hash2(x, y * 2 + k, 556) * 28) + 2;
          const py = sy + Math.round(hash2(x * 3 + k, y, 557) * 14) + 1 + Math.round(phase * 3);
          ctx.fillStyle = phase < 0.3 ? 'rgba(200,226,250,0.85)' : 'rgba(150,190,230,0.6)';
          ctx.fillRect(px - (len >> 1), py, len, 1);
        }
      }
    }
  }

  private drawCongestion(camX: number, camY: number): void {
    const ctx = this.ctx;
    for (const id in this.world.flags) {
      const f = this.world.flags[id];
      if (f.wares.length < VIEW.CONGESTION_WARN) continue;
      const [x, y] = this.nodePos(f.node, camX, camY);
      if (!this.onScreen(x, y)) continue;
      ctx.strokeStyle = f.wares.length >= TRANSPORT.FLAG_CAPACITY ? '#ff2020' : '#ffa020';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 15.5, y - 21.5, 31, 27);
    }
  }

  private drawNumber(n: number, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    const s = String(n);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, y - 1, s.length * 4 + 1, 7);
    ctx.fillStyle = color;
    for (let k = 0; k < s.length; k++) {
      const g = DIGITS[s.charCodeAt(k) - 48];
      for (let p = 0; p < 15; p++)
        if (g[p] === '1') ctx.fillRect(x + k * 4 + (p % 3), y + ((p / 3) | 0), 1, 1);
    }
  }

  private drawDebug(camX: number, camY: number, opts: RenderOptions): void {
    for (const id in this.world.flags) {
      const f = this.world.flags[id];
      const [x, y] = this.nodePos(f.node, camX, camY);
      if (this.onScreen(x, y)) this.drawNumber(f.id, x + 4, y - 22, '#ffff80');
    }
    const w = opts.selectedWare ? this.world.wares[opts.selectedWare] : undefined;
    if (!w) return;
    const route = plannedRoute(this.world, w);
    for (let k = 1; k < route.length; k++) {
      const a = this.world.flags[route[k - 1]];
      const b = this.world.flags[route[k]];
      if (!a || !b) continue;
      const [x0, y0] = this.nodePos(a.node, camX, camY);
      const [x1, y1] = this.nodePos(b.node, camX, camY);
      this.line(x0, y0 - 2, x1, y1 - 2, 1, '#40ffff');
    }
    const carrier = w.carrier ? this.world.settlers[w.carrier] : undefined;
    const [wx, wy] = carrier
      ? this.settlerPos(carrier, camX, camY)
      : this.nodePos(this.world.flags[w.flag].node, camX, camY);
    this.ctx.strokeStyle = '#40ffff';
    this.ctx.strokeRect(Math.round(wx) - 5.5, Math.round(wy) - 20.5, 11, 22);
  }
}
