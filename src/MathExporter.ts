import { FontManager } from './core/FontManager.js';
import { GlyphExtractor } from './core/GlyphExtractor.js';
import { SvgBuilder } from './core/SvgBuilder.js';
import type { SvgExportResult } from './types/index.js';

export class MathExporter {
	private fontManager: FontManager;
	private extractor: GlyphExtractor;
	private builder: SvgBuilder;

	public constructor(fontManager?: FontManager, extractor?: GlyphExtractor, builder?: SvgBuilder) {
		this.fontManager = fontManager ?? FontManager.getInstance();
		this.extractor = extractor ?? new GlyphExtractor();
		this.builder = builder ?? new SvgBuilder(this.fontManager);
	}

	public async exportToSvg(element: HTMLElement, id: string): Promise<SvgExportResult> {
		await this.fontManager.loadFonts();
		const result = this.extractor.extract(element);

		if (result.glyphs.length === 0 && result.svgElements.length === 0) {
			throw new Error('No glyphs or SVG elements found inside the provided element.');
		}

		const width = result.rootBounds.width;
		const height = result.rootBounds.height;
		const viewBox = `0 0 ${Math.round(width)} ${Math.round(height)}`;
		const svg = this.builder.build(result.glyphs, result.svgElements, width, height, id);

		return { id, svg, width, height, viewBox };
	}

	public downloadSvg(result: SvgExportResult, filename: string): void {
		const blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}
}
