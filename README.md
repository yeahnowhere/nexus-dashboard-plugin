# Nexus Dashboard

Code-block driven MOC dashboard for Obsidian.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/johnsstalk/nexus-dashboard-plugin/releases)
2. Create a folder `nexus-dashboard` in `.obsidian/plugins/`
3. Copy the three files into it
4. Enable the plugin in **Settings > Community Plugins**

## Quick Start

Create a note with a `nexus-dashboard` code block:

````
```nexus-dashboard
```
````

You can configure default settings in **Settings > Community Plugins > Nexus Dashboard**.

## Dashboard Components

### ASCII header
An ASCII art banner at the top of your dashboard.

Properties: `text`, `font`, `color`, `size`, `mobileSize`, `align`

````
```nexus-dashboard
header:
  text: MY VAULT
  font: ANSI Shadow
  color: #8A5CF6
  size: 1.0
  mobileSize: 0.5
  align: center
```
````

### Stats bar
Shows file/folder counts from selected folders.

Properties: `show` (true/false), `metric` (files/notes/size/tags), `scope` (all/today/week/month/year), `recursive`, plus New Note button keys (`new-note`, `new-note-folder`, `new-note-template`, `new-note-label`)

Each `- label:` / `- path:` entry defines one counter; `metric` chooses what to count, `scope` filters by time window, and `recursive` includes subfolders.

````
```nexus-dashboard
stats:
  show: true
  - label: Notes This Month
    path: Journal
    metric: notes
    scope: month
  - label: Vault Size
    metric: size
  new-note: true
  new-note-folder: Inbox
```
````

### Section
A card grid area.

Properties: `columns` (1–4)

````
```nexus-dashboard
section:
  columns: 2
```
````

### Card
A navigation link inside a section.

Card entries start with `- type:` (big or mini). Each section must contain only one card type — the section picks a single grid (mini-grid or big-grid) based on the first card, mixing types forces all cards into the wrong layout.

Properties: `type` (big/mini), `label`, `desc`, `path`, `icon`, `columns` (1–4 on parent section)

Big cards:

````
```nexus-dashboard
section:
  columns: 2
  cards:
    - type: big
      label: Journal
      desc: Daily reflections
      path: MOC/Journal MOC.md
      icon: Journal
```
````

Mini cards:

````
```nexus-dashboard
section:
  columns: 3
  cards:
    - type: mini
      label: Quick Link
      path: MOC/Book Notes MOC.md
      icon: Book
```
````

### Divider
A horizontal separator between sections.

Properties: `title`, `type` (default, bold, subtle, gradient, dashed)

````
```nexus-dashboard
divider:
  type: bold
  title: Archive
```
````

### Vault Activity
A compact terminal-style list of files, optionally filtered by path and/or tags. With no filter it shows the most recently modified notes from the whole vault.

Properties: `path`, `tags` (comma-separated), `count`, `label`, `show`

An empty `label` hides the divider header above the list. Slots without a list selected fall back to recently modified files from the whole vault, using the global **Label** and **Count** settings. In Settings → Components → Vault Activity, each named preset carries its own `path`, `tags`, `count`, and `label`; a preset with empty `path` and `tags` acts as a whole-vault list.

Multiple `vault-activity:` blocks with different filters each render their own list in their row/column.

````
```nexus-dashboard
vault-activity:
  label: Journal
  path: Journal/
  count: 10

vault-activity:
  label: Active Projects
  tags: project, active
  count: 5

vault-activity:
  count: 8
```
````

### Graph links
Injects wiki links at the bottom for visual navigation.

Properties: `showGraph`, `exclude` (comma-separated folder names)

````
```nexus-dashboard
graph:
  showGraph: true
  exclude: Templates,Attachments
```
````

### Links
A grid of clickable external or internal links.

Properties: `title`, `columns` (1–4)

Link items start with `- url:`. Each item can have `label` and `desc`.

````
```nexus-dashboard
links:
  title: Quick Links
  columns: 3
  items:
    - url: https://obsidian.md
      label: Obsidian
    - url: https://github.com
      label: GitHub
    - url: MOC/Journal MOC.md
      label: Journal
```
````

