/**
 * Runtime stand-in for the `obsidian` module used only inside Vitest.
 *
 * The real `obsidian` npm package ships types only (`"main": ""`), so any
 * module that imports a runtime symbol (`TFile`, `Notice`, `Menu`, …) would
 * fail to resolve under Vitest. `vitest.config.ts` aliases `obsidian` to this
 * file for test runs; the production build is unaffected.
 */

export interface TFileOptions {
	path: string;
	mtime?: number;
	ctime?: number;
	size?: number;
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	stat: { ctime: number; mtime: number; size: number };

	constructor(opts?: TFileOptions) {
		const p = opts?.path ?? "untitled.md";
		this.path = p;
		const parts = p.split("/");
		this.name = parts[parts.length - 1];
		const dot = this.name.lastIndexOf(".");
		this.extension = dot > 0 ? this.name.slice(dot + 1) : "";
		this.basename = this.extension ? this.name.slice(0, dot) : this.name;
		this.stat = {
			ctime: opts?.ctime ?? 0,
			mtime: opts?.mtime ?? 0,
			size: opts?.size ?? 0,
		};
	}
}

export class Notice {
	static instances: Notice[] = [];

	message: string;
	readonly type: string;

	constructor(message: string) {
		this.message = message;
		this.type = "default";
		Notice.instances.push(this);
	}

	hide(): void {}
}

interface MenuItemSpec {
	title: string;
	icon?: string;
	onClick?: () => void;
}

export class MenuItem {
	spec: MenuItemSpec = { title: "" };

	setTitle(title: string): MenuItem {
		this.spec.title = title;
		return this;
	}

	setIcon(icon: string): MenuItem {
		this.spec.icon = icon;
		return this;
	}

	setChecked(_checked: boolean): MenuItem {
		return this;
	}

	onClick(cb: () => void): MenuItem {
		this.spec.onClick = cb;
		return this;
	}
}

export class Menu {
	items: MenuItemSpec[] = [];
	lastEvent: MouseEvent | null = null;
	lastPosition: { x: number; y: number } | null = null;

	addItem(cb: (item: MenuItem) => void): Menu {
		const item = new MenuItem();
		cb(item);
		this.items.push(item.spec);
		return this;
	}

	addSeparator(): Menu {
		return this;
	}

	showAtMouseEvent(e: MouseEvent): void {
		this.lastEvent = e;
	}

	showAtPosition(position: { x: number; y: number }): void {
		this.lastPosition = position;
	}
}

export class MarkdownRenderChild {
	containerEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
	}

	onload(): void {}
	onunload(): void {}
	load(): void {}
	unload(): void {}
}

// ── Settings tab support ─────────────────────────────────────

export class App {
	vault = {
		getMarkdownFiles: () => [] as TFile[],
		getFiles: () => [] as TFile[],
	};
	workspace = {
		getLeaf: () => ({ openFile: () => {} }),
		openLinkText: () => {},
	};
	metadataCache = {
		resolvedLinks: {},
		getFileCache: () => null,
		trigger: () => {},
	};
	internalPlugins = {};
}

export class Modal {
	app: App;
	contentEl: HTMLElement;
	modalEl: HTMLElement;
	titleEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.modalEl = document.body.createDiv({ cls: "modal-container" });
		this.titleEl = this.modalEl.createDiv({ cls: "modal-title" });
		this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
	}

	open(): void {
		this.modalEl.addClass("is-visible");
		this.onOpen();
	}

	close(): void {
		this.onClose();
		this.modalEl.remove();
	}

	onOpen(): void {}
	onClose(): void {}
}

export class PluginSettingTab {
	app: App;
	plugin: unknown;
	containerEl: HTMLElement;

	constructor(app: App, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.body.createDiv({ cls: "plugin-setting-tab" });
	}

	display(): void {}
	hide(): void {}
}

class BaseComponent {
	containerEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
	}
}

export class ToggleComponent extends BaseComponent {
	inputEl: HTMLInputElement;

	constructor(containerEl: HTMLElement) {
		super(containerEl);
		this.inputEl = containerEl.createEl("input", {
			cls: "checkbox",
			attr: { type: "checkbox" },
		}) as HTMLInputElement;
	}

	setValue(value: boolean): this {
		this.inputEl.checked = value;
		return this;
	}

	onChange(cb: (value: boolean) => unknown): this {
		this.inputEl.addEventListener("change", () => cb(this.inputEl.checked));
		return this;
	}
}

export class TextComponent extends BaseComponent {
	inputEl: HTMLInputElement;

	constructor(containerEl: HTMLElement) {
		super(containerEl);
		this.inputEl = containerEl.createEl("input", {
			cls: "setting-text-input",
			attr: { type: "text" },
		}) as HTMLInputElement;
	}

	getValue(): string {
		return this.inputEl.value;
	}

	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}

	setPlaceholder(placeholder: string): this {
		this.inputEl.placeholder = placeholder;
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.inputEl.disabled = disabled;
		return this;
	}

	onChange(cb: (value: string) => unknown): this {
		this.inputEl.addEventListener("change", () => cb(this.inputEl.value));
		return this;
	}
}

