import {
  Plugin,
  TFile,
  TFolder,
  Vault,
  Notice,
} from 'obsidian';
import {
  DEFAULT_SETTINGS,
  DocumentExportSettings,
  DocumentExportSettingTab,
} from './settings.js';
import { ExportVaultModal, ExportProgressModal } from './exportModal/index.js';
import type { ExportConfig, NormalizedNote, NoteMapEntry } from './types.js';
import { normalizeNote, resolveEmbeds, resolveImagePaths, parseFrontmatter, resolveTitle } from './docsComposers/normalizer.js';
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

    const progressModal = new ExportProgressModal(this.app);
    progressModal.open();

    try {
      const normalizeOpts = {
        wikilinkMode: config.structure.wikilinkMode,
        tagMode: config.structure.tagMode,
        noteNameMode: config.structure.noteNameMode,
      };

      const rawContents = new Map<string, string>()

      if (config.source.mode === 'manifest') {
        const indexFile = vault.getAbstractFileByPath(config.source.indexNotePath);
        if (!indexFile || !(indexFile instanceof TFile)) {
          throw new Error(t('error-index-not-found') + ': ' + config.source.indexNotePath);
        }
        const indexContent = await vault.read(indexFile);
        rawContents.set(indexFile.path, indexContent);
        notes.push(normalizeNote(indexContent, indexFile.path, normalizeOpts));

        const linkRegex = /\[\[([^\]]+?)\]\]/g;
        const mdFiles = vault.getMarkdownFiles();
        const seen = new Set<string>([indexFile.path]);
        let linkMatch: RegExpExecArray | null;
        while ((linkMatch = linkRegex.exec(indexContent)) !== null) {
          const inner = linkMatch[1]?.trim();
          if (!inner) continue;
          const target = inner.split('|')[0]?.trim()?.split('#')[0]?.trim();
          if (!target || seen.has(target)) continue;
          const linkedFile = mdFiles.find(
            (f) => f.basename === target || f.path === target + '.md' || f.path.endsWith('/' + target + '.md'),
          );
          if (!linkedFile) continue;
          seen.add(linkedFile.path);
          const rawContent = await vault.read(linkedFile);
          rawContents.set(linkedFile.path, rawContent);
          notes.push(normalizeNote(rawContent, linkedFile.path, normalizeOpts));
        }
      } else {
        const total = config.source.selectedNotes.length;
        for (let i = 0; i < total; i++) {
          const path = config.source.selectedNotes[i]!;
          progressModal.setProgress(i, total, t('progress-reading'));
          const file = vault.getAbstractFileByPath(path);
          if (!file || !(file instanceof TFile)) continue;
          const rawContent = await vault.read(file);
          rawContents.set(file.path, rawContent)
          notes.push(normalizeNote(rawContent, file.path, normalizeOpts));
        }
      }

      if (notes.length === 0) {
        throw new Error(t('error-no-notes'));
      }

      progressModal.setProgress(1, 6, t('progress-processing'));
      for (const note of notes) {
        note.content = resolveImagePaths(note.content, note.path)
      }

      const noteMap = new Map<string, NoteMapEntry>()
      for (const note of notes) {
        const basename = note.path.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '')
        const rawContent = rawContents.get(note.path) ?? note.content
        const entry: NoteMapEntry = { content: note.content, rawContent, path: note.path }
        if (basename) noteMap.set(basename, entry)
        noteMap.set(note.path.replace(/\.md$/i, ''), entry)
        noteMap.set(note.title, entry)
      }

      progressModal.setProgress(2, 6, t('progress-processing'));
      await expandNoteMapWithEmbeds(noteMap, vault, normalizeOpts)

      for (const note of notes) {
        note.content = resolveEmbeds(note.content, noteMap, config.structure.wikilinkMode, note.path)
      }

      progressModal.setProgress(3, 6, t('progress-processing'));
      const bookMd = assemble(notes, config);
      const results = await this.exportManager.runPipeline(bookMd, config, this.assetResolver, (cur, total, msg) => progressModal.setProgress(3 + cur, 6 + total - 1, msg));

      if (results.length === 0) {
        throw new Error(t('error-no-formats'));
      }

      const writtenExtraPaths: string[] = []

      progressModal.setProgress(6, 6, t('progress-saving'));

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
            writtenExtraPaths.push(extraPath);
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

      // Cleanup: remove temporary image files from the export folder
      // KaTeX formulas are always removed (LaTeX uses native math)
      // Mermaid/PDF embeds are kept only for LaTeX (it references actual files)
      for (const extraPath of writtenExtraPaths) {
        const fileName = extraPath.split('/').pop() ?? '';
        const isFormula = fileName.startsWith('virtual_formula');
        const isMermaid = fileName.startsWith('virtual_mermaid');
        const isPdfPage = fileName.startsWith('virtual_pdf');

        const shouldDelete = isFormula || ((!isMermaid && !isPdfPage) ? false : !config.output.formats.latex);

        if (shouldDelete) {
          const file = vault.getAbstractFileByPath(extraPath);
          if (file && file instanceof TFile) {
            await this.app.fileManager.trashFile(file);
          }
        }
      }

      progressModal.close();
      new Notice(t('notice-export-complete') + ': ' + results.map(r => r.fileName).join(', '));
    } catch (err) {
      progressModal.close();
      throw err;
    }
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

async function expandNoteMapWithEmbeds(
  noteMap: Map<string, NoteMapEntry>,
  vault: Vault,
  normalizeOpts: { wikilinkMode: string; tagMode: string; noteNameMode: string },
): Promise<void> {
  const embedRe = /!\[\[([^|[\]]+)(?:\|([^[\]]+))?\]\]/g
  const allFiles = vault.getMarkdownFiles()
  const fileLookup = new Map<string, TFile>()
  const titleLookup = new Map<string, TFile>()
  
  for (const f of allFiles) {
    const basename = f.name.replace(/\.md$/i, '')
    fileLookup.set(basename, f)
    fileLookup.set(f.path, f)
    fileLookup.set(f.path.replace(/\.md$/i, ''), f)
    
    // Also build title lookup for notes with titles
    const rawContent = await vault.read(f)
    const { frontmatter } = parseFrontmatter(rawContent)
    const title = resolveTitle(frontmatter, f.path)
    if (title && title !== basename) {
      titleLookup.set(title, f)
    }
  }

  let foundNew = true
  while (foundNew) {
    foundNew = false
    const toAdd = new Map<string, TFile>()

    for (const entry of [...noteMap.values()]) {
      embedRe.lastIndex = 0
      let match
      while ((match = embedRe.exec(entry.content)) !== null) {
        const target = match[1]!.trim()
        const hashIdx = target.indexOf('#')
        const baseName = hashIdx >= 0 ? target.slice(0, hashIdx) : target

        if (!noteMap.has(baseName) && !toAdd.has(baseName)) {
          let file = fileLookup.get(baseName)
          if (!file) {
            file = titleLookup.get(baseName)
          }
          if (file) toAdd.set(baseName, file)
        }
      }
    }

    for (const [, file] of toAdd) {
      const rawContent = await vault.read(file)
      const normalized = normalizeNote(rawContent, file.path, normalizeOpts)
      normalized.content = resolveImagePaths(normalized.content, file.path)
      const entry: NoteMapEntry = { content: normalized.content, rawContent, path: file.path }
      const basename = file.name.replace(/\.md$/i, '')
      const pathWithoutExt = file.path.replace(/\.md$/i, '')
      noteMap.set(basename, entry)
      noteMap.set(pathWithoutExt, entry)
      noteMap.set(normalized.title, entry)
      foundNew = true
    }
  }
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
