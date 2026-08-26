# Multi-Branch Performance & Management Page

**Status:** Draft for review
**Date:** 2026-08-26
**Scope:** Planning only. This document proposes the page, data contract, UX, and implementation sequence; it does not change the dashboard yet.

## 1. Recommendation

Add a new first-class **Branch Performance** page at:

```text
/admin/branches/performance
```

The existing Dashboard **Branch Performance** table remains as the compact at-a-glance component. Add a **Full report** link in that component’s header. The link opens the new page using the same global branch context already used by the admin shell:

- An organization admin viewing **All branches** sees the multi-branch comparison by default.
- An organization admin viewing one branch sees that branch’s detailed report and can switch back to comparison mode.
- A manager remains limited to the branch assigned to them.

Keep the responsibilities separate:

| Surface | Purpose |
| --- | --- |
| `/admin` | Fast daily overview and compact Branch Performance table |
| `/admin/branches` | Create, edit, activate, deactivate, and maintain branch records |
| `/admin/branches/performance` | Compare branches, understand trends, and monitor branch operating health |
| `/admin/reports` | Detailed sales ledger reporting by date, item, category, cashier, payment method, and export type |

This gives the user a dedicated multi-branch decision-making space without turning the existing branch CRUD page into an overloaded analytics page or duplicating the general Reports page.

## 2. Existing product context

The proposal should build on the current implementation rather than replace it.

- The Dashboard already computes reversal-aware branch totals and renders the Branch Performance table in [`src/app/admin/page.tsx`](../src/app/admin/page.tsx).
- The table already shows branch, total sales, order count, average order value, and sales share.
- The Dashboard already has consistent admin panel, KPI, table, trend, and empty-state styling.
- [`src/lib/admin/sales-reports.ts`](../src/lib/admin/sales-reports.ts) already exposes reversal-aware report totals, period rows, payment rows, item rows, category rows, cashier rows, branch rows, discount rows, and hourly cells.
- [`src/app/admin/reports/page.tsx`](../src/app/admin/reports/page.tsx) already demonstrates date filters, grouping, CSV export, a sales trend, payment breakdown, heatmap, and branch comparison.
- [`src/app/admin/branches/page.tsx`](../src/app/admin/branches/page.tsx) already owns branch setup and loads device and staff counts.
- The admin shell already persists branch selection through the branch switcher and restricts managers to their assigned branch.

## 3. Entry points and navigation

### Primary entry point

Add a `Full report` link to the existing Branch Performance panel header on the Dashboard. It should:

- use the existing `AdminLink` pattern;
- have an accessible name such as `Open full branch performance report`;
- preserve the active global branch context through the existing cookie-based branch switcher;
- point to `/admin/branches/performance` without inventing a second branch-selection mechanism.

### Secondary entry points

For discoverability, add:

1. A `View performance` action on the existing `/admin/branches` page.
2. A `Branch performance` item under the sidebar’s **Insights & finance** group.

The sidebar should treat `/admin/branches/performance` as its own active section, while `/admin/branches` remains the active section for branch setup. This makes it clear that branch configuration and branch analytics are related but different tasks.

## 4. Proposed page experience

### Header

Use the existing `AdminPageHeader` and admin page spacing. The page header should communicate the task immediately:

- Eyebrow: `Multi-branch intelligence`
- Title: `Branch performance`
- Supporting text: selected date range, branch scope, and a clear note that voided/refunded sales are excluded.
- Actions: `Manage branches`, `Export report`, and the existing account/sign-out controls.

Show a compact `Last updated` or `Data refreshed` label near the report controls. If any query is incomplete or row limits are reached, show the same warning treatment already used by Reports rather than presenting the figures as complete.

### Filters and comparison controls

The filter bar should be visible near the top of the page and remain understandable on mobile.

- Quick ranges: **7 days**, **30 days**, **90 days**.
- Custom `From` and `To` dates.
- Group by: **Day**, **Week**, or **Month**.
- Comparison toggle: compare with the previous equivalent period.
- Branch scope: controlled by the existing global branch switcher; do not add a conflicting page-local selector.
- Optional `Include inactive branches` toggle for historical reporting. Inactive branches should be labeled, not silently removed from historical results.
- `Reset` action.

All dates should follow the existing Asia/Singapore business-day behavior.

### KPI summary

The first content row should answer “How are the branches doing?” before the user reads a chart.

Recommended cards:

1. **Net sales** — completed, non-reversed order total in the selected scope.
2. **Sales change** — percentage change against the previous equivalent period, with `New` or `—` when a comparison is not meaningful.
3. **Orders** — completed order count.
4. **Average order value** — net sales divided by completed orders.
5. **Sales per active branch** — net sales divided by active branches in the selected scope.
6. **Top branch** — branch name and its sales share.
7. **Discounts and reversals** — amount and count requiring attention.

