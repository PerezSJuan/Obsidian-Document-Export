export interface GlyphData {
	char: string;
	x: number;
	y: number;
	fontSize: number;
	fontFamily: string;
	color: string;
	advanceWidth: number;
}

export interface SvgElement {
	type: string;
	attributes: Record<string, string>;
	children: SvgElement[];
	textContent?: string;
	absoluteX: number;
	absoluteY: number;
}

export interface ExtractResult {
	glyphs: GlyphData[];
	svgElements: SvgElement[];
	rootBounds: DOMRect;
}

export interface SvgExportResult {
	id: string;
	svg: string;
	width: number;
	height: number;
	viewBox: string;
}

export type FontUrlMap = Record<string, string>;
