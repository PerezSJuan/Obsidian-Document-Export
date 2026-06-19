import type { HeadingMapping } from '../../types.js';
import type { ExportVaultModal } from '../modal.js';
import {
	buildPanelHeading,
	getHeadingMappingOptions
} from '../helpers.js';
import { buildFieldLabel, buildSectionHeading, createToggleRow } from '../helpers.js';

export function buildStructurePanel(container: HTMLDivElement, modal: ExportVaultModal) {
	buildPanelHeading(container, 'Structure');

	const newChapterToggle = createToggleRow(container, 'Start a new chapter at each note', modal.newChapterPerNote);
	newChapterToggle.addEventListener('change', () => {
		modal.newChapterPerNote = newChapterToggle.checked;
	});

	buildHeadingMappingSection(container, modal);
	buildReferencesSection(container, modal);
}

function buildHeadingMappingSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({
		cls: 'export-modal__section export-modal__section--bordered',
	});
	buildSectionHeading(section, 'Heading mapping');

	const rows = section.createDiv({ cls: 'export-modal__field-stack' });
	const levels = [
		{ id: 'lvl1', tag: 'H1' },
		{ id: 'lvl2', tag: 'H2' },
		{ id: 'lvl3', tag: 'H3' },
		{ id: 'lvl4', tag: 'H4' },
		{ id: 'lvl5', tag: 'H5' },
		{ id: 'lvl6', tag: 'H6' },
	];

	levels.forEach((level) => {
		const row = rows.createDiv({ cls: 'export-modal__mapping-row' });
		row.createEl('code', {
			text: level.tag,
			cls: 'export-modal__mapping-level',
		});

		const select = row.createEl('select');
		getHeadingMappingOptions().forEach((option) => {
			select.createEl('option', {
				value: option.value,
				text: option.label,
			});
		});
		select.value = modal.headingMapping[level.id] ?? 'inline';
		select.addEventListener('change', () => {
			modal.headingMapping[level.id] = select.value as HeadingMapping;
		});
	});
}

function buildReferencesSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({
		cls: 'export-modal__section export-modal__section--bordered',
	});
	buildSectionHeading(section, 'References & tags');

	const fields = section.createDiv({ cls: 'export-modal__field-stack' });
	const wikilinkField = fields.createDiv({ cls: 'export-modal__field' });
	buildFieldLabel(wikilinkField, 'Wikilinks [[Note]]');
	const wikilinkSelect = wikilinkField.createEl('select');
	[
		{ value: 'resolve', label: 'Resolve to note title' },
		{ value: 'raw', label: 'Keep as raw text' },
		{ value: 'strip', label: 'Strip references' },
	].forEach((opt) => {
		wikilinkSelect.createEl('option', { value: opt.value, text: opt.label });
	});
	wikilinkSelect.value = modal.wikilinkMode;
	wikilinkSelect.addEventListener('change', () => {
		modal.wikilinkMode = wikilinkSelect.value;
	});

	const tagField = fields.createDiv({ cls: 'export-modal__field' });
	buildFieldLabel(tagField, 'Tags #tag');
	const tagSelect = tagField.createEl('select');
	[
		{ value: 'keep', label: 'Keep as text' },
		{ value: 'bold', label: 'Convert to bold' },
		{ value: 'strip', label: 'Strip tags' },
	].forEach((opt) => {
		tagSelect.createEl('option', { value: opt.value, text: opt.label });
	});
	tagSelect.value = modal.tagMode;
	tagSelect.addEventListener('change', () => {
		modal.tagMode = tagSelect.value;
	});

	const noteNameField = fields.createDiv({ cls: 'export-modal__field' });
	buildFieldLabel(noteNameField, 'Note name');
	const noteNameSelect = noteNameField.createEl('select');
	[
		{ value: 'none', label: 'None' },
		...getHeadingMappingOptions(),
	].forEach((opt) => {
		noteNameSelect.createEl('option', { value: opt.value, text: opt.label });
	});
	noteNameSelect.value = modal.noteNameMode;
	noteNameSelect.addEventListener('change', () => {
		modal.noteNameMode = noteNameSelect.value;
	});
}
