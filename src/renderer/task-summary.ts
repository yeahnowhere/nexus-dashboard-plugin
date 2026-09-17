import { Notice, TFile } from "obsidian";
import { parseDueDate, dueStatus, toggleTaskLine } from "../tasks";
import type { TaskSummaryConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Render a task summary with progress bar, due chips, and a grouped task list. */
export async function renderTaskSummary(
	ctx: RendererContext,
	containerEl: HTMLElement,
	config: TaskSummaryConfig,
): Promise<void> {
	const label = config.label || (ctx.settings.showTaskSummaryDivider ? "TASKS" : "");
	const showProgress = config.showProgress !== false;
	const showList = config.showList !== false;
	const showDue = config.showDue !== false;
	const checkable = config.checkable !== false;
	const maxList = config.count || 10;
	const filterPath = config.path || "";
	const filterTags = config.tags || [];

	const files = ctx.app.vault.getMarkdownFiles();
	const filtered = files.filter((f) => {
		if (filterPath && !f.path.startsWith(filterPath)) return false;
		if (filterTags.length > 0) {
			const cache = ctx.app.metadataCache.getFileCache(f);
			const fileTags = (cache?.frontmatter?.tags as string[]) || [];
			const hasTag = filterTags.some((t) => fileTags.includes(t));
			if (!hasTag) return false;
		}
		return true;
	});

	let total = 0;
	let done = 0;
	const openTasks: { text: string; file: TFile; line: number; due: string | null }[] = [];

	for (const file of filtered) {
		const cache = ctx.app.metadataCache.getFileCache(file);
		const items = cache?.listItems;
		if (!items) continue;

		const raw = await ctx.app.vault.cachedRead(file);
		const lines = raw.split("\n");

		for (const item of items) {
			if (item.task === undefined) continue;
			total++;
			if (item.task === "x") {
				done++;
			} else {
				const lineIdx = item.position.start.line;
				const rawLine = lines[lineIdx] || "";
				const taskText = rawLine.replace(/^[\s\-*\d.]*\[[ xX]\]\s*/, "").trim();
				if (taskText) {
					openTasks.push({ text: taskText, file, line: lineIdx, due: parseDueDate(rawLine) });
				}
			}
		}
	}

	const now = new Date();
	const dueBucket = (due: string | null) => dueStatus(due, now);

	// Sort: overdue by due date (earliest first), upcoming by due date,
	// otherwise by file mtime (latest first) then line number within file
	openTasks.sort((a, b) => {
		const statusA = dueBucket(a.due);
		const statusB = dueBucket(b.due);
		if (statusA !== statusB) {
			const order: Record<string, number> = { overdue: 0, today: 1, upcoming: 2, none: 3 };
			return order[statusA] - order[statusB];
		}
		if (statusA === "overdue" || statusA === "upcoming") {
			const cmp = (a.due ?? "").localeCompare(b.due ?? "");
			if (cmp !== 0) return cmp;
		}
		const timeDiff = b.file.stat.mtime - a.file.stat.mtime;
		if (timeDiff !== 0) return timeDiff;
		return a.line - b.line;
	});

	const remaining = total - done;
	const pct = total > 0 ? Math.round((done / total) * 100) : 0;

	const wrapper = containerEl.createDiv({ cls: "nexus-section" });
	if (label) {
		renderDivider(ctx, wrapper, label);
	}

	const panel = wrapper.createDiv({ cls: "nexus-panel" });

	const taskEl = panel.createDiv({ cls: "nexus-tasks" });

	// Empty state
	if (total === 0) {
		const emptyEl = taskEl.createDiv({ cls: "nexus-tasks-empty" });
		emptyEl.createEl("span", { text: "No tasks found", cls: "nexus-tasks-empty-text" });
		if (filterPath) {
			emptyEl.createEl("span", { text: `in ${filterPath}`, cls: "nexus-tasks-empty-path" });
		}
		return;
	}

	// Stats row
	const statsRow = taskEl.createDiv({ cls: "nexus-tasks-stats" });
	const statItems = [
		{ value: String(total), label: "Total" },
		{ value: String(done), label: "Done" },
		{ value: String(remaining), label: "Open" },
		{ value: `${pct}%`, label: "" },
	];
	for (const stat of statItems) {
		const statEl = statsRow.createDiv({ cls: "nexus-tasks-stat" });
		statEl.createEl("span", { text: stat.value, cls: "nexus-tasks-stat-value" });
		if (stat.label) {
			statEl.createEl("span", { text: stat.label, cls: "nexus-tasks-stat-label" });
		}
	}

	// Progress bar with % label to the right
	if (showProgress) {
		const progressEl = taskEl.createDiv({ cls: "nexus-tasks-progress" });
		const track = progressEl.createDiv({ cls: "nexus-tasks-progress-track" });
		const fill = track.createDiv({ cls: "nexus-tasks-progress-fill" });
		fill.style.width = `${pct}%`;
		progressEl.createEl("span", { text: `${pct}%`, cls: "nexus-tasks-progress-pct" });
	}

	// Due-date summary strip
	if (showDue) {
		const overdueCount = openTasks.filter((t) => dueBucket(t.due) === "overdue").length;
		const todayCount = openTasks.filter((t) => dueBucket(t.due) === "today").length;
		if (overdueCount > 0 || todayCount > 0) {
			const strip = taskEl.createDiv({ cls: "nexus-tasks-due-strip" });
			if (overdueCount > 0) {
				strip.createEl("span", {
					text: `${overdueCount} overdue`,
					cls: "nexus-tasks-due-chip nexus-tasks-due-chip-overdue",
				});
			}
			if (todayCount > 0) {
				strip.createEl("span", {
					text: `${todayCount} today`,
					cls: "nexus-tasks-due-chip nexus-tasks-due-chip-today",
				});
			}
		}
	}

	// Task list — grouped by due-date bucket
	if (showList && openTasks.length > 0) {
		const groupDefs: Array<{
			key: string;
			label: string;
			task: (t: (typeof openTasks)[number]) => boolean;
		}> = [
			{ key: "overdue", label: "Overdue", task: (t) => dueBucket(t.due) === "overdue" },
			{ key: "today", label: "Today", task: (t) => dueBucket(t.due) === "today" },
			{ key: "upcoming", label: "Upcoming", task: (t) => dueBucket(t.due) === "upcoming" },
			{ key: "none", label: "No due date", task: (t) => dueBucket(t.due) === "none" },
		];

		const listEl = taskEl.createDiv({
			cls: `nexus-tasks-list${ctx.settings.taskSummaryShowFade ? " nexus-fade-mask" : ""}`,
		});
		listEl.style.maxHeight = `${ctx.settings.taskSummaryMaxHeight}px`;
		let shownTasks = 0;

		for (const def of groupDefs) {
			if (shownTasks >= maxList) break;

			const groupTasks = openTasks.filter(def.task);
			if (groupTasks.length === 0) continue;

			const groupEl = listEl.createDiv({ cls: `nexus-tasks-group nexus-tasks-group-${def.key}` });

			const headerEl = groupEl.createDiv({ cls: "nexus-tasks-group-header" });
			headerEl.createEl("span", { text: def.label, cls: "nexus-tasks-group-name" });
			headerEl.createEl("span", {
				text: `${groupTasks.length} task${groupTasks.length > 1 ? "s" : ""}`,
				cls: "nexus-tasks-group-count",
			});

			const tasksToShow = groupTasks.slice(0, maxList - shownTasks);
			shownTasks += tasksToShow.length;

			for (const task of tasksToShow) {
				const itemEl = groupEl.createDiv({ cls: "nexus-tasks-item" });

				if (checkable) {
					const checkbox = itemEl.createEl("input", {
						type: "checkbox",
						cls: "nexus-tasks-checkbox",
						attr: { "aria-label": "Mark task as done" },
					});
					checkbox.addEventListener("change", async () => {
						checkbox.disabled = true;
						try {
							await toggleTaskLine(task.file, task.line);
						} catch (e) {
							// eslint-disable-next-line no-console
							console.error("Nexus Dashboard: failed to toggle task", e);
							new Notice("Failed to update the task file");
							checkbox.disabled = false;
						}
						void ctx.rerender();
					});
				}

				const textEl = itemEl.createDiv({ cls: "nexus-tasks-item-text" });
				textEl.textContent = task.text;

				if (showDue && task.due) {
					const [y, m, d] = task.due.split("-").map(Number);
					const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
						month: "short",
						day: "numeric",
					});
					itemEl.createEl("span", {
						text: label,
						cls: `nexus-tasks-due nexus-tasks-due-${dueBucket(task.due)}`,
						attr: { title: task.due },
					});
				}

				itemEl.createEl("span", { text: task.file.basename, cls: "nexus-tasks-item-file" });

				// Click to open file at task line (except checkbox interaction)
				itemEl.addEventListener("click", (e) => {
					if (e.target instanceof HTMLInputElement) return;
					e.preventDefault();
					ctx.app.workspace.openLinkText(task.file.path, "", false, {
						state: { line: task.line },
					});
				});
			}
		}

		// Remaining count
		const totalOpen = openTasks.length;
		if (shownTasks < totalOpen) {
			const moreEl = listEl.createDiv({ cls: "nexus-tasks-more" });
			moreEl.createEl("span", { text: `+${totalOpen - shownTasks} more` });
		}
	}
}
