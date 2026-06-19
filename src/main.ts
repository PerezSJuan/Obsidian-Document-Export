import {
  MarkdownView,
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
import { normalizeNote } from './docsComposers/normalizer.js';
import { assemble } from './docsComposers/assembler.js';
import { ExportManager } from './docsComposers/exportManager.js';
import { LatexCreator } from './docsComposers/creators/latexCreator.js';
import { PdfCreator } from './docsComposers/creators/pdfCreator.js';
import { DocxCreator } from './docsComposers/creators/docxCreator.js';
import { ObsidianAssetResolver } from './infra/obsidianAssetResolver.js';
import { joinVaultPath, normalizeVaultRelativePath } from './utils/vaultPath.js';

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
      name: 'Export document',
      callback: () => {
        const modal = new ExportVaultModal(this.app);
        modal.onExport = (config) => this.runExport(config);
        modal.open();
      },
    });

    this.addCommand({
      id: 'export-document-check',
      name: 'Export document (when in Markdown)',
      checkCallback: (checking: boolean) => {
        const markdownView =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          if (!checking) {
            const modal = new ExportVaultModal(this.app);
            modal.onExport = (config) => this.runExport(config);
            modal.open();
          }
          return true;
        }
        return false;
      },
    });

    this.addSettingTab(new DocumentExportSettingTab(this.app, this));
  }

  onunload() {}

  private async runExport(config: ExportConfig): Promise<void> {
    const vault = this.app.vault;
    const notes: NormalizedNote[] = [];
    const saveFolder = normalizeVaultRelativePath(config.output.savePath, this.vaultBasePath);

    const normalizeOpts = {
      wikilinkMode: config.structure.wikilinkMode,
      tagMode: config.structure.tagMode,
      noteNameMode: config.structure.noteNameMode,
    };

    if (config.source.mode === 'manifest') {
      const file = vault.getAbstractFileByPath(config.source.indexNotePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error('Index note not found: ' + config.source.indexNotePath);
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
      throw new Error('No notes to export');
    }

    const bookMd = assemble(notes, config);
    const results = await this.exportManager.runPipeline(bookMd, config, this.assetResolver);

    if (results.length === 0) {
      throw new Error('No output formats selected');
    }

    for (const result of results) {
      const savePath = joinVaultPath(saveFolder, result.fileName);

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

      if (result.extraFiles) {
        for (const extra of result.extraFiles) {
          const extraPath = joinVaultPath(saveFolder, extra.name);
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
        }
      }
    }

    new Notice('Export complete: ' + results.map(r => r.fileName).join(', '));
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<DocumentExportSettings>,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
