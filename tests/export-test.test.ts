/**
 * @vitest-environment jsdom
 *
 * ─────────────────────────────────────────────────────────────────────
 *  CÓMO USAR
 * ─────────────────────────────────────────────────────────────────────
 *  1. Editar la fórmula abajo (FORMULA, SVG_ID)
 *  2. npx vitest run tests/export-test.test.ts
 *  3. Abrir test-output/<nombre>.svg en el navegador
 *
 *  Usa el GlyphExtractor REAL + FontManager real (opentype.js con
 *  fuentes .ttf). Las posiciones de glifos se corrigen post-extracción
 *  porque jsdom no hace layout del DOM.
 *
 *  En Obsidian (navegador real), getBoundingClientRect() da las
 *  posiciones reales y NO se necesita corrección.
 * ─────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as opentype from 'opentype.js';
import { GlyphExtractor } from '../src/core/GlyphExtractor.js';
import type { ExtractResult, GlyphData } from '../src/types/index.js';

const FONT_DIR = path.resolve(process.cwd(), 'node_modules/katex/dist/fonts');
const OUT_DIR = path.resolve(process.cwd(), 'test-output');
const BASE = 24; // px, tamaño base de la fórmula

const FAMILIES = [
	'KaTeX_Main-Regular', 'KaTeX_Math-Italic',
	'KaTeX_Size1-Regular', 'KaTeX_Size2-Regular',
	'KaTeX_Size3-Regular', 'KaTeX_Size4-Regular',
];
const FONT_MAP: Record<string, string> = {
	KaTeX_Main: 'KaTeX_Main-Regular',
	KaTeX_Math: 'KaTeX_Math-Italic',
	KaTeX_Size1: 'KaTeX_Size1-Regular',
	KaTeX_Size2: 'KaTeX_Size2-Regular',
	KaTeX_Size3: 'KaTeX_Size3-Regular',
	KaTeX_Size4: 'KaTeX_Size4-Regular',
};

let _fonts: Map<string, opentype.Font> | null = null;

function getFonts(): Map<string, opentype.Font> {
	if (!_fonts) {
		_fonts = new Map();
		for (const f of FAMILIES) {
			_fonts.set(f, opentype.parse(fs.readFileSync(path.join(FONT_DIR, `${f}.ttf`))));
		}
	}
	return _fonts;
}

function resolveFont(fontFamily: string): opentype.Font | null {
	const n = fontFamily.trim().replace(/['"]/g, '');
	const fonts = getFonts();
	const key = fonts.get(n) ? n
		: FONT_MAP[n] ? FONT_MAP[n]
		: Array.from(fonts.keys()).find(k => k.toLowerCase().includes(n.toLowerCase())) ?? null;
	return key ? fonts.get(key)! : null;
}

function getGlyphAdvance(char: string, fontFamily: string, fontSize: number): number {
	const font = resolveFont(fontFamily);
	if (!font) return fontSize * 0.5;
	const g = font.charToGlyph(char);
	return ((g.advanceWidth ?? 0) / font.unitsPerEm) * fontSize;
}

function fontManagerMock(): any {
	return {
		loadFonts: async () => {},
		getGlyphPath: (char: string, fontFamily: string, fontSize: number, x: number, y: number): string | null => {
			const font = resolveFont(fontFamily);
			if (!font) return null;
			return font.charToGlyph(char).getPath(x, y, fontSize).toPathData(2);
		},
		getFontByFamily: (ff: string) => resolveFont(ff),
		hasFont: (ff: string) => resolveFont(ff) !== null,
	};
}

// ── Envoltorio que usa GlyphExtractor REAL y corrige posiciones ─────
//
// jsdom no puede computar getBoundingClientRect, así que extraemos
// los caracteres con GlyphExtractor (recorrido DOM, lectura de
// estilos, detección de katex-mathml) y luego reposicionamos usando
// métricas reales de opentype.js y detección de superscripts.
function extractorConPosiciones(): any {
	const real = new GlyphExtractor();

	return {
		extract(root: HTMLElement): ExtractResult {
			const raw = real.extract(root);

			// Reposicionar usando métricas de fuente
			const fixed: GlyphData[] = [];
			let cursorX = 0;
			const baseline = BASE * 1.3;

			for (const g of raw.glyphs) {
				// Detectar superscript: el elemento está dentro de .msupsub
				// Buscamos el elemento original en el DOM
				const el = root.querySelector(
					`[data-char="${g.char}"]`,
				);
				// No tenemos referencia al DOM original desde GlyphData,
				// así que detectamos superscript por font-size reducido
				// (GlyphExtractor ya leyó el fontSize del computed style)
				const isSup = g.fontSize < BASE * 0.85;
				const size = isSup ? g.fontSize : BASE;
				const adv = getGlyphAdvance(g.char, g.fontFamily, size);
				const y = baseline + (isSup ? -size * 0.35 : 0);

				fixed.push({ ...g, x: cursorX, y, fontSize: size, advanceWidth: adv });
				cursorX += adv;
			}

			const w = cursorX + BASE;
			const h = baseline + BASE * 1.4;

			return {
				glyphs: fixed,
				svgElements: raw.svgElements,
				rootBounds: {
					width: w, height: h, left: 0, top: 0,
					right: w, bottom: h, x: 0, y: 0,
					toJSON() { return this; },
				},
			};
		},
	};
}

// ── Mock getComputedStyle (sin CSS de KaTeX, jsdom crashea) ─────────
// En vez de cargar el CSS, parseamos inline styles y clases.
function mockGetComputedStyle(): void {
	vi.stubGlobal('getComputedStyle', (_el: Element) => {
		const el = _el as HTMLElement;
		const s = el.getAttribute('style') ?? '';

		let family = 'KaTeX_Main-Regular';
		let sizePx = BASE;
		let color = '#000';

		const fm = s.match(/font-family\s*:\s*([^;]+)/i);
		if (fm) family = fm[1]!.trim().replace(/['"]/g, '');

		const sm = s.match(/font-size\s*:\s*([0-9.]+)px/i);
		if (sm) sizePx = parseFloat(sm[1]!);

		const co = s.match(/color\s*:\s*([^;]+)/i);
		if (co) color = co[1]!.trim();

		// Clases KaTeX para tamaño
		const cls = el.className ?? '';
		if (cls.includes('size1') && !cls.includes('reset-size')) sizePx = BASE * 0.5;
		if (cls.includes('size2') && !cls.includes('reset-size')) sizePx = BASE * 0.6;
		if (cls.includes('size3') && !cls.includes('reset-size')) sizePx = BASE * 0.7;
		if (cls.includes('size4') && !cls.includes('reset-size')) sizePx = BASE * 0.8;
		if (cls.includes('size5') && !cls.includes('reset-size')) sizePx = BASE * 0.9;

		// Los elementos dentro de msupsub (superscript) tienen font-size reducido
		if (el.closest('.msupsub')) sizePx = BASE * 0.72;

		return {
			fontFamily: family,
			fontSize: `${sizePx}px`,
			color,
			getPropertyValue(prop: string) {
				if (prop === 'font-family') return family;
				if (prop === 'font-size') return `${sizePx}px`;
				if (prop === 'color') return color;
				return '';
			},
		};
	});
}

describe('quick export', () => {
	beforeAll(() => {
		mockGetComputedStyle();
	});

	afterAll(() => {
		vi.unstubAllGlobals();
	});

	it('usa GlyphExtractor real + corrige posiciones con opentype.js', async () => {
		// ── Editar acá ───────────────────────────────────────────
		const FORMULA = '\\int_{\\partial \\Omega} \\mathbf{F} \\cdot d\\mathbf{S} = \\int_{\\Omega} (\\nabla \\cdot \\mathbf{F}) \\, dV';
		const SVG_ID = 'Stokes generalization';
		// ─────────────────────────────────────────────────────────

		const katex = await import('katex');
		const html = katex.renderToString(FORMULA, {
			displayMode: true,
			throwOnError: true,
		});

		document.body.innerHTML = `<div class="katex-display" id="eq">${html}</div>`;
		const container = document.getElementById('eq')!;

		container.getBoundingClientRect = () => ({
			width: 500, height: 80, left: 0, top: 0,
			right: 500, bottom: 80, x: 0, y: 0,
			toJSON() { return this; },
		});

		const { MathExporter } = await import('../src/MathExporter.js');
		const exporter = new MathExporter(
			fontManagerMock(),
			extractorConPosiciones(),
		);
		const result = await exporter.exportToSvg(container, SVG_ID);

		if (!fs.existsSync(OUT_DIR)) {
			fs.mkdirSync(OUT_DIR, { recursive: true });
		}
		fs.writeFileSync(path.join(OUT_DIR, `${SVG_ID}.svg`), result.svg);

		expect(result.id).toBe(SVG_ID);
		expect(result.svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(result.svg).toContain('<svg');
		expect(result.svg).toContain('</svg>');
		expect(result.svg).toContain('<path');
		console.log(`\n  SVG escrito: test-output/${SVG_ID}.svg`);
		console.log(`  ViewBox: ${result.viewBox}`);
	});
});
