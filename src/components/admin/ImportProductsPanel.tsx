"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { importProducts } from "@/app/admin/catalog/actions";
import { MAX_IMPORT_TEXT_BYTES, PRODUCT_IMPORT_HEADERS, encodeCsvRow, isNonEmptyImportRow, normalizeImportHeader, normalizeImportText, parseDelimitedText } from "@/lib/catalog-import-format";

type BranchRecord = { id: string; name: string; is_active: boolean };
type ImportFeedback = { tone: "error" | "success" | "info"; message: string };

const CSV_TEMPLATE = `${encodeCsvRow(PRODUCT_IMPORT_HEADERS)}\n`;
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const REQUIRED_IMPORT_HEADERS = ["name", "price", "unit"] as const;
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx"]);
const TEXT_EXTENSIONS = new Set(["csv", "tsv", "txt"]);

function getFileExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function isSpreadsheetFile(file: File, extension: string) {
  return SPREADSHEET_EXTENSIONS.has(extension) || file.type === "application/vnd.ms-excel" || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function isTextFile(file: File, extension: string) {
  return TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/") || file.type === "application/csv";
}

function readRequiredHeaders(text: string) {
  const rows = parseDelimitedText(text).filter(isNonEmptyImportRow);
  const headers = (rows[0] ?? []).map(normalizeImportHeader);
  return {
    rowCount: Math.max(rows.length - 1, 0),
    missing: REQUIRED_IMPORT_HEADERS.filter((header) => !headers.includes(header)),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "The selected file could not be read.";
}

function ImportSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="products-primary-button products-form-submit">{pending ? "Importing..." : "Import products"}</button>;
}

export function ImportProductsPanel({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  const [csv, setCsv] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);

  const setEditorText = (value: string) => {
    setCsv(value);
    setFeedback(null);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    setFeedback(null);

    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        throw new Error("Choose a file smaller than 10 MB. Split larger catalogs into separate imports.");
      }

      const extension = getFileExtension(file.name);
      let sourceText = "";

      if (isSpreadsheetFile(file, extension)) {
        const spreadsheet = await import("@e965/xlsx");
        const workbook = spreadsheet.read(await file.arrayBuffer(), { type: "array", cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error("The spreadsheet does not contain a worksheet.");

        const worksheet = workbook.Sheets[firstSheetName];
        if (!worksheet) throw new Error("The first worksheet could not be read.");
        sourceText = spreadsheet.utils.sheet_to_csv(worksheet, { blankrows: false });
      } else if (isTextFile(file, extension)) {
        sourceText = await file.text();
      } else {
        throw new Error("Use a .csv, .txt, .tsv, .xls, or .xlsx file.");
      }

      const normalizedText = normalizeImportText(sourceText);
      if (new TextEncoder().encode(normalizedText).byteLength > MAX_IMPORT_TEXT_BYTES) {
        throw new Error("The converted data is too large for one import. Split the catalog into smaller files.");
      }
      const { rowCount, missing } = readRequiredHeaders(normalizedText);
      if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
      if (rowCount === 0) throw new Error("Add at least one product row to the file before loading it.");

      setCsv(normalizedText);
      setFeedback({ tone: "success", message: `Loaded ${rowCount} product ${rowCount === 1 ? "row" : "rows"} from ${file.name}. Review the text before importing.` });
    } catch (error) {
      setFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setIsReadingFile(false);
      input.value = "";
    }
  };

  const handleCopyTemplate = async () => {
    setCsv(CSV_TEMPLATE);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(CSV_TEMPLATE);
      setFeedback({ tone: "success", message: "The template was copied and placed in the editor. Add one product per row, then import." });
    } catch {
      setFeedback({ tone: "info", message: "The template was placed in the editor. Add one product per row, then import." });
    }
  };

  const handleDownloadCsvTemplate = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "products-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcelTemplate = async () => {
    setIsCreatingTemplate(true);
    setFeedback(null);
    try {
      const spreadsheet = await import("@e965/xlsx");
      const workbook = spreadsheet.utils.book_new();
      const productsSheet = spreadsheet.utils.aoa_to_sheet([Array.from(PRODUCT_IMPORT_HEADERS)]);
      productsSheet["!cols"] = PRODUCT_IMPORT_HEADERS.map((header) => ({ wch: Math.max(12, header.length + 2) }));
      spreadsheet.utils.book_append_sheet(workbook, productsSheet, "Products");

      const instructionsSheet = spreadsheet.utils.aoa_to_sheet([
        ["Products import template"],
        ["Fill the Products sheet and keep the first row as the column header."],
        ["Required columns", "name, price, unit"],
        ["Optional columns", "sku, barcode, category, supplier, cost_price, min_stock, pricing_mode, inventory_mode, track_stock, is_active, sort_order, store_id, image_url"],
        ["Notes", "Use one product per row. Leave optional fields blank when they do not apply. Recipe products need the product editor."],
      ]);
      instructionsSheet["!cols"] = [{ wch: 22 }, { wch: 100 }];
      spreadsheet.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");
      spreadsheet.writeFile(workbook, "products-import-template.xlsx");
      setFeedback({ tone: "success", message: "The Excel template was downloaded. Fill the Products sheet, then upload it here." });
    } catch (error) {
      setFeedback({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (new TextEncoder().encode(csv).byteLength > MAX_IMPORT_TEXT_BYTES) {
      event.preventDefault();
      setFeedback({ tone: "error", message: "This import is too large for one submission. Split the catalog into smaller files." });
      return;
    }

    const rows = parseDelimitedText(csv).filter(isNonEmptyImportRow);
    const headers = (rows[0] ?? []).map(normalizeImportHeader);
    const missing = REQUIRED_IMPORT_HEADERS.filter((header) => !headers.includes(header));

    if (rows.length < 2) {
      event.preventDefault();
      setFeedback({ tone: "error", message: "Add a header row and at least one product row before importing." });
      return;
    }
    if (missing.length > 0) {
      event.preventDefault();
      setFeedback({ tone: "error", message: `Missing required columns: ${missing.join(", ")}.` });
      return;
    }

    setFeedback(null);
  };

  return <section id="import-items" className="products-action-panel" aria-labelledby="import-items-heading">
    <div className="products-action-panel__header">
      <div>
        <p className="products-action-panel__eyebrow">Bulk catalog action</p>
        <h2 id="import-items-heading">Import products</h2>
        <p>Upload CSV, TXT, or Excel data, or paste a template below. Required columns are name, price, and unit; optional fields can be filled in later.</p>
      </div>
      <a href="/products" className="products-icon-button" aria-label="Close import form">×</a>
    </div>

    <form action={importProducts} className="products-import-form" onSubmit={handleSubmit}>
      <label htmlFor="import-store" className="products-form-field products-import-form__branch">
        <span>Default branch</span>
        <select id="import-store" name="store_id" defaultValue={defaultBranch} required disabled={!canWrite || branches.length === 0} className="inventory-input">
          <option value="">Choose branch</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>

      <div className="products-form-field products-import-form__csv">
        <div className="products-import-form__csv-heading">
          <label htmlFor="import-csv" className="products-import-form__csv-label">CSV, TXT, or Excel data</label>
          <div className="products-import-form__source-actions">
            <label className="products-secondary-button products-import-form__file-button">
              Upload file
              <input type="file" accept=".csv,.txt,.tsv,.xls,.xlsx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={!canWrite || isReadingFile} className="products-import-form__file-input" />
            </label>
            <button type="button" onClick={handleCopyTemplate} disabled={!canWrite || isReadingFile} className="products-secondary-button">Copy template</button>
            <button type="button" onClick={handleDownloadCsvTemplate} disabled={!canWrite || isReadingFile} className="products-secondary-button">CSV template</button>
            <button type="button" onClick={handleDownloadExcelTemplate} disabled={!canWrite || isReadingFile || isCreatingTemplate} className="products-secondary-button">{isCreatingTemplate ? "Preparing..." : "Excel template"}</button>
          </div>
        </div>
        <textarea id="import-csv" name="csv" rows={8} value={csv} onChange={(event) => setEditorText(event.target.value)} disabled={!canWrite} placeholder={`${encodeCsvRow(PRODUCT_IMPORT_HEADERS)}\nWhole Lechon (Medium),6500,kg,LECHON-MED-001,Lechon,Rico's Farm,5400,5`} aria-describedby="import-csv-help" className="inventory-input min-h-40 resize-y font-mono text-[11px]" />
        <p id="import-csv-help" className="products-import-form__hint">The first worksheet is imported from Excel. Tabs, commas, semicolons, and pipe-delimited text are accepted; review the converted rows before saving.</p>
        {isReadingFile && <p className="products-import-form__status" role="status" aria-live="polite">Reading file...</p>}
        {feedback && <p className={`products-import-form__status is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
      </div>

      <ImportSubmitButton disabled={!canWrite || branches.length === 0 || isReadingFile || !csv.trim()} />
    </form>
  </section>;
}
