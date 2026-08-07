"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { buildReceipt } from "@/lib/receipt";
import { DEFAULT_SETTINGS, getPrinter, savePrinterSettings, type PrinterSettings } from "@/lib/printer";
import { PAPER_WIDTH_OPTIONS } from "@/lib/paper-width";
import { POS_DEVICE_BINDING_KEY, type PosDeviceBinding } from "@/lib/device-binding";
import { onboardTablet, type SetupState } from "./actions";

type BranchOption = { id: string; name: string; address: string | null };

const INITIAL_STATE: SetupState = { ok: false, message: "" };

export function SetupWizard({ branches }: { branches: BranchOption[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(onboardTablet, INITIAL_STATE);
  const [step, setStep] = useState<1 | 2>(1);
  const [storeId, setStoreId] = useState(branches[0]?.id ?? "");
  const [name, setName] = useState("Counter 1");
  const [devicePrefix, setDevicePrefix] = useState("T1");
  const [printer, setPrinter] = useState<PrinterSettings>({ ...DEFAULT_SETTINGS });
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    if (!state.ok || !state.deviceId || !state.storeId || !state.devicePrefix) return;
    const binding: PosDeviceBinding = {
      deviceId: state.deviceId,
      storeId: state.storeId,
      devicePrefix: state.devicePrefix,
      boundAt: new Date().toISOString(),
    };
    localStorage.setItem(POS_DEVICE_BINDING_KEY, JSON.stringify(binding));
    savePrinterSettings(printer);
    router.replace("/pos?setup=1");
  }, [printer, router, state]);

  async function testPrint() {
    setTesting(true);
    setTestMessage("");
    try {
      const adapter = await getPrinter(printer);
      await adapter.print(buildReceipt({
        storeName: branches.find((branch) => branch.id === storeId)?.name ?? "POS branch",
        orderNo: "SETUP-TEST",
        cashier: "",
        createdAt: new Date(),
        items: [{ name: "Tablet setup test", qty: 1, weightKg: null, lineTotal: 100 }],
        subtotal: 100,
        discountAmount: 0,
        vatableSale: 89,
        vatAmount: 11,
        vatExemptSale: 0,
        total: 100,
        paymentMethod: "cash",
        amountTendered: 100,
        changeDue: 0,
        paperWidth: printer.paperWidth,
      }));
      setTestMessage("Test slip sent successfully.");
    } catch (error: unknown) {
      setTestMessage(error instanceof Error ? error.message : "The test slip could not be sent.");
    } finally {
      setTesting(false);
    }
  }

  const selectedBranch = branches.find((branch) => branch.id === storeId);

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="settings" size={20} /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">P4 tablet onboarding</p><h1 className="text-lg font-extrabold text-primary">Set up this counter</h1></div></div>
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary">Back to admin</Link>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <StepCard number="1" title="Bind branch" detail="Choose where this tablet sells." active={step === 1} done={step === 2} />
          <StepCard number="2" title="Configure printer" detail="Save the counter prefix and printer." active={step === 2} done={state.ok} />
        </div>

        <form action={formAction} className="mt-5 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7">
          <input type="hidden" name="store_id" value={storeId} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="device_prefix" value={devicePrefix} />
          <input type="hidden" name="printer_transport" value={printer.transport} />
          <input type="hidden" name="paper_width" value={String(printer.paperWidth)} />
          <input type="hidden" name="ip" value={printer.ip} />
          <input type="hidden" name="port" value={String(printer.port)} />
          <input type="hidden" name="bridge_host" value={printer.bridgeHost} />
          <input type="hidden" name="bridge_port" value={String(printer.bridgePort)} />

          {step === 1 ? <section aria-labelledby="setup-branch-heading"><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-accent">Step 1</p><h2 id="setup-branch-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">Which branch is this tablet for?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">The branch binding stays on this device. Cashiers using this tablet will sell into the selected branch.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{branches.map((branch) => <label key={branch.id} className={`cursor-pointer rounded-card border p-4 transition ${storeId === branch.id ? "border-primary bg-primary-soft" : "border-line bg-surface-raised hover:border-primary/40"}`}><input type="radio" name="branch_choice" value={branch.id} checked={storeId === branch.id} onChange={() => setStoreId(branch.id)} className="sr-only" /><span className="flex items-start justify-between gap-3"><span><strong className="block text-sm font-extrabold">{branch.name}</strong><small className="mt-1 block text-xs text-ink-muted">{branch.address || "No address saved"}</small></span><span className={`mt-0.5 grid h-5 w-5 place-items-center rounded-full border ${storeId === branch.id ? "border-primary bg-primary text-primary-fg" : "border-line-strong"}`}>{storeId === branch.id ? <AdminIcon name="check" size={13} /> : null}</span></span></label>)}</div><button type="button" onClick={() => setStep(2)} disabled={!storeId} className="mt-6 rounded-btn bg-primary px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg disabled:cursor-not-allowed disabled:opacity-50">Continue to printer</button></section> : <section aria-labelledby="setup-printer-heading"><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-accent">Step 2 · {selectedBranch?.name ?? "Selected branch"}</p><h2 id="setup-printer-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">Name the counter and connect its printer</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">These settings belong to this physical tablet. You can fine-tune them later under Admin → POS → Hardware.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block"><span className="setup-field-label">Tablet name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required className="inventory-input" /></label><label className="block"><span className="setup-field-label">Order prefix</span><input value={devicePrefix} onChange={(event) => setDevicePrefix(event.target.value.toUpperCase())} maxLength={12} required className="inventory-input" /><small className="mt-1 block text-[11px] text-ink-muted">Use a unique prefix such as T1 or COUNTER-A.</small></label></div><div className="mt-5 rounded-card border border-line bg-surface-raised p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Printer</p><h3 className="mt-1 text-lg font-extrabold">{printer.transport === "network" ? "Network printer" : printer.transport === "bluetooth" ? "Bluetooth printer" : "USB printer"}</h3></div><select value={printer.transport} onChange={(event) => setPrinter((current) => ({ ...current, transport: event.target.value as PrinterSettings["transport"] }))} className="inventory-input w-auto"><option value="network">Network / LAN</option><option value="bluetooth">Bluetooth / BLE</option><option value="usb">USB / WebUSB</option></select></div>{printer.transport === "network" && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block"><span className="setup-field-label">Printer IP</span><input value={printer.ip} onChange={(event) => setPrinter((current) => ({ ...current, ip: event.target.value }))} placeholder="192.168.1.50" className="inventory-input" /></label><label className="block"><span className="setup-field-label">Printer port</span><input type="number" min={1} max={65535} value={printer.port} onChange={(event) => setPrinter((current) => ({ ...current, port: Number(event.target.value) || 9100 }))} className="inventory-input" /></label><label className="block"><span className="setup-field-label">Bridge host</span><input value={printer.bridgeHost} onChange={(event) => setPrinter((current) => ({ ...current, bridgeHost: event.target.value }))} className="inventory-input" /></label><label className="block"><span className="setup-field-label">Bridge port</span><input type="number" min={1} max={65535} value={printer.bridgePort} onChange={(event) => setPrinter((current) => ({ ...current, bridgePort: Number(event.target.value) || 8787 }))} className="inventory-input" /></label></div>}<div className="mt-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><span className="setup-field-label">Paper roll width</span><p className="mt-1 text-xs text-ink-muted">Match the roll installed in this printer.</p></div><button type="button" onClick={() => void testPrint()} disabled={testing} className="rounded-btn border border-primary/30 px-4 py-2 text-xs font-extrabold text-primary disabled:opacity-50">{testing ? "Testing…" : "Print test slip"}</button></div><div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Paper roll width">{PAPER_WIDTH_OPTIONS.map(({ value, label, description, columns }) => <button key={value} type="button" aria-pressed={printer.paperWidth === value} onClick={() => setPrinter((current) => ({ ...current, paperWidth: value }))} className={`rounded-btn flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${printer.paperWidth === value ? "bg-primary text-primary-fg" : "bg-secondary text-primary"}`}><span>{label}</span><span className={`text-[10px] font-semibold ${printer.paperWidth === value ? "text-primary-fg/75" : "text-ink-muted"}`}>{description} · {columns} chars</span></button>)}</div></div>{testMessage && <p role="status" className="mt-3 text-xs font-semibold text-ink-muted">{testMessage}</p>}</div>{state.message && <p role={state.ok ? "status" : "alert"} className={`mt-4 rounded-btn px-3 py-3 text-sm font-semibold ${state.ok ? "bg-success/10 text-success" : "bg-danger-soft text-danger"}`}>{state.message}</p>}<div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={() => setStep(1)} className="rounded-btn bg-secondary px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-primary">Back</button><button type="submit" disabled={pending || !storeId || !name.trim() || !devicePrefix.trim()} className="rounded-btn bg-primary px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Binding tablet…" : "Finish setup"}</button></div></section>}
        </form>
      </div>
    </main>
  );
}

function StepCard({ number, title, detail, active, done }: { number: string; title: string; detail: string; active: boolean; done: boolean }) {
  return <div className={`rounded-card border p-4 ${active ? "border-primary bg-primary text-primary-fg" : done ? "border-success/30 bg-success/10" : "border-line bg-surface"}`}><div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${active ? "bg-primary-fg text-primary" : done ? "bg-success text-white" : "bg-secondary text-primary"}`}>{done && !active ? <AdminIcon name="check" size={15} /> : number}</span><span><strong className="block text-sm font-extrabold">{title}</strong><small className={`mt-0.5 block text-xs ${active ? "text-primary-fg/75" : "text-ink-muted"}`}>{detail}</small></span></div></div>;
}
