import {
	MarkdownView,
	Plugin,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	DocumentExportSettings,
	DocumentExportSettingTab,
} from './settings.js';
import { ExportVaultModal } from './exportModal/index.js';

export default class DocumentExportPlugin extends Plugin {
	settings!: DocumentExportSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'export-document',
			name: 'Export document',
			callback: () => {
				new ExportVaultModal(this.app).open();
			},
		});

		this.addCommand({
			id: 'export-document-check',
			name: 'Export document (when in Markdown)',
			checkCallback: (checking: boolean) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						new ExportVaultModal(this.app).open();
					}
					return true;
				}
				return false;
			},
		});

		this.addSettingTab(new DocumentExportSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DocumentExportSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

