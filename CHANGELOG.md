# Changelog

## 2026-04-09

### Added
- Mobile-first UI in `index2.html`.
- Manual UI switchers:
  - Desktop -> Mobile: `/index2.html?mobile=1`
  - Mobile -> Desktop: `/index.html?desktop=1`
- Favorites share link import/export (`#favset=...`).
- Schedule change history modal.
- Smart notifications (15/5 min reminders + change digest).
- Conflict detection and workload analytics (desktop UI block).
- Quick action: free rooms now.
- Local data cleanup action (`Clear data`) in settings and mobile quick actions.

### Changed
- Tailwind moved from CDN to local CLI build:
  - Added `tailwind.config.js`
  - Added `css/tailwind.input.css`
  - Generated `css/tailwind.generated.css`
  - Added npm scripts: `build:css`, `watch:css`
- `index2.html` simplified for mobile performance:
  - Removed heavy conflict block from mobile screen.
  - Kept core schedule/occupancy/favorites flows.
- Occupancy scan reliability improved with direct `occupancy.js` inclusion in HTML.
- Calendar button fallback: if next lesson is missing, exports iCal instead of failing.
- Group names shown in mobile lesson cards (`Discipline (Group)`).

### Fixed
- Multiple cache/version mismatch crashes with safe template fallbacks.
- `ReportModule is not defined` stale-cache compatibility.
- `scheduleChangeLog/conflictSlots/mobileWidgetData undefined` render crashes.
- Duplicate lessons in grouped rendering (dedupe by signature).
- Incorrect today/tomorrow counts due to date normalization issues.
- CSS selector warnings from custom scrollbar rules.
