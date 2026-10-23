/**
 * Territorium: Besetzte Militärgebäude und Hauptquartiere beanspruchen Knoten in ihrem Radius.
 *
 * Konfliktregel (deterministisch, ohne Löcher und Inseln):
 * 1. Ein Knoten bleibt beim bisherigen Besitzer, solange ein Gebäude dieses Besitzers ihn
 *    beansprucht. Sonst gewinnt der nächste Anspruch, bei Gleichstand die kleinere Gebäude-ID.
 * 2. Gebietsteile ohne Verbindung zu einem eigenen beanspruchenden Gebäude fallen an den nächsten
 *    anderen Anspruch bzw. werden neutral.
 * 3. Neutrale Flächen, die vollständig von einem Spieler umschlossen sind (ohne Kartenrand),
 *    gehören diesem Spieler.
 */
import { BUILDING_VALUES, MILITARY } from '../data/balance';
import { isMilitaryType } from '../data/buildings';
import { DIRS, gridDistance, neighbor, nodeX, nodeY, nodesInRadius } from './geometry';
import type { Building } from './entities';
import type { World } from './world';

/** Beansprucht dieses Gebäude Gebiet? (HQ immer, Militärgebäude ab dem ersten Soldaten.) */
export function claimsTerritory(b: Building): boolean {
  if (b.type === 'hq') return true;
  return isMilitaryType(b.type) && !b.site && b.soldiers.length > 0;
}

export function claimRadius(b: Building): number {
  return b.type === 'hq' ? MILITARY.HQ_RADIUS : BUILDING_VALUES[b.type].radius;
}

interface Claim {
  owner: number;
  dist: number;
  id: number;
}

function better(a: Claim, b: Claim | undefined): boolean {
  return !b || a.dist < b.dist || (a.dist === b.dist && a.id < b.id);
}

/**
 * Berechnet das Gebiet neu. Liefert die Knoten, deren Besitzer sich geändert hat.
 * Im Radius frisch eroberter Gebäude (`forced`) gilt nur der nächste Anspruch.
 */
export function recomputeTerritory(world: World, forced: readonly number[] = []): number[] {
  const map = world.map;
  const n = map.width * map.height;
  // Beste Ansprüche je Knoten: insgesamt und je Spieler.
  const best: (Claim | undefined)[] = new Array(n);
  const byOwner = new Map<number, Map<number, Claim>>();
  const centers = new Map<number, number[]>();
  for (const id of Object.keys(world.buildings)) {
    const b = world.buildings[Number(id)];
    if (!claimsTerritory(b)) continue;
    const bx = nodeX(map, b.node);
    const by = nodeY(map, b.node);
    if (!centers.has(b.owner)) centers.set(b.owner, []);
    centers.get(b.owner)!.push(b.node);
    let own = byOwner.get(b.owner);
    if (!own) byOwner.set(b.owner, (own = new Map()));
    for (const k of nodesInRadius(map, b.node, claimRadius(b))) {
      const c: Claim = {
        owner: b.owner,
        dist: gridDistance(bx, by, nodeX(map, k), nodeY(map, k)),
        id: b.id,
      };
      if (better(c, best[k])) best[k] = c;
      if (better(c, own.get(k))) own.set(k, c);
    }
  }
  const contested = new Uint8Array(n);
  for (const id of forced) {
    const b = world.buildings[id];
    if (b && claimsTerritory(b))
      for (const k of nodesInRadius(map, b.node, claimRadius(b))) contested[k] = 1;
  }
  const next = new Array<number>(n).fill(-1);
  for (let k = 0; k < n; k++) {
    const prev = world.owner[k];
    if (!contested[k] && prev >= 0 && byOwner.get(prev)?.has(k)) next[k] = prev;
    else if (best[k]) next[k] = best[k]!.owner;
  }
  // 2. Zusammenhang: nur von eigenen Zentren aus erreichbare Knoten bleiben.
  const reached = new Uint8Array(n);
  for (const [owner, starts] of centers) {
    const queue = starts.filter((s) => next[s] === owner);
    for (const s of queue) reached[s] = 1;
    for (let q = 0; q < queue.length; q++) {
      for (const d of DIRS) {
        const m = neighbor(map, queue[q], d);
        if (m >= 0 && !reached[m] && next[m] === owner) {
          reached[m] = 1;
          queue.push(m);
        }
      }
    }
  }
  for (let k = 0; k < n; k++) {
    if (next[k] < 0 || reached[k]) continue;
    let alt: Claim | undefined;
    for (const [owner, claims] of byOwner) {
      if (owner === next[k]) continue;
      const c = claims.get(k);
      if (c && better(c, alt)) alt = c;
    }
    next[k] = alt ? alt.owner : -1;
  }
  // 3. Eingeschlossene neutrale Flächen auffüllen.
  const seen = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (next[k] >= 0 || seen[k]) continue;
    const comp = [k];
    seen[k] = 1;
    let border = false;
    const touching = new Set<number>();
    for (let q = 0; q < comp.length; q++) {
      const c = comp[q];
      const x = nodeX(map, c);
      const y = nodeY(map, c);
      if (x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1) border = true;
      for (const d of DIRS) {
        const m = neighbor(map, c, d);
        if (m < 0) continue;
        if (next[m] >= 0) touching.add(next[m]);
        else if (!seen[m]) {
          seen[m] = 1;
          comp.push(m);
        }
      }
    }
    if (!border && touching.size === 1) {
      const owner = [...touching][0];
      for (const c of comp) next[c] = owner;
    }
  }
  const changed: number[] = [];
  for (let k = 0; k < n; k++) {
    if (next[k] !== world.owner[k]) {
      changed.push(k);
      world.owner[k] = next[k];
    }
  }
  if (changed.length) world.mapRevision++;
  return changed;
}
