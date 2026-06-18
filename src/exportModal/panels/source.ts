import { TFile } from 'obsidian';
import type { ContentMode } from '../../types.js';
import type { ExportVaultModal } from '../modal.js';
import { NoteSuggestModal } from '../../noteSuggestModal.js';
import {
	buildFieldLabel,
	buildPanelHeading,
	buildSectionHeading,
	createTextField,
	noteExists,
	parseWikilinks,
} from '../helpers.js';

export function buildSourcePanel(container: HTMLDivElement, modal: ExportVaultModal) {
	buildPanelHeading(container, 'Book contents');
	buildContentModeSelector(container, modal);

	modal.manifestSectionEl = container.createDiv({ cls: 'export-modal__conditional-section' });
	buildManifestSection(modal.manifestSectionEl, modal);

	modal.manualSectionEl = container.createDiv({ cls: 'export-modal__conditional-section' });
	buildManualContentsSection(modal.manualSectionEl, modal);

	syncContentModeSections(modal);
	buildMetadataSection(container, modal);
}

function buildContentModeSelector(container: HTMLDivElement, modal: ExportVaultModal) {
	const group = container.createDiv({ cls: 'export-modal__radio-group' });
	createRadioOption(group, 'Use index note', 'manifest', modal);
	createRadioOption(group, 'Build manually', 'manual', modal);
}

function buildManifestSection(container: HTMLDivElement, modal: ExportVaultModal) {
	buildFieldLabel(container, 'Index note');
	const row = container.createDiv({ cls: 'export-modal__inline-row' });
	const selectBtn = row.createEl('button', {
		text: 'Select note',
		cls: 'export-modal__select-button',
	});
	selectBtn.createSpan({ text: '\u25BC', cls: 'export-modal__select-caret' });
	selectBtn.addEventListener('click', () => {
		new NoteSuggestModal(modal.app, (path) => {
			modal.indexNotePath = path;
			syncManifestPreview(container, modal);
		}).open();
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

function syncManifestPreview(container: HTMLDivElement, modal: ExportVaultModal) {
	const sub = container.querySelector('.export-modal__sub');
	const preview = container.querySelector('.export-modal__preview-box');
	if (!sub || !preview) return;
	preview.empty();

	if (!modal.indexNotePath) {
		sub.textContent = 'Detected chapters: 0';
		preview.createEl('p', {
			text: 'No index note selected.',
			cls: 'export-modal__empty-state',
		});
		return;
	}

	const file = modal.app.vault.getAbstractFileByPath(modal.indexNotePath);
	if (!(file instanceof TFile)) {
		sub.textContent = 'Detected chapters: 0';
		preview.createEl('p', {
			text: 'File not found.',
			cls: 'export-modal__empty-state',
		});
		return;
	}

	sub.textContent = 'Reading note...';

	modal.app.vault.read(file).then((content) => {
		const links = parseWikilinks(content);
		modal.parsedWikilinks = links.map((l) => ({
			...l,
			exists: noteExists(modal.app, l.target),
		}));
		const validCount = modal.parsedWikilinks.filter((l) => l.exists).length;
		const brokenCount = modal.parsedWikilinks.length - validCount;
		sub.textContent = `Detected chapters: ${modal.parsedWikilinks.length}`;

		preview.empty();

		if (modal.parsedWikilinks.length === 0) {
			preview.createEl('p', {
				text: 'No wikilinks found in this note.',
				cls: 'export-modal__empty-state',
			});
			return;
		}

		const list = preview.createEl('ul', { cls: 'export-modal__note-list' });
		modal.parsedWikilinks.forEach((link) => {
			const li = list.createEl('li', { cls: 'export-modal__note-row' });
			li.createSpan({ text: link.display, cls: 'export-modal__note-path' });
			if (!link.exists) {
				li.createSpan({
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
	}).catch(() => {
		sub.textContent = 'Failed to read file.';
	});
}

function buildManualContentsSection(container: HTMLDivElement, modal: ExportVaultModal) {
	buildFieldLabel(container, 'Selected notes');
	modal.manualNotesListEl = container.createEl('ul', {
		cls: 'export-modal__note-list',
	});
	renderSelectedNotes(modal);

	const addBtn = container.createEl('button', {
		text: 'Add notes',
		cls: 'export-modal__small-button',
	});
	addBtn.addEventListener('click', () => {
		new NoteSuggestModal(modal.app, (path) => {
			if (!modal.selectedNotes.includes(path)) {
				modal.selectedNotes.push(path);
				renderSelectedNotes(modal);
			}
		}).open();
	});
}

function renderSelectedNotes(modal: ExportVaultModal) {
	if (!modal.manualNotesListEl) return;
	modal.manualNotesListEl.empty();

	if (modal.selectedNotes.length === 0) {
		const empty = modal.manualNotesListEl.createEl('li', {
			text: 'No notes selected.',
			cls: 'export-modal__empty-state export-modal__empty-list-item',
		});
		empty.draggable = false;
		return;
	}

	modal.selectedNotes.forEach((note, index) => {
		const li = modal.manualNotesListEl!.createEl('li', {
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
			modal.selectedNotes.splice(index, 1);
			renderSelectedNotes(modal);
		});

		li.addEventListener('dragstart', () => {
			modal.dragIndex = index;
		});
		li.addEventListener('dragover', (event) => {
			event.preventDefault();
			if (modal.dragIndex < 0 || modal.dragIndex === index) return;
			li.classList.add('is-drag-over');
		});
		li.addEventListener('dragleave', () => {
			li.classList.remove('is-drag-over');
		});
		li.addEventListener('drop', (event) => {
			event.preventDefault();
			li.classList.remove('is-drag-over');
			if (modal.dragIndex < 0 || modal.dragIndex === index) return;
			const moved = modal.selectedNotes.splice(modal.dragIndex, 1)[0];
			if (!moved) return;
			modal.selectedNotes.splice(index, 0, moved);
			modal.dragIndex = -1;
			renderSelectedNotes(modal);
		});
	});
}

function syncContentModeSections(modal: ExportVaultModal) {
	if (modal.manifestSectionEl) {
		modal.manifestSectionEl.style.display =
			modal.contentMode === 'manifest' ? 'block' : 'none';
	}
	if (modal.manualSectionEl) {
		modal.manualSectionEl.style.display =
			modal.contentMode === 'manual' ? 'block' : 'none';
	}
}

function createRadioOption(container: HTMLDivElement, label: string, value: ContentMode, modal: ExportVaultModal) {
	const id = `export-content-mode-${value}`;
	const option = container.createEl('label', { cls: 'export-modal__radio-option' });
	const input = option.createEl('input', {
		attr: { type: 'radio', name: 'export-content-mode', id },
	});
	input.value = value;
	input.checked = modal.contentMode === value;
	option.createSpan({ text: label });
	input.addEventListener('change', () => {
		if (!input.checked) return;
		modal.contentMode = value;
		syncContentModeSections(modal);
	});
}

function buildMetadataSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({
		cls: 'export-modal__section export-modal__section--bordered',
	});
	buildSectionHeading(
		section,
		'Metadata',
		'Auto-filled from index note when available.',
	);

	const fields = section.createDiv({ cls: 'export-modal__field-stack' });
	createTextField(fields, 'Title', modal.detectedMetadata.title, (value) => {
		modal.detectedMetadata.title = value;
	});
	createTextField(fields, 'Subtitle', modal.detectedMetadata.subtitle, (value) => {
		modal.detectedMetadata.subtitle = value;
	});
	createTextField(fields, 'Author', modal.detectedMetadata.author, (value) => {
		modal.detectedMetadata.author = value;
	});
}
