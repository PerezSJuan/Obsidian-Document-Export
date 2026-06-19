import { App, PluginSettingTab, Setting } from 'obsidian';
import type { ExportConfig, FontFamily, HeadingMapping, PageNumberPosition } from './types.js';
import DocumentExportPlugin from './main.js';

export type DocumentExportSettings = ExportConfig;

export const DEFAULT_SETTINGS: DocumentExportSettings = {
	source: {
		mode: 'manual',
		indexNotePath: '',
		selectedNotes: [],
		metadata: {
			title: '',
			subtitle: '',
			author: '',
		},
	},
	structure: {
		newChapterPerNote: true,
		headingMapping: {
			lvl1: 'chapter',
			lvl2: 'section',
			lvl3: 'subsection',
			lvl4: 'inline',
			lvl5: 'inline',
			lvl6: 'inline',
		},
		wikilinkMode: 'resolve',
		tagMode: 'keep',
		noteNameMode: 'none',
	},
	frontMatter: {
		enableCoverPage: true,
		useBookMetadata: true,
		coverImagePath: '',
		toc: {
			enabled: true,
			depth: 2,
			title: 'Contents',
		},
	},
	output: {
		formats: {
			pdf: true,
			docx: false,
			latex: false,
		},
		savePath: '',
	},
	formatting: {
		font: 'times-new-roman',
		baseFontSize: 11,
		pageNumbers: {
			enabled: true,
			position: 'bottom-center',
		},
	},
};

export class DocumentExportSettingTab extends PluginSettingTab {
	plugin: DocumentExportPlugin;

	constructor(app: App, plugin: DocumentExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;

		containerEl.empty();
		new Setting(containerEl).setName("Default export presets").setHeading();

		this.buildSourceSection(containerEl, settings);
		this.buildStructureSection(containerEl, settings);
		this.buildFrontMatterSection(containerEl, settings);
		this.buildOutputSection(containerEl, settings);
		this.buildFormattingSection(containerEl, settings);
	}

	private buildSection(containerEl: HTMLElement, title: string, description?: string) {
		const section = containerEl.createDiv({ cls: 'export-modal__section' });
		new Setting(section).setName(title).setHeading();
		if (description) {
			section.createEl('p', {
				text: description,
				cls: 'export-modal__sub',
			});
		}
		return section;
	}

