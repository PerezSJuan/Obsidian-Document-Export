import type { ExtractResult, GlyphData, SvgElement } from '../types/index.js';

const SVG_CONTAINER_SELECTORS = ['.svg', '.delimsizing', '.sqrt', '.msqrt', '.mroot', '.mpadded', '.mfrac'];

function getAbsolutePosition(element: Element, rootRect: DOMRect): { x: number; y: number } {
	const rect = element.getBoundingClientRect();
	return {
		x: rect.left - rootRect.left,
		y: rect.top - rootRect.top,
	};
}

function getElementColor(element: Element): string {
	const style = window.getComputedStyle(element as HTMLElement);
	return style.color || '#000';
}

function extractSvgElement(node: Element, rootRect: DOMRect): SvgElement | null {
	const tag = node.tagName.toLowerCase();
	if (!['svg', 'g', 'path', 'rect', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'text'].includes(tag)) {
		return null;
	}

	const attributes: Record<string, string> = {};
	for (const attr of Array.from(node.attributes)) {
		attributes[attr.name] = attr.value;
	}

	if (tag === 'svg') {
		const rect = node.getBoundingClientRect();
		if (rect.width > 0) attributes['width'] = String(rect.width);
		if (rect.height > 0) attributes['height'] = String(rect.height);
	}

	const { x, y } = getAbsolutePosition(node, rootRect);

	return {
		type: tag,
		attributes,
		children: Array.from(node.children)
			.map((child) => extractSvgElement(child, rootRect))
			.filter((child): child is SvgElement => child !== null),
		textContent: node.textContent?.trim() || undefined,
		absoluteX: x,
		absoluteY: y,
	};
}

function shouldExtractNode(node: Element): boolean {
	return SVG_CONTAINER_SELECTORS.some((selector) => node.matches(selector)) || node.tagName.toLowerCase() === 'svg';
}

function collectSvgElements(root: Element, rootRect: DOMRect, result: SvgElement[]): void {
	for (const child of Array.from(root.children)) {
		if (child.closest('.katex-mathml')) {
			continue;
		}
		const extracted = shouldExtractNode(child) ? extractSvgElement(child, rootRect) : null;
		if (extracted) {
			result.push(extracted);
		} else {
			collectSvgElements(child, rootRect, result);
		}
	}
}

function extractGlyphs(root: HTMLElement, rootRect: DOMRect): GlyphData[] {
	const glyphs: GlyphData[] = [];

	function recurse(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const parent = node.parentElement;
			if (!parent) {
				return;
			}

			if (parent.closest('.katex-mathml')) {
				return;
			}

			const textContent = node.textContent ?? '';
			if (textContent.trim().length === 0) {
				return;
			}

			if (parent.closest('svg')) {
				return;
			}

			const style = window.getComputedStyle(parent);
			const rawFamily = style.fontFamily || '';
			const primaryFamily = rawFamily.split(',')[0] ?? '';
			const fontFamily = primaryFamily.replace(/['"]+/g, '').trim() || 'KaTeX_Main-Regular';
			const fontSize = parseFloat(style.fontSize) || 16;
			const color = style.color || '#000';

			for (let index = 0; index < textContent.length; index += 1) {
				const char = textContent[index];
				if (!char || !char.trim()) {
					continue;
				}

				const span = document.createElement('span');
				span.textContent = char;
				span.style.display = 'inline-block';
				span.style.padding = '0';
				span.style.margin = '0';
				span.style.border = 'none';
				span.style.position = 'relative';
				parent.insertBefore(span, node);
				const rect = span.getBoundingClientRect();

				const x = rect.left - rootRect.left;
				const y = rect.top - rootRect.top;
				const advanceWidth = rect.width;

				glyphs.push({ char, x, y, fontSize, fontFamily, color, advanceWidth });
				parent.removeChild(span);
			}
			return;
		}

		for (const child of Array.from(node.childNodes)) {
			recurse(child);
		}
	}

	recurse(root);
	return glyphs;
}

export class GlyphExtractor {
	public extract(root: HTMLElement): ExtractResult {
		const rootRect = root.getBoundingClientRect();
		const glyphs = extractGlyphs(root, rootRect);
		const svgElements: SvgElement[] = [];
		collectSvgElements(root, rootRect, svgElements);

		return {
			glyphs,
			svgElements,
			rootBounds: rootRect,
		};
	}
}