Do not label these figures as profit, margin, or return on investment. The current data model does not provide reliable cost-of-goods data, so those metrics should be a future feature rather than an inferred calculation.

### Core visual analytics

#### A. Multi-branch sales trend

Use a line or area chart for net sales over time.

- In All branches mode, show an organization total plus selectable branch series.
- In single-branch mode, show the selected branch against the previous period when comparison is enabled.
- Respect the selected day/week/month grouping.
- Provide a visible legend, hover/focus values, and a text summary for accessibility.
- Reuse the existing lightweight SVG/CSS chart approach unless a chart library becomes necessary for a later interaction requirement.

#### B. Sales share donut chart

Use a donut chart to answer “Which branches contribute the most?”

- One segment per branch for the top five branches.
- Combine the remaining branches into `Other` when necessary.
- Show amount and percentage in a visible legend beside or below the chart.
- Allow a segment or legend item to focus the corresponding branch row.
- Provide the same values in a semantic table/list so the report remains usable without relying on color or hover.

#### C. Branch comparison chart

Use a horizontal bar chart or grouped bars to compare the selected performance measure:

- net sales;
- order count; or
- average order value.

The default should be net sales. A compact metric switcher can change the measure without changing the report scope.

#### D. Payment mix by branch

Show cash, GCash, Maya, and card totals as a stacked bar or small-multiple bars. This helps identify operational differences between branches without requiring the user to open the general Reports page.

#### E. Operational health overview

Add a branch health matrix or cards with the operational signals already available in the application:

- active/inactive status;
- active POS terminals;
- staff count;
- low-stock item count;
- out-of-stock item count;
- latest closeout/Z-reading status when available;
- no-sales or stale-activity warning for the selected period.

The health state should be explainable. For example, use `Needs attention` when a branch has out-of-stock items or a device/data warning, and show the reason in the row rather than using an unexplained score.

### Branch comparison table

Place a sortable, filterable table below the charts as the authoritative comparison view. Recommended columns:

| Column | Purpose |
| --- | --- |
| Branch | Name, active/inactive label, and optional address |
| Net sales | Primary financial comparison |
| Change | Current period versus previous equivalent period |
| Orders | Completed order count |
| Average order | Average order value |
| Sales share | Contribution to selected scope |
| Discounts | Discount amount and rate |
| Reversals | Void/refund count and amount |
| Operations | Devices, staff, and stock alert summary |
| Actions | `View branch` and `Manage branch` links |

Required interactions:

- sort by sales, change, orders, average order, or alerts;
- search by branch name;
- open a branch-specific drilldown using the same page with a `branch` query or the existing branch context;
- open `/admin/branches?edit=...` for configuration;
- open the relevant existing Reports, Orders, Inventory, or Shifts page for deeper investigation.

On small screens, keep the table horizontally scrollable with the branch column visually prominent. If the table becomes too wide to scan, provide a responsive branch-card view rather than hiding critical fields.

### Selected branch drilldown

When a single branch is selected, add a detail area below the comparison view or replace the comparison chart with a branch detail layout. Include:

- branch profile and status summary;
- sales trend and period comparison;
- payment mix;
- category mix;
- top-selling items;
- peak sales hours/day heatmap;
- recent closeouts and cash variance indicators;
- low/out-of-stock summary;
- links to manage the branch, orders, inventory, and shifts.

This creates a practical workflow: compare branches, identify an outlier, open its detail, then jump to the operational page that can resolve the issue.

## 5. Data and business rules

Create a server-side report model for the new page, preferably in a focused module such as `src/lib/admin/branch-performance.ts`. It should reuse the existing report helpers instead of calculating a second definition of net sales in the page component.

### Metric definitions

- **Net sales:** completed orders with no reversal row, using the existing reversal-aware selection logic.
- **Orders:** count of those net orders.
- **Average order value:** net sales divided by net orders; show `—` when there are no orders.
- **Sales share:** branch net sales divided by total net sales in the selected scope.
- **Sales change:** current period minus previous equal-length period, divided by the previous period; show `New` when the prior period is zero and the current period is positive.
- **Discount rate:** discounts divided by gross sales; do not treat discounts as revenue.
- **Operational alerts:** counts derived from the existing devices, staff, inventory, and shift-report records. Do not invent a single health score until the component signals and thresholds are agreed.

### Query and scope rules

- Enforce organization and branch access on the server.
- Reuse `getSelectedAdminBranchId` and the existing manager branch restriction.
- Keep inactive branches available for historical rows, but exclude them from “active branch” denominators unless the user explicitly includes them.
- Use parallel queries for branch metadata, orders, order items, products/categories, devices, staff, inventory, and closeouts where appropriate.
- Preserve the current money representation and `formatPeso` formatting.
- Surface `queryWarning` and `truncated` states. Never present a row-limited report as complete.
- Keep the date and timezone behavior aligned with `/admin/reports`.

