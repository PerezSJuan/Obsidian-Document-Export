import {
  Plugin,
  TFile,
  TFolder,
  Notice,
  normalizePath,
} from 'obsidian';
import {
  DEFAULT_SETTINGS,
  DocumentExportSettings,
  DocumentExportSettingTab,
} from './settings.js';
import { ExportVaultModal } from './exportModal.js';
import type { ExportConfig, NormalizedNote } from './types.js';
import { normalizeNote } from './docsComposers/normalizer.js';
import { assemble } from './docsComposers/assembler.js';
import { ExportManager } from './docsComposers/exportManager.js';
import { LatexCreator } from './docsComposers/creators/latexCreator.js';
import { PdfCreator } from './docsComposers/creators/pdfCreator.js';
import { DocxCreator } from './docsComposers/creators/docxCreator.js';
import { ObsidianAssetResolver } from './infra/obsidianAssetResolver.js';

export default class MyPlugin extends Plugin {
  settings!: DocumentExportSettings;
  private exportManager = new ExportManager()
  private assetResolver = new ObsidianAssetResolver(this.app.vault)

  async onload() {
    await this.loadSettings();

    this.exportManager.registerCreator('latex', new LatexCreator())
    this.exportManager.registerCreator('pdf', new PdfCreator())
    this.exportManager.registerCreator('docx', new DocxCreator())

    this.addCommand({
      id: 'export-document',
      name: 'Export document',
      callback: () => {
        const modal = new ExportVaultModal(this.app)
        modal.onExport = (config) => this.runExport(config)
        modal.open()
      },
    });

    this.addSettingTab(new DocumentExportSettingTab(this.app, this));
  }

  onunload() {}

  private async runExport(config: ExportConfig): Promise<void> {
    const vault = this.app.vault
    const notes: NormalizedNote[] = []

    if (config.source.mode === 'manifest') {
      const file = vault.getAbstractFileByPath(config.source.indexNotePath)
      if (!file || !(file instanceof TFile)) {
        new Notice('Index note not found')
        return
      }
      const content = await vault.read(file)
      notes.push(normalizeNote(content, file.path))
    } else {
      for (const path of config.source.selectedNotes) {
        const file = vault.getAbstractFileByPath(path)
        if (!file || !(file instanceof TFile)) continue
        const content = await vault.read(file)
        notes.push(normalizeNote(content, file.path))
      }
    }

    if (notes.length === 0) {
      new Notice('No notes to export')
      return
    }

    const bookMd = assemble(notes, config)
    const results = await this.exportManager.runPipeline(bookMd, config, this.assetResolver)

    for (const result of results) {
      const savePath = normalizePath(`${config.output.savePath}/${result.fileName}`)
      const existing = vault.getAbstractFileByPath(savePath)
      if (existing && existing instanceof TFile) {
        await vault.modify(existing, typeof result.data === 'string' ? result.data : '')
      } else {
        const dir = savePath.substring(0, savePath.lastIndexOf('/'))
        if (dir) {
          const folder = vault.getAbstractFileByPath(dir)
          if (!folder || !(folder instanceof TFolder)) {
            await vault.createFolder(dir)
          }
        }
        await vault.create(savePath, typeof result.data === 'string' ? result.data : '')
      }
    }

    new Notice(`Export complete: ${results.map(r => r.fileName).join(', ')}`)
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
