# POS accessibility and tablet regression checklist

This checklist covers the counter-sized landscape layouts that are easy to
regress when the POS catalog, order panel, dialogs, and offline indicators are
changed.

## Viewports

- [ ] 1024 × 768 landscape: catalog and order panel remain usable without
  horizontal page scrolling.
- [ ] 1280 × 800 landscape: account menu, system-health panel, and order panel
  do not cover the navigation or each other.
- [ ] 768 × 1024 portrait fallback: the order panel remains reachable after
  scrolling the catalog.
- [ ] Browser zoom at 125%: no dialog action becomes unreachable.

## Touch and keyboard

- [ ] With a coarse pointer, product cards, order actions, stepper controls,
  health-panel controls, and modal actions have at least a 44 px target.
- [ ] Tab moves through the active dialog only; Shift+Tab wraps to the last
  control.
- [ ] Escape closes the active dropdown/dialog and returns focus to its trigger.
- [ ] Clicking the backdrop closes a dialog; clicking dialog content does not.
- [ ] Account dropdown and health panel remain inside the viewport at the
  right edge.
- [ ] Focus indicators remain visible against every configured POS palette.

## Loading, offline, and recovery

- [ ] Catalog loading state is announced or visually obvious and does not show
  stale action controls as available.
- [ ] Offline state shows the local-first status without disabling approved sale
  entry.
- [ ] Health panel shows pending sync count, oldest queued sale, failed prints,
  customer-display status, and terminal status.
- [ ] Reconnecting starts background sync and leaves the sale screen usable.
- [ ] A failed print exposes retry without duplicating the order.

## Dialog and payment flows

- [ ] Weight, discount, charge, printer, customer-display, and shift dialogs
  all use the shared portal overlay and have an accessible name.
- [ ] Cash underpayment cannot be confirmed; valid cash shows centavo-accurate
  change.
- [ ] Card and wallet references are validated before the sale is queued.
- [ ] Closing or cancelling a dialog restores focus and does not change cart
  contents.

The source-level checks live in `scripts/pos-accessibility.test.ts`. Run the
manual checklist on a real touch device or browser device emulation before a
release that changes POS layout or overlay behavior.