### Performance boundary

The current Reports implementation has bounded row limits. The first version can reuse that approach, but the new page should not fetch unbounded order or item data into the browser. If multi-branch data grows beyond the current limits, move the heavy aggregation into a server-side query/RPC or pre-aggregated read model before increasing row limits.

## 6. Export and deep links

Add an `Export report` action that preserves the active date range, grouping, branch scope, and comparison settings.

Recommended first release:

- CSV export for branch summary;
- CSV export for period trend;
- CSV export for payment mix;
- CSV export for operational alerts.

Reuse the existing export conventions where possible. A print/PDF version can follow after the screen layout is stable; it is not required for the first implementation.

Every chart/table should have a URL-representable state where practical, so a user can share or revisit a filtered report. At minimum, persist `from`, `to`, `grouping`, and `branch` in the URL while continuing to respect role restrictions.

## 7. Proposed implementation phases

### Phase 0 — Product decisions

- Approve the route and page name.
- Confirm whether the new page is analytics plus operational health, with branch CRUD remaining on `/admin/branches`.
- Confirm the default date range and whether inactive branches appear in historical views.
- Confirm that profit/margin is out of scope until cost data is available.

### Phase 1 — Route and entry points

- Add the new App Router page, loading state, and error state.
- Add the Dashboard `Full report` link.
- Add the `/admin/branches` `View performance` link.
- Add the sidebar item and active-section handling.
- Verify that admin, manager, and cashier access behaves consistently with existing admin routes.

### Phase 2 — Server report model

- Build the branch-performance report loader.
- Reuse reversal-aware sales selection and existing report row types where possible.
- Add previous-period aggregation for comparisons.
- Add device, staff, inventory-alert, and closeout summaries.
- Add query-warning, truncation, empty, and no-permission states.

### Phase 3 — Page UI and charts

- Build the filter bar and KPI cards.
- Build the trend chart, donut chart, comparison bars, payment mix, and health matrix.
- Build the sortable branch table and single-branch drilldown.
- Reuse current admin tokens, panel classes, table conventions, icons, and responsive behavior.
- Ensure chart values are also available in text/table form.

### Phase 4 — Export and verification

- Add CSV exports with the active filter state.
- Test reversal handling, zero-sales periods, inactive branches, missing devices, missing staff, missing inventory, and row-limit warnings.
- Verify manager scoping and admin All branches behavior.
- Run lint, typecheck, production build, and responsive/manual visual QA.

## 8. Acceptance criteria

- The existing Dashboard Branch Performance component remains visually and behaviorally intact except for the new `Full report` entry point.
- Clicking `Full report` opens the new branch performance page with the current global branch scope.
- An organization admin can compare active branches in one report.
- A manager cannot access data from another branch or switch to All branches.
- The page supports 7-day, 30-day, 90-day, and custom date ranges.
- The page supports day, week, and month grouping.
- Net sales, order count, average order value, sales share, discounts, and reversals reconcile with the existing Reports definitions.
- Void and refund rows do not inflate net sales.
- The page includes at least one trend chart, one branch-share donut chart, one comparison visualization, and one accessible comparison table.
- Chart values are understandable without hover, color, or a mouse.
- A branch row can lead to branch-specific detail and to the existing operational pages.
- Empty, loading, stale, query-warning, truncated, inactive, and no-access states are explicit.
- Exported files use the same date range and access scope shown on screen.
- No profit/margin claim is displayed without cost data.

## 9. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| New page duplicates `/admin/reports` | Keep this page branch-first and operational; link to Reports for transaction-level detail |
| Too many charts create visual noise | Make the branch table authoritative, keep one primary chart per question, and use progressive drilldown |
| Large date ranges exceed row limits | Show truncation clearly and move to server-side aggregation/read models when needed |
| Managers see organization-wide figures | Apply server-side branch scope before aggregation and test direct URL access |
| Donut/chart colors are inaccessible | Provide labels, percentages, values, focus states, and a semantic data table |
| “Health” becomes an unexplained score | Show the underlying device, staff, inventory, and closeout signals instead of a black-box score |
| Users mistake sales for profitability | Label the page around sales/operations and defer margin until costs are modeled |

## 10. Review decisions requested

1. Approve `/admin/branches/performance` as the route and **Branch performance** as the page name.
2. Confirm that the global branch switcher should remain the source of truth for branch scope.
3. Confirm whether operational health belongs in the first release or should be a follow-up after the sales comparison view.
4. Confirm whether CSV export is enough for the first release, with PDF/print deferred.
