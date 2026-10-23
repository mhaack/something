import { Terrain } from '../data/terrain';

export type RGB = [number, number, number];

function hex(h: string): RGB {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function ramp(...colors: string[]): RGB[] {
  return colors.map(hex);
}

/** Helligkeitsrampen pro Terraintyp, dunkel → hell. */
export const TERRAIN_RAMPS: Record<number, RGB[]> = {
  [Terrain.Water]: ramp('#0c2448', '#123468', '#1a4684', '#2559a0', '#3470b8', '#4a8ad0'),
  [Terrain.Swamp]: ramp('#1e2a14', '#2a3a1c', '#364a22', '#44582a', '#566a34', '#6a7c40'),
  [Terrain.Meadow1]: ramp('#1f4410', '#2b5a14', '#387018', '#46861e', '#589c26', '#70b232'),
  [Terrain.Meadow2]: ramp('#244a12', '#305e16', '#3e741a', '#4e8820', '#62a02a', '#7cb838'),
  [Terrain.Meadow3]: ramp('#2a4614', '#385a18', '#466e1e', '#568426', '#6a9a30', '#84b03e'),
  [Terrain.Desert]: ramp('#6a5228', '#806434', '#987a40', '#b0904e', '#c6a65e', '#dcbe74'),
  [Terrain.Mountain]: ramp('#3a3028', '#4c4034', '#5e5042', '#726252', '#887664', '#a08c78'),
  [Terrain.Snow]: ramp('#6c7488', '#8890a4', '#a4acbe', '#c0c8d6', '#dce2ec', '#f4f8fc'),
};

/** Spielerfarben (HQ-Marker, später Flaggen/Grenzen). */
export const PLAYER_COLORS: RGB[] = [
  hex('#3060e0'),
  hex('#d03030'),
  hex('#e0c020'),
  hex('#a040c0'),
];

export function rgbCss(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** 4x4-Bayer-Matrix für geordnetes Dithering, Werte in [0,1). */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
