import { App, Modal, Notice } from 'obsidian';
import type { PanelId, ContentMode, HeadingMapping, FontFamily, PageNumberPosition, ExportConfig } from '../types.js';
import { buildSourcePanel } from './panels/source.js';
import { buildStructurePanel } from './panels/structure.js';
import { buildFrontPanel } from './panels/front.js';
import { buildOutputPanel } from './panels/output.js';

export class ExportVaultModal extends Modal {
	public onExport?: (config: ExportConfig) => Promise<void>;
	public currentPanel: PanelId = 'source';
	public contentMode: ContentMode = 'manual';
	public selectedNotes: string[] = [];
	public detectedMetadata = {
		title: '',
		subtitle: '',
		author: '',
	};
	public headingMapping: Record<string, HeadingMapping> = {
		lvl1: 'chapter',
		lvl2: 'section',
		lvl3: 'subsection',
		lvl4: 'inline',
		lvl5: 'inline',
		lvl6: 'inline',
	};
	public manualNotesListEl?: HTMLUListElement;
	public manifestSectionEl?: HTMLDivElement;
	public manualSectionEl?: HTMLDivElement;
	public wikilinkMode = 'resolve';
	public tagMode = 'keep';
	public noteNameMode = 'none';
	public indexNotePath = '';
	public dragIndex = -1;
	public parsedWikilinks: { target: string; display: string; exists: boolean }[] = [];
	public coverImagePath = '';
	public savePath = '';
	public newChapterPerNote = true;
	public enableCoverPage = true;
	public useBookMetadata = true;
	public enableToc = true;
	public tocDepth = 2;
	public tocTitle = 'Contents';
	public formats = { pdf: true, docx: false, latex: false };
	public font: FontFamily = 'times-new-roman';
	public baseFontSize = 11;
	public pageNumbersEnabled = true;
	public pageNumberPosition: PageNumberPosition = 'bottom-center';

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.add('export-modal');
		this.modalEl.classList.add('export-modal--fullscreen');

		this.buildHeader(contentEl);

		const body = contentEl.createDiv({ cls: 'export-modal__body' });
		const nav = body.createDiv({ cls: 'export-modal__nav' });
		const panelContainer = body.createDiv({ cls: 'export-modal__panel' });

		const panelMap: Record<PanelId, HTMLDivElement> = {
			source: panelContainer.createDiv(),
			structure: panelContainer.createDiv({ attr: { style: 'display:none;' } }),
			front: panelContainer.createDiv({ attr: { style: 'display:none;' } }),
			output: panelContainer.createDiv({ attr: { style: 'display:none;' } }),
		};

		const navMap = this.buildNavigation(nav, panelMap);
		buildSourcePanel(panelMap.source, this);
		buildStructurePanel(panelMap.structure, this);
		buildFrontPanel(panelMap.front, this);
		buildOutputPanel(panelMap.output, this);
		this.buildFooter(contentEl);

		this.switchPanel(this.currentPanel, navMap, panelMap);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.remove('export-modal');
		this.modalEl.classList.remove('export-modal--fullscreen');
	}

	private buildHeader(container: HTMLElement) {
		const header = container.createDiv({ cls: 'export-modal__header' });
		header.createEl('h2', {
			text: 'Export vault to book',
			cls: 'export-modal__title',
		});
	}

	private buildNavigation(
		nav: HTMLDivElement,
		panelMap: Record<PanelId, HTMLDivElement>,
	): Record<PanelId, HTMLDivElement> {
		const navItems: { id: PanelId; label: string; icon: string }[] = [
			{ id: 'source', label: 'Source', icon: 'ti ti-folder' },
			{ id: 'structure', label: 'Structure', icon: 'ti ti-hierarchy' },
			{ id: 'front', label: 'Front matter', icon: 'ti ti-file-text' },
			{ id: 'output', label: 'Output', icon: 'ti ti-download' },
		];

		const navMap = {} as Record<PanelId, HTMLDivElement>;
		navItems.forEach((item) => {
			const itemEl = nav.createDiv({
				cls: 'export-modal__nav-item',
				attr: {
					'data-target': item.id,
					role: 'button',
					tabindex: '0',
				},
			});
			itemEl.createSpan({ cls: `export-modal__nav-icon ${item.icon}` });
			itemEl.createSpan({ text: item.label, cls: 'export-modal__nav-label' });
			navMap[item.id] = itemEl;
			const activate = () => this.switchPanel(item.id, navMap, panelMap);
			itemEl.addEventListener('click', activate);
			itemEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					activate();
				}
			});
		});

		return navMap;
	}

	private buildFooter(container: HTMLElement) {
		const footer = container.createDiv({ cls: 'export-modal__footer' });
		const cancelBtn = footer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const exportBtn = footer.createEl('button', {
			text: 'Export book',
			cls: 'mod-cta',
		});
		exportBtn.addEventListener('click', () => {
			if (!this.onExport) {
				new Notice('Export pipeline not configured');
				this.close();
				return;
			}
			exportBtn.disabled = true;
			exportBtn.textContent = 'Exporting...';
			this.onExport(this.getConfig()).then(() => {
				this.close();
			}).catch((err) => {
				console.error(err);
				new Notice('Export failed: ' + ((err as Error).message || 'Unknown error'));
				this.close();
			});
		});
	}

	private switchPanel(
		id: PanelId,
		navMap: Record<PanelId, HTMLDivElement>,
		panelMap: Record<PanelId, HTMLDivElement>,
	) {
		Object.entries(navMap).forEach(([key, btn]) => {
			btn.classList.toggle('active', key === id);
		});

		Object.entries(panelMap).forEach(([key, panel]) => {
			panel.style.display = key === id ? 'block' : 'none';
		});
		this.currentPanel = id;
	}

	getConfig(): ExportConfig {
		return {
			source: {
				mode: this.contentMode,
				indexNotePath: this.indexNotePath,
				selectedNotes: [...this.selectedNotes],
				metadata: { ...this.detectedMetadata },
			},
			structure: {
				newChapterPerNote: this.newChapterPerNote,
				headingMapping: { ...this.headingMapping },
				wikilinkMode: this.wikilinkMode,
				tagMode: this.tagMode,
				noteNameMode: this.noteNameMode,
			},
			frontMatter: {
				enableCoverPage: this.enableCoverPage,
				useBookMetadata: this.useBookMetadata,
				coverImagePath: this.coverImagePath,
				toc: {
					enabled: this.enableToc,
					depth: this.tocDepth,
					title: this.tocTitle,
				},
			},
			output: {
				formats: { ...this.formats },
				savePath: this.savePath,
			},
			formatting: {
				font: this.font,
				baseFontSize: this.baseFontSize,
				pageNumbers: {
					enabled: this.pageNumbersEnabled,
					position: this.pageNumberPosition,
				},
			},
		};
	}
}
