import { Notice } from 'obsidian';
import type { ExportVaultModal } from '../modal.js';
import type { FontFamily, PageNumberPosition } from '../../types.js';
import { buildPanelHeading, buildSectionHeading, createPathField, createSelectField, createToggleRow } from '../helpers.js';
import { normalizeVaultRelativePath } from '../../utils/vaultPath.js';
import { t } from '../../i18n.js';

interface ElectronDialog {
	showOpenDialog(options: { properties: string[] }): Promise<{
		canceled: boolean;
		filePaths: string[];
	}>;
}

interface FileWithPath extends File {
	path?: string;
}

export function buildOutputPanel(container: HTMLDivElement, modal: ExportVaultModal) {
	buildPanelHeading(container, t('panel-output'));
	buildFormatSection(container, modal);
	buildFormattingSection(container, modal);
	buildSavePathSection(container, modal);
}

function buildFormatSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({ cls: 'export-modal__section' });
	buildSectionHeading(section, t('section-formats'));

	const formatDefs = [
		{ key: 'pdf' as const, label: t('label-pdf') },
		{ key: 'docx' as const, label: t('label-docx') },
		{ key: 'latex' as const, label: t('label-latex') },
		{ key: 'svg' as const, label: t('label-svg') },
	];
	formatDefs.forEach((f) => {
		const row = section.createEl('label', { cls: 'export-modal__checkbox-row' });
		const cb = row.createEl('input', { attr: { type: 'checkbox' } });
		cb.checked = modal.formats[f.key];
		cb.addEventListener('change', () => {
			modal.formats[f.key] = cb.checked;
		});
		row.createSpan({ text: f.label });
	});
}

function tryElectronDialog(modal: ExportVaultModal, display: HTMLElement): void {
	let electron: { remote?: { dialog?: ElectronDialog }; dialog?: ElectronDialog } | undefined;
	try {
		electron = (window as { require?(name: string): { remote?: { dialog?: ElectronDialog }; dialog?: ElectronDialog } }).require?.('electron');
	} catch {
		return;
	}
	const dialog = electron?.remote?.dialog || electron?.dialog;
	if (!dialog?.showOpenDialog) return;
	dialog.showOpenDialog({ properties: ['openDirectory'] }).then((result) => {
		if (result.canceled || !result.filePaths.length) return;
		const dir = result.filePaths[0];
		if (!dir) return;
		const basePath = (modal.app.vault.adapter as { getBasePath?(): string }).getBasePath?.() || '';
		const relative = normalizeVaultRelativePath(dir, basePath);
		if (!relative && dir !== basePath) {
			new Notice('Select a folder inside the vault');
			return;
		}
		modal.savePath = relative;
		display.textContent = relative || t('vault-root');
	}).catch(() => undefined);
}

function tryWebkitDialog(modal: ExportVaultModal, display: HTMLElement): void {
	const fileInput = activeDocument.createElement('input');
	fileInput.type = 'file';
	fileInput.setAttribute('webkitdirectory', '');
	fileInput.classList.add('export-modal__hidden-input');
	activeDocument.body.appendChild(fileInput);
	fileInput.addEventListener('change', () => {
		activeDocument.body.removeChild(fileInput);
		if (!fileInput.files?.length) return;
		const rawFile = fileInput.files[0];
		if (!rawFile) return;
		const file = rawFile as FileWithPath;
		const dir = file.path?.substring(0, file.path.lastIndexOf('/')) || file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf('/'));
		if (!dir) return;
		const basePath = (modal.app.vault.adapter as { getBasePath?(): string }).getBasePath?.() || '';
		const relative = normalizeVaultRelativePath(dir, basePath);
		if (!relative && dir !== basePath) {
			new Notice(t('notice-folder-inside-vault'));
			return;
		}
		modal.savePath = relative;
		display.textContent = relative || t('vault-root');
	});
	fileInput.click();
}

function buildFormattingSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({
		cls: 'export-modal__section export-modal__section--bordered',
	});
	buildSectionHeading(section, t('section-formatting'));

	const fonts: { value: string; label: string }[] = [
		{ value: 'times-new-roman', label: 'Times New Roman' },
		{ value: 'arial', label: 'Arial' },
		{ value: 'calibri', label: 'Calibri' },
		{ value: 'georgia', label: 'Georgia' },
		{ value: 'garamond', label: 'Garamond' },
		{ value: 'verdana', label: 'Verdana' },
		{ value: 'courier-new', label: 'Courier New' },
		{ value: 'consolas', label: 'Consolas' },
	];
	createSelectField(section, t('field-font'), fonts, modal.font, (value) => {
		modal.font = value as FontFamily;
	});

	const sizes: { value: string; label: string }[] = [];
	for (let i = 8; i <= 14; i++) {
		sizes.push({ value: String(i), label: `${i} pt` });
	}
	createSelectField(section, t('field-base-font-size'), sizes, String(modal.baseFontSize), (value) => {
		modal.baseFontSize = Number(value);
	});

	const positions: { value: string; label: string }[] = [
		{ value: 'bottom-center', label: t('pos-bottom-center') },
		{ value: 'bottom-left', label: t('pos-bottom-left') },
		{ value: 'bottom-right', label: t('pos-bottom-right') },
		{ value: 'top-center', label: t('pos-top-center') },
		{ value: 'top-left', label: t('pos-top-left') },
		{ value: 'top-right', label: t('pos-top-right') },
	];
	const pageNumToggle = createToggleRow(section, t('toggle-page-numbers'), modal.pageNumbersEnabled);
	const pageNumPosField = section.createDiv({ cls: 'export-modal__field-stack' });
	pageNumPosField.classList.toggle('is-hidden', !modal.pageNumbersEnabled);
	pageNumToggle.addEventListener('change', () => {
		modal.pageNumbersEnabled = pageNumToggle.checked;
		pageNumPosField.classList.toggle('is-hidden', !pageNumToggle.checked);
	});
	createSelectField(pageNumPosField, t('field-position'), positions, modal.pageNumberPosition, (value) => {
		modal.pageNumberPosition = value as PageNumberPosition;
	});
}

function buildSavePathSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({
		cls: 'export-modal__section export-modal__section--bordered',
	});
	buildSectionHeading(section, t('section-save-path'));
	createPathField(section, t('field-save-to'), modal.savePath || t('vault-root'), t('btn-browse'), (display) => {
		tryElectronDialog(modal, display);
		tryWebkitDialog(modal, display);
	});
}
