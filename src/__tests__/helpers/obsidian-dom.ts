/**
 * Polyfill for Obsidian's `HTMLElement` extensions (`createEl`, `createDiv`,
 * `createSpan`, `empty`, `addClass`, …) so extracted render functions can run
 * under happy-dom. Mirrors the behaviour of Obsidian's `obsidian.ts` helpers.
 *
 * Imported (for side effects) by the render-context test helper.
 */

export interface ObsidianDomElementInfo {
	text?: string;
	cls?: string;
	attr?: Record<string, string | number | boolean>;
	title?: string;
	type?: string;
	href?: string;
	value?: string;
	parent?: HTMLElement;
}

export interface ObsidianSvgElementInfo {
	cls?: string | string[];
	attr?: Record<string, string | number | boolean | null>;
	parent?: Node;
	prepend?: boolean;
}

type HTMLElementWithObsidianExtras = HTMLElement & {
	createEl(tag: string, o?: ObsidianDomElementInfo): HTMLElement;
	createDiv(o?: ObsidianDomElementInfo): HTMLDivElement;
	createSpan(o?: ObsidianDomElementInfo): HTMLSpanElement;
	createButton(o?: ObsidianDomElementInfo): HTMLButtonElement;
	empty(): void;
	appendText(text: string): void;
	setText(text: string): void;
	addClass(...classes: string[]): void;
	removeClass(...classes: string[]): void;
	toggleClass(classes: string, value: boolean): void;
	setAttr(name: string, value: string | number | boolean | null): void;
};

declare global {
	interface HTMLElement {
		createEl<K extends keyof HTMLElementTagNameMap>(
			tag: K,
			o?: ObsidianDomElementInfo,
		): HTMLElementTagNameMap[K];
		createEl(tag: string, o?: ObsidianDomElementInfo): HTMLElement;
		createDiv(o?: ObsidianDomElementInfo): HTMLDivElement;
		createSpan(o?: ObsidianDomElementInfo): HTMLSpanElement;
		createButton(o?: ObsidianDomElementInfo): HTMLButtonElement;
		empty(): void;
		appendText(text: string): void;
		setText(text: string): void;
		addClass(...classes: string[]): void;
		removeClass(...classes: string[]): void;
		toggleClass(classes: string, value: boolean): void;
		setAttr(name: string, value: string | number | boolean | null): void;
	}
}

export function applyObsidianDomPolyfill(): void {
	const proto = HTMLElement.prototype as unknown as HTMLElementWithObsidianExtras;

	if (typeof proto.createEl === "function") return;

	proto.createEl = function (
		this: HTMLElement,
		tag: string,
		o?: ObsidianDomElementInfo,
	): HTMLElement {
		const el = document.createElement(tag);
		if (o) {
			if (o.cls) el.classList.add(...o.cls.split(" "));
			if (o.attr) {
				for (const [k, v] of Object.entries(o.attr)) {
					el.setAttribute(k, String(v));
				}
			}
			if (o.title) el.setAttribute("title", o.title);
			if (o.type) el.setAttribute("type", o.type);
			if (o.href) el.setAttribute("href", o.href);
			if (o.value) el.setAttribute("value", o.value);
			if (o.text !== undefined && o.text !== null) el.textContent = o.text;
			if (o.parent) o.parent.appendChild(el);
		}
		this.appendChild(el);
		return el;
	};

	proto.createDiv = function (this: HTMLElement, o?: ObsidianDomElementInfo): HTMLDivElement {
		return this.createEl("div", o) as HTMLDivElement;
	};

	proto.createSpan = function (this: HTMLElement, o?: ObsidianDomElementInfo): HTMLSpanElement {
		return this.createEl("span", o) as HTMLSpanElement;
	};

	proto.createButton = function (this: HTMLElement, o?: ObsidianDomElementInfo): HTMLButtonElement {
		return this.createEl("button", o) as HTMLButtonElement;
	};

	// `createSvg` lives on `Node` in Obsidian (so SVG nodes can nest SVG), and
	// must be reached from both HTML and SVG elements — hence `Node.prototype`.
	// Assigned through a narrow cast so it doesn't have to satisfy Obsidian's
	// overloaded global signature.
	const nodeProto = Node.prototype as unknown as {
		createSvg?: (tag: string, o?: ObsidianSvgElementInfo) => SVGElement;
	};
	if (typeof nodeProto.createSvg !== "function") {
		nodeProto.createSvg = function (this: Node, tag: string, o?: ObsidianSvgElementInfo): SVGElement {
			const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
			if (o) {
				if (o.cls) {
					const classes = Array.isArray(o.cls) ? o.cls : o.cls.split(" ");
					el.classList.add(...classes);
				}
				if (o.attr) {
					for (const [k, v] of Object.entries(o.attr)) {
						if (v === null || v === undefined) continue;
						el.setAttribute(k, String(v));
					}
				}
			}
			this.appendChild(el);
			return el;
		};
	}

	proto.empty = function (this: HTMLElement): void {
		while (this.firstChild) {
			this.removeChild(this.firstChild);
		}
	};

	proto.appendText = function (this: HTMLElement, text: string): void {
		this.append(text);
	};

	proto.setText = function (this: HTMLElement, text: string): void {
		this.textContent = text;
	};

	proto.addClass = function (this: HTMLElement, ...classes: string[]): void {
		this.classList.add(...classes);
	};

	proto.removeClass = function (this: HTMLElement, ...classes: string[]): void {
		this.classList.remove(...classes);
	};

	proto.toggleClass = function (this: HTMLElement, classes: string, value: boolean): void {
		this.classList.toggle(classes, value);
	};

	proto.setAttr = function (
		this: HTMLElement,
		name: string,
		value: string | number | boolean | null,
	): void {
		if (value === null || value === undefined) {
			this.removeAttribute(name);
		} else {
			this.setAttribute(name, String(value));
		}
	};
}

if (typeof HTMLElement !== "undefined") {
	applyObsidianDomPolyfill();
}
