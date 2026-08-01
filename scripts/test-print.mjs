/**
 * Print-path test (P3): builds a receipt, sends it through the network
 * adapter (WebSocket bridge -> raw TCP), and verifies the bytes a mock
 * printer received. Run with the bridge + a mock printer listening on
 * 127.0.0.1:9100:
 *   node scripts/printer-bridge.mjs &
 *   node -e "require('net').createServer(s=>s.on('data',d=>require('fs').appendFileSync('mock-printer.bin',d))).listen(9100)"
 *   node --experimental-strip-types scripts/test-print.mjs
 */
import { readFileSync } from "node:fs";
import { buildReceipt } from "../src/lib/receipt.ts";
import { getPrinter } from "../src/lib/printer.ts";

const receipt = buildReceipt({
  storeName: "Dumala",
  storeAddress: "Main Branch",
  orderNo: "MB-D12345-260731-0007",
  cashier: "Owner",
  createdAt: new Date("2026-07-31T12:34:56"),
  items: [
    { name: "Whole Lechon", qty: 1, weightKg: null, lineTotal: 295000 },
    { name: "Lechon Per Kilo", qty: 1, weightKg: 1.35, lineTotal: 114750 },
  ],
  subtotal: 409750,
  discountAmount: 0,
  discountRef: null,
  vatableSale: 365848,
  vatAmount: 43902,
  vatExemptSale: 0,
  total: 409750,
  paymentMethod: "cash",
  paymentRef: null,
  amountTendered: 500000,
  changeDue: 90250,
  officialReceipt: false,
  paperWidth: 58,
});

const printer = await getPrinter({
  transport: "network",
  bridgeHost: "127.0.0.1",
  ip: "127.0.0.1",
  port: 9100,
  paperWidth: 58,
});

await printer.print(receipt);
console.log("print OK — bytes sent:", receipt.length);

const received = readFileSync("mock-printer.bin");
const text = received.toString("latin1");

const checks = [
  ["init ESC @", received[0] === 0x1b && received[1] === 0x40],
  ["cut GS V 66", received[received.length - 3] === 0x1d && received[received.length - 2] === 0x56 && received[received.length - 1] === 0x66],
  ["store name", text.includes("Dumala")],
  ["order no", text.includes("MB-D12345-260731-0007")],
  ["weight line", text.includes("1.35 kg")],
  ["subtotal", text.includes("4,097.50")],
  ["vat line", text.includes("VAT (12%)")],
  ["vat amount", text.includes("439.02")],
  ["tendered", text.includes("5,000.00")],
  ["change", text.includes("902.50")],
  ["not official", text.includes("THIS IS NOT AN OFFICIAL RECEIPT")],
  ["salamat", text.includes("Salamat po!")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failed++;
}
process.exit(failed === 0 ? 0 : 1);
