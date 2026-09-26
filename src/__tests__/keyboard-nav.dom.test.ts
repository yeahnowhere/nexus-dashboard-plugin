// @vitest-environment happy-dom
import "./helpers/obsidian-dom";
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { DashboardKeyboardNav, NAV_SELECTED_CLASS } from "../renderer/keyboard-nav";

/**
 * Geometry: every element is laid out as a 100x40 rect via the stub below.
 * The dashboard components form three visual rows:
 *   Row A (y 0)   : stats (x 0) | clock (x 300)
 *   Row B (y 220) : moc    (x 0) | timeline (x 300)
 *   Row C (y 520) : tasks  (x 0) | heatmap  (x 300)
 * Inside rows, items are placed by their own coordinates.
 */
const place = new Map<HTMLElement, { left: number; top: number; width: number; height: number }>();

function layout(el: HTMLElement, left: number, top: number, width = 100, height = 40): HTMLElement {
	place.set(el, { left, top, width, height });
	return el;
}

function makeDashboard(): {
	container: HTMLElement;
	nav: DashboardKeyboardNav;
	stats: HTMLElement;
	statCards: HTMLElement[];
	statsNewNote: HTMLElement;
	clockPanel: HTMLElement;
	mocPanel: HTMLElement;
	cards: HTMLElement[];
	timelinePanel: HTMLElement;
	tasksPanel: HTMLElement;
	tasks: HTMLElement[];
	heatmapPanel: HTMLElement;
	enabled: ReturnType<typeof vi.fn>;
	focusOnOpen: ReturnType<typeof vi.fn>;
} {
	const container = document.createElement("div");
	document.body.appendChild(container);

	const stats = layout(container.createDiv({ cls: "nexus-stats" }), 0, 0);
	const statCards = [
		layout(stats.createDiv({ cls: "nexus-stat-card" }), 10, 8),
		layout(stats.createDiv({ cls: "nexus-stat-card" }), 130, 8),
	];
	const statsNewNote = layout(stats.createButton({ cls: "nexus-stat-new-note" }), 240, 8);

	const clockPanel = layout(container.createDiv({ cls: "nexus-panel" }), 300, 0);

	const mocPanel = layout(container.createDiv({ cls: "nexus-panel nexus-moc-panel" }), 0, 220);
	const grid = mocPanel.createDiv({ cls: "nexus-grid" });
	const cards = [
		layout(grid.createDiv({ cls: "nexus-card" }), 20, 240),
		layout(grid.createDiv({ cls: "nexus-card" }), 160, 240),
		layout(grid.createDiv({ cls: "nexus-card-mini" }), 300, 240),
	];

	const timelinePanel = layout(container.createDiv({ cls: "nexus-panel" }), 300, 220);
	const timeline = timelinePanel.createDiv({ cls: "nexus-timeline" });
	layout(timeline.createDiv({ cls: "nexus-timeline-row" }), 310, 240);
	layout(timeline.createDiv({ cls: "nexus-timeline-row" }), 310, 280);

	const tasksPanel = layout(container.createDiv({ cls: "nexus-panel" }), 0, 520);
	const tasks = tasksPanel.createDiv({ cls: "nexus-tasks" });
	const taskItems = [
		layout(tasks.createDiv({ cls: "nexus-tasks-item" }), 10, 540),
		layout(tasks.createDiv({ cls: "nexus-tasks-item" }), 10, 580),
	];

	const heatmapPanel = layout(container.createDiv({ cls: "nexus-panel" }), 300, 520);

	const enabled = vi.fn(() => true);
	const focusOnOpen = vi.fn(() => true);
	const nav = new DashboardKeyboardNav(container, enabled, focusOnOpen);
	nav.reset(false);

	return {
		container,
		nav,
		stats,
		statCards,
		statsNewNote,
		clockPanel,
		mocPanel,
		cards,
		timelinePanel,
		tasksPanel,
		tasks: taskItems,
		heatmapPanel,
		enabled,
		focusOnOpen,
	};
}

/**
 * Mimics the real dashboard layout where a tall left column (timeline)
 * vertically overlaps a stacked right column (moc | vault on top, heatmap
 * below) — so band overlap would wrongly merge the right column's two rows
 * into one. Geometry (scaled):
 *   Row A (y 0)    : stats (0..800, full width)
 *   Row B (y ~80)  : timeline (0..240) | moc (240..520) | vault (520..800)
 *   Row C (y 340)  : heatmap (240..800, stacked under moc/vault)
 *   Row D (y 680)  : tasks (0..400) | filetypes (400..800)
 */
