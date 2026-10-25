import { describe, expect, it } from 'vitest';
import { WARE_TYPES } from '../src/data/wares';
import { WARE_ART, WARE_H, WARE_W } from '../src/render/wareArt';

describe('Warenbilder', () => {
  for (const type of WARE_TYPES) {
    it(`${type}: Raster ${WARE_W}×${WARE_H}, alle Zeichen in der Palette`, () => {
      const art = WARE_ART[type];
      expect(art.rows).toHaveLength(WARE_H);
      for (const row of art.rows) {
        expect(row.length, row).toBe(WARE_W);
        for (const ch of row) if (ch !== '.') expect(art.pal[ch], `${type} '${ch}'`).toBeDefined();
      }
    });
  }
});
