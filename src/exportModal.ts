import { App, Modal } from 'obsidian';

export class ExportVaultModal extends Modal {
    private currentPanel = 'source';
    private chapterItems = [
        'Introduction.md',
        'Part 1/Chapter 1.md',
        'Part 1/Chapter 2.md',
        'Appendix A.md'
    ];
    private previewDiv!: HTMLDivElement;

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const wrapper = contentEl.createDiv({
            attr: { style: 'min-height:600px; display:flex; align-items:center; justify-content:center; padding:24px;' }
        });

        const dialog = wrapper.createDiv({
            attr: { style: 'width:600px; max-width:100%; background:var(--background-primary); border:0.5px solid var(--background-modifier-border); border-radius:var(--radius-l); overflow:hidden; display:flex; flex-direction:column;' }
        });

        // Header
        const header = dialog.createDiv({
            attr: { style: 'display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:0.5px solid var(--background-modifier-border);' }
        });
        const titleGroup = header.createDiv();
        titleGroup.createEl('p', { text: 'Export vault to book', attr: { style: 'font-size:16px; font-weight:500; margin:0;' } });
        titleGroup.createEl('p', { text: 'Knowledge base \u00B7 142 notes', attr: { style: 'font-size:13px; color:var(--text-muted); margin:2px 0 0;' } });

        const closeBtn = header.createEl('button', {
            attr: {
                'aria-label': 'Close',
                style: 'width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; border:none; background:transparent; cursor:pointer;'
            }
        });
        closeBtn.createSpan({ cls: 'ti ti-x', attr: { style: 'font-size:18px;' } });
        closeBtn.addEventListener('click', () => this.close());

        // Body
        const body = dialog.createDiv({ attr: { style: 'display:flex;' } });

        // Navigation sidebar
        const nav = body.createDiv({
            attr: { style: 'width:168px; flex-shrink:0; border-right:0.5px solid var(--background-modifier-border); padding:12px 8px; display:flex; flex-direction:column; gap:2px;' }
        });

        const navItems = [
            { id: 'source', label: 'Source & order', icon: 'ti ti-folder' },
            { id: 'structure', label: 'Structure', icon: 'ti ti-hierarchy' },
            { id: 'front', label: 'Front matter', icon: 'ti ti-file-text' },
            { id: 'output', label: 'Output', icon: 'ti ti-download' }
        ];

        const navBtnMap: Record<string, HTMLButtonElement> = {};
        navItems.forEach(nb => {
            const btn = nav.createEl('button', {
                cls: 'navbtn',
                attr: {
                    'data-target': nb.id,
                    style: 'width:100%; text-align:left; border:none; background:transparent; display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:var(--radius-s); font-size:14px; color:var(--text-muted); cursor:pointer;'
                }
            });
            btn.createSpan({ cls: nb.icon, attr: { style: 'font-size:16px;' } });
            btn.createSpan({ text: nb.label });
            if (nb.id === 'source') {
                btn.classList.add('active');
                btn.style.color = 'var(--text-normal)';
                btn.style.fontWeight = '500';
                btn.style.background = 'var(--background-secondary)';
            }
            navBtnMap[nb.id] = btn;
            btn.addEventListener('click', () => this.switchPanel(nb.id, navBtnMap, panelMap));
        });

        // Panel container
        const panelContainer = body.createDiv({
            attr: { style: 'flex:1; padding:18px 20px; min-width:0;' }
        });

        const panelMap: Record<string, HTMLDivElement> = {};
        const panelSource = panelContainer.createDiv();
        this.buildSourcePanel(panelSource);
        panelMap.source = panelSource;

        const panelStructure = panelContainer.createDiv({ attr: { style: 'display:none;' } });
        this.buildStructurePanel(panelStructure);
        panelMap.structure = panelStructure;

        const panelFront = panelContainer.createDiv({ attr: { style: 'display:none;' } });
        this.buildFrontPanel(panelFront);
        panelMap.front = panelFront;

        const panelOutput = panelContainer.createDiv({ attr: { style: 'display:none;' } });
        this.buildOutputPanel(panelOutput);
        panelMap.output = panelOutput;

        // Footer
        const footer = dialog.createDiv({
            attr: { style: 'display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:0.5px solid var(--background-modifier-border);' }
        });

