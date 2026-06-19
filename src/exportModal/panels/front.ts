import { Notice } from 'obsidian';
import type { ExportVaultModal } from '../modal.js';
import { buildPanelHeading, buildSectionHeading, buildFieldLabel, createToggleRow, createPathField, createTextField } from '../helpers.js';
import { normalizeVaultRelativePath } from '../../utils/vaultPath.js';
import { t } from '../../i18n.js';

export function buildFrontPanel(container: HTMLDivElement, modal: ExportVaultModal) {
	buildPanelHeading(container, t('panel-front-matter'));
	buildCoverPageSection(container, modal);
	buildTableOfContentsSection(container, modal);
}

function buildCoverPageSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({ cls: 'export-modal__section' });
	buildSectionHeading(section, t('section-cover-page'));

	const coverToggle = createToggleRow(section, t('toggle-enable-cover'), true);
	coverToggle.addEventListener('change', () => {
		modal.enableCoverPage = coverToggle.checked;
		coverFields.classList.toggle('is-hidden', !coverToggle.checked);
	});

	const coverFields = section.createDiv({ cls: 'export-modal__field-stack' });
	createToggleRow(coverFields, t('toggle-use-metadata'), true).addEventListener('change', (e) => {
		modal.useBookMetadata = (e.target as HTMLInputElement).checked;
	});
	createPathField(coverFields, t('field-cover-image'), modal.coverImagePath, t('btn-select-image'), (display) => {
		const fileInput = activeDocument.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = 'image/*';
		fileInput.classList.add('export-modal__hidden-input');
		activeDocument.body.appendChild(fileInput);
		fileInput.addEventListener('change', () => {
			activeDocument.body.removeChild(fileInput);
			if (!fileInput.files?.length) return;
			const file = fileInput.files[0] as File & { path?: string };
			if (!file) return;
			const fullPath = file.path;
			if (fullPath) {
				const basePath = (modal.app.vault.adapter as { getBasePath?(): string }).getBasePath?.() || '';
				const relative = normalizeVaultRelativePath(fullPath, basePath);
				if (relative) {
					modal.coverImagePath = relative;
					display.textContent = relative;
					return;
				}
			}
			modal.coverImagePath = file.name;
			display.textContent = file.name + ' ' + t('will-try-resolve');
			new Notice(t('notice-cover-path'));
		});
		fileInput.click();
	});
}

function buildTableOfContentsSection(container: HTMLDivElement, modal: ExportVaultModal) {
	const section = container.createDiv({
		cls: 'export-modal__section export-modal__section--bordered',
	});
	buildSectionHeading(section, t('section-toc'));

	const tocToggle = createToggleRow(section, t('toggle-enable-toc'), modal.enableToc);
	const tocFields = section.createDiv({ cls: 'export-modal__grid' });
	tocFields.classList.toggle('is-hidden', !modal.enableToc);
	tocToggle.addEventListener('change', () => {
		modal.enableToc = tocToggle.checked;
		tocFields.classList.toggle('is-hidden', !tocToggle.checked);
	});

	const depthField = tocFields.createDiv();
	buildFieldLabel(depthField, t('field-depth'));
	const depthSelect = depthField.createEl('select');
	[1, 2, 3, 4, 5, 6].forEach((depth) => {
		depthSelect.createEl('option', { value: String(depth), text: String(depth) });
	});
	depthSelect.value = String(modal.tocDepth);
	depthSelect.addEventListener('change', () => {
		modal.tocDepth = Number(depthSelect.value);
	});

	createTextField(tocFields, t('field-title'), modal.tocTitle, (value) => {
		modal.tocTitle = value;
	});
}
