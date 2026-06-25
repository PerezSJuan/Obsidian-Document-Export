/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { MathExporter } from '../../src/MathExporter.js';

describe('MathExporter (unit)', () => {
	beforeEach(() => {
		document.body.innerHTML = `<div class="katex-display"></div>`;
	});

	it('exportToSvg devuelve SVG con id y paths', async () => {
		const el = document.querySelector('.katex-display') as HTMLElement;
		el.getBoundingClientRect = () => ({ width: 10, height: 20, left: 0, top: 0, right: 10, bottom: 20, x: 0, y: 0, toJSON: () => {} });

		const mockFontManager = {
			loadFonts: vi.fn().mockResolvedValue(undefined),
			getGlyphPath: vi.fn(() => 'M0 0h10v10z'),
		} as any;

		const mockExtractor = {
			extract: () => ({
				glyphs: [
					{ char: 'a', x: 0, y: 0, fontSize: 16, fontFamily: 'KaTeX_Main-Regular', color: '#000', advanceWidth: 8 },
				],
				svgElements: [],
				rootBounds: { width: 10, height: 20, left: 0, top: 0, right: 10, bottom: 20, x: 0, y: 0, toJSON: () => {} },
			}),
		} as any;

		const exporter = new MathExporter(mockFontManager, mockExtractor);
		const res = await exporter.exportToSvg(el, 'testid');

		expect(res.id).toBe('testid');
		expect(res.svg).toContain('<svg');
		expect(res.svg).toContain('<path');
	});
});
