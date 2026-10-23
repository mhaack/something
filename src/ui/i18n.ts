/** Alle UI-Texte. Sprache: Deutsch. */
const de = {
  'game.title': 'Kleine Siedler',
  'hud.paused': 'Pause',
  'hud.speed': 'Tempo {speed}x',
  'hud.seed': 'Seed {seed}',
  'hud.minimap': 'Übersicht',
  'hud.help':
    'Scrollen: Ziehen mit rechter Maustaste, Pfeiltasten/WASD · Zoom: Mausrad · Leertaste: Pause · +/−: Tempo · M: Minikarte · N: neue Karte · F3: Debug',
  'debug.title': 'Debug',
  'debug.fps': 'FPS',
  'debug.frame': 'Frame-Zeit',
  'debug.tickTime': 'Tick-Zeit',
  'debug.tick': 'Tick',
  'debug.chunks': 'Terrain-Chunks',
  'debug.objects': 'Objekte',
  'debug.camera': 'Kamera',
  'debug.zoom': 'Zoom',
  'debug.node': 'Knoten',
  'debug.height': 'Höhe',
  'debug.terrain': 'Terrain',
  'debug.resource': 'Bodenschatz',
  'debug.slope': 'Steigung',
  'debug.buildable': 'Bebaubar',
  'debug.minable': 'Bergwerk möglich',
  'debug.walkable': 'Begehbar',
  'debug.yes': 'ja',
  'debug.no': 'nein',
  'terrain.water': 'Wasser',
  'terrain.swamp': 'Sumpf',
  'terrain.meadow': 'Wiese',
  'terrain.desert': 'Wüste',
  'terrain.mountain': 'Berg',
  'terrain.snow': 'Hochgebirge',
  'resource.0': 'keiner',
  'resource.1': 'Kohle',
  'resource.2': 'Eisen',
  'resource.3': 'Gold',
  'resource.4': 'Granit',
  'object.0': '–',
  'object.1': 'Baum',
  'object.2': 'Felsen',
  'debug.object': 'Objekt',
} as const;

export type TextKey = keyof typeof de;

export function t(key: TextKey, params?: Record<string, string | number>): string {
  let s: string = de[key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Für dynamisch zusammengesetzte Schlüssel (z. B. `resource.${id}`). */
export function tDyn(key: string): string {
  return (de as Record<string, string>)[key] ?? key;
}
