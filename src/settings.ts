import { App, PluginSettingTab, Setting } from 'obsidian';
import DocumentExportPlugin from './main.js';

export interface DocumentExportSettings {
	outputFormat: string;
}

export const DEFAULT_SETTINGS: DocumentExportSettings = {
	outputFormat: 'pdf',
};

export class DocumentExportSettingTab extends PluginSettingTab {
	plugin: DocumentExportPlugin;

	constructor(app: App, plugin: DocumentExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Output format')
			.setDesc('Select the default export format')
			.addText((text) =>
				text
					.setPlaceholder('PDF, docx, or LaTeX')
					.setValue(this.plugin.settings.outputFormat)
					.onChange(async (value) => {
						this.plugin.settings.outputFormat = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