        const cancelBtn = footer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const exportBtn = footer.createEl('button', {
            text: 'Export book',
            attr: { style: 'background:var(--interactive-accent); color:var(--text-on-accent); border-color:transparent;' }
        });
        exportBtn.addEventListener('click', () => {
            throw new Error('Not implemented');
        });
    }

    private switchPanel(id: string, navMap: Record<string, HTMLButtonElement>, panelMap: Record<string, HTMLDivElement>) {
        Object.keys(navMap).forEach(key => {
            const btn = navMap[key];
            if (!btn) return;
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-muted)';
            btn.style.fontWeight = 'normal';
        });
        const activeBtn = navMap[id];
        if (!activeBtn) return;
        activeBtn.classList.add('active');
        activeBtn.style.background = 'var(--background-secondary)';
        activeBtn.style.color = 'var(--text-normal)';
        activeBtn.style.fontWeight = '500';

        Object.keys(panelMap).forEach(key => {
            const panel = panelMap[key];
            if (!panel) return;
            panel.style.display = key === id ? 'block' : 'none';
        });
        this.currentPanel = id;
    }

    // ---------- Source Panel ----------
    private buildSourcePanel(container: HTMLDivElement) {
        const orderRow = container.createDiv({ cls: 'row', attr: { style: 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; padding-top:0;' } });
        orderRow.createSpan({ text: 'Ordering method', attr: { style: 'font-size:14px;' } });
        const orderSelect = orderRow.createEl('select', { attr: { style: 'width:180px;' } });
        orderSelect.createEl('option', { value: 'explicit', text: 'Explicit list' });
        orderSelect.createEl('option', { value: 'frontmatter', text: 'Frontmatter field' });
        orderSelect.createEl('option', { value: 'manifest', text: 'Manifest note' });

        const explicitBlock = container.createDiv();
        explicitBlock.createEl('p', { text: 'Drag to reorder chapters', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });
        const list = explicitBlock.createEl('ul', {
            attr: { style: 'list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px;' }
        });
        this.renderChapterList(list);

        const frontmatterBlock = container.createDiv({ attr: { style: 'display:none;' } });
        frontmatterBlock.createEl('p', { text: 'Frontmatter field used for sorting', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });
        frontmatterBlock.createEl('input', { attr: { type: 'text', value: 'order', style: 'width:200px;' } });

        const manifestBlock = container.createDiv({ attr: { style: 'display:none;' } });
        manifestBlock.createEl('p', { text: 'Manifest note', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });
        manifestBlock.createEl('input', { attr: { type: 'text', value: 'Book Manifest.md', style: 'width:240px;' } });

        orderSelect.addEventListener('change', () => {
            const val = orderSelect.value;
            explicitBlock.style.display = val === 'explicit' ? 'block' : 'none';
            frontmatterBlock.style.display = val === 'frontmatter' ? 'block' : 'none';
            manifestBlock.style.display = val === 'manifest' ? 'block' : 'none';
        });
    }

    private renderChapterList(listEl: HTMLUListElement) {
        listEl.empty();
        this.chapterItems.forEach((item, index) => {
            const li = listEl.createEl('li', {
                cls: 'chap-row',
                attr: {
                    draggable: 'true',
                    style: 'display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--background-secondary); border-radius:var(--radius-s); cursor:grab;'
                }
            });
            li.createSpan({ cls: 'ti ti-grip-vertical', attr: { style: 'font-size:16px; color:var(--text-faint);' } });
            const num = li.createSpan({ cls: 'num', attr: { style: 'font-size:12px; color:var(--text-faint); width:16px;' } });
            num.textContent = String(index + 1);
            li.createEl('code', { text: item, attr: { style: 'font-size:13px; font-family:var(--font-monospace);' } });

            li.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', String(index));
            });
            li.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragData = e.dataTransfer?.getData('text/plain');
                const dragIdx = dragData ? parseInt(dragData) : -1;
                if (dragIdx < 0 || dragIdx === index) return;
                const moved = this.chapterItems.splice(dragIdx, 1)[0];
                if (moved === undefined) return;
                this.chapterItems.splice(index, 0, moved);
                this.renderChapterList(listEl);
            });
        });
    }

    // ---------- Structure Panel ----------
    private buildStructurePanel(container: HTMLDivElement) {
        const row = container.createDiv({ cls: 'row', attr: { style: 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; padding-top:0; border-bottom:0.5px solid var(--background-modifier-border); padding-bottom:12px; margin-bottom:8px;' } });
        row.createSpan({ text: 'Start a new chapter at each note', attr: { style: 'font-size:14px;' } });
        this.createToggle(row, true);

        container.createEl('p', { text: 'Heading level decides structural importance', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });

        const levelRows = container.createDiv({ attr: { style: 'display:flex; flex-direction:column; gap:6px;' } });

        const levels = [
            { id: 'lvl1', tag: 'H1', def: 'bold' },
            { id: 'lvl2', tag: 'H2', def: 'paragraph' },
            { id: 'lvl3', tag: 'H3', def: 'italic' },
            { id: 'lvl4', tag: 'H4', def: 'paragraph' }
        ];

        const options = [
            { value: 'paragraph', label: 'Paragraph' },
            { value: 'bold', label: 'Bold text' },
            { value: 'italic', label: 'Cursiva' }
        ];

        const selectMap: Record<string, HTMLSelectElement> = {};
        levels.forEach(l => {
            const rowDiv = levelRows.createDiv({ cls: 'row', attr: { style: 'display:flex; align-items:center; gap:12px; padding:4px 0;' } });
            rowDiv.createEl('code', { text: l.tag, attr: { style: 'font-size:13px; font-family:var(--font-monospace); width:28px;' } });
            const select = rowDiv.createEl('select', { attr: { style: 'width:160px;' } });
            options.forEach(opt => {
                select.createEl('option', { value: opt.value, text: opt.label });
            });
            select.value = l.def;
            selectMap[l.id] = select;
            select.addEventListener('change', () => this.updateStructurePreview(selectMap));
        });

        container.createEl('p', { text: 'Preview with sample headings', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin-top:16px;' } });
        this.previewDiv = container.createDiv({
            attr: { style: 'background:var(--background-secondary); border-radius:var(--radius-s); padding:12px;' }
        });
        this.updateStructurePreview(selectMap);
    }

    private updateStructurePreview(selectMap: Record<string, HTMLSelectElement>) {
        const preview = this.previewDiv;
        if (!preview) return;

        const sample = [
            { level: 1, text: 'Getting started' },
            { level: 2, text: 'Installation' },
            { level: 2, text: 'Configuration' },
            { level: 3, text: 'Advanced options' },
            { level: 4, text: 'Edge case notes' },
            { level: 1, text: 'Deployment' }
        ];

        const styleMap: Record<string, { css: string; label: string }> = {
            paragraph: { css: '', label: 'Paragraph' },
            bold: { css: 'font-weight:bold;', label: 'Bold' },
            italic: { css: 'font-style:italic;', label: 'Italic' }
        };

        let html = '';
        sample.forEach(h => {
            const sel = selectMap[`lvl${h.level}`];
            if (!sel) return;
            const role = sel.value;
            const st = styleMap[role];
            if (!st) return;
            const indent = (h.level - 1) * 16;
            html += `<div style="display:flex; align-items:center; gap:8px; padding:3px 0; margin-left:${indent}px;">
                <span style="font-size:11px; background:var(--background-modifier-hover); color:var(--text-normal); padding:2px 8px; border-radius:999px;">${st.label}</span>
                <span style="font-size:13px; ${st.css}">${h.text}</span>
            </div>`;
        });
        preview.innerHTML = html;
    }

    // ---------- Front Matter Panel ----------
    private buildFrontPanel(container: HTMLDivElement) {
        // Cover page
        const coverRow = container.createDiv({ cls: 'row', attr: { style: 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; padding-top:0;' } });
        const coverLabel = coverRow.createDiv();
        coverLabel.createSpan({ text: 'Cover page', attr: { style: 'font-size:14px;' } });
        coverLabel.createEl('p', { text: 'Title page before chapter 1', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 0;' } });
        const coverToggle = this.createToggle(coverRow, true);

        const coverFields = container.createDiv({ attr: { style: 'display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0 14px;' } });
        const coverInputs = [
            { label: 'Title', type: 'text', value: 'My book' },
            { label: 'Subtitle', type: 'text', placeholder: 'Optional' },
            { label: 'Author', type: 'text', placeholder: 'Jane Doe' },
            { label: 'Cover image', type: 'file', value: 'assets/cover.png' }
        ];
        coverInputs.forEach(f => {
            const div = coverFields.createDiv();
            div.createEl('p', { text: f.label, cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });
            if (f.type === 'file') {
                const row = div.createDiv({ attr: { style: 'display:flex; gap:6px;' } });
                const input = row.createEl('input', { attr: { type: 'text', placeholder: f.placeholder || '', value: f.value || '', style: 'width:100%;' } });
                const btn = row.createEl('button', { attr: { 'aria-label': 'Upload cover image', style: 'width:36px; padding:0; flex-shrink:0;' } });
                btn.createSpan({ cls: 'ti ti-upload', attr: { style: 'font-size:15px;' } });
                btn.addEventListener('click', () => { input.value = 'cover.png'; });
            } else {
                div.createEl('input', { attr: { type: f.type, placeholder: f.placeholder || '', value: f.value || '', style: 'width:100%;' } });
            }
        });

        coverToggle.addEventListener('change', () => {
            coverFields.style.display = coverToggle.checked ? 'grid' : 'none';
        });

        // Table of Contents
        const tocRow = container.createDiv({ cls: 'row', attr: { style: 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-top:0.5px solid var(--background-modifier-border);' } });
        const tocLabel = tocRow.createDiv();
        tocLabel.createSpan({ text: 'Table of contents', attr: { style: 'font-size:14px;' } });
        const tocToggle = this.createToggle(tocRow, true);

        const tocFields = container.createDiv({ attr: { style: 'display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0 14px;' } });
        const depthDiv = tocFields.createDiv();
        depthDiv.createEl('p', { text: 'Depth', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });
        const depthSelect = depthDiv.createEl('select', { attr: { style: 'width:100%;' } });
        [1, 2, 3, 4].forEach(d => {
            depthSelect.createEl('option', { value: String(d), text: String(d) });
        });
        depthSelect.value = '2';

        const titleDiv = tocFields.createDiv();
        titleDiv.createEl('p', { text: 'Title', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });
        titleDiv.createEl('input', { attr: { type: 'text', value: 'Contents', style: 'width:100%;' } });

        tocToggle.addEventListener('change', () => {
            tocFields.style.display = tocToggle.checked ? 'grid' : 'none';
        });
    }

    // ---------- Output Panel ----------
    private buildOutputPanel(container: HTMLDivElement) {
        const formats = [
            { id: 'fmtPdf', label: 'PDF', checked: true },
            { id: 'fmtDocx', label: 'DOCX', checked: false },
            { id: 'fmtLatex', label: 'LaTeX source', checked: false }
        ];

        const fmtContainer = container.createDiv({ attr: { style: 'display:flex; flex-direction:column; gap:10px; margin-bottom:16px;' } });
        formats.forEach(f => {
            const wrap = fmtContainer.createDiv({
                attr: { style: 'padding:10px 12px; background:var(--background-secondary); border-radius:var(--radius-s);' }
            });
            const row = wrap.createDiv({ attr: { style: 'display:flex; align-items:center; gap:8px; font-size:14px; padding:0;' } });
            const cb = row.createEl('input', { attr: { type: 'checkbox', id: f.id } });
            if (f.checked) cb.checked = true;
            row.createEl('label', { text: f.label, attr: { for: f.id } });
        });

        // Save path
        container.createEl('p', { text: 'Save to', cls: 'sub', attr: { style: 'font-size:12px; color:var(--text-muted); margin:2px 0 4px;' } });
        const pathRow = container.createDiv({ attr: { style: 'display:flex; gap:6px; align-items:center;' } });
        const pathInput = pathRow.createEl('input', {
            attr: { type: 'text', placeholder: '/path/to/export', value: './book', style: 'flex:1;' }
        });
        const browseBtn = pathRow.createEl('button', { text: 'Browse', attr: { style: 'white-space:nowrap;' } });
        browseBtn.addEventListener('click', async () => {
            try {
                const dirHandle = await (window as any).showDirectoryPicker();
                pathInput.value = dirHandle.name;
            } catch {
                console.log('Directory picker not supported, please enter path manually.');
            }
        });
    }

    // ---------- Toggle ----------
    private createToggle(container: HTMLElement, initialState: boolean): HTMLInputElement {
        const label = container.createEl('label', { cls: 'tg' });
        const input = label.createEl('input', { attr: { type: 'checkbox' } });
        if (initialState) input.checked = true;
        label.createEl('i');
        return input;
    }
}
