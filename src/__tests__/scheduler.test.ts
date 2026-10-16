import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoalescedScheduler } from "../scheduler";

describe("CoalescedScheduler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("debounce: coalesces rapid calls into a single trailing run", () => {
		const run = vi.fn();
		const s = new CoalescedScheduler({ mode: "debounce", delay: 100, run });

		s.schedule();
		vi.advanceTimersByTime(40);
		s.schedule();
		vi.advanceTimersByTime(40);
		s.schedule();

		expect(run).not.toHaveBeenCalled();
		vi.advanceTimersByTime(99);
		expect(run).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("debounce + maxWait: a continuous burst still fires at the cap", () => {
		const run = vi.fn();
		const s = new CoalescedScheduler({
			mode: "debounce",
			delay: 100,
			maxWait: 250,
			run,
		});

		s.schedule();
		for (let i = 0; i < 4; i++) {
			vi.advanceTimersByTime(60);
			s.schedule();
		}
		// Last request at t=240 would trailing-fire at 340, but the 250 ms cap wins.
		expect(run).not.toHaveBeenCalled();
		vi.advanceTimersByTime(11);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("earliest: a later deadline never postpones a pending sooner one", () => {
		const run = vi.fn();
		const s = new CoalescedScheduler({ mode: "earliest", delay: 300, run });

		s.schedule(300);
		vi.advanceTimersByTime(100);
		s.schedule(1500);

		vi.advanceTimersByTime(199);
		expect(run).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("earliest: a sooner deadline pulls a pending later one forward", () => {
		const run = vi.fn();
		const s = new CoalescedScheduler({ mode: "earliest", delay: 300, run });

		s.schedule(1500);
		vi.advanceTimersByTime(100);
		s.schedule(300);

		vi.advanceTimersByTime(300);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("lock: ignores requests while a run is already pending", () => {
		const run = vi.fn();
		const s = new CoalescedScheduler({ mode: "lock", delay: 100, run });

		s.schedule();
		vi.advanceTimersByTime(50);
		s.schedule();
		vi.advanceTimersByTime(50);

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("flush: runs immediately when pending, no-op when idle, never double-fires", () => {
		const run = vi.fn();
		const s = new CoalescedScheduler({ mode: "debounce", delay: 100, run });

		s.flush();
		expect(run).not.toHaveBeenCalled();

		s.schedule();
		s.flush();
		expect(run).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(200);
		expect(run).toHaveBeenCalledTimes(1);
		expect(s.pending).toBe(false);
	});

	it("cancel: drops a pending run without invoking it", () => {
		const run = vi.fn();
		const s = new CoalescedScheduler({ mode: "debounce", delay: 100, run });

		s.schedule();
		s.cancel();
		vi.advanceTimersByTime(200);

		expect(run).not.toHaveBeenCalled();
		expect(s.pending).toBe(false);
	});

	it("delayFor + onBeforeRun: dynamic fast-lane delay and per-cycle reset", () => {
		let fast = false;
		const run = vi.fn();
		const s = new CoalescedScheduler({
			mode: "debounce",
			delay: 800,
			delayFor: () => (fast ? 200 : 800),
			onBeforeRun: () => {
				fast = false;
			},
			run,
		});

		fast = true;
		s.schedule();
		vi.advanceTimersByTime(200);

		expect(run).toHaveBeenCalledTimes(1);
		expect(fast).toBe(false);
	});
});
