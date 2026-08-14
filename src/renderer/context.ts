import type { App, TFile } from "obsidian";
import type { NexusSettings } from "../types";

/** Dependency surface exposed to standalone component renderers. */
export interface RendererContext {
	app: App;
	settings: NexusSettings;
	sourcePath: string;
	getRecentFiles(): TFile[];
	saveSettings(): Promise<void>;
	rerender(): void;
	registerClockInterval(id: ReturnType<typeof setInterval>): void;
}
