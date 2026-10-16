# Changelog

## v1.5.1 — 2026-10-16

Performance, correctness and maintainability release. No user-facing feature changes; the full audit trail lives in the Bug Hunt Report (vault).

### Fixed

- **First click after startup stalled** - the initial render deferred graph-link injection and vault scans behind an idle callback, so the very first interaction could hang until they finished; the work is now coalesced and cached so the first paint is instant
- **File-type legend height key was ignored** - a `height:` key on a `filetypes:` block wrote `height` instead of `maxLegendHeight`, so the cap never applied; it now respects the configured height
- **Post-unload timers injected phantom graph links** - scheduler callbacks were never disposed on unload, so a debounced graph rescan could fire after the plugin was disabled and re-inject links; every scheduler is now disposed in `onunload`
- **Inert activity-tracking toggle** - the "track activity" setting did nothing because the write-dedupe key was wrong; it now correctly gates activity logging
- **Parser edge cases** - boolean coercion, list parsing and structural-directive handling were hardened during the parser split

### Changed

- **Fewer, batched re-renders** - all five ad-hoc debouncers in `main.ts` were replaced by a single `CoalescedScheduler`, so settings edits and vault events coalesce instead of stacking
- **Faster vault scans** - recently-modified files (10 s TTL) and the vault folder list (5 s TTL) are cached, and each render builds one shared snapshot instead of re-querying per block
- **Faster graph-link injection** - the graph scan is incremental and task-file reads run concurrently via `mapWithConcurrency`
- **Smoother drag-reorder** - list and layout drag operations save once at the end instead of on every pointer move

### Internal

- **Parser split into `DashboardParser`** - the giant `parseDashboard` function became a class with 25 focused methods; the public `parseDashboard()` API is unchanged
- **New `scheduler.ts` and `cache.ts` modules** - `CoalescedScheduler` (debounce / earliest / lock modes) and `TtlCache`, each unit-tested
- **Renderer settings builder extracted** - `buildConfigFromSettings` moved out of `renderer/index.ts` into `renderer/settings-layout.ts`, shrinking the coordinator
- **Settings-tab helpers de-duplicated** - shared card, list and divider builders extracted across the layout and components tabs
- **Type aliases** - `StatEntry` and `NewNoteSettings` are now aliases of the canonical `StatItem` / `NewNoteConfig`, removing the duplicate definitions
- **CI workflow fixed** - the trigger branch was `main` but the default branch is `master`, so CI never ran

## v1.5.0 — 2026-10-16

### Added

- **Keyboard / WASD dashboard navigation** - arrow keys and `W A S D` move focus between dashboard widgets on a grid: left/right step across a visual row, up/down keep the column, and the target scrolls into view. Enabled by default, with an opt-out and a "focus on open" toggle in the new **Navigation** settings tab. MOC cards drop their per-card tab stop since the dashboard root now owns focus
- **MOC card keyboard accessibility** - cards are focusable (`role="link"`, `aria-label="Open {label}"`), open with Enter/Space, and open their context menu (Open / Copy path / Move up / Move down) with the Menu key or Shift+F10 at the card position
- **Dead-link styling** - MOC cards whose target note no longer exists are marked (`.nexus-card-dead`) instead of looking identical to live cards
- **MOC cards tray height cap** - the MOC grid now sits in the unified panel recipe (`.nexus-moc-panel`); a `height: <px>` key on a `section:` block and a "MOC cards tray height" slider (0 = Auto) cap the tray, which scrolls on overflow
- **Single Default preset** - the four built-in layouts are collapsed into one **Default** preset that mirrors the shipped fresh-install layout; the active preset is detected structurally, and the Presets tab is now a compact list with **Active** / **Default** badges
- **Timeline rows scroll sideways instead of clipping** - long paths and change details were cut off with an ellipsis at the panel edge; the list is now a single max-content column, so every row keeps its full width and the panel scrolls horizontally (shift + mouse wheel, or a trackpad swipe) like a spreadsheet. Day separators span the full scroll width, and short rows still fill the panel as before
- **Timeline row hover tooltip** - hovering a row animates in a tooltip with the action, the full timestamp, the untruncated path (`old -> new` for renames and moves) and the change detail on separate lines, so nothing stays hidden when a path is long. It replaces the previous tooltip that only showed the timestamp
- **`npm run gen:fonts`** - a dev-only script (`scripts/gen-fonts.mjs`, fetches `.flf` from `patorjk/figlet.js`) that regenerates `src/fonts/*.ts` from canonical FIGlet data, so the hand-written fonts can be re-synced or a new font added from upstream source

