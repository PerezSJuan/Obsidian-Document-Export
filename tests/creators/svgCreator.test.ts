/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';

import { SvgCreator } from '../../src/docsComposers/creators/svgCreator.js';

describe('SvgCreator', () => {
	it('lanza si no hay elemento KaTeX en el DOM', async () => {
		document.body.innerHTML = ``;

		const mockExporter = {
			exportToSvg: vi.fn(),
		} as any;

		const creator = new SvgCreator(mockExporter);
		await expect(creator.render('', { source: { metadata: { title: 'eq' } } } as any, {} as any)).rejects.toThrow('No KaTeX element found');
	});

	it('usa MathExporter y devuelve data SVG', async () => {
		document.body.innerHTML = `<div class="katex-display"></div>`;

		const mockExporter = {
			exportToSvg: vi.fn().mockResolvedValue({ id: 'mockid', svg: '<svg>mock</svg>', width: 10, height: 20, viewBox: '0 0 10 20' }),
		} as any;

		const creator = new SvgCreator(mockExporter);
		const res = await creator.render('', { source: { metadata: { title: 'eq' } } } as any, {} as any);
		expect(res.data).toBe('<svg>mock</svg>');
		expect(res.fileName).toMatch(/\.svg$/);
	});
});
