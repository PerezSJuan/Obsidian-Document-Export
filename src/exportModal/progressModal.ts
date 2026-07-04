import { Modal, ProgressBarComponent, App } from 'obsidian';
import { t } from '../i18n.js';

export class ExportProgressModal extends Modal {
  private progressBar!: ProgressBarComponent;
  private statusEl!: HTMLElement;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('export-progress-modal');

    contentEl.createEl('h3', {
      text: t('progress-title'),
      cls: 'export-progress-modal__title',
    });

    this.statusEl = contentEl.createDiv({
      cls: 'export-progress-modal__status',
    });
    this.statusEl.setText(t('progress-starting'));

    const barContainer = contentEl.createDiv({
      cls: 'export-progress-modal__bar',
    });
    this.progressBar = new ProgressBarComponent(barContainer);
    this.progressBar.setValue(0);
  }

  setProgress(current: number, total: number, status: string) {
    this.progressBar.setValue(Math.round((current / total) * 100));
    this.statusEl.setText(status);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