### Fixed

- **Four header fonts rendered as garbled ASCII art** - the hand-written `Slant`, `Small Slant`, `Standard` and `Graffiti` glyph tables had their whole line stream shifted by 5/5/2/5 rows, so every character was assembled from the wrong slices of the following glyphs (verified against the canonical FIGlet data). They are now regenerated verbatim from the upstream `patorjk/figlet.js` fonts via `scripts/gen-fonts.mjs` (`npm run gen:fonts`)
- **ANSI Shadow punctuation was offset by one character** - the `! " # $ % & ' ( ) * + , - . / : ; < = > ? @` glyphs were shifted one slot, so e.g. `#` drew the `"` art and `&` drew `#` art; the `[ ] ^ _` glyphs were also missing entirely (rendered blank). The punctuation is now corrected to the canonical ANSI Shadow definitions (letters and digits were already correct and are untouched)
- **ASCII header and heading showed a stray vertical scrollbar** - `.ascii-header-output` and `.nexus-heading-output` set `overflow-x: auto` with the default `overflow-y: visible`, which the CSS spec computes to a vertical scroll container; the full-block glyphs (`█ ╗ ╔`) slightly overflow the `line-height: 1` line box, so the header could be scrolled up/down. The horizontal scrollers now pin `overflow-y: hidden` and the surrounding wrappers use `overflow: hidden`
- **Heatmap month labels sat one column too far right** - month anchors were measured from a noon cursor against a midnight range start, and rounding pulled the fractional day up a full day, so any month whose 1st landed on the week column's last day was anchored into the _next_ week (e.g. Nov and Aug in a 52-week view); anchors now use the exact calendar-day distance. Month labels are also collected per year-month instead of month number, so a range that crosses a year boundary or repeats a month name (over 52 weeks) keeps every label in order instead of dropping/overlapping them
- **Heatmap outer week columns were still clipped** - the 52-week calendar's nested CSS grid (53 outer tracks vs 52 inner tracks, each with its own gaps) was sized in two independent passes that drifted apart by one gap, so the first/last (Nov/Oct) columns kept losing a hairline at the panel edge even after the track clamp. The heatmap is now a single self-scaling inline `<svg>` with a `viewBox`, drawn the way the DKirwan `calendar-heatmap` reference is, so `width: 100%` fits it to any panel or column and there is no inner grid or `overflow` left to clip against. Cell geometry is centralised in an exported `HEATMAP_GEOMETRY` (11px cell, 2px gap, 2px radius, 28px day gutter, 16px month header) and the per-day cells, counts and tooltips are unchanged
- **New Note button was taller than the stat cards** - the button and its label had no line-height, so the label inherited Obsidian's global ~1.5 line-height (~15.7 px) while the stat cards force `line-height: 1` (~13.6 px); with the row centered on its cross-axis the button sat ~2 px taller. The button row is now `align-items: stretch` and the button + label force `line-height: 1`, so every box on the row is exactly the same height
- **File-type legend colors ignored the file count** - legend swatches were colored by rank position (cycling an 8-step ramp) instead of by count, so a 1-file extension looked identical to the dominant one. Counts now map to the ramp on a log scale: the largest type gets the full accent and rarer types read progressively lighter, with equal counts sharing a color
- **File-type chart showed a `(none)` type** - files with no extension (empty `TFile.extension`) were labeled literally `(none)`; the bucket is now labeled `no ext` and still counts toward the total
- **Task summary showed "No tasks found" on a cold start** - a `null` metadata cache means Obsidian has not indexed the file yet, not that it has no tasks, so the empty state now reads **Loading** until the cache settles
- **`tasks:` block rendered before the metadata cache settled** - a `tasks:` block could render empty on fresh open because the vault was still indexing when the dashboard first painted; the plugin now re-renders open dashboards on a debounced (800 ms) `metadataCache "changed"` event

### Removed

- **File-type chart stacked bar** - the horizontal composition bar above the legend was removed; the block is now just the total count plus the per-extension list (extension, count, percentage, accent swatch). The accent ramp still colours the legend swatches, now mixed in `oklab` (perceptually even steps) and ordered strong → light so the largest type gets the full accent

