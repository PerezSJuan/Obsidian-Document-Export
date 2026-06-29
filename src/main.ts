import {
  Plugin,
  TFile,
  TFolder,
  Notice,
} from 'obsidian';
import {
  DEFAULT_SETTINGS,
  DocumentExportSettings,
  DocumentExportSettingTab,
} from './settings.js';
import { ExportVaultModal } from './exportModal/index.js';
import type { ExportConfig, NormalizedNote } from './types.js';
import { normalizeNote, resolveEmbeds, resolveImagePaths } from './docsComposers/normalizer.js';
import { assemble } from './docsComposers/assembler.js';
import { ExportManager } from './docsComposers/exportManager.js';
import { LatexCreator } from './docsComposers/creators/latexCreator.js';
import { PdfCreator } from './docsComposers/creators/pdfCreator.js';
import { DocxCreator } from './docsComposers/creators/docxCreator.js';
import { ObsidianAssetResolver } from './infra/obsidianAssetResolver.js';
import { joinVaultPath, normalizeVaultRelativePath } from './utils/vaultPath.js';
import { t } from './i18n.js';

export default class DocumentExportPlugin extends Plugin {
  settings!: DocumentExportSettings;
  private exportManager = new ExportManager();
  private assetResolver = new ObsidianAssetResolver(this.app.vault);
  private vaultBasePath = '';

  async onload() {
    await this.loadSettings();
    this.vaultBasePath = (this.app.vault.adapter as { getBasePath?(): string }).getBasePath?.() || '';

    this.exportManager.registerCreator('latex', new LatexCreator());
    this.exportManager.registerCreator('pdf', new PdfCreator());
    this.exportManager.registerCreator('docx', new DocxCreator());

    this.addCommand({
      id: 'export-document',
      name: t('cmd-export'),
      callback: () => {
        const modal = new ExportVaultModal(this.app);
        modal.applySettings(this.settings);
        modal.onExport = (config) => this.runExport(config);
        modal.open();
      },
    });

    this.addRibbonIcon('file-down', t('ribbon-export'), () => {
      const modal = new ExportVaultModal(this.app);
      modal.applySettings(this.settings);
      modal.onExport = (config) => this.runExport(config);
      modal.open();
    });

    this.addSettingTab(new DocumentExportSettingTab(this.app, this));
  }

  onunload() {}

  private async runExport(config: ExportConfig): Promise<void> {
    const vault = this.app.vault;
    const notes: NormalizedNote[] = [];
    const saveFolder = normalizeVaultRelativePath(config.output.savePath, this.vaultBasePath);
    console.info('[Document Export] export start', {
      mode: config.source.mode,
      formats: config.output.formats,
      saveFolder,
    });

    const normalizeOpts = {
      wikilinkMode: config.structure.wikilinkMode,
      tagMode: config.structure.tagMode,
      noteNameMode: config.structure.noteNameMode,
    };

    if (config.source.mode === 'manifest') {
      const file = vault.getAbstractFileByPath(config.source.indexNotePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error(t('error-index-not-found') + ': ' + config.source.indexNotePath);
      }
      const content = await vault.read(file);
      notes.push(normalizeNote(content, file.path, normalizeOpts));
    } else {
      for (const path of config.source.selectedNotes) {
        const file = vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) continue;
        const content = await vault.read(file);
        notes.push(normalizeNote(content, file.path, normalizeOpts));
      }
    }

    if (notes.length === 0) {
      throw new Error(t('error-no-notes'));
    }

    console.info('[Document Export] notes loaded', { noteCount: notes.length })

    for (const note of notes) {
      note.content = resolveImagePaths(note.content, note.path)
    }

    const noteMap = new Map<string, { content: string; path: string }>()
    for (const note of notes) {
      const basename = note.path.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '')
      if (basename) noteMap.set(basename, { content: note.content, path: note.path })
      noteMap.set(note.title, { content: note.content, path: note.path })
    }
    for (const note of notes) {
      note.content = resolveEmbeds(note.content, noteMap, config.structure.wikilinkMode, note.path)
    }

    const bookMd = assemble(notes, config);
    console.info('[Document Export] markdown assembled', { bodyLength: bookMd.length })
    const results = await this.exportManager.runPipeline(bookMd, config, this.assetResolver);

    if (results.length === 0) {
      throw new Error(t('error-no-formats'));
    }

    console.info('[Document Export] pipeline returned results', {
      resultCount: results.length,
      fileNames: results.map(r => r.fileName),
    })

    for (const result of results) {
      const savePath = joinVaultPath(saveFolder, result.fileName);
      console.info('[Document Export] writing result', {
        format: result.format,
        savePath,
        isString: typeof result.data === 'string',
        extraFiles: result.extraFiles?.length ?? 0,
      })

      const existing = vault.getAbstractFileByPath(savePath);
      if (existing && existing instanceof TFile) {
        if (typeof result.data === 'string') {
          await vault.modify(existing, result.data);
        } else {
          await vault.modifyBinary(existing, bufferToArrayBuffer(result.data));
        }
      } else {
        const dir = savePath.substring(0, savePath.lastIndexOf('/'));
        if (dir) {
          const folder = vault.getAbstractFileByPath(dir);
          if (!folder || !(folder instanceof TFolder)) {
            await vault.createFolder(dir);
          }
        }
        if (typeof result.data === 'string') {
          await vault.create(savePath, result.data);
        } else {
          await vault.createBinary(savePath, bufferToArrayBuffer(result.data));
        }
      }

      console.info('[Document Export] wrote result', { format: result.format, savePath })

      if (result.extraFiles) {
        for (const extra of result.extraFiles) {
          const extraPath = joinVaultPath(saveFolder, extra.name);
          console.info('[Document Export] writing extra file', { extraPath })
          const extraExisting = vault.getAbstractFileByPath(extraPath);
          if (extraExisting && extraExisting instanceof TFile) {
            await vault.modifyBinary(extraExisting, extra.data);
          } else {
            const extraDir = extraPath.substring(0, extraPath.lastIndexOf('/'));
            if (extraDir) {
              const extraFolder = vault.getAbstractFileByPath(extraDir);
              if (!extraFolder || !(extraFolder instanceof TFolder)) {
                await vault.createFolder(extraDir);
              }
            }
            await vault.createBinary(extraPath, extra.data);
          }
          console.info('[Document Export] wrote extra file', { extraPath })
        }
      }
    }

    console.info('[Document Export] export complete', { files: results.map(r => r.fileName) })
    new Notice(t('notice-export-complete') + ': ' + results.map(r => r.fileName).join(', '));
  }

  async loadSettings() {
    const stored = (await this.loadData()) as Partial<DocumentExportSettings> | null;
    this.settings = stored ? this.mergeSettings(DEFAULT_SETTINGS, stored) : DEFAULT_SETTINGS;
  }

  private mergeSettings(
    defaults: DocumentExportSettings,
    stored: Partial<DocumentExportSettings>,
  ): DocumentExportSettings {
    const result: Record<string, unknown> = { ...defaults };

    for (const key of Object.keys(stored) as Array<keyof DocumentExportSettings>) {
      const storedValue = stored[key];
      if (storedValue === undefined) continue;

      if (
        storedValue &&
        typeof storedValue === 'object' &&
        !Array.isArray(storedValue)
      ) {
        result[key] = this.mergeDeep(result[key] as Record<string, unknown>, storedValue as Record<string, unknown>);
      } else {
        result[key] = storedValue;
      }
    }

    return result as unknown as DocumentExportSettings;
  }

  private mergeDeep(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.mergeDeep(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
      } else {
        result[key] = sourceValue;
      }
    }
    return result;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
