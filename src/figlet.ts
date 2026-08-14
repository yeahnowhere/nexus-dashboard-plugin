import { CHARS, FigletChar, FONT_HEIGHT } from "./fonts/ansi-shadow";
import {
	CHARS as SLANT_CHARS,
	FONT_HEIGHT as SLANT_HEIGHT,
	FONT_NAME as SLANT_NAME,
} from "./fonts/slant";
import {
	CHARS as SMALL_SLANT_CHARS,
	FONT_HEIGHT as SMALL_SLANT_HEIGHT,
	FONT_NAME as SMALL_SLANT_NAME,
} from "./fonts/small-slant";
import {
	CHARS as STANDARD_CHARS,
	FONT_HEIGHT as STANDARD_HEIGHT,
	FONT_NAME as STANDARD_NAME,
} from "./fonts/standard";
import {
	CHARS as GRAFFITI_CHARS,
	FONT_HEIGHT as GRAFFITI_HEIGHT,
	FONT_NAME as GRAFFITI_NAME,
} from "./fonts/graffiti";

/**
 * Definition of a FIGlet font, containing character line-art for ASCII rendering.
 */
export type FigletFont = {
	/** Human-readable font name (e.g. "ANSI Shadow"). */
	name: string;
	/** Number of vertical lines per character. */
	height: number;
	/** Map of ASCII characters (uppercase) to their line-art definitions. */
	chars: Record<string, FigletChar>;
};

const DEFAULT_FONT: FigletFont = {
	name: "ANSI Shadow",
	height: FONT_HEIGHT,
	chars: CHARS,
};

function getCharLines(font: FigletChar, lineIndex: number): string {
	if (lineIndex < font.length) {
		return font[lineIndex];
	}
	return "";
}

function getCharWidth(font: FigletChar): number {
	let max = 0;
	for (const line of font) {
		if (line.length > max) max = line.length;
	}
	return max;
}

const padCache = new WeakMap<Record<string, FigletChar>, Record<string, FigletChar>>();

function padCharLines(chars: Record<string, FigletChar>): Record<string, FigletChar> {
	const cached = padCache.get(chars);
	if (cached) return cached;

	const padded: Record<string, FigletChar> = {};
	for (const [key, charDef] of Object.entries(chars)) {
		const maxWidth = getCharWidth(charDef);
		padded[key] = charDef.map((line) => {
			if (line.length < maxWidth) {
				return line + " ".repeat(maxWidth - line.length);
			}
			return line;
		});
	}
	padCache.set(chars, padded);
	return padded;
}

/**
 * Render a text string as FIGlet ASCII art.
 *
 * Converts input to uppercase, looks up each character in the font,
 * and joins the result line-by-line. Trailing blank lines are stripped.
 *
 * @param text - The string to render. Converted to uppercase internally.
 * @param _options - Optional settings; currently only `font` is supported.
 * @returns A multi-line string of the rendered banner.
 *
 * @example
 * ```ts
 * const banner = renderFiglet("Hi");
 * console.log(banner);
 * ```
 */
export function renderFiglet(text: string, _options?: { font?: FigletFont }): string {
	const font = _options?.font ?? DEFAULT_FONT;
	const paddedChars = padCharLines(font.chars);
	const lines: string[] = [];

	for (let i = 0; i < font.height; i++) {
		let line = "";
		const chars = [...text.toUpperCase()];

		for (let c = 0; c < chars.length; c++) {
			const ch = chars[c];
			const charDef = paddedChars[ch] ?? paddedChars[" "];
			line += getCharLines(charDef, i);
		}

		lines.push(line);
	}

	while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
		lines.pop();
	}

	return lines.join("\n");
}

const FONTS: Record<string, FigletFont> = {
	"ANSI Shadow": DEFAULT_FONT,
	[SLANT_NAME]: { name: SLANT_NAME, height: SLANT_HEIGHT, chars: SLANT_CHARS },
	[SMALL_SLANT_NAME]: {
		name: SMALL_SLANT_NAME,
		height: SMALL_SLANT_HEIGHT,
		chars: SMALL_SLANT_CHARS,
	},
	[STANDARD_NAME]: { name: STANDARD_NAME, height: STANDARD_HEIGHT, chars: STANDARD_CHARS },
	[GRAFFITI_NAME]: { name: GRAFFITI_NAME, height: GRAFFITI_HEIGHT, chars: GRAFFITI_CHARS },
};

/**
 * Return the names of all registered FIGlet fonts.
 *
 * @returns Array of font name strings.
 */
export function getAvailableFonts(): string[] {
	return Object.keys(FONTS);
}

/**
 * Look up a FIGlet font by its name (case-sensitive).
 *
 * Falls back to the default "ANSI Shadow" font if the name is not found.
 *
 * @param name - The font name to look up.
 * @returns The matching {@link FigletFont}, or the default font.
 */
export function getFontByName(name: string): FigletFont {
	return FONTS[name] ?? DEFAULT_FONT;
}
