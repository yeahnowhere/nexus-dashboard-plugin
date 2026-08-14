import type { TFile } from "obsidian";

/**
 * Due-date bucket for an open task, relative to today.
 */
export type DueStatus = "overdue" | "today" | "upcoming" | "none";

/**
 * Extract a due date (YYYY-MM-DD) from a raw task line.
 *
 * Recognises the Tasks-plugin emoji format (`📅 YYYY-MM-DD`) and the plain
 * `due: YYYY-MM-DD` token. Returns `null` when no valid date is present.
 */
export function parseDueDate(rawLine: string): string | null {
	const emoji = rawLine.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
	if (emoji) return emoji[1];
	const token = rawLine.match(/(?:^|\s)due:\s*(\d{4}-\d{2}-\d{2})/);
	if (token) return token[1];
	return null;
}

/**
 * Categorise a due date against today. Dates without a due date map to `"none"`.
 */
export function dueStatus(dueDate: string | null, now: Date = new Date()): DueStatus {
	if (!dueDate) return "none";
	const [y, m, d] = dueDate.split("-").map(Number);
	if (!y || !m || !d) return "none";
	const due = new Date(y, m - 1, d);
	if (due.getFullYear() !== y || due.getMonth() !== m - 1 || due.getDate() !== d) return "none";
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const dayDiff = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
	if (dayDiff < 0) return "overdue";
	if (dayDiff === 0) return "today";
	return "upcoming";
}

/**
 * Mark a task on the given line as done by flipping its `[ ]` checkbox to `[x]`
 * through the vault process API. Lines that are already checked are left untouched.
 */
export async function toggleTaskLine(file: TFile, lineIdx: number): Promise<void> {
	await file.vault.process(file, (content) => {
		const lines = content.split("\n");
		const line = lines[lineIdx];
		if (line === undefined) return content;
		const next = line.replace(/\[[ xX]\]/, "[x]");
		if (next === line) return content;
		lines[lineIdx] = next;
		return lines.join("\n");
	});
}
