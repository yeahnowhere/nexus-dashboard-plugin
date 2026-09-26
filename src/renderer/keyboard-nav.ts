/** Layout direction for arrow/WASD movement. */
type Dir = "up" | "down" | "left" | "right";

/** The four cardinal keys plus WASD (for 60% keyboards). */
const DIRECTION_KEYS: Record<string, Dir> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
	w: "up",
	W: "up",
	s: "down",
	S: "down",
	a: "left",
	A: "left",
	d: "right",
	D: "right",
};

/** Component roots that can be targeted by the browse cursor. */
const COMPONENT_QUERY = ".nexus-panel, .nexus-stats";

/** Class mirroring the element's own `:hover` styling while navigation-selected. */
export const NAV_SELECTED_CLASS = "nexus-nav-selected";

/** Minimum gap between autop-repeat steps while a direction key is held. */
const STEP_REPEAT_MS = 120;

/**
 * Arrow/WASD pointer navigation for a dashboard container.
 *
 * Both levels use the same directional grid-stepper: browsing walks whole
 * components, Enter steps into the selected component and the arrows range
 * over that component's items only; Esc steps back out. Movement is row /
 * lane based (Left/Right across a row, wrapping onward at the row's end;
 * Down/Up into the next row keeping the horizontal lane), so nested rows,
 * columns and column stacks always feel deterministic. Selection reuses the
 * exact mouse-hover styles via `nexus-nav-selected`, never new visuals.
 */
export class DashboardKeyboardNav {
	private containerEl: HTMLElement;
	private isEnabled: () => boolean;
	private focusOnOpen: () => boolean;
	private handleKeydown: (e: KeyboardEvent) => void;
	private components: HTMLElement[] = [];
	private selIndex = -1;
	private insideRoot: HTMLElement | null = null;
	private innerIndex = -1;
	private autoFocused = false;
	private lastStepMs = 0;

	constructor(containerEl: HTMLElement, isEnabled: () => boolean, focusOnOpen: () => boolean) {
		this.containerEl = containerEl;
		this.isEnabled = isEnabled;
		this.focusOnOpen = focusOnOpen;
		this.handleKeydown = (e) => this.onKeydown(e);
		this.containerEl.addEventListener("keydown", this.handleKeydown);
	}

	/** Release the keydown listener. Call from the renderer's unload. */
	dispose(): void {
		this.containerEl.removeEventListener("keydown", this.handleKeydown);
	}

	/**
	 * Re-scan the container after a render. Clears any lingering selection.
	 *
	 * @param autoFocus - When `true` (first render only) the container grabs
	 *   focus so the arrow keys work the moment the dashboard opens. Nothing is
	 *   preselected; the cursor starts on the first component at the first
	 *   directional press.
	 */
	reset(autoFocus: boolean): void {
		this.components = Array.from(this.containerEl.querySelectorAll<HTMLElement>(COMPONENT_QUERY));
		this.clear();
		if (autoFocus && !this.autoFocused && this.isEnabled() && this.focusOnOpen()) {
			this.autoFocused = true;
			this.makeFocusable(this.containerEl);
			this.containerEl.focus({ preventScroll: true });
		}
	}

	// ── Key routing ───────────────────────────────────────────

	private onKeydown(e: KeyboardEvent): void {
		if (!this.isEnabled()) return;
		const target = e.target;
		if (!(target instanceof HTMLElement) || !this.containerEl.contains(target)) return;
		if (isEditable(target)) return;

		const { key } = e;

		if (key === "PageDown" || key === "PageUp") {
			e.preventDefault();
			this.scrollPage(key === "PageDown");
			return;
		}

		if (key === "Tab") {
			if (this.insideRoot) {
				e.preventDefault();
				this.moveInner(e.shiftKey ? -1 : 1);
			}
			return;
		}

		if (key === "Enter") {
			e.preventDefault();
			if (this.insideRoot) this.activateFocusedItem();
			else this.enterSelected();
			return;
		}

		if (key === "Escape") {
			if (this.insideRoot) {
				e.preventDefault();
				this.exitInside();
			} else if (this.selIndex >= 0) {
				e.preventDefault();
				this.clearSelection();
			}
			return;
		}

		const dir = DIRECTION_KEYS[key];
		if (dir) {
			e.preventDefault();
			// While a key is held down the OS repeats it far faster than a human
			// can follow; throttle repeated steps so the cursor crawls instead
			// of racing across the whole dashboard.
			const now = Date.now();
			if (e.repeat && now - this.lastStepMs < STEP_REPEAT_MS) return;
			this.lastStepMs = now;
			if (this.insideRoot) this.moveInnerBy(dir);
			else this.moveSelection(dir);
		}
	}

