import { App, Modal, Notice, TFile } from 'obsidian';
import { NoteSuggestModal } from './noteSuggestModal.js';

type PanelId = 'source' | 'structure' | 'front' | 'output';
type ContentMode = 'manifest' | 'manual';
type HeadingMapping = 'part' | 'chapter' | 'section' | 'subsection' | 'inline' | 'paragraph' | 'bold' | 'italic';

interface HeadingMappingOption {
	value: HeadingMapping;
	label: string;
}

export class ExportVaultModal extends Modal {
	private currentPanel: PanelId = 'source';
	private contentMode: ContentMode = 'manual';
	private selectedNotes: string[] = [];
	private detectedMetadata = {
		title: '',
		subtitle: '',
		author: '',
	};
	private headingMapping: Record<string, HeadingMapping> = {
		lvl1: 'chapter',
		lvl2: 'section',
		lvl3: 'subsection',
		lvl4: 'inline',
	};
	private manualNotesListEl?: HTMLUListElement;
	private manifestSectionEl?: HTMLDivElement;
	private manualSectionEl?: HTMLDivElement;
	private wikilinkMode = 'resolve';
	private tagMode = 'keep';
	private noteNameMode = 'none';
	private indexNotePath = '';
	private dragIndex = -1;
	private parsedWikilinks: { target: string; display: string; exists: boolean }[] = [];

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.add('export-modal');

		this.modalEl.style.setProperty('width', '92vw');
		this.modalEl.style.setProperty('max-width', '92vw');
		this.modalEl.style.setProperty('height', '90vh');
		this.modalEl.style.setProperty('max-height', '90vh');

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
		this.buildSourcePanel(panelMap.source);
		this.buildStructurePanel(panelMap.structure);
		this.buildFrontPanel(panelMap.front);
		this.buildOutputPanel(panelMap.output);
		this.buildFooter(contentEl);

		this.switchPanel(this.currentPanel, navMap, panelMap);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.remove('export-modal');
		this.modalEl.style.removeProperty('width');
		this.modalEl.style.removeProperty('max-width');
		this.modalEl.style.removeProperty('height');
		this.modalEl.style.removeProperty('max-height');
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
			throw new Error('Not implemented');
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

	// ---------- Source Panel ----------
	private buildSourcePanel(container: HTMLDivElement) {
		this.buildPanelHeading(container, 'Book contents');
		this.buildContentModeSelector(container);

		this.manifestSectionEl = container.createDiv({
			cls: 'export-modal__conditional-section',
		});
		this.buildManifestSection(this.manifestSectionEl);

		this.manualSectionEl = container.createDiv({
			cls: 'export-modal__conditional-section',
		});
		this.buildManualContentsSection(this.manualSectionEl);

		this.syncContentModeSections();
		this.buildMetadataSection(container);
	}

	private buildContentModeSelector(container: HTMLDivElement) {
		const group = container.createDiv({ cls: 'export-modal__radio-group' });
		this.createRadioOption(group, 'Use index note', 'manifest');
		this.createRadioOption(group, 'Build manually', 'manual');
	}

	private buildManifestSection(container: HTMLDivElement) {
		this.buildFieldLabel(container, 'Index note');
		const row = container.createDiv({ cls: 'export-modal__inline-row' });
		const selectBtn = row.createEl('button', {
			text: 'Select note',
			cls: 'export-modal__select-button',
		});
		selectBtn.createSpan({ text: '\u25BC', cls: 'export-modal__select-caret' });
		selectBtn.addEventListener('click', () => {
			new NoteSuggestModal(this.app, (path) => {
				this.indexNotePath = path;
				this.syncManifestPreview(container);
			}).open();
		});

		const chaptersP = container.createEl('p', {
			text: 'Detected chapters: 0',
			cls: 'export-modal__sub',
		});

		const preview = container.createDiv({ cls: 'export-modal__preview-box' });
		preview.createEl('p', {
			text: 'No index note selected.',
			cls: 'export-modal__empty-state',
		});
	}

