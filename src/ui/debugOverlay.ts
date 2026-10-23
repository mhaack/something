import { terrainInfo } from '../data/terrain';
import { TRI_UP } from '../sim/geometry';
import { isBuildableTerrain, isMinableTerrain, isWalkableTerrain, maxSlope } from '../sim/map';
import type { World } from '../sim/world';
import type { Camera } from '../render/camera';
import type { RenderStats } from '../render/renderer';
import { t, tDyn } from './i18n';

export interface DebugInfo {
  fps: number;
  frameMs: number;
  tickMs: number;
  render: RenderStats;
  hoverNode: number;
  selectedWare: number;
}

/** Debug-Overlay (F3). */
export class DebugOverlay {
  visible = false;

  constructor(private el: HTMLElement) {
    el.hidden = true;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  update(world: World, cam: Camera, info: DebugInfo): void {
    if (!this.visible) return;
    const yes = t('debug.yes');
    const no = t('debug.no');
    const lines = [
      `${t('debug.fps')}: ${info.fps.toFixed(0)}  ${t('debug.frame')}: ${info.frameMs.toFixed(1)} ms`,
      `${t('debug.tickTime')}: ${info.tickMs.toFixed(2)} ms  ${t('debug.tick')}: ${world.tick}`,
      `${t('debug.chunks')}: ${info.render.chunksDrawn} / ${info.render.cachedChunks}  ${t('debug.objects')}: ${info.render.objectsDrawn}`,
      `${t('debug.camera')}: ${Math.round(cam.x)},${Math.round(cam.y)}  ${t('debug.zoom')}: ${cam.zoom} (${cam.width}×${cam.height} ×${cam.scale})`,
      `${t('debug.flags')}: ${Object.keys(world.flags).length}  ${t('debug.roads')}: ${Object.keys(world.roads).length}  ${t('debug.settlers')}: ${Object.keys(world.settlers).length} (${info.render.settlersDrawn})  ${t('debug.wares')}: ${Object.keys(world.wares).length}`,
      `${t('debug.routeQueue')}: ${world.routeQueue.length}`,
    ];
    const w = info.selectedWare ? world.wares[info.selectedWare] : undefined;
    if (w) {
      lines.push(
        `${t('debug.selectedWare')}: #${w.id} ${tDyn(`ware.${w.type}`)} → ${w.destFlag ? `F${w.destFlag}` : `B${w.dest}`}`,
      );
    }
    const i = info.hoverNode;
    const map = world.map;
    if (i >= 0) {
      const x = i % map.width;
      const y = (i / map.width) | 0;
      const ter = terrainInfo(map.terrain[2 * i + TRI_UP]);
      lines.push(
        `${t('debug.node')}: ${x},${y} (#${i})  ${t('debug.height')}: ${map.heights[i]}  ${t('debug.slope')}: ${maxSlope(map, i)}`,
        `${t('debug.terrain')}: ${tDyn(`terrain.${ter.key}`)}  ${t('debug.object')}: ${tDyn(`object.${map.objects[i]}`)}`,
        `${t('debug.walkable')}: ${isWalkableTerrain(map, i) ? yes : no}  ${t('debug.buildable')}: ${isBuildableTerrain(map, i) ? yes : no}  ${t('debug.minable')}: ${isMinableTerrain(map, i) ? yes : no}`,
        `${t('debug.resource')}: ${tDyn(`resource.${map.resources[i]}`)} ${map.resourceAmounts[i] || ''}`,
      );
    }
    this.el.textContent = lines.join('\n');
  }
}