function makeTallColumnDashboard(): {
	container: HTMLElement;
	nav: DashboardKeyboardNav;
	stats: HTMLElement;
	timeline: HTMLElement;
	moc: HTMLElement;
	vault: HTMLElement;
	heatmap: HTMLElement;
	tasks: HTMLElement;
	filetypes: HTMLElement;
} {
	const container = document.createElement("div");
	document.body.appendChild(container);

	const stats = layout(container.createDiv({ cls: "nexus-stats" }), 0, 0, 800, 40);
	const timeline = layout(container.createDiv({ cls: "nexus-panel" }), 0, 80, 240, 320);
	const moc = layout(container.createDiv({ cls: "nexus-panel nexus-moc-panel" }), 240, 90, 280, 250);
	const vault = layout(container.createDiv({ cls: "nexus-panel" }), 520, 90, 280, 250);
	const heatmap = layout(container.createDiv({ cls: "nexus-panel" }), 240, 340, 560, 300);
	const tasks = layout(container.createDiv({ cls: "nexus-panel" }), 0, 680, 400, 200);
	const filetypes = layout(container.createDiv({ cls: "nexus-panel" }), 400, 680, 400, 200);

	const nav = new DashboardKeyboardNav(
		container,
		() => true,
		() => true,
	);
	nav.reset(false);

	return { container, nav, stats, timeline, moc, vault, heatmap, tasks, filetypes };
}

function press(target: HTMLElement, key: string, repeat = false): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, repeat });
	target.dispatchEvent(event);
	return event;
}

function selected(el: HTMLElement): boolean {
	return el.classList.contains(NAV_SELECTED_CLASS);
}

beforeAll(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
		this: HTMLElement,
	) {
		const rect = place.get(this) ?? { left: 0, top: 0, width: 100, height: 40 };
		return {
			left: rect.left,
			top: rect.top,
			right: rect.left + rect.width,
			bottom: rect.top + rect.height,
			width: rect.width,
			height: rect.height,
			x: rect.left,
			y: rect.top,
			toJSON: () => ({}),
		};
	});
});

afterEach(() => {
	document.body.replaceChildren();
});

afterAll(() => {
	vi.restoreAllMocks();
});