### Changed

- **Heatmap scale** - the 4 intensity levels now blend in `oklab` (40 / 60 / 80 / 100 %) instead of `srgb` (30 / 50 / 70 / 100 %), so the steps are perceptually even
- **Tighter default height caps** - vault activity 240 px, timeline 410 px, task summary 120 px, file types 120 px; the Project vault list now points at the `Project` folder, the default vault-activity count is 50, column spacing is `0.25rem`, and vault-activity path matching trims trailing slashes
- **Settings tab split into per-tab modules** - `settings/index.ts` was split into `settings/tabs/*.ts` (`general`, `header`, `layout`, `presets`, `components`) behind a thin coordinator; a mechanical move with no behavior change, and `saveAndRefresh()` now re-renders only the active tab

## v1.4.0 — 2026-09-17

### Fixed

- **Heatmap day grid disappeared inside panels** — the panel background and the empty heatmap cells both used `var(--background-secondary)`, so the inactive cells and the grid gaps blended into one flat block; empty/inactive cells now use a subtle translucent neutral (`color-mix` with `--text-normal`), so the per-day grid reads GitHub-style on any theme and card background without turning dark
- **Activity log was full of noise** — `folder-created`, `folder-deleted`, `folder-renamed` and `opened` events consumed the capped log buffer (often 60 %+), pushing real edit history out; the plugin now records only genuine file edits (`created`, `modified`, `moved`, `renamed`, `deleted`, plus optional `task` / `property` toggles), and existing noise is purged on startup
- **Heatmap mtime was double-counting recent days** — the mtime fallback now only fills files with no edit-log entry at all, so a logged file's mtime can't inflate (or double-count) recent days

### Changed

- **Unified card panels** — all widgets (clock, heatmap, timeline, vault activity, task summary, file types, quick links) now render inside bordered card panels matching the MOC card style
- **Timeline** — the "Show more" button and its `count` / `showMore` options were removed; the full filtered event list now renders (scroll + fade mask retained)
- **File-type chart** — the fixed color palette is now a theme-accent ramp blended against the card background (`25 % → 100 %` of `--interactive-accent`), so the chart adapts to any theme or accent color and every slot stays clearly visible
- **Heatmap scale** — now 4 intensity levels (was 5), with a stronger accent ramp mixed against the card background (`30 % → 100 %`), so each step is clearly distinguishable on any theme
- **Activity log buffer** — default `activityLogMax` raised from 500 to 2000 so a longer edit history is retained
- **Resize dividers** — hovering a row/column divider no longer flashes an accent bar; the accent now shows only while actively dragging

### Removed

- **Heatmap legend and summary** — the "Less / More" legend and the "N activities · X-day streak" line were removed

## v1.3.1 — 2026-09-02

### Fixed

- **Graph view edges on load** — dashboard → MOC → card edges are now injected into `metadataCache.resolvedLinks` at plugin load (after layout ready) and re-synced on vault/metadata changes (debounced), so the relationships appear in Graph View even before any dashboard file is opened. Injected edges are tracked and removed on unload.
- **Graph load scan was finding no dashboards** — `injectAllGraphLinks()` detected candidate files via `SectionCache.info`, a field Obsidian's metadata cache does not populate; the scan found zero candidates and injected nothing. Detection is now content-based (`vault.cachedRead` + `content.includes("```nexus-dashboard")`), matching the proven `findDashboardFile` pattern and independent of cache shape or indexing timing.
- **Graph view missing edges** — card paths are now injected into `metadataCache.resolvedLinks` and a global `"resolved"` event is fired, so MOC/sub-MOC edges from dashboard cards appear in Graph View on first render instead of only after a reload or visiting a linked note
- **New Note button sizing** — the button now mirrors the stat cards' layout (flex stretch, centered content) on desktop and mobile, so it no longer looks undersized next to the counters
- **Heatmap color scale** — replaced the linear max-based scale with GitHub-style rank buckets, so a 1-edit day and a 12–20-edit day get visibly different shades and a single outlier day can no longer flatten the rest of the scale
- **Heatmap mtime fallback** — a file's last edit day is now filled in per (path, day) even when an older log entry exists for it, so recent edits are no longer hidden when the capped log window drops the modify event

### Changed

