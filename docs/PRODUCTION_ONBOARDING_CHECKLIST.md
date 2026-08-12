# Production onboarding and device checklist

Use one copy per branch and one device section per POS terminal. Mark a box only after the operator observes the result on the real device.

## 1. Owner and branch handoff

- [ ] Real organization name, branch name/address, tax/VAT settings, receipt header/footer, payment methods, and timezone confirmed.
- [ ] Real menu, category order, prices, units, SKUs/barcodes, stock policy, and opening inventory supplied and approved.
- [ ] Real employee names, Employee IDs, roles, branch assignments, and schedules supplied through the secure intake process.
- [ ] Staff PINs delivered through a private channel or set in Admin; no raw PIN is stored in Git, a spreadsheet, or a chat transcript.
- [ ] Admin account uses a unique password and MFA where available; cashier accounts are not shared.
- [ ] Backup posture and restore owner confirmed; Vercel log access and alert recipients confirmed.

## 2. Tablet and browser setup

- [ ] Tablet OS updates, date/time, locale, screen timeout, brightness, and charging position configured.
- [ ] Tablet is on the branch Wi-Fi/LAN; internet access to `https://dumala.store` works.
- [ ] Chrome/approved browser is updated; browser zoom is 100%; no stale QA tabs or saved QA credentials remain.
- [ ] Open `https://dumala.store/setup`, sign in as the authorized admin, select the correct branch, and name the terminal.
- [ ] Device binding persists after a browser restart and the terminal appears in Admin device settings.
- [ ] Open `/pos` once online so the real profile and menu cache are created.
- [ ] Install the PWA from the browser prompt/Add to Home Screen, launch the installed app, and confirm the install control is hidden in standalone mode.
- [ ] Confirm the compact install control has an accessible close action and does not cover the cart or charge controls.

## 3. Printer and display

- [ ] Printer is powered, paper is loaded, and the real LAN IP/port is recorded in the restricted branch copy.
- [ ] Configure the reachable printer target; do not leave the production terminal on loopback `127.0.0.1`.
- [ ] Print a test slip and inspect paper width, alignment, store details, totals, tax, payment, change, and footer.
- [ ] Open a customer display pairing, load the URL on the display device, and confirm pairing is branch-scoped.
- [ ] Add an item, per-kg item, discount, payment/change, thank-you, and idle state; confirm the display follows the POS without blocking checkout.
- [ ] Disconnect the display and confirm the POS sale still completes.

## 4. Operational acceptance

- [ ] Online cash sale completed with a real menu item; order number and receipt match.
- [ ] E-wallet/card path is tested only when the payment account is enabled; no live payment is used for a test without owner approval.
- [ ] Shift opens with the correct opening float; X-reading prints; shift closes; Z-reading prints and seals.
- [ ] Admin Reports for the test business date show `Balanced` and include the observed order.
- [ ] Printer-unavailable behavior is understood: the sale remains recorded and the receipt can be retried/reprinted.
- [ ] Go offline after the catalog is cached; complete the pilot offline-sale drill; reconnect and verify exactly-once sync.
- [ ] Confirm pending count returns to zero before signing out or clearing browser data.
- [ ] Sign out and sign in as a cashier; verify the cashier sees only the assigned branch and menu.
- [ ] Verify the real employee can change their initial password and that the disposable QA accounts are inactive.

## 5. Handoff record

| Item | Value / initials | Done |
|---|---|---|
| Branch | | [ ] |
| Terminal name / device ID | | [ ] |
| Printer model / IP / port | | [ ] |
| Customer display device | | [ ] |
| PWA standalone launch | | [ ] |
| Online sale + receipt | | [ ] |
| Offline drill + reconnect | | [ ] |
| X/Z readings | | [ ] |
| Reports reconciliation | | [ ] |
| Owner sign-off | | [ ] |

### Recovery note

If a device is lost or replaced, revoke its active device binding, change any compromised employee credentials, and re-run setup on the replacement tablet. Do not delete the server order ledger to clean up a device.
