# Document Export

An [Obsidian](https://obsidian.md) plugin that exports your vault notes to **PDF**, **DOCX**, or **LaTeX** book formats with full control over structure, formatting, and content.

## Features

- **Multi-format export** — Generate PDF (via PDFKit), DOCX (via docx.js), or LaTeX output from your notes.
- **Two content modes** — Choose notes via an index note with wikilinks (manifest mode) or manually pick and reorder them.
- **Heading mapping** — Map H1–H4 to document structure elements (part, chapter, section, subsection) or to inline styles (bold, italic, paragraph).
- **Front matter & cover page** — Set title, subtitle, author, cover image, and enable a table of contents.
- **Custom formatting** — Choose from 8 font families, set base font size (8–14pt), and configure page number position.
- **Obsidian syntax normalization** — Converts wikilinks, tags, highlights, comments, callouts, and image embeds to standard markdown.
- **Table of contents** — Auto-generated TOC with configurable depth and title.
- **Asset resolution** — Embedded images and files are resolved through the Obsidian vault API.
- **Drag-and-drop reordering** — In manual mode, reorder notes with drag and drop.

## Installation

### From a release

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/your-username/obsidian-document-export/releases).
2. Create the folder `<vault>/.obsidian/plugins/obsidian-document-export/` in your vault.
3. Copy the three files into that folder.
4. In Obsidian, go to **Settings → Community plugins**, refresh the list, and enable **Document Export**.

### From source (development)

See [DEVELOPMENT.md](./DEVELOPMENT.md) for building and deploying from source.

## Usage

Open the command palette (`Ctrl/Cmd + P`) and run **Document Export: Export vault**. The export configuration modal appears with four panels.

### 1. Source panel

Controls what content to export and its metadata.

**Content mode:**
- **Manifest** — Select an index note. The plugin parses its wikilinks (e.g., `[[Chapter 1]]`, `[[Chapter 2]]`) to discover and order the notes to export. When you pick an index note, the detected chapters are shown in order.
- **Manual** — Add individual notes one by one using the note suggester. Reorder them by dragging the handle on the left of each row. Remove a note with the X button.

**Metadata:**
- **Title** — Book/document title (used in the cover page and document metadata).
- **Subtitle** — Optional subtitle for the cover page.
- **Author** — Author name for the cover page and metadata.

### 2. Structure panel

Controls how headings and structural elements are handled.

- **New chapter per note** — When enabled, each note starts on a new chapter (or top-level structure element).
- **Heading mapping** — For each heading level H1 through H4, choose what it maps to:
  - *Part* — Top-level division (page break before, rendered as part heading).
  - *Chapter* — Chapter-level division.
  - *Section* — Section-level division.
  - *Subsection* — Subsection-level division.
  - *Inline* — Rendered as inline bold text, no structural break.
  - *Paragraph* — Rendered as a regular paragraph.
  - *Bold* — Rendered as bold text.
  - *Italic* — Rendered as italic text.
- **Reference handling** — Choose how reference-style links are processed.
- **Tag handling** — Choose whether to keep, bold, or strip `#tags` from the content.

### 3. Front matter panel

Controls cover page and table of contents settings.

- **Cover page** — Toggle to include a cover page with the document title, subtitle, and author.
- **Use book metadata** — When enabled, the cover pulls metadata from the book structure (frontmatter).
- **Cover image** — Select an image file to display on the cover page. Uses the OS file picker.
- **Table of contents** — Toggle to include an auto-generated table of contents.
  - **TOC depth** — How many heading levels to include in the TOC (1–6).
  - **TOC title** — Custom title for the table of contents (e.g., "Contents" or "Table of Contents").

### 4. Output panel

Controls output formats, formatting, and save location.

**Formats:**
- **PDF** — Export to PDF using PDFKit.
- **DOCX** — Export to Microsoft Word format using docx.js.
- **LaTeX** — Export to LaTeX source code (`.tex`).