- **Heatmap counts edits only** — cells now reflect unique files edited per day (`created` / `modified` / `moved` / `renamed` only); file opens, task toggles, and property edits no longer count as activity

## v1.3.0

Stable release — feature set unchanged from `v1.3.0-beta.1` (see entry below). The first release meeting the current feature and quality bar.

## v1.3.0-beta.1

> Everything since v1.2.0 shipped here as a single minor. This entry was previously split across the never-released `v1.2.2-beta.1` / `v1.2.2-beta.2` line and renumbered — features under a patch number was a semver mistake. Promoted to stable as `v1.3.0` on 2026-08-06.

### Added

- **Vault Activity block** — `vault-activity:` content slot with activity tracking scoped by `path`, `tags`, and `count`, plus a custom `label`
- **Activity tracking** — new `src/timeline.ts` persists a vault event log (created, modified, deleted, moved, renamed, opened, task, property, folder-created/deleted/renamed) with `time`, `path`, and `detail`
- **Timeline block** — `timeline:` content slot with `count`, `exclude`, `include`, `onlyMarkdown`, `excludeExt`, `types`, `group` (day/file), `relative` times, `showDate`, `showChips`, and `showMore`
- **Task Summary block** — `tasks:` content slot with `progress` bar, `showList` of unchecked tasks, `count`, `path`, and `tags` filters
- **Heatmap block** — `heatmap:` contribution-style activity calendar with `weeks` and `label`
- **Clock block** — `clock:` live clock widget with `timezone`, `showDate`, `showSeconds`, `format` (12h/24h), and `label`
- **File-type chart block** — `filetypes:` distribution chart with `max` and `label`
- **Stat metrics & scopes** — each stat counter now supports `metric` (`files`, `notes`, `size`, `tags`), `scope` (`all`, `today`, `week`, `month`, `year`), and `recursive` subfolder traversal, in both settings and `stats:` code blocks
- **New Note button** — quick-create date-stamped note (`YYYY-MM-DD.md`) from the stats bar with configurable `label`, `folder`, and optional `template` (`new-note`, `new-note-folder`, `new-note-template`, `new-note-label` keys)
- **`src/stats.ts`** — pure stat computation helpers (`normalizeStatItem`, `computeStatValue`, `windowStart`, `collectFileTags`, `statSummary`, `formatSize`, `dateStamp`) with a dedicated 26-test suite
- **Timeline rename recovery** — external renames now surface as `renamed`/`moved` instead of a spurious delete:
  - `pairDeleteCreateEvents` — collapses delete+create pairs within 5s (`TIMELINE_RENAME_PAIR_MS`) into one entry, direction-agnostic
  - `collectRenameEvents` — startup reconcile converts orphaned deletes into renames by matching mtimes (1000ms tolerance) against a primed `fileMtimes` cache
  - `ActivityEvent.mtime` — delete events capture the deleted file's mtime so a later create is recognized as a rename
- **Collapse all / expand all** buttons in the Components tab with persisted `collapseState` in settings
- **Quick Links MOC-style editor** — consistent add/edit/reorder UI matching the MOC card editor
- **Disabled slot feedback** — content-slot dropdown options in the Dashboard tab are greyed out (`.nexus-settings` `select.dropdown option:disabled`) when the corresponding component toggle is off, via `isSlotEnabled()`
- **Typecheck script** — `npm run typecheck` (`tsc --noEmit`) wired into `npm run build`; `skipLibCheck` enabled in `tsconfig.json`

### Fixed

- Row-expansion slider — expanding a saved row layout no longer miscalculates proportions
- `renderActiveTab` error guard — settings tab render is guarded against out-of-range tab state
- **Heatmap grid layout** — swapped day/week loop nesting so cells fill column-by-column instead of row-by-row
- **Heatmap month labels** — grouped consecutive weeks by month with `grid-column: span` for correct alignment; added gutter spacer column
- `saveAndRefresh()` in settings (was calling itself recursively)
- **Live `MODIFIED` events no longer wait for a restart** — the `modify` handler used `isStartupArtifact()` (`min(mtime, ctime)` vs plugin load time), so any file that existed before Obsidian started was treated as a startup indexing artifact and its live edits were silently dropped; `MODIFIED` entries only surfaced after a restart via the startup reconcile backfill. The handler now filters purely on `file.stat.mtime` (skips only mtime before plugin load), so edits — including external ones — appear in the timeline live