### Heatmap
A GitHub-style contribution calendar of your vault editing activity. Each cell's color reflects the number of unique files edited that day (`created`/`modified`/`moved`/`renamed`); file opens, task toggles, and property edits are not counted. Colors use rank-based intensity, so busier days are clearly darker regardless of outliers.

Properties: `show` (true/false), `weeks` (integer), `label`

````
```nexus-dashboard
heatmap:
  show: true
  weeks: 16
```
````

### Activity Timeline
A chronological log of vault activity — created, modified, deleted, renamed/moved, task, and property events — with day or file grouping, relative times, and date chips. `MODIFIED` events update live as you edit; external renames are recovered via delete+create pairing and startup mtime reconciliation, so they appear as `renamed` instead of a spurious delete.

Properties: `show` (true/false), `label`, `exclude` (comma-separated folders), `include` (comma-separated folders), `excludeExt` (comma-separated extensions), `types` (comma-separated actions, e.g. `created,deleted`), `onlyMarkdown` (true/false), `group` (day/file), `relative` (true/false), `showDate` (true/false),

````
```nexus-dashboard
timeline:
  show: true
  group: day
  relative: true
  exclude: Templates,Attachments
```
````

### Clock
A live digital clock widget.

Properties: `show` (true/false), `timezone` (IANA name, e.g. `Europe/London`), `showDate` (true/false), `showSeconds` (true/false), `format` (12h/24h), `label`

````
```nexus-dashboard
clock:
  show: true
  timezone: Asia/Kolkata
  format: 12h
  showDate: true
  showSeconds: true
```
````

### File Types
A stacked composition bar showing the share of file types in your vault, with a
total file count and a legend listing every extension present (e.g. `md`,
`canvas`, `png`, `js`). Every extension gets its own row and color from a
theme-accent ramp that adapts to any theme or accent color. The legend wraps into
multiple columns and caps at the configured height, scrolling internally when
the vault has many extensions. Optionally scope it to a single folder. In the
dashboard layout builder you can create named **file-type lists** (folder +
label + optional max height) in the Components tab and assign one to any
row/column slot.

Properties: `show` (true/false), `path` (vault-relative folder; empty = whole vault), `label`, `height` (max legend height in px, e.g. `200`)

````
```nexus-dashboard
filetypes:
  show: true
  path: Projects
  height: 200
```
````

### Task Summary
Open/done task counts with a progress bar and a grouped open-task list.

Properties: `show` (true/false), `progress` (true/false), `showList` (true/false), `count` (integer), `path` (vault-relative folder), `tags` (comma-separated frontmatter tags), `label`

````
```nexus-dashboard
tasks:
  show: true
  progress: true
  showList: true
  count: 10
  path: Project
  tags: project, active
```
````

### Row
Places the next N sections side-by-side in columns. `row:` is a marker — the sections that follow it become the row's children.

Properties: `columns` (1–4, defaults to 2), `proportion`, `align` (top/center/stretch)

Leaf blocks (`vault-activity:`, `links:`, `heatmap:`, `timeline:`, `clock:`, `filetypes:`, `tasks:`) can also fill a row column — either as a direct row child or nested inside a `column:`. An empty `section:` marker followed by a leaf block hands its column slot to that block:

````
```nexus-dashboard
row:
  columns: 2
  proportion: 50/50
  - section:
      columns: 2
      cards:
        - type: big
          label: Journal Cards
          path: MOC/Journal MOC.md
          icon: Journal
  - section:
      vault-activity:
        label: Journal Activity
        path: Journal/
        count: 8
```
````

````
```nexus-dashboard
row:
  columns: 2
  proportion: 50/50
  - column:
      - section:
          columns: 2
          cards:
            - type: big
              label: Left Panel
              path: MOC/Journal MOC.md
              icon: Journal
  - column:
      - vault-activity:
          label: Journal Activity
          path: Journal/
          count: 8
```
````

### Column
Vertical stacking layout — places sections one above another inside a row.

Properties: `spacing`, `align` (top/center/stretch)

Any leaf block can be stacked inside a `column:` too:

