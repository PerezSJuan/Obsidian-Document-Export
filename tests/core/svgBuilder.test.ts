import { describe, it, expect, vi } from 'vitest';
import { SvgBuilder } from '../../src/core/SvgBuilder.js';

describe('SvgBuilder', () => {
	it('construye SVG con paths y elementos serializados', () => {
		const mockFontManager = {
			getGlyphPath: (char: string) => `M${char.charCodeAt(0)} 0 1 1`,
		} as any;

		const builder = new SvgBuilder(mockFontManager);

		const glyphs = [
			{ char: 'A', x: 1, y: 2, fontSize: 16, fontFamily: 'KaTeX_Main-Regular', color: '#ff0000', advanceWidth: 8 },
			{ char: 'B', x: 10, y: 12, fontSize: 16, fontFamily: 'KaTeX_Main-Regular', color: '#00ff00', advanceWidth: 9 },
		];

		const svgElements = [
			{
				type: 'g',
				attributes: { transform: 'translate(0,0)' },
				children: [
					{ type: 'text', attributes: { x: '0', y: '0' }, children: [], textContent: 'hi' },
				],
				textContent: undefined,
				absoluteX: 0,
				absoluteY: 0,
			},
		];

		const svg = builder.build(glyphs as any, svgElements as any, 200, 100, 'myid');

		expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(svg).toContain('<svg id="myid"');
		expect(svg).toContain('fill="#ff0000"');
		expect(svg).toContain('fill="#00ff00"');
		expect(svg).toContain('<text x="0" y="0">');
		expect(svg).toContain('hi');
	});
});