### Changed

- **Quicklinks** — card-style items (favicon, label, description) replaced with compact pills
- **Vault Activity** — folder path removed; shows only filename + relative time
- **Timeline** — tighter line-height/padding, removed min-width constraints
- **`mergeSettings()`** — centralized settings loader replacing the 170-line manual `loadSettings()` block; every new setting field is handled automatically
- **Stats settings UI** — stat entries rebuilt as a two-row form (label + metric + delete / folder + scope + subfolders), replacing the overflowing one-row layout and the anonymous recursive toggle with a labeled "Incl. subfolders / Direct only" dropdown; live `statSummary()` description; New Note button subgroup
- **Stats parser keys** — `stats:` blocks accept item entries (`- label` / `- path`) with `metric`, `scope`, `recursive` plus `new-note*` keys
- **Tabbed settings polish** — tab bar and content layout refinements

### Developer

- 4 `as any` casts removed — `App.internalPlugins` typed via module augmentation, `window.moment` replaced with Obsidian's typed `moment` export, `Vault.getName()` used directly
- `bookmarkBlock!` non-null assertion replaced with type-narrowed guard
- `no-console` warning addressed in settings render error guard
- `renderDividerPreview()` accepts optional `labelText` parameter
- Added `.github/workflows/ci.yml` — lint, typecheck, format check, and tests on every push/PR
- `npm run format:check` restored to green (prettier formatting drift fixed across all 14 source files)
- `src/obsidian-augment.d.ts` — `App.internalPlugins` module augmentation
- `primeFileMtimes()` + `reconcileStartupChanges()` — mtime cache and startup reconcile for changes while the plugin was unloaded
- **Tests: 62 → 125** — new `stats.test.ts` (26), `timeline.test.ts` expanded to 36, `parser.test.ts` 26, `defaults.test.ts` 31, `utils.test.ts` 6

## v1.2.1 (cycle folded into v1.3.0-beta.1, never released)

### Added

- **Column blocks** — new `column:` code block keyword for vertical stacking layout (replaces old `tabs:` and `stack:` systems)
- **Links block** — new `links:` code block keyword with `- url:` items for quick link grids
- **Stats block** — `stats:` as a renderable block inside `row:`/`column:` layouts
- **Search block** — `search:` as a renderable block inside layouts
- **Heading block** — `heading:` for layout slot headings with configurable text, color, align, size
- **Vault list block** — `vaultlist:` for folder-based file listings inside layouts
- **Section dividers** — `divider:` inside a section attaches it as the section's header divider
- **Per-slot divider labels** — divider content slots in row/column layouts now have a configurable label text input
- **Quick Links divider label** — customizable text for the Quick Links divider (default "Quick Links")
- **Row gap** — `gap:` property on `row:` blocks for custom column spacing
- **Column spacing** — `spacing:` property on `column:` blocks
- **Content slot system** — `RowLayoutEntry` and `ColumnLayoutEntry` use typed `slots` (stats, search, heading, moc-cards, quick-links, recently, vaultlist, divider, none)
- **Search bar** — `search:` code block keyword with vault-wide note search (debounced, keyboard-dismissible)
- **Row column drag** — draggable dividers between row columns to resize proportions in real-time
- **Saved row proportions** — drag-resized proportions persist per source file
- **Graph link injection** — injects paths into `metadataCache.resolvedLinks` instead of hidden wikilinks (cleaner Graph View integration)
- **Expanded icon set** — from 9 to 40 icons (31 new)
- **Searchable icon picker** in MOC card settings
- **Collapse/expand MOC cards** in settings — click heading to toggle
- Dev tooling — `.editorconfig`, `.eslintignore`, `.prettierrc`, `eslint.config.cjs`, `vitest.config.ts`, `src/__tests__/`
- **Shared utility helpers** — `safeParseInt`, `splitCsv`, `applyListConfigKV` in `utils.ts` replacing duplicated patterns
- **JSDoc documentation** — comprehensive doc comments across all source files (~80+ functions/interfaces)

### Fixed

