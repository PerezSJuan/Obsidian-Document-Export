import { App, SuggestModal, TFolder } from 'obsidian';

export class FolderSuggestModal extends SuggestModal<TFolder> {
    private onChoose: (path: string) => void;

    constructor(app: App, onChoose: (path: string) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    getSuggestions(query: string): TFolder[] {
        const folders: TFolder[] = [];
        this.app.vault.getAllLoadedFiles().forEach((f) => {
            if (f instanceof TFolder) {
                folders.push(f);
            }
        });
        if (!query) return folders.slice(0, 50);
        const q = query.toLowerCase();
        return folders.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 50);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement) {
        el.createDiv({ text: folder.name || '(root)' });
        el.createEl('small', {
            text: folder.path || '/',
            attr: { style: 'color: var(--text-muted);' },
        });
    }

    onChooseSuggestion(folder: TFolder) {
        this.onChoose(folder.path || '/');
    }
}