	// ── Browse mode ───────────────────────────────────────────

	private moveSelection(dir: Dir): void {
		if (this.components.length === 0) return;
		const next =
			this.selIndex < 0
				? dir === "up" || dir === "left"
					? this.components.length - 1
					: 0
				: gridStep(this.components, this.selIndex, dir);
		if (next < 0) return;
		this.selIndex = next;
		this.clearSelection();
		const el = this.components[next];
		this.applySelected(el, true);
		this.makeFocusable(el);
		this.focusAndReveal(el);
	}

	private enterSelected(): void {
		if (this.selIndex < 0) return;
		const el = this.components[this.selIndex];
		this.insideRoot = el;
		this.innerIndex = -1;
		this.makeFocusable(el);
		this.focusAndReveal(el);
	}

	private exitInside(): void {
		const root = this.insideRoot;
		this.insideRoot = null;
		this.innerIndex = -1;
		if (!root) return;
		this.innerItems(root).forEach((el) => el.classList.remove(NAV_SELECTED_CLASS));
		this.makeFocusable(root);
		root.focus({ preventScroll: true });
	}

	private clearSelection(): void {
		this.components.forEach((el) => this.applySelected(el, false));
	}

	// ── Inside mode ───────────────────────────────────────────

	private moveInnerBy(dir: Dir): void {
		const root = this.insideRoot;
		if (!root) return;
		const items = this.innerItems(root);
		if (items.length === 0) return;
		const next =
			this.innerIndex < 0
				? dir === "up" || dir === "left"
					? items.length - 1
					: 0
				: gridStep(items, this.innerIndex, dir);
		if (next < 0) return;
		this.innerIndex = next;
		this.setInnerItem(items[next], items);
	}

	private moveInner(delta: number): void {
		const root = this.insideRoot;
		if (!root) return;
		const items = this.innerItems(root);
		if (items.length === 0) {
			this.exitInside();
			return;
		}
		const next = this.innerIndex < 0 ? (delta > 0 ? 0 : items.length - 1) : this.innerIndex + delta;
		if (next < 0 || next >= items.length) {
			this.exitInside();
			return;
		}
		this.innerIndex = next;
		this.setInnerItem(items[next], items);
	}

	private setInnerItem(item: HTMLElement, items: HTMLElement[]): void {
		items.forEach((el) => el.classList.remove(NAV_SELECTED_CLASS));
		item.classList.add(NAV_SELECTED_CLASS);
		this.makeFocusable(item);
		this.focusAndReveal(item);
	}

	private activateFocusedItem(): void {
		const root = this.insideRoot;
		if (!root) return;
		const active = document.activeElement;
		if (!(active instanceof HTMLElement) || active === root) return;
		if (!this.innerItems(root).includes(active)) return;
		active.click();
	}

	private innerItems(root: HTMLElement): HTMLElement[] {
		const query = this.innerQuery(root);
		if (!query) return [];
		return Array.from(root.querySelectorAll<HTMLElement>(query));
	}

	private innerQuery(root: HTMLElement): string | null {
		if (root.classList.contains("nexus-stats")) {
			// Stat cards are pure presentation; only the New Note button acts.
			return ".nexus-stat-new-note";
		}
		if (root.classList.contains("nexus-moc-panel")) {
			return ".nexus-card, .nexus-card-mini";
		}
		if (root.querySelector(".nexus-timeline")) return ".nexus-timeline-row";
		if (root.querySelector(".nexus-vault-activity")) return ".nexus-vault-activity-row";
		if (root.querySelector(".nexus-tasks")) return ".nexus-tasks-item";
		if (root.querySelector(".nexus-links-pills")) return ".nexus-link-pill";
		return null;
	}

	// ── Selection chrome ──────────────────────────────────────

