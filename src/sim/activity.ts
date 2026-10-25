/**
 * Was macht ein Betrieb gerade? Abgeleitet aus Zustand, Arbeiter und Lager (nur Anzeige, kein
 * Spielzustand): arbeitet, macht Pause, Arbeiter unterwegs oder steht still mit Grund.
 */
import { BUILDINGS } from '../data/buildings';
import { JOB_TOOLS, type WareType } from '../data/wares';
import { canSupply, neededJob, wanted } from './buildings';
import type { Building } from './entities';
import { isStore } from './store';
import type { World } from './world';

export type StallReason =
  'noWorker' | 'noTool' | 'noRoad' | 'noResources' | 'outputBlocked' | 'waitingInput' | 'noOrders';

export interface Activity {
  kind: 'working' | 'resting' | 'arriving' | 'stalled' | 'none';
  reason?: StallReason;
  /** Fehlende Eingangswaren bzw. das fehlende Werkzeug. */
  missing: WareType[];
}

const WORKING_STATES = new Set(['producing', 'harvest', 'toResource', 'toFlagOut', 'enterHome']);

/** Hat der Spieler ein Lager, das diesen Beruf stellen kann (vorhanden oder ausrüstbar)? */
function jobAvailable(world: World, owner: number, b: Building): boolean {
  const job = neededJob(b);
  if (!job) return true;
  for (const id in world.buildings) {
    const s = world.buildings[id];
    if (s.owner === owner && isStore(s) && !s.site && canSupply(s, job)) return true;
  }
  return false;
}

function toolInStock(world: World, owner: number, tool: WareType): boolean {
  for (const id in world.buildings) {
    const s = world.buildings[id];
    if (s.owner === owner && isStore(s) && s.stock[tool] > 0) return true;
  }
  return false;
}

/** `connected`: Gebäudeflagge ist über Straßen mit einem Lager verbunden. */
export function buildingActivity(world: World, b: Building, connected: boolean): Activity {
  const def = BUILDINGS[b.type];
  if (b.site || !def.worker || isStore(b)) return { kind: 'none', missing: [] };
  const stalled = (reason: StallReason, missing: WareType[] = []): Activity => ({
    kind: 'stalled',
    reason,
    missing,
  });
  if (!connected) return stalled('noRoad');
  const worker = world.settlers[b.worker];
  if (!worker || worker.home !== b.id) {
    // Ein Lager kann den Beruf stellen: Der Arbeiter wird gleich losgeschickt.
    if (jobAvailable(world, b.owner, b)) return { kind: 'arriving', missing: [] };
    const tool = JOB_TOOLS[def.worker];
    if (tool && !toolInStock(world, b.owner, tool)) return stalled('noTool', [tool]);
    return stalled('noWorker');
  }
  if (worker.state === 'toBuilding') return { kind: 'arriving', missing: [] };
  if (worker.state === 'outputWait' || b.status === 'outputBlocked')
    return stalled('outputBlocked');
  if (WORKING_STATES.has(worker.state)) return { kind: 'working', missing: [] };
  switch (b.status) {
    case 'noResources':
      return stalled('noResources');
    case 'noOrders':
      return stalled('noOrders');
    case 'waitingInput': {
      const want = wanted(b);
      const missing = (Object.keys(want) as WareType[]).filter((t) => b.stock[t] <= 0);
      // Bergwerke brauchen nur eine Nahrungssorte; erst wenn alle fehlen, steht es still.
      const starving = def.consumesAny.length
        ? def.consumesAny.every((t) => b.stock[t] <= 0)
        : Object.entries(def.consumes).some(([t, n]) => b.stock[t as WareType] < (n ?? 0));
      return starving ? stalled('waitingInput', missing) : { kind: 'resting', missing: [] };
    }
    default:
      return { kind: 'resting', missing: [] };
  }
}
