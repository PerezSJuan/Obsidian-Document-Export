import { App } from 'obsidian';
import type { HeadingMappingOption } from '../types.js';

export function getHeadingMappingOptions(): HeadingMappingOption[] {
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

export function parseWikilinks(content: string): { target: string; display: string }[] {
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

export function noteExists(app: App, target: string): boolean {
	const name = target.split('#')[0];
	return app.vault.getMarkdownFiles().some(
		(f) => f.basename === name || f.path === name + '.md' || f.path.endsWith('/' + name + '.md'),
	);
}

export function buildPanelHeading(container: HTMLElement, title: string) {
	container.createEl('h2', { text: title, cls: 'export-modal__panel-title' });
}

export function buildSectionHeading(container: HTMLElement, title: string, description?: string) {
	container.createEl('h3', { text: title, cls: 'export-modal__section-title' });
	if (description) {
		container.createEl('p', { text: description, cls: 'export-modal__sub' });
	}
}

export function buildFieldLabel(container: HTMLElement, label: string) {
	container.createEl('p', { text: label, cls: 'export-modal__field-label' });
}

export function createTextField(
	container: HTMLElement,
	label: string,
	value: string,
	onChange?: (value: string) => void,
) {
	const field = container.createDiv({ cls: 'export-modal__field' });
	buildFieldLabel(field, label);
	const input = field.createEl('input', {
		attr: { type: 'text', value },
	});
	if (onChange) {
		input.addEventListener('input', () => onChange(input.value));
	}
}

export function createPathField(
	container: HTMLElement,
	label: string,
	value: string,
	buttonText: string,
	onBrowse: (displayEl: HTMLElement) => void,
) {
	const field = container.createDiv({ cls: 'export-modal__field' });
	buildFieldLabel(field, label);
	const row = field.createDiv({ cls: 'export-modal__path-row' });
	const display = row.createEl('span', {
		text: value || '(not set)',
		cls: 'export-modal__path-text',
	});
	row.createEl('button', { text: buttonText }).addEventListener('click', () => onBrowse(display));
}

export function createSelectField(
	container: HTMLElement,
	label: string,
	options: { value: string; label: string }[],
	value: string,
	onChange: (value: string) => void,
) {
	const field = container.createDiv({ cls: 'export-modal__field' });
	buildFieldLabel(field, label);
	const select = field.createEl('select');
	options.forEach((opt) => {
		select.createEl('option', { value: opt.value, text: opt.label });
	});
	select.value = value;
	select.addEventListener('change', () => onChange(select.value));
}

export function createToggleRow(container: HTMLElement, label: string, initialState: boolean): HTMLInputElement {
	const row = container.createDiv({ cls: 'export-modal__setting-row' });
	row.createSpan({ text: label, cls: 'export-modal__field-label' });
	const toggleLabel = row.createEl('label', { cls: 'tg export-modal-toggle' });
	const input = toggleLabel.createEl('input', { attr: { type: 'checkbox' } });
	input.checked = initialState;
	toggleLabel.createEl('i');
	return input;
}
