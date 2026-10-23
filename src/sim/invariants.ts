import { WARE_TYPES, emptyWareCounts, type WareCounts } from '../data/wares';
import type { World } from './world';

/** Zählt alle Waren eines Spielers in der Welt: Lager, Flaggen, Träger (Ware-Entities). */
export function countWares(world: World, player: number): WareCounts {
  const out = emptyWareCounts();
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.owner !== player) continue;
    for (const t of WARE_TYPES) out[t] += b.stock[t];
  }
  for (const id in world.wares) {
    const w = world.wares[id];
    if (w.owner === player) out[w.type]++;
  }
  return out;
}

/**
 * Prüft die Konsistenz des Weltzustands. Liefert eine Liste von Fehlern (leer = alles in Ordnung).
 * Wird von Tests und optional im Debug-Modus verwendet.
 */
export function checkInvariants(world: World): string[] {
  const errors: string[] = [];
  for (const p of world.players) {
    const counted = countWares(world, p.id);
    for (const t of WARE_TYPES) {
      if (counted[t] !== world.ledger[p.id].wares[t]) {
        errors.push(
          `Spieler ${p.id}: ${t} gezählt ${counted[t]}, Buch ${world.ledger[p.id].wares[t]}`,
        );
      }
    }
  }
  for (const id in world.wares) {
    const w = world.wares[id];
    const onFlag = w.flag ? world.flags[w.flag]?.wares.includes(w.id) : false;
    const carried = w.carrier ? world.settlers[w.carrier]?.ware === w.id : false;
    if (Number(!!onFlag) + Number(!!carried) !== 1) {
      errors.push(
        `Ware ${w.id} hat keinen eindeutigen Ort (Flagge ${w.flag}, Träger ${w.carrier})`,
      );
    }
    if (w.reservedBy && !world.settlers[w.reservedBy]) {
      errors.push(`Ware ${w.id} reserviert von fehlendem Siedler ${w.reservedBy}`);
    }
  }
  for (const id in world.flags) {
    const f = world.flags[id];
    for (const wid of f.wares) {
      if (world.wares[wid]?.flag !== f.id) errors.push(`Flagge ${f.id}: Ware ${wid} inkonsistent`);
    }
    for (const r of f.roads) {
      if (r > 0 && !world.roads[r]) errors.push(`Flagge ${f.id}: Straße ${r} fehlt`);
    }
    if (world.nodeFlag[f.node] !== f.id) errors.push(`Flagge ${f.id}: Knotenbelegung falsch`);
  }
  for (const id in world.roads) {
    const r = world.roads[id];
    if (!world.flags[r.flagA] || !world.flags[r.flagB]) errors.push(`Straße ${r.id}: Flagge fehlt`);
    for (let i = 1; i < r.path.length - 1; i++) {
      if (world.nodeRoad[r.path[i]] !== r.id) errors.push(`Straße ${r.id}: Knoten ${r.path[i]}`);
    }
    for (const sid of r.carriers) {
      if (sid && world.settlers[sid]?.road !== r.id) errors.push(`Straße ${r.id}: Träger ${sid}`);
    }
  }
  for (const id in world.settlers) {
    const s = world.settlers[id];
    if (s.ware && world.wares[s.ware]?.carrier !== s.id) {
      errors.push(`Siedler ${s.id}: Ware ${s.ware} inkonsistent`);
    }
  }
  return errors;
}
