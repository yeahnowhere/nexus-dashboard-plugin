import type { ClockConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Render a live clock block. Registers its interval via ctx so unload can clear it. */
export function renderClock(
	ctx: RendererContext,
	containerEl: HTMLElement,
	config: ClockConfig,
): void {
	const showDate = config.showDate !== false;
	const showSeconds = config.showSeconds === true;
	const format = config.format || "12h";
	const timezone = config.timezone || undefined;
	const label = config.label || "";

	if (label) {
		renderDivider(ctx, containerEl, label);
	}

	const panel = containerEl.createDiv({ cls: "nexus-panel" });

	const clockEl = panel.createDiv({ cls: "nexus-clock" });

	const timeEl = clockEl.createDiv({ cls: "nexus-clock-time" });
	const dateEl = showDate ? clockEl.createDiv({ cls: "nexus-clock-date" }) : null;

	const timeOpts: Intl.DateTimeFormatOptions = {
		hour: "2-digit",
		minute: "2-digit",
		hour12: format === "12h",
	};
	if (showSeconds) timeOpts.second = "2-digit";
	if (timezone) timeOpts.timeZone = timezone;

	const dateOpts: Intl.DateTimeFormatOptions = {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	};
	if (timezone) dateOpts.timeZone = timezone;

	let tzEl: HTMLElement | null = null;
	if (timezone) {
		tzEl = clockEl.createDiv({ cls: "nexus-clock-tz" });
		const short = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			timeZoneName: "shortOffset",
		})
			.formatToParts(new Date())
			.find((p) => p.type === "timeZoneName")?.value;
		tzEl.textContent = short || timezone;
	}

	const updateClock = () => {
		const now = new Date();
		timeEl.textContent = new Intl.DateTimeFormat(undefined, timeOpts).format(now);
		if (dateEl) {
			dateEl.textContent = new Intl.DateTimeFormat(undefined, dateOpts).format(now);
		}
		if (tzEl) {
			const short = new Intl.DateTimeFormat("en-US", {
				timeZone: timezone,
				timeZoneName: "shortOffset",
			})
				.formatToParts(now)
				.find((p) => p.type === "timeZoneName")?.value;
			tzEl.textContent = short || timezone || "";
		}
	};

	updateClock();

	// Track a per-clock interval so multiple clock blocks stay in sync and
	// stale timers are cleared when their DOM is discarded.
	ctx.registerClockInterval(setInterval(updateClock, 1000));
}
