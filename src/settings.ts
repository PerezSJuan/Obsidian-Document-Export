import { App, PluginSettingTab, Setting } from 'obsidian';
import type { ExportConfig, FontFamily, HeadingMapping, PageNumberPosition } from './types.js';
import DocumentExportPlugin from './main.js';
import { t } from './i18n.js';

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
			svg: false,
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
		new Setting(containerEl).setName(t('settings-default-presets')).setHeading();

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
		const section = this.buildSection(containerEl, t('settings-source'));

		new Setting(section)
			.setName(t('settings-source-mode'))
			.setDesc(t('settings-source-mode-desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('manual', t('radio-build-manually'));
				dropdown.addOption('manifest', t('radio-index-note'));
				dropdown.setValue(settings.source.mode);
					dropdown.onChange((value) => {
						settings.source.mode = value as 'manual' | 'manifest';
						void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-index-path'))
			.setDesc(t('settings-index-path-desc'))
			.addText((text) =>
				text
					.setPlaceholder(t('placeholder-index-path'))
					.setValue(settings.source.indexNotePath)
					.onChange((value) => {
						settings.source.indexNotePath = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(section)
			.setName(t('settings-book-title'))
			.addText((text) =>
				text
					.setValue(settings.source.metadata.title)
					.onChange((value) => {
						settings.source.metadata.title = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(section)
			.setName(t('settings-subtitle'))
			.addText((text) =>
				text
					.setValue(settings.source.metadata.subtitle)
					.onChange((value) => {
						settings.source.metadata.subtitle = value;
						void this.plugin.saveSettings();
					}),
			);

		new Setting(section)
			.setName(t('settings-author'))
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
		const section = this.buildSection(containerEl, t('settings-structure'));

		new Setting(section)
			.setName(t('settings-new-chapter'))
			.setDesc(t('settings-new-chapter-desc'))
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
			{ value: 'part', label: t('heading-part') },
			{ value: 'chapter', label: t('heading-chapter') },
			{ value: 'section', label: t('heading-section') },
			{ value: 'subsection', label: t('heading-subsection') },
			{ value: 'inline', label: t('heading-inline') },
			{ value: 'paragraph', label: t('heading-paragraph') },
			{ value: 'bold', label: t('heading-bold') },
			{ value: 'italic', label: t('heading-italic') },
		];

		levelMap.forEach((level) => {
			new Setting(section)
				.setName(t('settings-heading-mapping', { level: level.label }))
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
			.setName(t('settings-wikilinks'))
			.setDesc(t('settings-wikilinks-desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('resolve', t('dropdown-resolve'));
				dropdown.addOption('raw', t('dropdown-raw'));
				dropdown.addOption('strip', t('dropdown-strip'));
				dropdown.setValue(settings.structure.wikilinkMode);
				dropdown.onChange((value) => {
					settings.structure.wikilinkMode = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-tags'))
			.setDesc(t('settings-tags-desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('keep', t('dropdown-keep-text'));
				dropdown.addOption('bold', t('dropdown-convert-bold'));
				dropdown.addOption('strip', t('dropdown-strip-tags'));
				dropdown.setValue(settings.structure.tagMode);
				dropdown.onChange((value) => {
					settings.structure.tagMode = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-note-name'))
			.setDesc(t('settings-note-name-desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('none', t('dropdown-none'));
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
		const section = this.buildSection(containerEl, t('settings-front-matter'));

		new Setting(section)
			.setName(t('settings-enable-cover'))
			.addToggle((toggle) => {
				toggle.setValue(settings.frontMatter.enableCoverPage);
				toggle.onChange((value) => {
					settings.frontMatter.enableCoverPage = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-use-metadata'))
			.addToggle((toggle) => {
				toggle.setValue(settings.frontMatter.useBookMetadata);
				toggle.onChange((value) => {
					settings.frontMatter.useBookMetadata = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-cover-path'))
			.setDesc(t('settings-cover-path-desc'))
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
			.setName(t('settings-enable-toc'))
			.addToggle((toggle) => {
				toggle.setValue(settings.frontMatter.toc.enabled);
				toggle.onChange((value) => {
					settings.frontMatter.toc.enabled = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-toc-depth'))
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
			.setName(t('settings-toc-title'))
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
		const section = this.buildSection(containerEl, t('settings-output'));

		new Setting(section)
			.setName(t('settings-export-pdf'))
			.addToggle((toggle) => {
				toggle.setValue(settings.output.formats.pdf);
				toggle.onChange((value) => {
					settings.output.formats.pdf = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-export-docx'))
			.addToggle((toggle) => {
				toggle.setValue(settings.output.formats.docx);
				toggle.onChange((value) => {
					settings.output.formats.docx = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-export-latex'))
			.addToggle((toggle) => {
				toggle.setValue(settings.output.formats.latex);
				toggle.onChange((value) => {
					settings.output.formats.latex = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-export-svg'))
			.addToggle((toggle) => {
				toggle.setValue(settings.output.formats.svg);
				toggle.onChange((value) => {
					settings.output.formats.svg = value;
					void this.plugin.saveSettings();
				});
			});
	}

	private buildFormattingSection(containerEl: HTMLElement, settings: DocumentExportSettings) {
		const section = this.buildSection(containerEl, t('settings-formatting'));

		const fontOptions: { value: FontFamily; label: string }[] = [
			{ value: 'times-new-roman', label: 'Times New Roman' },
			{ value: 'arial', label: 'Arial' },
			{ value: 'calibri', label: 'Calibri' },
			{ value: 'georgia', label: 'Georgia' },
			{ value: 'garamond', label: 'Garamond' },
			{ value: 'verdana', label: 'Verdana' },
			{ value: 'courier-new', label: 'Courier New' },
			{ value: 'consolas', label: 'Consolas' },
		];

		new Setting(section)
			.setName(t('settings-font'))
			.addDropdown((dropdown) => {
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
			.setName(t('settings-font-size'))
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
			.setName(t('settings-page-numbers'))
			.addToggle((toggle) => {
				toggle.setValue(settings.formatting.pageNumbers.enabled);
				toggle.onChange((value) => {
					settings.formatting.pageNumbers.enabled = value;
					void this.plugin.saveSettings();
				});
			});

		new Setting(section)
			.setName(t('settings-page-position'))
			.addDropdown((dropdown) => {
				const positionOptions: { value: PageNumberPosition; label: string }[] = [
					{ value: 'bottom-center', label: t('pos-bottom-center') },
					{ value: 'bottom-left', label: t('pos-bottom-left') },
					{ value: 'bottom-right', label: t('pos-bottom-right') },
					{ value: 'top-center', label: t('pos-top-center') },
					{ value: 'top-left', label: t('pos-top-left') },
					{ value: 'top-right', label: t('pos-top-right') },
				];
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