export class DropdownComponent extends BaseComponent {
	selectEl: HTMLSelectElement;
	options: Map<string, string> = new Map();

	constructor(containerEl: HTMLElement) {
		super(containerEl);
		this.selectEl = containerEl.createEl("select", { cls: "dropdown" }) as HTMLSelectElement;
	}

	addOption(value: string, label: string): this {
		this.options.set(value, label);
		this.selectEl.createEl("option", { text: label, value });
		return this;
	}

	getValue(): string {
		return this.selectEl.value;
	}

	setValue(value: string): this {
		this.selectEl.value = value;
		return this;
	}

	onChange(cb: (value: string) => unknown): this {
		this.selectEl.addEventListener("change", () => cb(this.selectEl.value));
		return this;
	}
}

export class SliderComponent extends BaseComponent {
	inputEl: HTMLInputElement;

	constructor(containerEl: HTMLElement) {
		super(containerEl);
		this.inputEl = containerEl.createEl("input", {
			cls: "slider",
			attr: { type: "range" },
		}) as HTMLInputElement;
	}

	setLimits(min: number, max: number, step: number): this {
		this.inputEl.min = String(min);
		this.inputEl.max = String(max);
		this.inputEl.step = String(step);
		return this;
	}

	getValue(): number {
		return Number(this.inputEl.value);
	}

	setValue(value: number): this {
		this.inputEl.value = String(value);
		return this;
	}

	setDynamicTooltip(): this {
		return this;
	}

	onChange(cb: (value: number) => unknown): this {
		this.inputEl.addEventListener("change", () => cb(Number(this.inputEl.value)));
		return this;
	}
}

export class ButtonComponent extends BaseComponent {
	buttonEl: HTMLButtonElement;

	constructor(containerEl: HTMLElement) {
		super(containerEl);
		this.buttonEl = containerEl.createEl("button") as HTMLButtonElement;
	}

	setButtonText(text: string): this {
		this.buttonEl.setText(text);
		return this;
	}

	setCta(): this {
		this.buttonEl.addClass("mod-cta");
		return this;
	}

	setWarning(): this {
		this.buttonEl.addClass("mod-warning");
		return this;
	}

	onClick(cb: (evt: MouseEvent) => unknown): this {
		this.buttonEl.addEventListener("click", cb as EventListener);
		return this;
	}
}

export class ExtraButtonComponent extends BaseComponent {
	buttonEl: HTMLButtonElement;

	constructor(containerEl: HTMLElement) {
		super(containerEl);
		this.buttonEl = containerEl.createEl("button", {
			cls: "clickable-icon",
		}) as HTMLButtonElement;
	}

	setIcon(icon: string): this {
		this.buttonEl.setAttribute("data-icon", icon);
		return this;
	}

	setTooltip(tooltip: string): this {
		this.buttonEl.setAttribute("aria-label", tooltip);
		return this;
	}

	onClick(cb: (evt: MouseEvent) => unknown): this {
		this.buttonEl.addEventListener("click", cb as EventListener);
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(containerEl?: HTMLElement) {
		this.settingEl = (containerEl ?? document.createElement("div")).createDiv({
			cls: "setting-item",
		});
		this.nameEl = this.settingEl.createDiv({ cls: "setting-item-name" });
		this.descEl = this.settingEl.createDiv({ cls: "setting-item-description" });
		this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
	}

	setName(name: string): this {
		this.nameEl.setText(name);
		return this;
	}

	setDesc(desc: string): this {
		this.descEl.setText(desc);
		return this;
	}

	setHeading(): this {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}

	setClass(cls: string): this {
		this.settingEl.addClass(cls);
		return this;
	}

	addText(cb: (comp: TextComponent) => unknown): this {
		cb(new TextComponent(this.controlEl));
		return this;
	}

	addToggle(cb: (comp: ToggleComponent) => unknown): this {
		cb(new ToggleComponent(this.controlEl));
		return this;
	}

	addDropdown(cb: (comp: DropdownComponent) => unknown): this {
		cb(new DropdownComponent(this.controlEl));
		return this;
	}

	addSlider(cb: (comp: SliderComponent) => unknown): this {
		cb(new SliderComponent(this.controlEl));
		return this;
	}

	addButton(cb: (comp: ButtonComponent) => unknown): this {
		cb(new ButtonComponent(this.controlEl));
		return this;
	}

	addExtraButton(cb: (comp: ExtraButtonComponent) => unknown): this {
		cb(new ExtraButtonComponent(this.controlEl));
		return this;
	}
}

export function setIcon(parent: HTMLElement, iconName: string): HTMLElement {
	const icon = parent.createEl("svg", {
		cls: "svg-icon",
		attr: { "aria-label": iconName, viewBox: "0 0 24 24" },
	});
	return icon;
}

let copiedText = "";

export function copy(textToCopy: string): void {
	copiedText = textToCopy;
}

export function lastCopiedText(): string {
	return copiedText;
}