**Formatting:**
- **Font family** — Choose from: Times New Roman, Arial, Helvetica, Courier New, Georgia, Garamond, Palatino, or Book Antiqua.
- **Base font size** — Set the base font size from 8pt to 14pt (default 12pt).
- **Page numbers** — Toggle page numbers on/off and choose a position:
  - Top left, Top center, Top right
  - Bottom left, Bottom center, Bottom right

**Save path:**
- Click **Select folder** to choose where the exported files are saved in your vault. The folder path is displayed once selected.

### Running the export

Once all panels are configured, click the **Export** button at the bottom. The plugin processes each selected format through the document pipeline:
1. **Normalize** — Each note's markdown is parsed: frontmatter extracted, wikilinks resolved, tags/highlights/comments/callouts converted.
2. **Assemble** — All normalized notes are combined into a single document with frontmatter metadata.
3. **Render** — Each enabled format renders the document to its target format.
4. **Save** — The generated files are written to the selected vault folder.

Files are named automatically: `<title>-<format>.<ext>` (e.g., `MyBook-pdf.pdf`, `MyBook-docx.docx`, `MyBook-latex.tex`).

## Configuration

### Plugin settings

Accessible via **Settings → Community plugins → Document Export**.

- **Output format** — Set a default output format for new export sessions.

Settings are persisted automatically via Obsidian's `loadData`/`saveData` API.

### Commands

| Command ID | Name | Description |
|---|---|---|
| `export-document` | Export vault | Opens the export configuration modal |
| `export-document-check` | Export vault (check) | Reserved variant for validation workflows |

## Output format details

### PDF

- Generated with PDFKit.
- Supports cover page with optional image, table of contents, headings, paragraphs, bold/italic/code spans, blockquotes, lists (ordered and unordered), tables, code blocks with background shading, images, and horizontal rules.
- Page numbers in six configurable positions.
- Uses standard PDF fonts (Times-Roman, Helvetica, Courier) or configured font family.

### DOCX

- Generated with docx.js library.
- Full Word document with cover page, TOC, styled headings, inline formatting, images, code blocks, blockquotes, lists, tables, and horizontal rules.
- Font family and base font size applied throughout.
- Page numbers in configurable positions.
- Compatible with Microsoft Word, Google Docs, LibreOffice, and other DOCX-compatible software.

### LaTeX

- Generates a complete, compilable `.tex` file using the `book` document class.
- Preamble includes: `graphicx`, `hyperref`, `tocloft`, `fancyhdr`, `listings`, `xcolor`.
- Cover page via `\maketitle` or `\begin{titlepage}`.
- Proper LaTeX escaping for special characters.
- Headings map to `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`.
- Inline formatting: `\textbf`, `\textit`, `\texttt`, `\href`.
- Code blocks via `lstlisting` or `verbatim`.
- Tables via `tabular` environment.
- Page numbers via `fancyhdr`.
- Compile with `pdflatex` or `xelatex`.

## Syntax normalization

The plugin automatically converts Obsidian-specific markdown to standard markdown before rendering:

| Obsidian syntax | Converted to |
|---|---|
| `[[Internal link\|Display text]]` | `[Display text](Internal link)` |
| `![[image.png]]` | `![image.png](image.png)` |
| `==highlighted text==` | `<mark>highlighted text</mark>` |
| `%% comment %%` | Removed |
| `> [!type] Title` | `> **Title**` |
| `#tag` | Kept, bold, or stripped (configurable) |

## Limitations

- **Mobile**: The plugin is marked `isDesktopOnly: false`, but some features (like the Electron file dialog for save path) may fall back to webkit-based pickers on mobile.
- **Cover image**: Must be a path accessible within the vault.
- **PDF fonts**: Only standard PDF fonts (Times, Helvetica, Courier) are embedded; other font selections may fall back gracefully.

## Development

For setup instructions, available npm scripts, deployment configuration, project structure, and release process, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## License

[MIT](./LICENSE)