describe("DashboardKeyboardNav", () => {
	it("starts with a clean selection", () => {
		const { container, nav, stats, mocPanel } = makeDashboard();
		expect(container.querySelectorAll(`.${NAV_SELECTED_CLASS}`).length).toBe(0);
		expect(selected(stats)).toBe(false);
		expect(selected(mocPanel)).toBe(false);
		nav.dispose();
	});

	it("selects the first component on the first directional press", () => {
		const { container, nav, stats } = makeDashboard();
		press(container, "ArrowDown");
		expect(selected(stats)).toBe(true);
		expect(document.activeElement).toBe(stats);
		nav.dispose();
	});

	it("moves down row by row keeping the lane", () => {
		const { container, nav, stats, mocPanel, tasksPanel, timelinePanel } = makeDashboard();
		press(container, "ArrowDown");
		expect(selected(stats)).toBe(true);
		press(container, "ArrowDown");
		expect(selected(mocPanel)).toBe(true);
		expect(selected(stats)).toBe(false);
		press(container, "ArrowDown");
		expect(selected(tasksPanel)).toBe(true);
		expect(selected(timelinePanel)).toBe(false);
		nav.dispose();
	});

	it("keeps the column when a tall panel spans several rows (real layout)", () => {
		const { container, nav, stats, timeline, moc, tasks, filetypes, heatmap } =
			makeTallColumnDashboard();
		// Full-width bar steps to the row's leftmost component, not the center lane.
		press(container, "ArrowDown");
		expect(selected(stats)).toBe(true);
		press(container, "ArrowDown");
		expect(selected(timeline)).toBe(true);
		expect(selected(moc)).toBe(false);
		// The timeline's column is empty on the heatmap row, so Down walks
		// past it and lands on the bottom-left panel — never on filetypes.
		press(container, "ArrowDown");
		expect(selected(tasks)).toBe(true);
		expect(selected(filetypes)).toBe(false);
		expect(selected(heatmap)).toBe(false);
		// Right crosses to the bottom-right without drifting upward.
		press(container, "ArrowRight");
		expect(selected(filetypes)).toBe(true);
		assertSelectedCount(container, 1);
		nav.dispose();
	});

	function assertSelectedCount(container: HTMLElement, count: number): void {
		expect(container.querySelectorAll(`.${NAV_SELECTED_CLASS}`).length).toBe(count);
	}

	it("Right crosses the row then wraps into the next row", () => {
		const { container, nav, clockPanel, mocPanel, timelinePanel } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowRight");
		expect(selected(clockPanel)).toBe(true);
		// Row edge reached — wrap to the next row's leftmost component.
		press(container, "ArrowRight");
		expect(selected(mocPanel)).toBe(true);
		press(container, "ArrowRight");
		expect(selected(timelinePanel)).toBe(true);
		nav.dispose();
	});

	it("Left wraps backward into the previous row's rightmost component", () => {
		const { container, nav, timelinePanel } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowLeft");
		expect(selected(timelinePanel)).toBe(true);
		nav.dispose();
	});

	it("keeps the current selection at the very edges", () => {
		const { container, nav, stats } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowLeft");
		expect(selected(stats)).toBe(true);
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowUp");
		press(container, "ArrowRight");
		press(container, "ArrowRight");
		press(container, "ArrowRight");
		// From timeline (row B right) wrapping down: row C's leftmost is tasks,
		// then heatmap, then row C ends — stays on heatmap.
		expect(selected(stats)).toBe(false);
		nav.dispose();
	});

	it("moves up into the same lane", () => {
		const { container, nav, mocPanel, stats } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowUp");
		expect(selected(mocPanel)).toBe(true);
		press(container, "ArrowUp");
		expect(selected(stats)).toBe(true);
		nav.dispose();
	});

	it("drives the same cursor with WASD", () => {
		const { container, nav, stats, mocPanel } = makeDashboard();
		press(container, "s");
		expect(selected(stats)).toBe(true);
		press(container, "s");
		expect(selected(mocPanel)).toBe(true);
		press(container, "w");
		expect(selected(stats)).toBe(true);
		nav.dispose();
	});

	it("shades the panel like hover, without touching its cards", () => {
		const { container, nav, cards } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		expect(cards.some(selected)).toBe(false);
		nav.dispose();
	});

	it("Enter steps into the component and arrows roam inside it only", () => {
		const { container, nav, mocPanel, cards, timelinePanel } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "Enter");
		expect(document.activeElement).toBe(mocPanel);

		press(container, "ArrowRight");
		expect(selected(cards[0])).toBe(true);
		expect(document.activeElement).toBe(cards[0]);

		press(container, "ArrowRight");
		expect(selected(cards[1])).toBe(true);
		press(container, "ArrowRight");
		expect(selected(cards[2])).toBe(true);

		// Down finds no card row beneath — the range stays inside the panel.
		press(container, "ArrowDown");
		expect(selected(cards[2])).toBe(true);
		expect(selected(timelinePanel)).toBe(false);
		nav.dispose();
	});

	it("Enter activates the focused inner item via click", () => {
		const { container, nav, cards } = makeDashboard();
		const spy = vi.fn();
		cards[0].addEventListener("click", spy);
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "Enter");
		press(container, "ArrowRight");
		press(container, "Enter");
		expect(spy).toHaveBeenCalledTimes(1);
		nav.dispose();
	});

	it("browse-selecting the stats bar highlights only the New Note button", () => {
		const { container, nav, stats, statCards, statsNewNote } = makeDashboard();
		expect(selected(statsNewNote)).toBe(false);
		press(container, "ArrowDown");
		expect(selected(stats)).toBe(true);
		expect(selected(statsNewNote)).toBe(true);
		expect(statCards.some(selected)).toBe(false);
		nav.dispose();
	});

	it("inside the stats bar only the New Note button is navigable", () => {
		const { container, nav, stats, statCards, statsNewNote } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "Enter");
		expect(document.activeElement).toBe(stats);
		expect(statCards.some(selected)).toBe(false);
		press(container, "ArrowDown");
		expect(selected(statsNewNote)).toBe(true);
		expect(document.activeElement).toBe(statsNewNote);
		nav.dispose();
	});

	it("steps into the tasks panel and arrows roam the task items", () => {
		const { container, nav, tasks, tasksPanel } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		expect(selected(tasksPanel)).toBe(true);
		press(container, "Enter");
		expect(document.activeElement).toBe(tasksPanel);

		press(container, "ArrowDown");
		expect(selected(tasks[0])).toBe(true);
		expect(document.activeElement).toBe(tasks[0]);
		press(container, "ArrowDown");
		expect(selected(tasks[1])).toBe(true);
		expect(selected(tasks[0])).toBe(false);
		nav.dispose();
	});

	it("Enter activates the focused task item via click", () => {
		const { container, nav, tasks } = makeDashboard();
		const spy = vi.fn();
		tasks[1].addEventListener("click", spy);
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "Enter");
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		expect(selected(tasks[1])).toBe(true);
		press(container, "Enter");
		expect(spy).toHaveBeenCalledTimes(1);
		nav.dispose();
	});

	it("Esc steps out of a component and then clears the selection", () => {
		const { container, nav, mocPanel, cards } = makeDashboard();
		press(container, "ArrowDown");
		press(container, "ArrowDown");
		press(container, "Enter");
		press(container, "ArrowRight");
		expect(selected(cards[0])).toBe(true);

		press(container, "Escape");
		expect(document.activeElement).toBe(mocPanel);
		expect(cards.some(selected)).toBe(false);
		expect(selected(mocPanel)).toBe(true);

		press(container, "Escape");
		expect(selected(mocPanel)).toBe(false);
		nav.dispose();
	});

	it("PageUp/PageDown scroll without moving the selection", () => {
		const { container, nav, stats } = makeDashboard();
		press(container, "ArrowDown");
		expect(selected(stats)).toBe(true);
		const event = press(container, "PageDown");
		expect(event.defaultPrevented).toBe(true);
		expect(selected(stats)).toBe(true);
		nav.dispose();
	});

	it("throttles held arrow keys so the cursor crawls", () => {
		vi.useFakeTimers();
		try {
			const { container, nav, stats, mocPanel } = makeDashboard();
			press(container, "ArrowDown");
			expect(selected(stats)).toBe(true);
			// Immediate repeats are swallowed (key still default-prevented).
			const repeat = press(container, "ArrowDown", true);
			expect(repeat.defaultPrevented).toBe(true);
			expect(selected(mocPanel)).toBe(false);
			// Advance past the throttle window and the next repeat steps.
			vi.advanceTimersByTime(150);
			press(container, "ArrowDown", true);
			expect(selected(mocPanel)).toBe(true);
			expect(selected(stats)).toBe(false);
			nav.dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it("grabs container focus on open but preselection stays clean", () => {
		const container = document.createElement("div");
		container.classList.add("nexus-dashboard-root");
		document.body.appendChild(container);
		const stats = layout(container.createDiv({ cls: "nexus-stats" }), 0, 0);
		const mocPanel = layout(container.createDiv({ cls: "nexus-panel nexus-moc-panel" }), 0, 220);
		const nav = new DashboardKeyboardNav(
			container,
			() => true,
			() => true,
		);
		nav.reset(true);

		// Nothing is highlighted or focused just from opening the note.
		expect(selected(stats)).toBe(false);
		expect(selected(mocPanel)).toBe(false);
		expect(container.querySelectorAll(`.${NAV_SELECTED_CLASS}`).length).toBe(0);
		// The first directional press starts the cursor on the first component.
		press(container, "ArrowDown");
		expect(selected(stats)).toBe(true);
		press(container, "ArrowDown");
		expect(selected(mocPanel)).toBe(true);
		expect(selected(stats)).toBe(false);
		nav.dispose();
	});

	it("ignores keys typed into a text input", () => {
		const { container, nav, stats } = makeDashboard();
		const input = document.createElement("input");
		input.type = "text";
		container.appendChild(input);
		input.focus();
		press(input, "ArrowDown");
		expect(selected(stats)).toBe(false);
		input.remove();
		nav.dispose();
	});

	it("does nothing when the setting is disabled", () => {
		const container = document.createElement("div");
		const stats = layout(container.createDiv({ cls: "nexus-stats" }), 0, 0);
		const nav = new DashboardKeyboardNav(
			container,
			() => false,
			() => false,
		);
		nav.reset(false);
		press(container, "ArrowDown");
		expect(selected(stats)).toBe(false);
		nav.dispose();
	});
});