	private applySelected(el: HTMLElement, on: boolean): void {
		el.classList.toggle(NAV_SELECTED_CLASS, on);
		// The stats bar's hover cosmetics live on its chips, not the bar.
		if (el.classList.contains("nexus-stats")) {
			el
				.querySelectorAll<HTMLElement>(".nexus-stat-new-note")
				.forEach((btn) => btn.classList.toggle(NAV_SELECTED_CLASS, on));
		}
	}

	private makeFocusable(el: HTMLElement): void {
		// Programmatic focus target: added to the tab order (-1) but not a tab stop.
		el.setAttribute("tabindex", "-1");
	}

	// ── Scrolling ─────────────────────────────────────────────

	private scrollPage(next: boolean): void {
		const anchor =
			this.insideRoot ?? (this.selIndex >= 0 ? this.components[this.selIndex] : this.containerEl);
		const scroller = findScrollable(anchor);
		if (!scroller) return;
		const top = scroller.scrollTop + (next ? 1 : -1) * Math.max(40, scroller.clientHeight * 0.9);
		const behavior = prefersReducedMotion() ? "auto" : "smooth";
		try {
			scroller.scrollTo({ top, behavior });
		} catch {
			scroller.scrollTop = top;
		}
	}

	/** Focus an element without scrolling, then reveal it smoothly. */
	private focusAndReveal(el: HTMLElement): void {
		el.focus({ preventScroll: true });
		reveal(el);
	}

	private clear(): void {
		this.insideRoot = null;
		this.innerIndex = -1;
		this.clearSelection();
		this.selIndex = -1;
	}
}

/** True for text-entry targets where the dashboard must not steal keys. */
function isEditable(el: HTMLElement): boolean {
	if (el.isContentEditable) return true;
	const { tagName } = el;
	if (tagName === "TEXTAREA" || tagName === "SELECT") return true;
	if (tagName === "INPUT") {
		const type = (el as HTMLInputElement).type;
		return type !== "checkbox" && type !== "radio" && type !== "button";
	}
	return false;
}

/** Closest scrollable ancestor of `start` (inclusive), or `null`. */
function findScrollable(start: HTMLElement): HTMLElement | null {
	let el: HTMLElement | null = start;
	while (el) {
		if (el.scrollHeight > el.clientHeight + 4) return el;
		el = el.parentElement;
	}
	return null;
}

/** `true` when the OS has "reduce motion" on — animations should not play. */
function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Smoothly scroll every scroll container that needs to move for `el` to be
 * on screen (page, panel and any inner overflow list). Falls back to an
 * abrupt reveal when smooth scrolling is unsupported or disallowed.
 */
function reveal(el: HTMLElement): void {
	const behavior = prefersReducedMotion() ? "auto" : "smooth";
	try {
		el.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
	} catch {
		el.scrollIntoView(behavior === "smooth");
	}
}

