import { App, Modal, Notice } from 'obsidian';

type PanelId = 'source' | 'structure' | 'front' | 'output';
type ContentMode = 'manifest' | 'manual';
type HeadingMapping = 'part' | 'chapter' | 'section' | 'subsection' | 'inline';

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
	private structurePreviewEl?: HTMLDivElement;
	private manifestSectionEl?: HTMLDivElement;
	private manualSectionEl?: HTMLDivElement;

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.add('export-modal');

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
	}

	private buildHeader(container: HTMLElement) {
		const header = container.createDiv({ cls: 'export-modal__header' });
		header.createEl('h2', {
			text: 'Export vault to book',
			cls: 'export-modal__title',
		});

		const closeBtn = header.createEl('button', {
			cls: 'export-modal__close',
			attr: { 'aria-label': 'Close' },
		});
		closeBtn.createSpan({ cls: 'ti ti-x' });
		closeBtn.addEventListener('click', () => this.close());
	}

	private buildNavigation(
		nav: HTMLDivElement,
		panelMap: Record<PanelId, HTMLDivElement>,
	): Record<PanelId, HTMLButtonElement> {
		const navItems: { id: PanelId; label: string; icon: string }[] = [
			{ id: 'source', label: 'Source', icon: 'ti ti-folder' },
			{ id: 'structure', label: 'Structure', icon: 'ti ti-hierarchy' },
			{ id: 'front', label: 'Front matter', icon: 'ti ti-file-text' },
			{ id: 'output', label: 'Output', icon: 'ti ti-download' },
		];

		const navMap = {} as Record<PanelId, HTMLButtonElement>;
		navItems.forEach((item) => {
			const btn = nav.createEl('button', {
				cls: 'export-modal__nav-btn',
				attr: { 'data-target': item.id },
			});
			btn.createSpan({ cls: item.icon });
			btn.createSpan({ text: item.label });
			navMap[item.id] = btn;
			btn.addEventListener('click', () => this.switchPanel(item.id, navMap, panelMap));
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
		navMap: Record<PanelId, HTMLButtonElement>,
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
			new Notice('Note selection is not implemented yet.');
		});

		container.createEl('p', {
			text: 'Detected chapters: 0',
			cls: 'export-modal__sub',
		});

		const preview = container.createDiv({ cls: 'export-modal__preview-box' });
		preview.createEl('p', {
			text: 'No index note selected.',
			cls: 'export-modal__empty-state',
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
			new Notice('Note selection is not implemented yet.');
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

			li.addEventListener('dragstart', (event) => {
				event.dataTransfer?.setData('text/plain', String(index));
			});
			li.addEventListener('dragover', (event) => {
				event.preventDefault();
				const dragData = event.dataTransfer?.getData('text/plain');
				const dragIndex = dragData ? parseInt(dragData, 10) : -1;
				if (dragIndex < 0 || dragIndex === index) return;

				const moved = this.selectedNotes.splice(dragIndex, 1)[0];
				if (moved === undefined) return;
				this.selectedNotes.splice(index, 0, moved);
				this.renderSelectedNotes();
			});
		});
	}

	// ---------- Structure Panel ----------
	private buildStructurePanel(container: HTMLDivElement) {
		this.buildPanelHeading(container, 'Structure');

		const chapterRow = container.createDiv({ cls: 'export-modal__setting-row' });
		chapterRow.createSpan({
			text: 'Start a new chapter at each note',
			cls: 'export-modal__label',
		});
		this.createToggle(chapterRow, true);

		this.buildHeadingMappingSection(container);
		this.buildStructurePreview(container);
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
				this.updateStructurePreview();
			});
		});
	}

	private buildStructurePreview(container: HTMLDivElement) {
		const section = container.createDiv({
			cls: 'export-modal__section export-modal__section--bordered',
		});
		this.buildSectionHeading(section, 'Preview');
		this.structurePreviewEl = section.createDiv({ cls: 'export-modal__structure-preview' });
		this.updateStructurePreview();
	}

	private updateStructurePreview() {
		if (!this.structurePreviewEl) return;
		this.structurePreviewEl.empty();

		const sample = [
			{ level: 1, text: 'Getting started' },
			{ level: 2, text: 'Installation' },
			{ level: 2, text: 'Configuration' },
			{ level: 3, text: 'Advanced options' },
		];

		sample.forEach((heading) => {
			const mapping = this.headingMapping[`lvl${heading.level}`];
			const option = this.getHeadingMappingOptions().find((item) => item.value === mapping);
			if (!option) return;

			const row = this.structurePreviewEl!.createDiv({
				cls: 'export-modal__preview-row',
			});
			row.style.marginLeft = `${(heading.level - 1) * 14}px`;
			row.createSpan({ text: option.label, cls: 'export-modal__badge' });
			row.createSpan({ text: heading.text, cls: 'export-modal__preview-text' });
		});
	}

	private getHeadingMappingOptions(): HeadingMappingOption[] {
		return [
			{ value: 'part', label: 'Part' },
			{ value: 'chapter', label: 'Chapter' },
			{ value: 'section', label: 'Section' },
			{ value: 'subsection', label: 'Subsection' },
			{ value: 'inline', label: 'Keep inline' },
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

		const coverEnabledRow = section.createDiv({ cls: 'export-modal__setting-row' });
		coverEnabledRow.createSpan({
			text: 'Enable cover page',
			cls: 'export-modal__label',
		});
		const coverToggle = this.createToggle(coverEnabledRow, true);

		const coverFields = section.createDiv({ cls: 'export-modal__field-stack' });
		const metadataRow = coverFields.createDiv({ cls: 'export-modal__setting-row' });
		metadataRow.createSpan({
			text: 'Use book metadata',
			cls: 'export-modal__label',
		});
		this.createToggle(metadataRow, true);
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

		const tocEnabledRow = section.createDiv({ cls: 'export-modal__setting-row' });
		tocEnabledRow.createSpan({ text: 'Enable TOC', cls: 'export-modal__label' });
		const tocToggle = this.createToggle(tocEnabledRow, true);

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

		this.buildPdfFormat(section);
		this.buildDocxFormat(section);
		this.buildLatexFormat(section);
	}

	private buildPdfFormat(container: HTMLDivElement) {
		const optionsDiv = container.createDiv({ cls: 'export-modal__nested-field' });
		this.buildFieldLabel(optionsDiv, 'Engine');
		const select = optionsDiv.createEl('select');
		[
			{ value: 'typst', label: 'Typst (recommended)' },
			{ value: 'tectonic', label: 'Tectonic' },
			{ value: 'xelatex', label: 'XeLaTeX' },
		].forEach((option) => {
			select.createEl('option', { value: option.value, text: option.label });
		});

		this.createFormatBlock(container, 'fmtPdf', 'PDF', true, optionsDiv);
	}

	private buildDocxFormat(container: HTMLDivElement) {
		const optionsDiv = container.createDiv({ cls: 'export-modal__nested-field' });
		this.createTextField(optionsDiv, 'Reference template path', '');
		this.createFormatBlock(container, 'fmtDocx', 'DOCX', false, optionsDiv);
	}

	private buildLatexFormat(container: HTMLDivElement) {
		const optionsDiv = container.createDiv({ cls: 'export-modal__nested-field' });
		this.buildFieldLabel(optionsDiv, 'Document class');
		const select = optionsDiv.createEl('select');
		['scrbook', 'memoir', 'book'].forEach((docClass) => {
			select.createEl('option', { value: docClass, text: docClass });
		});

		this.createFormatBlock(container, 'fmtLatex', 'LaTeX source', false, optionsDiv);
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

	private createFormatBlock(
		container: HTMLDivElement,
		id: string,
		label: string,
		checked: boolean,
		optionsEl?: HTMLDivElement,
	): HTMLDivElement {
		const wrap = container.createDiv({ cls: 'export-modal__format-block' });
		const row = wrap.createEl('label', { cls: 'export-modal__checkbox-row' });
		const checkbox = row.createEl('input', { attr: { type: 'checkbox', id } });
		checkbox.checked = checked;
		row.createSpan({ text: label });

		if (optionsEl) {
			wrap.appendChild(optionsEl);
			optionsEl.style.display = checked ? 'block' : 'none';
			checkbox.addEventListener('change', () => {
				optionsEl.style.display = checkbox.checked ? 'block' : 'none';
			});
		}

		return wrap;
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

	private createToggle(container: HTMLElement, initialState: boolean): HTMLInputElement {
		const label = container.createEl('label', { cls: 'tg export-modal-toggle' });
		const input = label.createEl('input', { attr: { type: 'checkbox' } });
		input.checked = initialState;
		label.createEl('i');
		return input;
	}
}
