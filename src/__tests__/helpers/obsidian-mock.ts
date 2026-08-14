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