- File rename handler now works for all file types — not just `.md`
- Label auto-updates when file basename changes
- Rename handler case-sensitivity: passes original case (not lowercased) to code block matching
- Label no longer gets `.md` appended during rename (cleaned `newBasename`)
- Multiple MOC paths fixed: Projects MOC (9 missing folder prefixes), Tracker Index MOC (typo), Journal MOC (3 wrong paths)
- `recently:` block form vs root boolean — `isRootRecentlyContext` now uses proper indent comparison
- Search bar event listener cleanup — `AbortController` prevents memory leaks on re-render
- Block render errors caught with `console.error` instead of crashing entire dashboard
- Settings import validates each field independently (mocs/stats validated separately)
- Safer `dataTransfer` handling in drag-and-drop
- Quick-links fallback using wrong column count (`columns: 3` → `columns: 1`)

### Changed

- **Replaced Tabs with Column** — `tabs:` block type removed (CSS specificity conflict with themes); replaced by `column:` for vertical stacking
- **Stacks renamed to Columns** — `stack:` keyword renamed to `column:` throughout
- **Code block paths** now require `.md` extension (parser auto-appends for backward compat)
- Card click validates path via `getAbstractFileByPath()` — shows Notice if file not found
- Settings migration auto-appends `.md` to existing extension-free paths on load
- **Types extracted** to `types.ts` — settings interfaces, defaults, and divider presets moved out of `settings.ts` into dedicated modules (`types.ts`, `defaults.ts`, `utils.ts`)
- `DashboardBlock` union type expanded — now includes `VaultListConfig`, `ColumnConfig`, `StatsBlockConfig`, `SearchBlockConfig`, `HeadingBlockConfig`
- `RowConfig.children` widened to `(SectionConfig | ColumnConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | VaultListConfig)[]`
- `SectionConfig.columns` widened from `1 | 2 | 3 | 4` to `number`
- Graph links CSS removed (no longer rendering hidden wikilinks)
- Row columns use `flex: 1 1 0` base with override only when custom proportion is set
- Row divider styling improved — transparent default, accent color on hover/drag
- `NexusSettings` expanded — new fields: `columnLayouts`, `vaultLists`, `showQuickLinksDivider`, `quickLinksDividerLabel`, `showHeader`, `showMocCards`, `showQuickLinks`
- **Deduplicated ~350 lines** across `parser.ts`, `renderer.ts`, `settings.ts`, `main.ts`
- Replaced 12 `parseInt + Number.isFinite` patterns with `safeParseInt`
- Replaced 9 `.split(",").map().filter()` patterns with `splitCsv`
- Replaced 3 identical `applyXxxKV` parser functions with shared `applyListConfigKV`
- Replaced 6 duplicated fallback block constructions with `renderSlotChildren()` loop
- Extracted `saveAndRefresh()` in settings (replaces 24 duplicate save+display pairs)
- Extracted `resetSearch()` closure in renderer (replaces 4 duplicate search reset blocks)
- Removed 8 non-null assertions (replaced with `??= {}` pattern)
- Fixed 3 `as unknown as` unsafe casts
- Removed 15+ unused CSS classes

---

## v1.2.0

> Early, minimal-stage release; v1.3.0 is the first release meeting the current feature and quality bar.

### Fixed

- Font selection now actually uses the chosen font (was always using default)
- Column count `1` now works; values outside 1–4 are rejected instead of silently defaulting
- `recentCount: 0` no longer ignored (nullish coalescing fix)
- ASCII block handles non-numeric `size` and invalid `align` gracefully
- Graph link injection uses async/await — no more race condition on file write
- Cards outside any section auto-wrap in an implicit section instead of disappearing
- Settings import validates that MOCs have `path` + `title` and stats have `folder` + `label`
- Settings load rejects corrupted persisted data (wrong types, missing fields)

### Improved

- Mini cards now show descriptions
- Mini-only sections use compact grid layout (10px gap instead of 14px)
- Standalone `divider:` blocks as root-level dashboard elements
- Removed dead CSS classes, dead parser branch, unused `layoutPreset` field

---

## v1.1.0

> Early, minimal-stage release; v1.3.0 is the first release meeting the current feature and quality bar.

Initial release.

- ASCII art banners via FIGlet (`ANSI Shadow` and `Small Slant`)
- Dashboard with stat cards, recently modified notes, graph link injection
- Code block driven: `nexus-dashboard` and `ascii` blocks
- Big and mini card types with color accents, icons, descriptions
- Standalone dividers with 5 style presets (default, bold, subtle, gradient, dashed)
- Drag-and-drop MOC card reorder in settings
- Export / import settings as JSON
- Open on startup option
