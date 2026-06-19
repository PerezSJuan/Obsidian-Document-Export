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
import { t } from '../../i18n.js';

export function buildSourcePanel(container: HTMLDivElement, modal: ExportVaultModal) {
	buildPanelHeading(container, t('panel-book-contents'));
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
	createRadioOption(group, t('radio-index-note'), 'manifest', modal);
	createRadioOption(group, t('radio-build-manually'), 'manual', modal);
}

function buildManifestSection(container: HTMLDivElement, modal: ExportVaultModal) {
	buildFieldLabel(container, t('field-index-note'));
	const row = container.createDiv({ cls: 'export-modal__inline-row' });
	const selectBtn = row.createEl('button', {
		text: t('btn-select-note'),
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
		text: t('detected-chapters', { count: 0 }),
		cls: 'export-modal__sub',
	});

	container.createDiv({ cls: 'export-modal__preview-box' });
	syncManifestPreview(container, modal);
}

function syncManifestPreview(container: HTMLDivElement, modal: ExportVaultModal) {
	const sub = container.querySelector('.export-modal__sub');
	const preview = container.querySelector('.export-modal__preview-box');
	if (!sub || !preview) return;
	preview.empty();

	if (!modal.indexNotePath) {
		sub.textContent = t('detected-chapters', { count: 0 });
		preview.createEl('p', {
			text: t('no-index-note'),
			cls: 'export-modal__empty-state',
		});
		return;
	}

	const file = modal.app.vault.getAbstractFileByPath(modal.indexNotePath);
	if (!(file instanceof TFile)) {
		sub.textContent = t('detected-chapters', { count: 0 });
		preview.createEl('p', {
			text: t('file-not-found'),
			cls: 'export-modal__empty-state',
		});
		return;
	}

	sub.textContent = t('reading-note');

	modal.app.vault.read(file).then((content) => {
		const links = parseWikilinks(content);
		modal.parsedWikilinks = links.map((l) => ({
			...l,
			exists: noteExists(modal.app, l.target),
		}));
		const validCount = modal.parsedWikilinks.filter((l) => l.exists).length;
		const brokenCount = modal.parsedWikilinks.length - validCount;
		sub.textContent = t('detected-chapters', { count: modal.parsedWikilinks.length });

		preview.empty();

		if (modal.parsedWikilinks.length === 0) {
			preview.createEl('p', {
				text: t('no-wikilinks'),
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
				text: t('broken-link'),
					cls: 'export-modal__error-badge',
				});
			}
		});

		if (brokenCount > 0) {
			preview.createEl('p', {
				text: t('broken-links-count', { count: brokenCount }),
				cls: 'export-modal__empty-state',
				attr: { style: 'color: var(--text-error); margin-top: 6px;' },
			});
		}
	}).catch(() => {
		sub.textContent = t('failed-read-file');
	});
}

function buildManualContentsSection(container: HTMLDivElement, modal: ExportVaultModal) {
	buildFieldLabel(container, t('field-selected-notes'));
	modal.manualNotesListEl = container.createEl('ul', {
		cls: 'export-modal__note-list',
	});
	renderSelectedNotes(modal);

	const addBtn = container.createEl('button', {
		text: t('btn-add-notes'),
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
			text: t('no-notes-selected'),
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
		t('section-metadata'),
		t('metadata-desc'),
	);

	const fields = section.createDiv({ cls: 'export-modal__field-stack' });
	createTextField(fields, t('field-title'), modal.detectedMetadata.title, (value) => {
		modal.detectedMetadata.title = value;
	});
	createTextField(fields, t('field-subtitle'), modal.detectedMetadata.subtitle, (value) => {
		modal.detectedMetadata.subtitle = value;
	});
	createTextField(fields, t('field-author'), modal.detectedMetadata.author, (value) => {
		modal.detectedMetadata.author = value;
	});
}
