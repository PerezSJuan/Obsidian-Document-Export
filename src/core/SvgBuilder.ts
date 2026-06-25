import type { GlyphData, SvgElement } from '../types/index.js';
import { FontManager } from './FontManager.js';

function indent(level: number): string {
	return '  '.repeat(level);
}

function serializeAttributes(attributes: Record<string, string>): string {
	return Object.entries(attributes)
		.map(([name, value]) => `${name}="${value.replace(/"/g, '&quot;')}"`)
		.join(' ');
}

function serializeSvgElement(element: SvgElement, level = 1): string {
	let attrs = serializeAttributes(element.attributes);
	if (element.type === 'svg' && element.absoluteX !== undefined && element.absoluteY !== undefined) {
		if (!element.attributes['x'] && !element.attributes['y']) {
			attrs += ` x="${element.absoluteX}" y="${element.absoluteY}"`;
		}
	}
	const children = element.children.map((child: SvgElement) => serializeSvgElement(child, level + 1)).join('\n');
	const text = element.textContent ? `${indent(level + 1)}${element.textContent}` : '';
	const content = [text, children].filter(Boolean).join('\n');
	if (content) {
		return `${indent(level)}<${element.type}${attrs ? ' ' + attrs : ''}>\n${content}\n${indent(level)}</${element.type}>`;
	}
	return `${indent(level)}<${element.type}${attrs ? ' ' + attrs : ''} />`;
}

export class SvgBuilder {
	private fontManager: FontManager;

	public constructor(fontManager?: FontManager) {
		this.fontManager = fontManager ?? FontManager.getInstance();
	}

	public build(
		glyphs: GlyphData[],
		svgElements: SvgElement[],
		width: number,
		height: number,
		id: string,
	): string {
		const glyphPaths: string[] = [];
		for (const glyph of glyphs) {
			const d = this.fontManager.getGlyphPath(
				glyph.char,
				glyph.fontFamily,
				glyph.fontSize,
				glyph.x,
				glyph.y + glyph.fontSize * 0.8,
			);

			if (d === null) {
				throw new Error(`Missing font for family ${glyph.fontFamily} when building glyph ${glyph.char}`);
			}

			if (d) {
				glyphPaths.push(`  <path d="${d}" fill="${glyph.color}" />`);
			}
		}

		const serializedSvgElements = svgElements.map((element) => serializeSvgElement(element)).join('\n');

		return `<?xml version="1.0" encoding="UTF-8"?>\n<svg id="${id}" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${glyphPaths.join('\n')}\n${serializedSvgElements}\n</svg>`;
	}
}
