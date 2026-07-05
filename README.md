# Document Export

An [Obsidian](https://obsidian.md) plugin that exports your vault notes to **PDF**, **DOCX**, or **LaTeX** book formats with full control over structure, formatting, and content.

## Features

- **Multi-format export** — Generate PDF (via pdf-lib), DOCX (via docx.js), or LaTeX output from your notes in a single run.
- **Two content modes** — Choose notes via an index note with wikilinks (manifest mode) or manually pick and reorder them.
- **Heading mapping** — Map H1–H6 to document structure elements (part, chapter, section, subsection) or to inline styles (bold, italic, paragraph).
- **Front matter & cover page** — Set title, subtitle, author, cover image, and enable a table of contents.
- **Custom formatting** — Choose from 8 font families, set base font size (8–14pt), and configure page number position.
- **Obsidian syntax normalization** — Converts wikilinks, tags, highlights, comments, callouts, and image embeds to standard markdown.
- **Table of contents** — Auto-generated TOC with configurable depth (1–6 levels).
- **Asset resolution** — Embedded images, PDFs, and files are resolved through the Obsidian vault API.
- **Drag-and-drop reordering** — In manual mode, reorder notes with drag and drop.
- **Mermaid diagrams** — Mermaid code blocks are rendered to PNG and embedded in the output.
- **KaTeX formulas** — LaTeX math expressions (`$...$` and `$$...$$`) are rendered to PNG via KaTeX for PDF/DOCX output. Left as raw syntax in LaTeX output.
- **Syntax highlighting** — Code blocks include basic syntax highlighting with color-coded keywords, strings, comments, and numbers.
- **Callout support** — All Obsidian callout types (note, tip, warning, danger, etc.) are rendered with distinct colors and styling.
- **Task lists** — Checkbox items (`- [ ]` / `- [x]`) are rendered as checkbox characters in the output.
- **Footnotes** — Block references (`^block-id`) with `[[#^block-id]]` references become footnotes.
- **Embedded PDFs** — `![[file.pdf]]` embeds are rendered page-by-page as images.
- **Recursive embed resolution** — `![[Note]]` embeds are recursively inlined with circular reference protection.
- **Internationalization** — UI is translated into 24 languages.
- **Ribbon icon** — Quick access via the file-down icon in the Obsidian sidebar.
- **Progress tracking** — A progress modal shows real-time status during export.
- **Default presets** — Save your preferred export settings as defaults for future sessions.

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
- **Manifest** — Select an index note. The plugin parses its wikilinks (e.g., `[[Chapter 1]]`, `[[Chapter 2]]`) to discover and order the notes to export. When you pick an index note, the detected chapters are shown in order. Broken wikilinks are detected and highlighted with a red badge.
- **Manual** — Add individual notes one by one using the note suggester. Reorder them by dragging the handle on the left of each row. Remove a note with the X button. Duplicate notes are automatically prevented.

**Metadata:**
- **Title** — Book/document title (used in the cover page, file naming, and document metadata).
- **Subtitle** — Optional subtitle for the cover page.
- **Author** — Author name for the cover page and metadata.

### 2. Structure panel

Controls how headings and structural elements are handled.

- **New chapter per note** — When enabled, each note starts on a new chapter (or top-level structure element). Default: enabled.
- **Heading mapping** — For each heading level H1 through H6, choose what it maps to:
  - *Part* — Top-level division (page break before, rendered as `\part{}` in LaTeX).
  - *Chapter* — Chapter-level division (H1 default). Forces a page break in PDF/DOCX.
  - *Section* — Section-level division (H2 default).
  - *Subsection* — Subsection-level division (H3 default).
  - *Inline* — Rendered as inline bold text, no structural break (H4–H6 default).
  - *Paragraph* — Rendered as a regular paragraph.
  - *Bold* — Rendered as bold text.
  - *Italic* — Rendered as italic text.
- **Wikilink handling** — Choose how `[[wikilinks]]` are processed:
  - *Resolve to note title* — Converts `[[Note]]` to `[Note](Note)` markdown links.
  - *Keep as raw text* — Leaves `[[Note]]` unchanged in the output.
  - *Strip references* — Removes all wikilink references entirely.
- **Tag handling** — Choose how `#tags` are processed:
  - *Tag text only* — `#mytag` becomes `mytag` (hash removed). Default.
  - *Convert to bold* — `#mytag` becomes **mytag**.
  - *Strip tags* — Removes all tags entirely.
- **Note name** — Optionally prepend each note's filename as a heading at any structural level (part/chapter/section/etc.) or none (default).

### 3. Front matter panel

Controls cover page and table of contents settings.

- **Cover page** — Toggle to include a cover page with the document title, subtitle, and author. Default: enabled.
- **Use book metadata** — When enabled, the cover pulls metadata from the book structure. Default: enabled.
- **Cover image** — Select an image file to display on the cover page. The image is scaled to fit the page. Uses the OS file picker.
- **Table of contents** — Toggle to include an auto-generated table of contents. Default: enabled.
  - **TOC depth** — How many heading levels to include in the TOC (1–6, default: 2).
  - **TOC title** — Custom title for the table of contents (default: "Contents").

### 4. Output panel

Controls output formats, formatting, and save location.

**Formats (select one or more):**
- **PDF** — Export to PDF using pdf-lib.
- **DOCX** — Export to Microsoft Word format using docx.js.
- **LaTeX source** — Export to LaTeX source code (`.tex`).

**Formatting:**
- **Font family** — Choose from: Times New Roman, Arial, Calibri, Georgia, Garamond, Verdana, Courier New, or Consolas. Default: Times New Roman.
- **Base font size** — Set the base font size from 8pt to 14pt (default: 11pt). Heading sizes scale relative to base: H1=2x, H2=1.7x, H3=1.4x, H4=1.2x, H5=1.1x, H6=1.05x.
- **Page numbers** — Toggle page numbers on/off (default: enabled) and choose a position:
  - Top left, Top center, Top right
  - Bottom left, Bottom center (default), Bottom right

**Save path:**
- Click **Select folder** to choose where the exported files are saved in your vault. The folder path is displayed once selected. Shows "(vault root)" when no folder is selected.

### Running the export

Once all panels are configured, click the **Export** button at the bottom. A progress modal shows the current stage:

1. **Reading notes** — Each note is read from the vault.
2. **Processing notes** — Image paths are resolved, embeds are expanded.
3. **Rendering Mermaid diagrams** — Code blocks with `mermaid` language are rendered to PNG.
4. **Rendering formulas** — `$...$` and `$$...$$` are rendered to PNG via KaTeX.
5. **Processing embedded PDFs** — `![[file.pdf]]` pages are rendered to PNG.
6. **Generating output** — Each enabled format renders the document.
7. **Saving files** — Generated files are written to the vault.

Files are named automatically: `<title>-<format>.<ext>` (e.g., `MyBook-pdf.pdf`, `MyBook-docx.docx`, `MyBook-latex.tex`). Special characters in the title are replaced with underscores.

## Output format details

### PDF

- Generated with pdf-lib.
- US Letter page size (612 x 792 points), 1-inch margins.
- **Cover page**: If a cover image is provided, it is scaled to fit and centered. Otherwise, title (28pt bold), subtitle (18pt), and author (14pt) are centered.
- **Table of contents**: Dedicated page with entries indented by depth level and page numbers right-aligned.
- **Headings**: Bold, scaled sizes. H1 structural headings force a page break. H1 and H2 get a horizontal rule underneath.
- **Code blocks**: Gray background (`#f5f5f5`), Courier 9pt font, with syntax highlighting colors (keyword=blue, string=green, comment=gray, number=orange, builtin=purple).
- **Blockquotes**: Left border bar (3px gray). Callouts get a 6px colored left border with shaded background.
- **Lists**: Bullet points or numbered, with proper indentation. Task list checkboxes rendered as square boxes with checkmark.
- **Tables**: Equal-width columns, gray header row, bordered cells, bold headers.
- **Images**: PNG and JPEG embedded directly. Image-only paragraphs are centered. Formula images are auto-trimmed.
- **Links**: Web links rendered in blue.
- **Page numbers**: 9pt font, positioned per configuration, starting after front matter.
- **Footnotes**: Block references rendered at page bottom with separator line.

### DOCX

- Generated with docx.js library.
- Full Word document with document properties (title, author).
- **Cover page**: Title (36pt bold), subtitle (24pt), author (20pt), centered.
- **Table of contents**: Native `TableOfContents` with dot leader tab stops and hyperlink support.
- **Headings**: Maps to native HeadingLevel.HEADING_1 through HEADING_6 with proper spacing. H1 triggers `pageBreakBefore`.
- **Code blocks**: Courier New font, light gray background, left border, syntax highlighting.
- **Callouts**: Colored left border (18pt width), shaded background, matching color scheme.
- **Lists**: Nested with increasing indent (400 EMU per level), alternating bullet characters (bullet, circle, square, triangle).
- **Task lists**: Checkbox characters (checked: ☑, unchecked: ☐).
- **Inline formatting**: Bold, italic, strikethrough, highlight (yellow), subscript, superscript.
- **Links**: External hyperlinks with blue color and underline.
- **Images**: Sized using actual dimensions with `scaleToFit()`.
- **Page numbers**: In footer with configurable alignment.
- **Footnotes**: Native DOCX footnotes with italic text.
- **Compatible with**: Microsoft Word, Google Docs, LibreOffice, and other DOCX readers.

### LaTeX

- Generates a complete, compilable `.tex` file using the `book` document class.
- **Preamble includes**: `inputenc`, `fontenc`, `lmodern`, `graphicx`, `hyperref`, `tocloft`, `fancyhdr`, `listings`, `xcolor`, `amssymb`, `ulem`.
- **Font packages**: Automatically includes the appropriate LaTeX package for the selected font (e.g., `mathptmx` for Times New Roman, `helvet` for Arial).
- **Cover page**: `\begin{titlepage}` with `\includegraphics` if cover image provided; otherwise `\maketitle`.
- **Table of contents**: `\tableofcontents` followed by `\newpage`.
- **Headings**: `\part{}`, `\chapter{}`, `\section{}`, `\subsection{}`, `\subsubsection{}`.
- **Inline formatting**: `\textbf{}`, `\textit{}`, `\sout{}` (strikethrough), `\colorbox{yellow}{}` (highlight), `\textsubscript{}`, `\textsuperscript{}`, `\href{}`.
- **Code blocks**: `lstlisting` environment with language specification and syntax highlighting colors, or `verbatim` for unlabeled blocks.
- **Blockquotes**: `\begin{quote}` environment. Callouts use `\fcolorbox` with colored `minipage`.
- **Lists**: `\begin{itemize}` / `\begin{enumerate}` with `\item`. Task lists use Unicode checkbox symbols.
- **Tables**: `\begin{tabular}` with alignment per column, `\hline` borders.
- **Footnotes**: `\footnote{See page \pageref{block:id}}`.
- **LaTeX escaping**: Proper escaping of `\`, `{`, `}`, `&`, `%`, `$`, `#`, `_`, `~`, `^` with protection of existing math blocks.
- **Extra files**: Image files are copied alongside the `.tex` file with sanitized filenames.
- **Compile with**: `pdflatex` or `xelatex`.

## Syntax normalization

The plugin automatically converts Obsidian-specific markdown to standard markdown before rendering. Transformations are applied in this order:

| Obsidian syntax | Converted to |
|---|---|
| `%%comment%%` | Removed |
| `==highlighted text==` | `<mark>highlighted text</mark>` |
| `^block-id` | `<blocklabel id="block-id"></blocklabel>` |
| `[[#^block-id]]` | `<footnote id="block-id">text</footnote>` |
| `~text~` | `<sub>text</sub>` |
| `^text^` | `<sup>text</sup>` |
| `[[Internal link\|Display text]]` | `[Display text](Internal link)` (resolve mode) |
| `![[image.png]]` | `![image.png](image.png)` |
| `![[file.pdf]]` | Rendered page-by-page as PNG images |
| `![[Note]]` | Content inlined recursively (with circular reference protection) |
| `#tag` | `tag`, **tag**, or removed (configurable) |
| `> [!type] Title` | Colored callout with title header |

Code blocks and math blocks (`$...$`, `$$...$$`) are protected from transformations during normalization.

## Callout types

All Obsidian callout types are supported with distinct colors:

| Type | Color |
|---|---|
| note, info, todo | Blue |
| tip, hint, important, success, check, done | Green |
| question, help, faq | Teal |
| warning, caution, attention | Orange |
| danger, error | Red |
| abstract, summary, tldr | Purple |
| default / unknown | Gray |

## Embed resolution

The plugin resolves embedded content through several layers:

- **Image embeds** (`![[image.png]]`) — Converted to standard markdown images with resolved paths.
- **PDF embeds** (`![[file.pdf]]`) — Each page is rendered to a PNG image using pdfjs-dist.
- **Media embeds** (`![[audio.mp3]]`, `![[video.mp4]]`) — Converted to links with the file path.
- **Note embeds** (`![[Other Note]]`) — Content is recursively inlined into the parent note. Circular references are detected and stopped.
- **Section embeds** (`![[Note#heading]]`) — Only the content under that heading is included.
- **Block embeds** (`![[Note#^blockid]]`) — Only the referenced block is included.
- **External URLs** (`![](https://...)`) — Fetched and embedded (10-second timeout).

## Supported languages

The UI is automatically translated based on your Obsidian language setting:

| Language | Code | Variants |
|---|---|---|
| English | `en` | — |
| Spanish | `es` | es_ES, es_MX, es_AR |
| French | `fr` | fr_FR, fr_CA, fr_BE, fr_CH |
| German | `de` | de_DE, de_AT, de_CH |
| Italian | `it` | it_IT, it_CH |
| Portuguese | `pt` | pt_PT, pt_BR |
| Russian | `ru` | ru_RU |
| Chinese | `zh` | zh_CN, zh_TW, zh_HK |
| Japanese | `ja` | ja_JP |
| Korean | `ko` | ko_KR |
| Arabic | `ar` | ar_SA, ar_EG |
| Hindi | `hi` | hi_IN |
| Turkish | `tr` | tr_TR |
| Polish | `pl` | pl_PL |
| Dutch | `nl` | nl_NL, nl_BE |
| Swedish | `sv` | sv_SE |
| Vietnamese | `vi` | vi_VN |
| Thai | `th` | th_TH |
| Indonesian | `id` | id_ID |
| Greek | `el` | el_GR |
| Czech | `cs` | cs_CZ |
| Romanian | `ro` | ro_RO |
| Hungarian | `hu` | hu_HU |
| Ukrainian | `uk` | uk_UA |

## Plugin settings

Accessible via **Settings → Community plugins → Document Export**.

The settings tab provides default presets organized into sections:

- **Source defaults** — Source mode, default index note path, default title/subtitle/author.
- **Structure defaults** — New chapter per note, heading mapping (H1–H6), wikilink mode, tag mode, note name mode.
- **Front matter defaults** — Cover page toggle, book metadata toggle, cover image path, TOC toggle, TOC depth.
- **Output defaults** — PDF/DOCX/LaTeX format toggles.
- **Formatting defaults** — Font family, font size, page numbers toggle, page number position.

Settings are persisted automatically via Obsidian's `loadData`/`saveData` API. When new settings are added in future versions, they are merged with your existing settings without overwriting them.

## Commands

| Command ID | Name | Description |
|---|---|---|
| `export-document` | Export vault | Opens the export configuration modal |

A ribbon icon (file-down) is also added to the sidebar for quick access.

## Limitations

- **Mobile**: The plugin is marked `isDesktopOnly: false`, but the folder picker may fall back to webkit-based pickers on mobile. Tested on desktop only.
- **Cover image**: Must be a path accessible within the vault.
- **PDF fonts**: PDF uses the 14 standard PDF fonts. Non-standard font selections map to the closest equivalent (e.g., Georgia → Times-Roman, Arial → Helvetica). The rendered output uses the correct font name in DOCX and LaTeX.
- **Mermaid diagrams**: In DOCX output, mermaid code blocks show a placeholder message since they cannot be natively rendered. In PDF, they are rendered to PNG. In LaTeX, they show a placeholder.
- **Formula rendering**: KaTeX formulas are rendered to PNG images for PDF/DOCX. Complex formulas with special fonts may have slight visual differences. In LaTeX output, formulas are kept as raw `$...$` syntax.
- **File size**: Exported PDFs with many images can be large. Consider compressing images in your vault before export.

## Troubleshooting

- **Plugin doesn't appear**: Ensure `main.js`, `manifest.json`, and `styles.css` are in `<vault>/.obsidian/plugins/obsidian-document-export/`. Reload Obsidian.
- **Export button does nothing**: Check that at least one output format is selected and at least one note is loaded.
- **Broken wikilinks in manifest mode**: The plugin highlights broken links in red. Verify the target notes exist in your vault.
- **Cover image not showing**: Use a vault-relative path (e.g., `assets/cover.png`). Absolute paths and URLs may not resolve correctly.
- **Formula rendering fails**: KaTeX is loaded dynamically. If it fails, the original `$...$` syntax is preserved in the output.
- **Build issues**: Run `npm install` first, then `npm run build`. See [DEVELOPMENT.md](./DEVELOPMENT.md).

## Development

For setup instructions, available npm scripts, deployment configuration, project structure, and release process, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## License

[MIT](./LICENSE)
