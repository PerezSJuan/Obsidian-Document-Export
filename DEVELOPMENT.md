# Development

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm

## Setup

```bash
npm install
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start esbuild in watch mode (rebuilds on changes) |
| `npm run build` | Type-check with `tsc` then production bundle with esbuild |
| `npm run deploy` | Build then copy artifacts to the Obsidian vault plugins directory |
| `npm run lint` | Run ESLint across the project |
| `npm test` | Run all tests with vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run version` | Bump version in `manifest.json` and `versions.json` |

## Deploy to Obsidian

The `deploy` script builds the plugin and copies `main.js`, `manifest.json`, and `styles.css` to your Obsidian vault's plugins directory.

### Configure `.env.local`

Create a `.env.local` file in the project root (it is gitignored by default):

```bash
OBSIDIAN_PLUGINS_DIR=/path/to/your/vault/.obsidian/plugins
```

For example:

```bash
OBSIDIAN_PLUGINS_DIR=/home/user/MyVault/.obsidian/plugins
```

### Run deploy

```bash
npm run deploy
```

The script reads the plugin ID from `manifest.json`, creates a subdirectory named after it inside `OBSIDIAN_PLUGINS_DIR`, and copies the build artifacts there. You can then reload Obsidian to see the updated plugin.

## Project Structure

```
├── src/
│   ├── main.ts                    # Plugin entry point, lifecycle, commands
│   ├── settings.ts                # Settings interface and defaults
│   ├── types.ts                   # Central type definitions
│   ├── noteSuggestModal.ts        # Suggest modal for file selection
│   ├── exportModal/               # Export configuration modal UI
│   │   ├── index.ts
│   │   ├── modal.ts
│   │   ├── helpers.ts
│   │   └── panels/
│   │       ├── source.ts          # Source/contents panel
│   │       ├── structure.ts       # Structure/heading mapping panel
│   │       ├── front.ts           # Front matter/cover panel
│   │       └── output.ts          # Output format/formatting panel
│   ├── docsComposers/             # Document pipeline
│   │   ├── normalizer.ts          # Obsidian markdown → normalized markdown
│   │   ├── assembler.ts           # Notes → single document with frontmatter
│   │   ├── exportManager.ts       # Pipeline orchestrator
│   │   └── creators/
│   │       ├── creator.ts         # Creator interface
│   │       ├── assetResolver.ts   # AssetResolver interface
│   │       ├── docxCreator.ts     # DOCX renderer (docx.js)
│   │       ├── latexCreator.ts    # LaTeX renderer
│   │       └── pdfCreator.ts      # PDF renderer (PDFKit)
│   ├── infra/
│   │   └── obsidianAssetResolver.ts  # Vault-backed asset resolution
│   └── utils/
│       └── vaultPath.ts          # Vault path utilities
├── tests/                         # Vitest test suite
├── esbuild.config.mjs             # esbuild bundler configuration
├── deploy-plugin.mjs              # Deploy script
├── version-bump.mjs               # Version bump script
└── manifest.json                  # Plugin manifest
```

## Release Process

1. Update `version` in `manifest.json` following SemVer.
2. Run `npm run version` to sync `versions.json`.
3. Run `npm run build` to produce the final `main.js`.
4. Create a GitHub release with tag matching the version (no leading `v`).
5. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.