/** Center point of an element, used for row-clustering and lane matching. */
function centerOf(el: HTMLElement): { x: number; y: number } {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Index of the item in `items` to move to from `items[from]` along `dir`, or
 * -1 when no move is possible. Movement is grid-based:
 *
 * - Left/Right step across the current row (items whose top edges align — row
 *   siblings on one CSS grid line), wrapping into the next/previous row's
 *   edge-most item when the row's edge is reached.
 * - Down/Up keep the horizontal lane: among the items of the next/previous
 *   row that share the source's column (their spans overlap it), pick the one
 *   with the closest center (ties go leftmost). When the lane is empty in
 *   that row, the walk continues to the following/previous row — so a tall
 *   panel spanning several visual rows doesn't hijack its neighbours' rows.
 *   A full-width bar (>= 60% of its own row) lands on the next row's
 *   edge-most item (leftmost going down, rightmost going up).
 *
 * Rows are derived purely from top-edge alignment, so nested rows, columns
 * and column stacks behave correctly without parsing the layout structure.
 */
function gridStep(items: HTMLElement[], from: number, dir: Dir): number {
	const rows = clusterRows(items);
	const fromRow = rows.find((row) => row.includes(from));
	if (!fromRow) return -1;
	const fromCenter = centerOf(items[from]);

	if (dir === "left" || dir === "right") {
		const sameRow = fromRow.map((i) => i).sort((a, b) => centerOf(items[a]).x - centerOf(items[b]).x);
		const neighbors = sameRow.filter((i) => {
			const dx = centerOf(items[i]).x - fromCenter.x;
			return dir === "right" ? dx > 0 : dx < 0;
		});
		if (neighbors.length > 0) {
			const target = dir === "right" ? neighbors[0] : neighbors[neighbors.length - 1];
			if (target !== from) return target;
			return -1;
		}
		// Row edge reached — wrap into the adjacent row's edge-most item.
		const rowIdx = rows.indexOf(fromRow);
		const adjacent = dir === "right" ? rows[rowIdx + 1] : rows[rowIdx - 1];
		if (!adjacent) return -1;
		return edgeOf(adjacent, dir === "right" ? "left" : "right", items);
	}

	// Up / Down: walk the column across the following/previous rows.
	const rowIdx = rows.indexOf(fromRow);
	const laterRows = dir === "down" ? rows.slice(rowIdx + 1) : rows.slice(0, rowIdx).reverse();
	const fromRect = items[from].getBoundingClientRect();
	const rowLeft = Math.min(...fromRow.map((i) => items[i].getBoundingClientRect().left));
	const rowRight = Math.max(
		...fromRow.map(
			(i) => items[i].getBoundingClientRect().left + items[i].getBoundingClientRect().width,
		),
	);
	const wide = fromRect.width >= 0.6 * Math.max(1, rowRight - rowLeft);

	for (const row of laterRows) {
		const inLane = row.filter((i) => {
			const r = items[i].getBoundingClientRect();
			return r.right > fromRect.left && r.left < fromRect.right;
		});
		if (inLane.length === 0) continue;
		if (wide) return edgeOf(row, dir === "down" ? "left" : "right", items);
		return nearestX(inLane, fromCenter.x, items);
	}
	return -1;
}

/** Index of the horizontally edge-most item of `row` (min-x for left, max-x for right). */
function edgeOf(row: number[], side: "left" | "right", items: HTMLElement[]): number {
	return row.reduce((best, i) => {
		const bx = items[best].getBoundingClientRect().left;
		const ix = items[i].getBoundingClientRect().left;
		return side === "left" ? (ix < bx ? i : best) : ix > bx ? i : best;
	});
}

/** Index of the item whose center is closest to `anchorX` (ties go leftmost). */
function nearestX(indicies: number[], anchorX: number, items: HTMLElement[]): number {
	let best = -1;
	let bestDx = Number.POSITIVE_INFINITY;
	for (const i of indicies) {
		const c = centerOf(items[i]);
		const dx = Math.abs(c.x - anchorX);
		if (dx < bestDx || (dx === bestDx && best >= 0 && c.x < centerOf(items[best]).x)) {
			bestDx = dx;
			best = i;
		}
	}
	return best;
}

/** Row membership tolerance — top edges closer than this align to one row. */
const ROW_TOP_TOL = 8;
const ROW_TOP_TOL_CAP = 32;

/**
 * Bucket item indexes into rows by top-edge alignment: an item joins a row
 * when its top edge is within a tolerance of the row's shared top. The
 * tolerance scales with the smaller of the two heights (capped), so panel
 * peers offset by a divider stay aligned while stacked rows stay apart. A
 * tall panel can therefore overlap several visual rows without merging them.
 */
function clusterRows(items: HTMLElement[]): number[][] {
	const rows: { idxs: number[]; top: number; minH: number }[] = [];
	for (let i = 0; i < items.length; i++) {
		const r = items[i].getBoundingClientRect();
		const top = r.top;
		const h = Math.max(1, r.height);
		let placed = false;
		for (const row of rows) {
			const tol = Math.max(ROW_TOP_TOL, Math.min(ROW_TOP_TOL_CAP, 0.2 * Math.min(h, row.minH)));
			if (Math.abs(top - row.top) <= tol) {
				row.idxs.push(i);
				row.top = Math.min(row.top, top);
				row.minH = Math.min(row.minH, h);
				placed = true;
				break;
			}
		}
		if (!placed) {
			rows.push({ idxs: [i], top, minH: h });
		}
	}
	return rows.sort((a, b) => a.top - b.top).map((row) => row.idxs);
}
