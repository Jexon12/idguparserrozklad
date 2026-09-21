# Reliability and usability changes — 2026-09-21

Implemented locally:

- Protected monitor, audit and version diagnostics with the existing administrator password. The staff portal keeps the password in memory only and clears diagnostic data on logout.
- Restricted cross-origin write and diagnostic requests. Set `ALLOWED_ORIGINS` to a comma-separated list of explicitly trusted origins only if cross-origin access is required. Production requires a strong `ADMIN_PASSWORD`; this is still shared-password authentication, not individual accounts.
- Independent note identities for subjects sharing a time slot, with fallback reads for old notes. Legacy notes are retained because their original keys cannot distinguish overlapping subjects.
- Bounded history cache, per-entity failure states, retry, manual-number indication and reset to calculated numbering. History is derived from the available schedule, not a permanent archive of lessons actually held.
- JSON export/import of notes, favorites, aliases, numbering and selected preferences. Import validates the document, merges personal records, asks for confirmation and reloads the application. Passwords and diagnostic logs are excluded.
- One source of state for Minimum/Details, selected group variant details, checked-at labels, and less frequent background timer work.
- Native shared dialogs, locally bundled Vue, content-hashed resource URLs and an explicit update prompt on the main schedule page.
- Service-worker cache isolation, query-aware offline navigation and quota-error handling. Offline access does not guarantee that uncached API schedule data is available.

## Build and checks

Run `npm ci`, then `npm run build` before publishing. The build generates Tailwind CSS, copies the pinned Vue runtime and updates HTML/service-worker asset versions. Commit generated asset changes with their source changes when deploying directly from the repository.

Run `npx jest --runInBand --silent` for API, domain, template and service-worker regression checks.

Browser scenarios are defined in `tests/browser/schedule.e2e.cjs` for phone, dark phone, tablet and desktop. Run `npm run test:browser` in an environment with Playwright browsers installed. Listing tests is not equivalent to running them. Browser execution and visual review were blocked by the desktop browser connection error during this change.

## Still open

- Choose and implement individual staff accounts and permissions; use distributed rate limits for a multi-instance deployment.
- Introduce persistent historical snapshots if the product needs actual change history rather than reconstruction from current upstream data.
- Complete browser verification of layouts, zoom, keyboard focus, import/export and service-worker updates before production publication.
- Continue incremental decomposition of the large app/API modules; this change does not replace their architecture wholesale.
- Resolve the two remaining moderate npm audit findings in the ExcelJS/uuid chain without an unverified breaking downgrade.

No production deployment is included in this change.
