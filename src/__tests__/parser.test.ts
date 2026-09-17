import { describe, it, expect } from "vitest";
import { buildDefaultConfig, parseDashboard } from "../parser";

describe("buildDefaultConfig", () => {
	it("returns a valid default config", () => {
		const config = buildDefaultConfig();
		expect(config.header).toBeDefined();
		expect(config.header.enabled).toBe(false);
		expect(config.stats).toBeDefined();
		expect(config.stats.enabled).toBe(false);
		expect(config.blocks).toHaveLength(2);
		expect(config.blocks[0].kind).toBe("row");
		expect(config.blocks[1].kind).toBe("row");
		expect(config.graph).toBeDefined();
	});
});

describe("parseDashboard", () => {
	it("returns default config for empty input", () => {
		const config = parseDashboard("");
		expect(config.header.enabled).toBe(false);
		expect(config.blocks).toHaveLength(2);
		expect(config.blocks[0].kind).toBe("row");
	});

	it("parses header config", () => {
		const config = parseDashboard(`
header:
  text: HELLO
  color: "#ff0000"
  size: 2
  align: center
`);
		expect(config.header.enabled).toBe(true);
		expect(config.header.text).toBe("HELLO");
		expect(config.header.color).toBe("#ff0000");
		expect(config.header.size).toBe(2);
		expect(config.header.align).toBe("center");
	});

	it("parses header with shorthand size", () => {
		const config = parseDashboard(`
header:
  text: SMALL
  size: small
`);
		expect(config.header.size).toBe(0.6);
	});

	it("parses section with cards", () => {
		const config = parseDashboard(`
section:
  columns: 3
  cards:
    - type: big
      label: Test
      path: Test.md
      icon: MOC
`);
		expect(config.blocks).toHaveLength(1);
		const section = config.blocks[0];
		expect(section.kind).toBe("section");
		if (section.kind === "section") {
			expect(section.columns).toBe(3);
			expect(section.cards).toHaveLength(1);
			expect(section.cards[0].label).toBe("Test");
			expect(section.cards[0].path).toBe("Test.md");
		}
	});

	it("parses a section height override", () => {
		const config = parseDashboard(`
section:
  columns: 2
  height: 300
  cards:
    - type: big
      label: Test
      path: Test.md
      icon: MOC
`);
		const section = config.blocks[0];
		expect(section.kind).toBe("section");
		if (section.kind === "section") {
			expect(section.columns).toBe(2);
			expect(section.height).toBe(300);
		}
	});

	it("parses divider", () => {
		const config = parseDashboard(`
divider:
  title: My Divider
  type: bold
`);
		expect(config.blocks).toHaveLength(1);
		const divider = config.blocks[0];
		expect(divider.kind).toBe("divider");
	});

	it("parses links block", () => {
		const config = parseDashboard(`
links:
  title: Quick Links
  columns: 2
  - url: https://example.com
    label: Example
`);
		expect(config.blocks).toHaveLength(1);
		const links = config.blocks[0];
		expect(links.kind).toBe("links");
	});

	it("parses stats toggle", () => {
		const config = parseDashboard(`
stats: true
`);
		expect(config.stats.enabled).toBe(true);
	});

	it("parses stats items with metric, scope and recursive", () => {
		const config = parseDashboard(`
stats:
  show: true
  - label: Notes This Month
    path: Journal
    metric: notes
    scope: month
  - label: Vault Size
    metric: size
    recursive: false
`);
		expect(config.stats.enabled).toBe(true);
		expect(config.stats.items).toHaveLength(2);
		expect(config.stats.items[0]).toEqual({
			label: "Notes This Month",
			folder: "Journal",
			metric: "notes",
			scope: "month",
		});
		expect(config.stats.items[1]).toEqual({
			label: "Vault Size",
			metric: "size",
			recursive: false,
		});
	});

	it("parses new-note config in stats", () => {
		const config = parseDashboard(`
stats:
  show: true
  new-note: true
  new-note-folder: Inbox
  new-note-template: Templates/Inbox
  new-note-label: "+ Add"
`);
		expect(config.stats.newNote).toEqual({
			enabled: true,
			folder: "Inbox",
			template: "Templates/Inbox",
			label: "+ Add",
		});
	});

	it("parses new-note disabled override", () => {
		const config = parseDashboard(`
stats:
  show: true
  new-note: false
`);
		expect(config.stats.newNote).toEqual({
			enabled: false,
			label: "+ New Note",
			folder: "",
			template: "",
		});
	});

	it("parses graph config", () => {
		const config = parseDashboard(`
graph:
  showGraph: true
  exclude: folder1, folder2
`);
		expect(config.graph.enabled).toBe(true);
		expect(config.graph.exclude).toEqual(["folder1", "folder2"]);
	});

	it("parses vault-activity block with path, tags and label", () => {
		const config = parseDashboard(`
vault-activity:
  show: true
  count: 5
  path: Journal/
  tags: project, active
  label: MY ACTIVITY
`);
		expect(config.blocks).toHaveLength(1);
		const activity = config.blocks[0];
		expect(activity.kind).toBe("vault-activity");
		if (activity.kind === "vault-activity") {
			expect(activity.show).toBe(true);
			expect(activity.count).toBe(5);
			expect(activity.path).toBe("Journal/");
			expect(activity.tags).toEqual(["project", "active"]);
			expect(activity.label).toBe("MY ACTIVITY");
		}
	});

	it("parses filetypes block with path, label and height", () => {
		const config = parseDashboard(`
filetypes:
  show: true
  path: Projects
  label: FILES
  height: 250
`);
		expect(config.blocks).toHaveLength(1);
		const chart = config.blocks[0];
		expect(chart.kind).toBe("filetypes");
		if (chart.kind === "filetypes") {
			expect(chart.show).toBe(true);
			expect(chart.path).toBe("Projects");
			expect(chart.label).toBe("FILES");
			expect(chart.maxLegendHeight).toBe(250);
		}
	});

	it("ignores invalid filetypes height values", () => {
		const config = parseDashboard(`
filetypes:
  height: 0
`);
		const chart = config.blocks[0];
		expect(chart.kind).toBe("filetypes");
		if (chart.kind === "filetypes") {
			expect(chart.maxLegendHeight).toBeUndefined();
		}
	});

	it("parses multiple vault-activity blocks independently", () => {
		const config = parseDashboard(`
vault-activity:
  path: Journal/
  count: 10

vault-activity:
  tags: work
  count: 3
`);
		const activityBlocks = config.blocks.filter((b) => b.kind === "vault-activity");
		expect(activityBlocks).toHaveLength(2);
		const [first, second] = activityBlocks;
		if (first.kind === "vault-activity" && second.kind === "vault-activity") {
			expect(first.path).toBe("Journal/");
			expect(first.tags).toBeUndefined();
			expect(second.path).toBeUndefined();
			expect(second.tags).toEqual(["work"]);
		}
	});

	it("parses row with sections", () => {
		const config = parseDashboard(`
row:
  columns: 2
  - section:
      columns: 1
      cards:
        - type: big
          label: Left
          path: Left.md
  - section:
      columns: 1
      cards:
        - type: big
          label: Right
          path: Right.md
`);
		expect(config.blocks).toHaveLength(1);
		const row = config.blocks[0];
		expect(row.kind).toBe("row");
		if (row.kind === "row") {
			expect(row.children).toHaveLength(2);
			expect(row.children.every((c) => c.kind === "section")).toBe(true);
		}
	});

	it("nests a leaf block in the next row slot when section is empty", () => {
		const config = parseDashboard(`
row:
  columns: 2
  proportion: 50/50
- section:
    columns: 2
    cards:
      - type: big
        label: AI Content Drafts
        path: MOC/AI Content Drafts MOC
        icon: Journal
- section:
    vault-activity:
    path: Journal
`);
		expect(config.blocks).toHaveLength(1);
		const row = config.blocks[0];
		expect(row.kind).toBe("row");
		if (row.kind === "row") {
			expect(row.proportion).toBe("50/50");
			expect(row.children).toHaveLength(2);
			const [left, right] = row.children;
			expect(left.kind).toBe("section");
			if (left.kind === "section") {
				expect(left.cards).toHaveLength(1);
				expect(left.cards[0].label).toBe("AI Content Drafts");
			}
			expect(right.kind).toBe("vault-activity");
			if (right.kind === "vault-activity") {
				expect(right.path).toBe("Journal");
			}
		}
	});

	it("carries a section divider onto a leaf block in a row slot", () => {
		const config = parseDashboard(`
row:
  columns: 2
  proportion: 50/50
- section:
    divider:
      title: SUB-MOC
    columns: 2
    cards:
      - type: big
        label: AI Content Drafts
        path: MOC/AI Content Drafts MOC
- section:
    divider:
      title: SUB-MOC
    vault-activity:
      path: Journal
      count: 50
`);
		expect(config.blocks).toHaveLength(1);
		const row = config.blocks[0];
		expect(row.kind).toBe("row");
		if (row.kind === "row") {
			expect(row.children).toHaveLength(2);
			const [left, right] = row.children;
			expect(left.kind).toBe("section");
			if (left.kind === "section") {
				expect(left.divider?.title).toBe("SUB-MOC");
				expect(left.cards).toHaveLength(1);
			}
			expect(right.kind).toBe("vault-activity");
			if (right.kind === "vault-activity") {
				expect(right.label).toBe("SUB-MOC");
				expect(right.path).toBe("Journal");
				expect(right.count).toBe(50);
			}
		}
	});

	it("attaches a pending divider to a leaf block in a row slot", () => {
		const config = parseDashboard(`
row:
  columns: 2
- section:
    divider:
      title: LEFT
    cards:
      - type: big
        label: Left
        path: Left.md
- divider:
    title: SUB-MOC
  vault-activity:
    path: Journal
    count: 50
`);
		expect(config.blocks).toHaveLength(1);
		const row = config.blocks[0];
		expect(row.kind).toBe("row");
		if (row.kind === "row") {
			expect(row.children).toHaveLength(2);
			const [left, right] = row.children;
			expect(left.kind).toBe("section");
			expect(right.kind).toBe("vault-activity");
			if (right.kind === "vault-activity") {
				expect(right.label).toBe("SUB-MOC");
				expect(right.path).toBe("Journal");
				expect(right.count).toBe(50);
			}
		}
	});

	it("does not leak a pending divider to the top level before a leaf block", () => {
		const config = parseDashboard(`
divider:
  title: SUB-MOC
vault-activity:
  path: Journal
`);
		expect(config.blocks).toHaveLength(1);
		const activity = config.blocks[0];
		expect(activity.kind).toBe("vault-activity");
		if (activity.kind === "vault-activity") {
			expect(activity.label).toBe("SUB-MOC");
			expect(activity.path).toBe("Journal");
		}
	});

	it("nests a leaf block inside an explicit column", () => {
		const config = parseDashboard(`
row:
  columns: 2
- column:
  - section:
      columns: 2
      cards:
        - type: big
          label: Cards
          path: Cards.md
- column:
  - vault-activity:
      path: Journal/
      count: 5
`);
		expect(config.blocks).toHaveLength(1);
		const row = config.blocks[0];
		expect(row.kind).toBe("row");
		if (row.kind === "row") {
			expect(row.children).toHaveLength(2);
			const [col1, col2] = row.children;
			expect(col1.kind).toBe("column");
			expect(col2.kind).toBe("column");
			if (col1.kind === "column" && col2.kind === "column") {
				expect(col1.children).toHaveLength(1);
				expect(col1.children[0].kind).toBe("section");
				expect(col2.children).toHaveLength(1);
				const activity = col2.children[0];
				expect(activity.kind).toBe("vault-activity");
				if (activity.kind === "vault-activity") {
					expect(activity.path).toBe("Journal/");
					expect(activity.count).toBe(5);
				}
			}
		}
	});

	it("nests heatmap and timeline inside a column", () => {
		const config = parseDashboard(`
column:
  - heatmap:
      weeks: 12
  - timeline:
      label: RECENT
`);
		expect(config.blocks).toHaveLength(1);
		const column = config.blocks[0];
		expect(column.kind).toBe("column");
		if (column.kind === "column") {
			expect(column.children).toHaveLength(2);
			const [heatmap, timeline] = column.children;
			expect(heatmap.kind).toBe("heatmap");
			if (heatmap.kind === "heatmap") {
				expect(heatmap.weeks).toBe(12);
			}
			expect(timeline.kind).toBe("timeline");
			if (timeline.kind === "timeline") {
				expect(timeline.label).toBe("RECENT");
			}
		}
	});

	it("keeps standalone leaf blocks at the top level", () => {
		const config = parseDashboard(`
vault-activity:
  path: Journal/
  count: 10
`);
		expect(config.blocks).toHaveLength(1);
		const block = config.blocks[0];
		expect(block.kind).toBe("vault-activity");
	});

	it("auto-appends .md to card paths", () => {
		const config = parseDashboard(`
section:
  cards:
    - type: big
      label: Test
      path: Test
`);
		expect(config.blocks.length).toBeGreaterThan(0);
		const section = config.blocks[0];
		if (section.kind === "section") {
			expect(section.cards[0].path).toBe("Test.md");
		}
	});

	it("handles YAML list prefix", () => {
		const config = parseDashboard(`
- section:
    cards:
      - type: big
        label: Test
        path: Test.md
`);
		expect(config.blocks).toHaveLength(1);
	});

	it("parses timeline block with extended keys", () => {
		const config = parseDashboard(`
timeline:
  show: true
  label: RECENT
  exclude: Journal
  excludeExt: .png, .jpg
  include: Projects, Journal
  types: created, deleted
  onlyMarkdown: false
  group: file
  relative: true
  showDate: false
`);
		expect(config.blocks).toHaveLength(1);
		const timeline = config.blocks[0];
		expect(timeline.kind).toBe("timeline");
		if (timeline.kind === "timeline") {
			expect(timeline.show).toBe(true);
			expect(timeline.label).toBe("RECENT");
			expect(timeline.exclude).toEqual(["Journal"]);
			expect(timeline.excludeExt).toEqual([".png", ".jpg"]);
			expect(timeline.include).toEqual(["Projects", "Journal"]);
			expect(timeline.types).toEqual(["created", "deleted"]);
			expect(timeline.onlyMarkdown).toBe(false);
			expect(timeline.group).toBe("file");
			expect(timeline.relative).toBe(true);
			expect(timeline.showDate).toBe(false);
		}
	});

	it("parses tasks block with due + checkable keys", () => {
		const config = parseDashboard(`
tasks:
  show: true
  showList: false
  due: true
  checkable: false
  count: 5
  label: TODO
`);
		expect(config.blocks).toHaveLength(1);
		const tasks = config.blocks[0];
		expect(tasks.kind).toBe("tasks");
		if (tasks.kind === "tasks") {
			expect(tasks.show).toBe(true);
			expect(tasks.showList).toBe(false);
			expect(tasks.showDue).toBe(true);
			expect(tasks.checkable).toBe(false);
			expect(tasks.count).toBe(5);
			expect(tasks.label).toBe("TODO");
		}
	});
});
