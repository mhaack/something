/** Dialog zum Speichern und Laden: Spielplätze im Browser sowie Export und Import als Datei. */
import { SAVE } from '../data/balance';
import type { SaveMeta } from '../sim/save';
import { formatTime } from './goalsPanel';
import { t } from './i18n';
import { icon } from './icons';
import { el } from './panels';
import { deleteSave, listSaves, pickSaveFile, readSave, type SlotInfo } from './saveStore';

export interface SaveHost {
  /** Speichert das laufende Spiel in einen Platz. */
  save(slot: string): Promise<void>;
  /** Lädt einen Spielstand (JSON); liefert false bei Fehler (Meldung zeigt der Host). */
  load(json: string): boolean;
  /** Exportiert das laufende Spiel als Datei. */
  exportFile(): void;
  toast(text: string, kind?: 'warn' | 'info'): void;
}

export class SaveDialog {
  private root: HTMLElement;
  private title: HTMLElement;
  private body: HTMLElement;
  private mode: 'save' | 'load' = 'save';

  constructor(
    parent: HTMLElement,
    private host: SaveHost,
  ) {
    const close = el('button', { className: 'panel-close' }, [icon('close')]);
    close.title = t('action.close');
    close.addEventListener('click', () => this.hide());
    this.title = el('div', { className: 'panel-title' });
    this.body = el('div', { className: 'menu-body' });
    const box = el('div', { className: 'panel stats-box menu-box' }, [
      el('div', { className: 'panel-head' }, [this.title, close]),
      this.body,
    ]);
    this.root = el('div', { className: 'stats-overlay save-overlay' }, [box]);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
  }

  show(mode: 'save' | 'load'): void {
    this.mode = mode;
    this.title.textContent = t(mode === 'save' ? 'save.titleSave' : 'save.titleLoad');
    this.root.hidden = false;
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    let saves: SlotInfo[] = [];
    let storage = true;
    try {
      saves = await listSaves();
    } catch {
      storage = false;
    }
    const bySlot = new Map(saves.map((s) => [s.slot, s.meta]));
    const slots = Array.from({ length: SAVE.SLOTS }, (_, i) => `slot${i + 1}`);
    if (this.mode === 'load') slots.unshift(SAVE.AUTO_SLOT);
    const rows: HTMLElement[] = [];
    if (!storage) rows.push(el('p', { className: 'warn', text: t('save.noStorage') }));
    else {
      for (const slot of slots) rows.push(this.row(slot, bySlot.get(slot)));
    }
    const file =
      this.mode === 'save'
        ? this.button(t('save.export'), () => this.host.exportFile())
        : this.button(t('save.import'), async () => {
            const json = await pickSaveFile();
            if (json && this.host.load(json)) this.hide();
          });
    rows.push(el('div', { className: 'menu-actions' }, [file]));
    this.body.replaceChildren(...rows);
  }

  private row(slot: string, meta: SaveMeta | undefined): HTMLElement {
    const label =
      slot === SAVE.AUTO_SLOT ? t('save.auto') : t('save.slot', { n: slot.replace('slot', '') });
    const info = meta
      ? `${meta.name} · ${t('save.gameTime', { time: formatTime(meta.tick) })} · ${new Date(
          meta.savedAt,
        ).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`
      : t('save.empty');
    const actions: HTMLElement[] = [];
    if (this.mode === 'save') {
      actions.push(
        this.button(meta ? t('save.overwrite') : t('save.save'), async () => {
          try {
            await this.host.save(slot);
            this.host.toast(t('save.saved'), 'info');
            this.hide();
          } catch {
            this.host.toast(t('save.failed'));
          }
        }),
      );
    } else if (meta) {
      actions.push(
        this.button(t('save.load'), async () => {
          const json = await readSave(slot).catch(() => null);
          if (!json) return this.host.toast(t('save.failed'));
          if (this.host.load(json)) this.hide();
        }),
      );
    }
    if (meta) {
      actions.push(
        this.button(
          t('save.delete'),
          async () => {
            await deleteSave(slot).catch(() => undefined);
            void this.refresh();
          },
          'chip',
        ),
      );
    }
    return el('div', { className: 'save-row' }, [
      el('div', { className: 'save-info' }, [
        el('div', { className: 'mission-title', text: label }),
        el('div', { className: meta ? 'menu-note' : 'menu-note dim', text: info }),
      ]),
      el('div', { className: 'save-actions' }, actions),
    ]);
  }

  private button(text: string, fn: () => void | Promise<void>, cls = 'menu-start'): HTMLElement {
    const b = el('button', { className: cls, text });
    b.addEventListener('click', () => void fn());
    return b;
  }
}