	private buildSourceSection(containerEl: HTMLElement, settings: DocumentExportSettings) {
		const section = this.buildSection(containerEl, 'Source defaults');

		new Setting(section)
			.setName('Source mode')
			.setDesc('Default starting source for export')
			.addDropdown((dropdown) => {
				dropdown.addOption('manual', 'Build manually');
				dropdown.addOption('manifest', 'Use index note');
				dropdown.setValue(settings.source.mode);
					dropdown.onChange((value) => {
						settings.source.mode = value as 'manual' | 'manifest';
						void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Index note path')
			.setDesc('Default note used when source mode is set to manifest')
			.addText((text) =>
				text
					.setPlaceholder('path/to/index.md')
					.setValue(settings.source.indexNotePath)
					.onChange((value) => {
						settings.source.indexNotePath = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(section)
			.setName('Default book title')
			.addText((text) =>
				text
					.setValue(settings.source.metadata.title)
					.onChange((value) => {
						settings.source.metadata.title = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(section)
			.setName('Default subtitle')
			.addText((text) =>
				text
					.setValue(settings.source.metadata.subtitle)
					.onChange((value) => {
						settings.source.metadata.subtitle = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(section)
			.setName('Default author')
			.addText((text) =>
				text
					.setValue(settings.source.metadata.author)
					.onChange((value) => {
						settings.source.metadata.author = value;
						void this.plugin.saveSettings();
					}),
			);
	}

	private buildStructureSection(containerEl: HTMLElement, settings: DocumentExportSettings) {
		const section = this.buildSection(containerEl, 'Structure defaults');

		new Setting(section)
			.setName('New chapter per note')
			.setDesc('Start a new chapter for each selected note')
			.addToggle((toggle) => {
				toggle.setValue(settings.structure.newChapterPerNote);
				toggle.onChange((value) => {
					settings.structure.newChapterPerNote = value;
					void this.plugin.saveSettings();
				});
			});

		const levelMap = [
			{ key: 'lvl1', label: 'H1' },
			{ key: 'lvl2', label: 'H2' },
			{ key: 'lvl3', label: 'H3' },
			{ key: 'lvl4', label: 'H4' },
			{ key: 'lvl5', label: 'H5' },
			{ key: 'lvl6', label: 'H6' },
		] as const;

		const headingOptions: { value: HeadingMapping; label: string }[] = [
			{ value: 'part', label: 'Part' },
			{ value: 'chapter', label: 'Chapter' },
			{ value: 'section', label: 'Section' },
			{ value: 'subsection', label: 'Subsection' },
			{ value: 'inline', label: 'Keep inline' },
			{ value: 'paragraph', label: 'Paragraph' },
			{ value: 'bold', label: 'Bold text' },
			{ value: 'italic', label: 'Italic' },
		];

		levelMap.forEach((level) => {
			new Setting(section)
				.setName(`${level.label} mapping`)
				.addDropdown((dropdown) => {
					for (const option of headingOptions) {
						dropdown.addOption(option.value, option.label);
					}
					dropdown.setValue(settings.structure.headingMapping[level.key] ?? 'inline');
					dropdown.onChange((value) => {
						settings.structure.headingMapping[level.key] = value as HeadingMapping;
						void this.plugin.saveSettings();
					});
				});
		});

		new Setting(section)
			.setName('Wikilinks')
			.setDesc('How [[links]] are resolved in the exported book')
			.addDropdown((dropdown) => {
				dropdown.addOption('resolve', 'Resolve to note title');
				dropdown.addOption('raw', 'Keep as raw text');
				dropdown.addOption('strip', 'Strip references');
				dropdown.setValue(settings.structure.wikilinkMode);
				dropdown.onChange((value) => {
					settings.structure.wikilinkMode = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Tags')
			.setDesc('How tags are exported')
			.addDropdown((dropdown) => {
				dropdown.addOption('keep', 'Keep as text');
				dropdown.addOption('bold', 'Convert to bold');
				dropdown.addOption('strip', 'Strip tags');
				dropdown.setValue(settings.structure.tagMode);
				dropdown.onChange((value) => {
					settings.structure.tagMode = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Note name')
			.setDesc('How note titles are rendered in exports')
			.addDropdown((dropdown) => {
				dropdown.addOption('none', 'None');
				for (const option of headingOptions) {
					dropdown.addOption(option.value, option.label);
				}
				dropdown.setValue(settings.structure.noteNameMode);
				dropdown.onChange((value) => {
					settings.structure.noteNameMode = value;
					void this.plugin.saveSettings();
				});
			});
	}

	private buildFrontMatterSection(containerEl: HTMLElement, settings: DocumentExportSettings) {
		const section = this.buildSection(containerEl, 'Front matter defaults');

		new Setting(section)
			.setName('Enable cover page')
			.addToggle((toggle) => {
				toggle.setValue(settings.frontMatter.enableCoverPage);
				toggle.onChange((value) => {
					settings.frontMatter.enableCoverPage = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Use book metadata')
			.addToggle((toggle) => {
				toggle.setValue(settings.frontMatter.useBookMetadata);
				toggle.onChange((value) => {
					settings.frontMatter.useBookMetadata = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Cover image path')
			.setDesc('Vault-relative path to a default cover image')
			.addText((text) =>
				text
					.setPlaceholder('path/to/image.png')
					.setValue(settings.frontMatter.coverImagePath)
					.onChange((value) => {
						settings.frontMatter.coverImagePath = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(section)
			.setName('Enable table of contents')
			.addToggle((toggle) => {
				toggle.setValue(settings.frontMatter.toc.enabled);
				toggle.onChange((value) => {
					settings.frontMatter.toc.enabled = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Table of contents depth')
			.addDropdown((dropdown) => {
				for (let depth = 1; depth <= 6; depth++) {
					dropdown.addOption(String(depth), String(depth));
				}
				dropdown.setValue(String(settings.frontMatter.toc.depth));
				dropdown.onChange((value) => {
					settings.frontMatter.toc.depth = Number(value);
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Table of contents title')
			.addText((text) =>
				text
					.setValue(settings.frontMatter.toc.title)
					.onChange((value) => {
						settings.frontMatter.toc.title = value;
						void this.plugin.saveSettings();
					}),
			);
	}

	private buildOutputSection(containerEl: HTMLElement, settings: DocumentExportSettings) {
		const section = this.buildSection(containerEl, 'Output defaults');

		new Setting(section)
			.setName('Export PDF')
			.addToggle((toggle) => {
				toggle.setValue(settings.output.formats.pdf);
				toggle.onChange((value) => {
					settings.output.formats.pdf = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Export docx')
			.addToggle((toggle) => {
				toggle.setValue(settings.output.formats.docx);
				toggle.onChange((value) => {
					settings.output.formats.docx = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Export LaTeX')
			.addToggle((toggle) => {
				toggle.setValue(settings.output.formats.latex);
				toggle.onChange((value) => {
					settings.output.formats.latex = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Save path')
			.setDesc('Default vault-relative folder for exported files')
			.addText((text) =>
				text
					.setPlaceholder('(Vault root)')
					.setValue(settings.output.savePath)
					.onChange((value) => {
						settings.output.savePath = value;
						void this.plugin.saveSettings();
					}),
			);
	}

	private buildFormattingSection(containerEl: HTMLElement, settings: DocumentExportSettings) {
		const section = this.buildSection(containerEl, 'Formatting defaults');

		new Setting(section)
			.setName('Font')
			.addDropdown((dropdown) => {
				const fontOptions = [{
					value: 'times-new-roman',
					label: 'Times New Roman',
				}, {
					value: 'arial',
					label: 'Arial',
				}, {
					value: 'calibri',
					label: 'Calibri',
				}, {
					value: 'georgia',
					label: 'Georgia',
				}, {
					value: 'garamond',
					label: 'Garamond',
				}, {
					value: 'verdana',
					label: 'Verdana',
				}, {
					value: 'courier-new',
					label: 'Courier New',
				}, {
					value: 'consolas',
					label: 'Consolas',
				}];
				for (const opt of fontOptions) {
					dropdown.addOption(opt.value, opt.label);
				}
				dropdown.setValue(settings.formatting.font);
				dropdown.onChange((value) => {
					settings.formatting.font = value as FontFamily;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Base font size')
			.addDropdown((dropdown) => {
				for (let size = 8; size <= 14; size++) {
					dropdown.addOption(String(size), `${size} pt`);
				}
				dropdown.setValue(String(settings.formatting.baseFontSize));
				dropdown.onChange((value) => {
					settings.formatting.baseFontSize = Number(value);
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Page numbers')
			.addToggle((toggle) => {
				toggle.setValue(settings.formatting.pageNumbers.enabled);
				toggle.onChange((value) => {
					settings.formatting.pageNumbers.enabled = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName('Page number position')
			.addDropdown((dropdown) => {
				const positionOptions = [{
					value: 'bottom-center',
					label: 'Bottom center',
				}, {
					value: 'bottom-left',
					label: 'Bottom left',
				}, {
					value: 'bottom-right',
					label: 'Bottom right',
				}, {
					value: 'top-center',
					label: 'Top center',
				}, {
					value: 'top-left',
					label: 'Top left',
				}, {
					value: 'top-right',
					label: 'Top right',
				}];
				for (const opt of positionOptions) {
					dropdown.addOption(opt.value, opt.label);
				}
				dropdown.setValue(settings.formatting.pageNumbers.position);
				dropdown.onChange((value) => {
					settings.formatting.pageNumbers.position = value as PageNumberPosition;
					void this.plugin.saveSettings();
				});
			});
	}
}
