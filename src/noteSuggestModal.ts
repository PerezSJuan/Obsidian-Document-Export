import { App, SuggestModal, TFile } from 'obsidian';

export class NoteSuggestModal extends SuggestModal<TFile> {
    private onChoose: (path: string) => void;

    constructor(app: App, onChoose: (path: string) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    getSuggestions(query: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        if (!query) return files.slice(0, 50);
        const q = query.toLowerCase();
        return files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 50);
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.createDiv({ text: file.basename });
        el.createEl('small', {
            text: file.path,
            attr: { style: 'color: var(--text-muted);' },
        });
    }

    onChooseSuggestion(file: TFile) {
        this.onChoose(file.path);
    }
}