	private parseWikilinks(content: string): { target: string; display: string }[] {
		const results: { target: string; display: string }[] = [];
		const regex = /\[\[([^\]]+?)\]\]/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(content)) !== null) {
			const inner = match[1]?.trim();
			if (!inner) continue;
			const parts = inner.split('|');
			const target = parts[0]?.trim() ?? '';
			if (!target) continue;
			const display = parts.length > 1 ? (parts[1]?.trim() ?? target) : target;
			results.push({ target, display });
		}
		return results;
	}

	private noteExists(target: string): boolean {
		const name = target.split('#')[0];
		return this.app.vault.getMarkdownFiles().some(
			(f) => f.basename === name || f.path === name + '.md' || f.path.endsWith('/' + name + '.md'),
		);
	}

	private syncManifestPreview(container: HTMLDivElement) {
		const sub = container.querySelector('.export-modal__sub');
		const preview = container.querySelector('.export-modal__preview-box');
		if (!sub || !preview) return;
		preview.empty();

		if (!this.indexNotePath) {
			sub.textContent = 'Detected chapters: 0';
			preview.createEl('p', {
				text: 'No index note selected.',
				cls: 'export-modal__empty-state',
			});
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(this.indexNotePath);
		if (!(file instanceof TFile)) {
			sub.textContent = 'Detected chapters: 0';
			preview.createEl('p', {
				text: 'File not found.',
				cls: 'export-modal__empty-state',
			});
			return;
		}

		sub.textContent = 'Reading note...';

		this.app.vault.read(file).then((content) => {
			const links = this.parseWikilinks(content);
			this.parsedWikilinks = links.map((l) => ({
				...l,
				exists: this.noteExists(l.target),
			}));
			const validCount = this.parsedWikilinks.filter((l) => l.exists).length;
			const brokenCount = this.parsedWikilinks.length - validCount;
			sub.textContent = `Detected chapters: ${this.parsedWikilinks.length}`;

			preview.empty();

			if (this.parsedWikilinks.length === 0) {
				preview.createEl('p', {
					text: 'No wikilinks found in this note.',
					cls: 'export-modal__empty-state',
				});
				return;
			}

			const list = preview.createEl('ul', { cls: 'export-modal__note-list' });
			this.parsedWikilinks.forEach((link) => {
				const row = list.createEl('li', { cls: 'export-modal__note-row' });
				row.createSpan({ text: link.display, cls: 'export-modal__note-path' });
				if (!link.exists) {
					row.createSpan({
						text: 'Broken link',
						cls: 'export-modal__error-badge',
					});
				}
			});

			if (brokenCount > 0) {
				preview.createEl('p', {
					text: `${brokenCount} broken link(s) detected.`,
					cls: 'export-modal__empty-state',
					attr: { style: 'color: var(--text-error); margin-top: 6px;' },
				});
			}
		});
	}

	private buildManualContentsSection(container: HTMLDivElement) {
		this.buildFieldLabel(container, 'Selected notes');
		this.manualNotesListEl = container.createEl('ul', {
			cls: 'export-modal__note-list',
		});
		this.renderSelectedNotes();

		const addBtn = container.createEl('button', {
			text: 'Add notes',
			cls: 'export-modal__small-button',
		});
		addBtn.addEventListener('click', () => {
			new NoteSuggestModal(this.app, (path) => {
				if (!this.selectedNotes.includes(path)) {
					this.selectedNotes.push(path);
					this.renderSelectedNotes();
				}
			}).open();
		});
	}

	private buildMetadataSection(container: HTMLDivElement) {
		const section = container.createDiv({
			cls: 'export-modal__section export-modal__section--bordered',
		});
		this.buildSectionHeading(
			section,
			'Metadata',
			'Auto-filled from index note when available.',
		);

		const fields = section.createDiv({ cls: 'export-modal__field-stack' });
		this.createTextField(fields, 'Title', this.detectedMetadata.title, (value) => {
			this.detectedMetadata.title = value;
		});
		this.createTextField(fields, 'Subtitle', this.detectedMetadata.subtitle, (value) => {
			this.detectedMetadata.subtitle = value;
		});
		this.createTextField(fields, 'Author', this.detectedMetadata.author, (value) => {
			this.detectedMetadata.author = value;
		});
	}

	private createRadioOption(container: HTMLDivElement, label: string, value: ContentMode) {
		const id = `export-content-mode-${value}`;
		const option = container.createEl('label', { cls: 'export-modal__radio-option' });
		const input = option.createEl('input', {
			attr: { type: 'radio', name: 'export-content-mode', id },
		});
		input.value = value;
		input.checked = this.contentMode === value;
		option.createSpan({ text: label });
		input.addEventListener('change', () => {
			if (!input.checked) return;
			this.contentMode = value;
			this.syncContentModeSections();
		});
	}

	private syncContentModeSections() {
		if (this.manifestSectionEl) {
			this.manifestSectionEl.style.display =
				this.contentMode === 'manifest' ? 'block' : 'none';
		}
		if (this.manualSectionEl) {
			this.manualSectionEl.style.display =
				this.contentMode === 'manual' ? 'block' : 'none';
		}
	}

	private renderSelectedNotes() {
		if (!this.manualNotesListEl) return;
		this.manualNotesListEl.empty();

		if (this.selectedNotes.length === 0) {
			const empty = this.manualNotesListEl.createEl('li', {
				text: 'No notes selected.',
				cls: 'export-modal__empty-state export-modal__empty-list-item',
			});
			empty.draggable = false;
			return;
		}

		this.selectedNotes.forEach((note, index) => {
			const li = this.manualNotesListEl!.createEl('li', {
				cls: 'export-modal__note-row',
				attr: { draggable: 'true' },
			});
			li.createSpan({ cls: 'ti ti-grip-vertical export-modal__drag-handle' });
			li.createSpan({ text: String(index + 1), cls: 'export-modal__note-number' });
			li.createEl('code', { text: note, cls: 'export-modal__note-path' });
			const removeBtn = li.createSpan({
				text: '\u2715',
				cls: 'export-modal__remove-btn',
			});
			removeBtn.addEventListener('click', () => {
				this.selectedNotes.splice(index, 1);
				this.renderSelectedNotes();
			});

			li.addEventListener('dragstart', () => {
				this.dragIndex = index;
			});
			li.addEventListener('dragover', (event) => {
				event.preventDefault();
				if (this.dragIndex < 0 || this.dragIndex === index) return;
				li.style.borderTop = '2px solid var(--interactive-accent)';
			});
			li.addEventListener('dragleave', () => {
				li.style.borderTop = '';
			});
			li.addEventListener('drop', (event) => {
				event.preventDefault();
				li.style.borderTop = '';
				if (this.dragIndex < 0 || this.dragIndex === index) return;
				const moved = this.selectedNotes.splice(this.dragIndex, 1)[0];
				if (!moved) return;
				this.selectedNotes.splice(index, 0, moved);
				this.dragIndex = -1;
				this.renderSelectedNotes();
			});
		});
	}

	// ---------- Structure Panel ----------
	private buildStructurePanel(container: HTMLDivElement) {
		this.buildPanelHeading(container, 'Structure');

		this.createToggleRow(container, 'Start a new chapter at each note', true);

		this.buildHeadingMappingSection(container);
		this.buildReferencesSection(container);
	}

	private buildHeadingMappingSection(container: HTMLDivElement) {
		const section = container.createDiv({
			cls: 'export-modal__section export-modal__section--bordered',
		});
		this.buildSectionHeading(section, 'Heading mapping');

		const rows = section.createDiv({ cls: 'export-modal__field-stack' });
		const levels = [
			{ id: 'lvl1', tag: 'H1' },
			{ id: 'lvl2', tag: 'H2' },
			{ id: 'lvl3', tag: 'H3' },
			{ id: 'lvl4', tag: 'H4' },
		];

		levels.forEach((level) => {
			const row = rows.createDiv({ cls: 'export-modal__mapping-row' });
			row.createEl('code', {
				text: level.tag,
				cls: 'export-modal__mapping-level',
			});

			const select = row.createEl('select');
			this.getHeadingMappingOptions().forEach((option) => {
				select.createEl('option', {
					value: option.value,
					text: option.label,
				});
			});
			select.value = this.headingMapping[level.id] ?? 'inline';
			select.addEventListener('change', () => {
				this.headingMapping[level.id] = select.value as HeadingMapping;
			});
		});
	}

	private buildReferencesSection(container: HTMLDivElement) {
		const section = container.createDiv({
			cls: 'export-modal__section export-modal__section--bordered',
		});
		this.buildSectionHeading(section, 'References & tags');

		const fields = section.createDiv({ cls: 'export-modal__field-stack' });
		const wikilinkField = fields.createDiv({ cls: 'export-modal__field' });
		this.buildFieldLabel(wikilinkField, 'Wikilinks [[Note]]');
		const wikilinkSelect = wikilinkField.createEl('select');
		[
			{ value: 'resolve', label: 'Resolve to note title' },
			{ value: 'raw', label: 'Keep as raw text' },
			{ value: 'strip', label: 'Strip references' },
		].forEach((opt) => {
			wikilinkSelect.createEl('option', { value: opt.value, text: opt.label });
		});
		wikilinkSelect.value = this.wikilinkMode;
		wikilinkSelect.addEventListener('change', () => {
			this.wikilinkMode = wikilinkSelect.value;
		});

		const tagField = fields.createDiv({ cls: 'export-modal__field' });
		this.buildFieldLabel(tagField, 'Tags #tag');
		const tagSelect = tagField.createEl('select');
		[
			{ value: 'keep', label: 'Keep as text' },
			{ value: 'bold', label: 'Convert to bold' },
			{ value: 'strip', label: 'Strip tags' },
		].forEach((opt) => {
			tagSelect.createEl('option', { value: opt.value, text: opt.label });
		});
		tagSelect.value = this.tagMode;
		tagSelect.addEventListener('change', () => {
			this.tagMode = tagSelect.value;
		});

		const noteNameField = fields.createDiv({ cls: 'export-modal__field' });
		this.buildFieldLabel(noteNameField, 'Note name');
		const noteNameSelect = noteNameField.createEl('select');
		[
			{ value: 'none', label: 'None' },
			...this.getHeadingMappingOptions(),
		].forEach((opt) => {
			noteNameSelect.createEl('option', { value: opt.value, text: opt.label });
		});
		noteNameSelect.value = this.noteNameMode;
		noteNameSelect.addEventListener('change', () => {
			this.noteNameMode = noteNameSelect.value;
		});
	}

	private getHeadingMappingOptions(): HeadingMappingOption[] {
		return [
			{ value: 'part', label: 'Part' },
			{ value: 'chapter', label: 'Chapter' },
			{ value: 'section', label: 'Section' },
			{ value: 'subsection', label: 'Subsection' },
			{ value: 'inline', label: 'Keep inline' },
			{ value: 'paragraph', label: 'Paragraph' },
			{ value: 'bold', label: 'Bold text' },
			{ value: 'italic', label: 'Italic' },
		];
	}

	// ---------- Front Matter Panel ----------
	private buildFrontPanel(container: HTMLDivElement) {
		this.buildPanelHeading(container, 'Front matter');
		this.buildCoverPageSection(container);
		this.buildTableOfContentsSection(container);
	}

	private buildCoverPageSection(container: HTMLDivElement) {
		const section = container.createDiv({ cls: 'export-modal__section' });
		this.buildSectionHeading(section, 'Cover page');

		const coverToggle = this.createToggleRow(section, 'Enable cover page', true);

		const coverFields = section.createDiv({ cls: 'export-modal__field-stack' });
		this.createToggleRow(coverFields, 'Use book metadata', true);
		this.createPathField(coverFields, 'Cover image', '', 'Select image', () => {
			new Notice('Cover image selection is not implemented yet.');
		});

		coverToggle.addEventListener('change', () => {
			coverFields.style.display = coverToggle.checked ? 'flex' : 'none';
		});
	}

	private buildTableOfContentsSection(container: HTMLDivElement) {
		const section = container.createDiv({
			cls: 'export-modal__section export-modal__section--bordered',
		});
		this.buildSectionHeading(section, 'Table of contents');

		const tocToggle = this.createToggleRow(section, 'Enable TOC', true);

		const tocFields = section.createDiv({ cls: 'export-modal__grid' });
		const depthField = tocFields.createDiv();
		this.buildFieldLabel(depthField, 'Depth');
		const depthSelect = depthField.createEl('select');
		[1, 2, 3, 4].forEach((depth) => {
			depthSelect.createEl('option', { value: String(depth), text: String(depth) });
		});
		depthSelect.value = '2';

		this.createTextField(tocFields, 'Title', 'Contents');
		tocToggle.addEventListener('change', () => {
			tocFields.style.display = tocToggle.checked ? 'grid' : 'none';
		});
	}

	// ---------- Output Panel ----------
	private buildOutputPanel(container: HTMLDivElement) {
		this.buildPanelHeading(container, 'Output');
		this.buildFormatSection(container);
		this.buildSavePathSection(container);
	}

	private buildFormatSection(container: HTMLDivElement) {
		const section = container.createDiv({ cls: 'export-modal__section' });
		this.buildSectionHeading(section, 'Formats');

		const formats = [
			{ id: 'fmtPdf', label: 'PDF', checked: true },
			{ id: 'fmtDocx', label: 'DOCX', checked: false },
			{ id: 'fmtLatex', label: 'LaTeX source', checked: false },
		];
		formats.forEach((f) => {
			const row = section.createEl('label', { cls: 'export-modal__checkbox-row' });
			const cb = row.createEl('input', { attr: { type: 'checkbox', id: f.id } });
			cb.checked = f.checked;
			row.createSpan({ text: f.label });
		});
	}

	private buildSavePathSection(container: HTMLDivElement) {
		const section = container.createDiv({
			cls: 'export-modal__section export-modal__section--bordered',
		});
		this.buildSectionHeading(section, 'Save path');
		this.createPathField(section, 'Save to', './book', 'Browse', () => {
			new Notice('Save path selection is not implemented yet.');
		});
	}

	private buildPanelHeading(container: HTMLDivElement, title: string) {
		container.createEl('h2', { text: title, cls: 'export-modal__panel-title' });
	}

	private buildSectionHeading(container: HTMLDivElement, title: string, description?: string) {
		container.createEl('h3', { text: title, cls: 'export-modal__section-title' });
		if (description) {
			container.createEl('p', { text: description, cls: 'export-modal__sub' });
		}
	}

	private buildFieldLabel(container: HTMLElement, label: string) {
		container.createEl('p', { text: label, cls: 'export-modal__field-label' });
	}

	private createTextField(
		container: HTMLElement,
		label: string,
		value: string,
		onChange?: (value: string) => void,
	) {
		const field = container.createDiv({ cls: 'export-modal__field' });
		this.buildFieldLabel(field, label);
		const input = field.createEl('input', {
			attr: { type: 'text', value },
		});
		if (onChange) {
			input.addEventListener('input', () => onChange(input.value));
		}
	}

	private createPathField(
		container: HTMLElement,
		label: string,
		value: string,
		buttonText: string,
		onBrowse: () => void,
	) {
		const field = container.createDiv({ cls: 'export-modal__field' });
		this.buildFieldLabel(field, label);
		const row = field.createDiv({ cls: 'export-modal__path-row' });
		row.createEl('input', {
			attr: { type: 'text', value },
		});
		row.createEl('button', { text: buttonText }).addEventListener('click', onBrowse);
	}

	private createToggleRow(container: HTMLElement, label: string, initialState: boolean): HTMLInputElement {
		const row = container.createDiv({ cls: 'export-modal__setting-row' });
		row.createSpan({ text: label, cls: 'export-modal__field-label' });
		const toggleLabel = row.createEl('label', { cls: 'tg export-modal-toggle' });
		const input = toggleLabel.createEl('input', { attr: { type: 'checkbox' } });
		input.checked = initialState;
		toggleLabel.createEl('i');
		return input;
	}
}