````
```nexus-dashboard
row:
  columns: 2
  - column:
      - section:
          columns: 1
          cards:
            - type: big
              label: Top Section
              path: MOC/Journal MOC.md
              icon: Journal
      - heatmap:
          weeks: 12
  - section:
      columns: 1
      cards:
        - type: big
          label: Right Side
          path: MOC/Knowledge MOC.md
          icon: Knowledge
```
````

## Commands

Open **Ctrl+P** / **Cmd+P** and search:

- `Open dashboard` — opens the full dashboard view
- `Insert Nexus Dashboard code block` — inserts an empty code block
- `Insert ASCII art block` — inserts a header code block
- `Render selection as ASCII art` — wraps selected text in a header block
- `Clear activity log` — clears the recorded activity timeline (also available in Settings → Components → Activity Timeline)

## Settings

Open **Settings > Community Plugins > Nexus Dashboard** to configure:

- **General** — open on startup, export/import settings JSON, reset to defaults
- **Header** — show header toggle, ASCII text, font picker, color, desktop size, mobile size, alignment, live preview
- **Dashboard** — the layout builder: row layouts, column layouts, and saved row proportions. Each card can be collapsed, dragged to reorder, or deleted
- **Presets** — preloaded layout templates that replace the current dashboard layout while keeping your MOC cards, stats, vault lists, and quick links
- **Components** — the content blocks that fill your layout slots, plus the global divider style

Every card in the **Dashboard** and **Components** tabs collapses/expands by clicking its header, remembers its state between sessions, and supports **Collapse all / Expand all** shortcuts.

## Layout Builder

The dashboard is assembled from **row** and **column** layouts configured in **Settings → Dashboard**:

- A **row layout** places content side-by-side. Set the number of columns (1–4), the proportion (e.g. `50/50`, `33/67`), and vertical alignment.
- A **column layout** stacks content vertically inside a row. Set the spacing and alignment.
- Each column of a row, or each slot of a column, gets a content slot: **Empty**, **Stats**, **Heading**, **MOC Cards**, **Quick Links**, **Vault Activity**, **Divider**, **Heatmap**, **Activity Timeline**, **Clock**, **File Types**, or **Task Summary**.
- Saved row proportions let you reuse column-width ratios across rows.

## Component Settings

The content blocks are configured in **Settings → Components**. Each component has an enable toggle and its own options; the **Divider Style** card controls the global appearance of all section dividers.

- **MOC Cards** — Map-of-Content cards with drag-and-drop reorder. Each card has a note path, title, description, icon picker, and color picker.
- **Stats** — header counters showing file/folder counts from selected folders. Each counter picks a folder, a metric (`files`, `notes`, `size`, `tags`), a scope (`all`, `today`, `week`, `month`, `year`), and recursive subfolder traversal. A New Note button with configurable label, target folder, and optional template is available here too.
- **Vault Activity** — terminal-style lists of files. Create named presets with their own `path`, `tags`, `count`, and `label`; a preset with empty path and tags acts as a whole-vault list.
- **Quick Links** — a grid of internal/external links with label and URL, drag-and-drop reorderable.
- **Heatmap** — a GitHub-style contribution calendar of your vault activity (weeks, label).
- **Activity Timeline** — a chronological log of vault activity (new/modified/deleted files and folders) with day grouping, relative times, and date chips. `MODIFIED` events update live as you edit. External renames are detected via delete+create pairing and startup mtime reconciliation, so they appear as `renamed` instead of a spurious delete. Toggles for activity tracking, task tracking, and markdown-only filtering live here.
- **Clock** — a digital clock; set the timezone, show date/seconds, and pick a 12h/24h format.
- **File Types** — a horizontal bar chart of file types in your vault (max types, label).
- **Task Summary** — open/done tasks with a progress bar and a task list; filter by path or comma-separated tags, and set the max tasks shown.
- **Divider Style** — global gradient line, line width, label size/weight/color/spacing, and named presets (default, bold, subtle, gradient, dashed).

## Development

```bash
npm install
npm run dev          # watch mode
npm run typecheck    # type-check (tsc --noEmit)
npm run lint         # ESLint
npm run test         # Vitest (312 tests)
npm run build        # typecheck + production build
```

## License

[MIT](LICENSE)
