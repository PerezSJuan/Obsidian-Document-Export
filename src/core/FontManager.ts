import type { FontUrlMap } from '../types/index.js';
import type { Font } from 'opentype.js';
import * as opentype from 'opentype.js';

const DEFAULT_FONT_URLS: FontUrlMap = {
	'KaTeX_Main-Regular': '/fonts/KaTeX_Main-Regular.ttf',
	'KaTeX_Math-Italic': '/fonts/KaTeX_Math-Italic.ttf',
	'KaTeX_Size1-Regular': '/fonts/KaTeX_Size1-Regular.ttf',
	'KaTeX_Size2-Regular': '/fonts/KaTeX_Size2-Regular.ttf',
	'KaTeX_Size3-Regular': '/fonts/KaTeX_Size3-Regular.ttf',
	'KaTeX_Size4-Regular': '/fonts/KaTeX_Size4-Regular.ttf',
};

const FONT_FAMILY_MAP: Record<string, string> = {
	'KaTeX_Main': 'KaTeX_Main-Regular',
	'KaTeX_Math': 'KaTeX_Math-Italic',
	'KaTeX_Size1': 'KaTeX_Size1-Regular',
	'KaTeX_Size2': 'KaTeX_Size2-Regular',
	'KaTeX_Size3': 'KaTeX_Size3-Regular',
	'KaTeX_Size4': 'KaTeX_Size4-Regular',
};

export class FontManager {
	private static instance: FontManager | null = null;
	private fonts: Map<string, Font> = new Map();
	private fontUrls: FontUrlMap;
	private loaded = false;

	public constructor(fontUrls: FontUrlMap = DEFAULT_FONT_URLS) {
		this.fontUrls = fontUrls;
	}

	public static getInstance(fontUrls?: FontUrlMap): FontManager {
		if (!FontManager.instance) {
			FontManager.instance = new FontManager(fontUrls);
		}
		return FontManager.instance;
	}

	public static reset(fontUrls?: FontUrlMap): void {
		FontManager.instance = null;
	}

	public async loadFonts(): Promise<void> {
		if (this.loaded) {
			return;
		}

		const fontEntries = Object.entries(this.fontUrls);
		const loadPromises = fontEntries.map(async ([family, url]) => {
			try {
				const response = await fetch(String(url));
				if (!response.ok) {
					throw new Error(`Failed to fetch font ${family} from ${url}`);
				}
				const arrayBuffer = await response.arrayBuffer();
				const font = opentype.parse(arrayBuffer);
				this.fonts.set(family, font);
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				return;
			}
		});

		await Promise.all(loadPromises);
		this.loaded = true;
	}

	public getGlyphPath(
		char: string,
		fontFamily: string,
		fontSize: number,
		x: number,
		y: number,
	): string | null {
		const resolvedFamily = this.resolveFontFamily(fontFamily);
		if (!resolvedFamily) {
			return null;
		}

		const font = this.fonts.get(resolvedFamily);
		if (!font) {
			return null;
		}

		const glyph = font.charToGlyph(char);
		const path = glyph.getPath(x, y, fontSize);
		return path.toPathData(2);
	}

	public getFontByFamily(fontFamily: string): Font | null {
		const resolvedFamily = this.resolveFontFamily(fontFamily);
		return resolvedFamily ? this.fonts.get(resolvedFamily) ?? null : null;
	}

	private resolveFontFamily(fontFamily: string): string | null {
		const normalized = fontFamily.trim().replace(/['"]/g, '');
		if (this.fonts.has(normalized)) {
			return normalized;
		}
		if (FONT_FAMILY_MAP[normalized]) {
			return FONT_FAMILY_MAP[normalized];
		}
		const matching = Object.keys(this.fonts).find((name) => name.toLowerCase().includes(normalized.toLowerCase()));
		return matching ?? null;
	}

	public hasFont(fontFamily: string): boolean {
		return this.fonts.has(fontFamily);
	}
}
