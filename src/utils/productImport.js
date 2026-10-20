// ── Product Master import: one path for CSV and Excel ─────────────────────────
//
// CEO 2026-10-20: no mandatory columns. Any file is accepted; every field that
// has data is imported. The flow is
//   parseProductSheet → autoMapColumns (the user can change it) →
//   buildImportPlan (the dry run, nothing written) → executeImportPlan.
//
// Rules that protect existing data:
//   - Blanks never wipe. An update writes only the fields that have a value in
//     the file AND differ from what is stored.
//   - Defaults (UoM "PC", Active) apply only to NEW products.
//   - Existing products are updated by id, never upserted on (company, code),
//     and nothing is ever deleted — deal lines reference products by id.
//
// This module has no Supabase import: the caller passes the client in, so the
// whole flow can be exercised in memory.

import * as XLSX from "xlsx";

// Product columns the app reads (DealModal, Product Master, groups settings):
// material, description, material_group, material_subgroup,
// base_unit_of_measure, the price columns and is_active. Nothing reads
// products.product_group or item_code / item_description.
export const PRODUCT_FIELDS = [
  { key: "material",             label: "Code",            type: "text" },
  { key: "description",          label: "Description",     type: "text" },
  { key: "material_group",       label: "Group",           type: "group" },
  { key: "material_subgroup",    label: "Sub Group",       type: "text" },
  { key: "base_unit_of_measure", label: "Unit of Measure", type: "uom" },
  { key: "unit_price",           label: "Unit Price",      type: "number" },
  { key: "cost_price",           label: "Cost Price",      type: "number" },
  { key: "price_per_ton",        label: "Price Per Ton",   type: "number" },
  { key: "price_per_pc",         label: "Price Per PC",    type: "number" },
  { key: "price_per_meter",      label: "Price Per Meter", type: "number" },
  { key: "is_active",            label: "Active",          type: "bool" },
];

const FIELD_BY_KEY = Object.fromEntries(PRODUCT_FIELDS.map((f) => [f.key, f]));
export const fieldLabel = (key) => FIELD_BY_KEY[key]?.label || key;

// Heading synonyms. Matching ignores case, spacing, punctuation, "*" and
// anything in brackets, so "Unit Price (SAR)", "unit_price" and "UNIT PRICE *"
// all match "Unit Price".
export const HEADER_SYNONYMS = {
  material:             ["Material", "Item Code", "SAP Code", "Material Number", "Product Code", "Code", "Material Code"],
  description:          ["Material description", "Item Description", "Description", "Product Name", "Desc"],
  material_group:       ["Material Group", "Product Group", "Group"],
  material_subgroup:    ["Sub Group", "Material Subgroup", "Product Sub Group"],
  base_unit_of_measure: ["Unit of Measure", "Base Unit of Measure", "UoM", "Unit", "Base UoM"],
  unit_price:           ["Unit Price", "Price", "Default Price", "Amount"],
  cost_price:           ["Cost Price", "Cost"],
  price_per_ton:        ["Price Per Ton", "Price Per Tonne"],
  price_per_pc:         ["Price Per PC", "Price Per Piece"],
  price_per_meter:      ["Price Per Meter", "Price Per Metre"],
  is_active:            ["Is Active", "Active", "Status"],
};

export function normalizeHeader(h) {
  return String(h ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const SYNONYM_INDEX = (() => {
  const m = new Map();
  for (const [key, names] of Object.entries(HEADER_SYNONYMS)) {
    for (const n of names) m.set(normalizeHeader(n), key);
  }
  return m;
})();

export function matchHeader(h) {
  return SYNONYM_INDEX.get(normalizeHeader(h)) || null;
}

// mapping[i] = field key or null (ignore). When two columns match the same
// field, the first keeps it and the second is ignored.
export function autoMapColumns(headers) {
  const used = new Set();
  return headers.map((h) => {
    const key = matchHeader(h);
    if (!key || used.has(key)) return null;
    used.add(key);
    return key;
  });
}

// ── Parsing ──────────────────────────────────────────────────────────────────

// Read the first sheet into { headers, rows: [{ rowNum, cells }] }. rowNum is
// the row number the user sees in Excel. CSV is read as text with raw: true so
// codes keep their leading zeros and nothing is reinterpreted.
export function parseProductSheet(data, kind) {
  const wb = kind === "csv"
    ? XLSX.read(data, { type: "string", raw: true })
    : XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return { headers: [], rows: [] };
  const start = XLSX.utils.decode_range(ws["!ref"]).s.r;
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true });
  if (aoa.length === 0) return { headers: [], rows: [] };

  const width = aoa.reduce((w, r) => Math.max(w, r.length), 0);
  const headers = Array.from({ length: width }, (_, i) => {
    const h = String(aoa[0][i] ?? "").trim();
    return h || `Column ${XLSX.utils.encode_col(i)}`;
  });
  const rows = aoa.slice(1).map((r, i) => ({
    rowNum: start + i + 2,
    cells: Array.from({ length: width }, (_, c) => String(r[c] ?? "").trim()),
  }));
  return { headers, rows };
}

export function readProductFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    return Promise.reject(new Error("Please upload an .xlsx, .xls or .csv file."));
  }
  const kind = ext === "csv" ? "csv" : "excel";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const input = kind === "csv" ? e.target.result : new Uint8Array(e.target.result);
        resolve(parseProductSheet(input, kind));
      } catch (err) {
        reject(new Error("Could not read file: " + err.message));
      }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    if (kind === "csv") reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

// "1,250.50", "SAR 1250", " 12 " → number. Returns undefined for text. Commas
// are accepted only as thousands separators, so "12,5" is reported rather than
// read as 125.
export function parseNumber(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return undefined;
  s = s.replace(/^(sar|sr|usd|aed|ر\.?س\.?|\$)\s*/i, "")
       .replace(/\s*(sar|sr|usd|aed|ر\.?س\.?)$/i, "")
       .replace(/\s+/g, "");
  if (s.includes(",")) {
    if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return undefined;
    s = s.replace(/,/g, "");
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "active", "enabled"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "inactive", "disabled"]);

export function parseActive(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return undefined;
}

const lc = (s) => String(s ?? "").trim().toLowerCase();
const AUTO_RE = /^AUTO-(\d+)$/i;
const formatAuto = (n) => `AUTO-${String(n).padStart(6, "0")}`;

// ── Dry run ──────────────────────────────────────────────────────────────────
//
// existingProducts: every product of the company (all columns).
// existingGroups:   names in material_groups for the company.
// availableColumns: product columns that exist in the database (keys of a
//                   loaded row); null when unknown (company has no products).
export function buildImportPlan({
  rows, mapping, existingProducts = [], existingGroups = [], availableColumns = null,
}) {
  const plan = {
    creates: [], updates: [], unchanged: [], skipped: [],
    fieldIssues: [], warnings: [], newGroups: [], blankRows: 0,
    mirrorProductGroup: !!availableColumns?.has("product_group"),
  };

  // Mapped fields whose column does not exist are never written.
  const missingCols = new Set();
  mapping.forEach((key) => {
    if (key && key !== "material" && availableColumns && !availableColumns.has(key)) missingCols.add(key);
  });
  missingCols.forEach((key) => plan.warnings.push({
    message: `The database has no "${fieldLabel(key)}" column, so that column of the file is not imported.`,
  }));

  // Lookups over existing products.
  const byCode = new Map();
  const byCodeLc = new Map();
  const byDesc = new Map();
  let maxAuto = 0;
  for (const p of existingProducts) {
    const code = String(p.material ?? "").trim();
    if (code) {
      byCode.set(code, p);
      const k = code.toLowerCase();
      byCodeLc.set(k, [...(byCodeLc.get(k) || []), p]);
      const m = code.match(AUTO_RE);
      if (m) maxAuto = Math.max(maxAuto, Number(m[1]));
    }
    const d = lc(p.description);
    if (d) byDesc.set(d, [...(byDesc.get(d) || []), p]);
  }

  // Group spelling: the material_groups table first, then what products carry.
  const tableGroups = new Map(existingGroups.map((g) => [lc(g), g]));
  const productGroups = new Map();
  existingProducts.forEach((p) => {
    const g = String(p.material_group ?? "").trim();
    if (g && !productGroups.has(lc(g))) productGroups.set(lc(g), g);
  });
  const newGroups = new Map();
  const groupRows = new Map();

  // Last row wins: entries keyed by target, replaced in place.
  const targets = new Map();
  const order = [];
  const codesInFile = new Set();

  for (const row of rows) {
    if (row.cells.every((c) => !c)) { plan.blankRows++; continue; }

    const fields = {};
    mapping.forEach((key, i) => {
      if (!key) return;
      const raw = row.cells[i];
      if (!raw) return;
      const f = FIELD_BY_KEY[key];
      if (missingCols.has(key)) return;
      if (f.type === "number") {
        const n = parseNumber(raw);
        if (n === undefined) {
          plan.fieldIssues.push({ rowNum: row.rowNum, field: key, value: raw, reason: `"${raw}" is not a number` });
          return;
        }
        fields[key] = n;
      } else if (f.type === "bool") {
        const b = parseActive(raw);
        if (b === undefined) {
          plan.fieldIssues.push({ rowNum: row.rowNum, field: key, value: raw, reason: `"${raw}" is not Active / Inactive (or Yes / No, True / False)` });
          return;
        }
        fields[key] = b;
      } else if (f.type === "uom") {
        fields[key] = raw.toUpperCase();
      } else if (f.type === "group") {
        const k = lc(raw);
        const known = tableGroups.get(k) || productGroups.get(k) || newGroups.get(k);
        if (known) fields[key] = known;
        else { fields[key] = raw; newGroups.set(k, raw); }
        if (!tableGroups.has(k)) groupRows.set(k, [...(groupRows.get(k) || []), row.rowNum]);
      } else {
        fields[key] = raw;
      }
    });

    const code = fields.material;
    const desc = fields.description;
    let key;
    let entry;

    if (code) {
      codesInFile.add(code.toLowerCase());
      let product = byCode.get(code);
      if (!product) {
        const ci = byCodeLc.get(code.toLowerCase()) || [];
        if (ci.length > 1) {
          plan.skipped.push({ rowNum: row.rowNum, cells: row.cells, reason: `Code "${code}" matches ${ci.length} products that differ only in upper/lower case` });
          continue;
        }
        product = ci[0];
      }
      if (product) {
        key = `id:${product.id}`;
        entry = { kind: "update", rowNum: row.rowNum, cells: row.cells, product, fields };
      } else {
        key = `code:${code.toLowerCase()}`;
        entry = { kind: "create", rowNum: row.rowNum, cells: row.cells, fields };
      }
    } else if (desc) {
      const matches = byDesc.get(lc(desc)) || [];
      if (matches.length > 1) {
        plan.skipped.push({
          rowNum: row.rowNum, cells: row.cells,
          reason: `Ambiguous description: "${desc}" matches ${matches.length} products (${matches.map((p) => p.material).join(", ")})`,
        });
        continue;
      }
      if (matches.length === 1) {
        key = `id:${matches[0].id}`;
        entry = { kind: "update", rowNum: row.rowNum, cells: row.cells, product: matches[0], fields, byDescription: true };
      } else {
        key = `desc:${lc(desc)}`;
        entry = { kind: "create", rowNum: row.rowNum, cells: row.cells, fields, auto: true };
      }
    } else {
      plan.skipped.push({ rowNum: row.rowNum, cells: row.cells, reason: "Nothing to identify the product (no code and no description)" });
      continue;
    }

    const prev = targets.get(key);
    if (prev) {
      const what = entry.product ? `product ${entry.product.material}` : (code ? `code ${code}` : `description "${desc}"`);
      plan.warnings.push({ rowNum: row.rowNum, message: `Row ${row.rowNum} repeats ${what} from row ${prev.rowNum}; the later row is used` });
    } else {
      order.push(key);
    }
    targets.set(key, entry);
  }

  // Auto codes: next free number per company, skipping codes in the file.
  let next = maxAuto;
  const nextAuto = () => {
    do { next++; } while (byCodeLc.has(formatAuto(next).toLowerCase()) || codesInFile.has(formatAuto(next).toLowerCase()));
    return formatAuto(next);
  };

  for (const key of order) {
    const e = targets.get(key);
    if (e.kind === "create") {
      const record = { ...e.fields };
      if (e.auto) record.material = nextAuto();
      if (record.base_unit_of_measure === undefined) record.base_unit_of_measure = "PC";
      if (record.is_active === undefined) record.is_active = true;
      if (plan.mirrorProductGroup && record.material_group !== undefined) record.product_group = record.material_group;
      plan.creates.push({ rowNum: e.rowNum, cells: e.cells, record, auto: !!e.auto });
    } else {
      const changes = [];
      const patch = {};
      for (const [field, value] of Object.entries(e.fields)) {
        // What identified the row is never rewritten: the code, or the
        // description it matched on (which may differ only in case/spacing).
        if (field === "material") continue;
        if (field === "description" && e.byDescription) continue;
        const before = e.product[field];
        const same = FIELD_BY_KEY[field].type === "number"
          ? before !== null && before !== undefined && before !== "" && Number(before) === value
          : FIELD_BY_KEY[field].type === "bool"
            ? before === value
            : String(before ?? "") === value;
        if (same) continue;
        changes.push({ field, from: before ?? null, to: value });
        patch[field] = value;
      }
      if (plan.mirrorProductGroup && patch.material_group !== undefined) patch.product_group = patch.material_group;
      if (changes.length === 0) {
        plan.unchanged.push({ rowNum: e.rowNum, material: e.product.material });
      } else {
        plan.updates.push({ rowNum: e.rowNum, cells: e.cells, productId: e.product.id, material: e.product.material, changes, patch });
      }
    }
  }

  // Groups that will actually be written (a row skipped or replaced does not count).
  const written = new Set();
  plan.creates.forEach((c) => c.record.material_group && written.add(lc(c.record.material_group)));
  plan.updates.forEach((u) => u.patch.material_group && written.add(lc(u.patch.material_group)));
  for (const [k, name] of newGroups) {
    if (!written.has(k)) continue;
    plan.newGroups.push(name);
    plan.warnings.push({ message: `New group "${name}" will be created (rows ${groupRows.get(k).join(", ")})` });
  }
  // A group used by products but missing from the groups table is added to it.
  for (const [k, name] of productGroups) {
    if (!tableGroups.has(k) && !newGroups.has(k) && written.has(k)) plan.newGroups.push(name);
  }

  return plan;
}

// ── Loading context ──────────────────────────────────────────────────────────

// PostgREST returns at most 1,000 rows per request, so page through.
export async function loadImportContext(client, companyId, pageSize = 1000) {
  const products = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("products").select("*").eq("company_id", companyId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error("Could not load existing products: " + error.message);
    products.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const { data: groups, error: gErr } = await client
    .from("material_groups").select("name").eq("company_id", companyId);
  if (gErr) throw new Error("Could not load product groups: " + gErr.message);

  const availableColumns = products.length ? new Set(Object.keys(products[0])) : null;
  return { products, groups: (groups || []).map((g) => g.name), availableColumns };
}

// ── Writing ──────────────────────────────────────────────────────────────────
//
// Creates are inserted in chunks; a chunk that fails is retried row by row so
// the report names the exact rows and reasons. Updates are by id with only the
// changed fields. A failed row is reported as failed, never as skipped.
export async function executeImportPlan(plan, { client, companyId, chunkSize = 50, onProgress } = {}) {
  const result = { created: [], updated: [], failed: [], groupErrors: [] };
  const total = plan.creates.length + plan.updates.length;
  let done = 0;
  const progress = () => onProgress?.(total ? Math.round((done / total) * 100) : 100);

  if (plan.newGroups.length) {
    const { error } = await client.from("material_groups").upsert(
      plan.newGroups.map((name) => ({ company_id: companyId, name, sort_order: 0, is_active: true })),
      { onConflict: "company_id,name", ignoreDuplicates: true },
    );
    if (error) result.groupErrors.push(error.message);
  }

  for (let i = 0; i < plan.creates.length; i += chunkSize) {
    const chunk = plan.creates.slice(i, i + chunkSize);
    const records = chunk.map((c) => ({ ...c.record, company_id: companyId }));
    const { data, error } = await client.from("products").insert(records).select("id, material");
    if (!error) {
      const ids = new Map((data || []).map((d) => [d.material, d.id]));
      chunk.forEach((c) => result.created.push({ rowNum: c.rowNum, material: c.record.material, id: ids.get(c.record.material) }));
    } else {
      for (const c of chunk) {
        const one = await client.from("products").insert([{ ...c.record, company_id: companyId }]).select("id, material");
        if (one.error) result.failed.push({ rowNum: c.rowNum, cells: c.cells, material: c.record.material, reason: one.error.message });
        else result.created.push({ rowNum: c.rowNum, material: c.record.material, id: one.data?.[0]?.id });
      }
    }
    done += chunk.length;
    progress();
  }

  for (let i = 0; i < plan.updates.length; i += chunkSize) {
    const chunk = plan.updates.slice(i, i + chunkSize);
    const outcomes = await Promise.all(chunk.map((u) =>
      client.from("products")
        .update({ ...u.patch, updated_at: new Date().toISOString() })
        .eq("id", u.productId).eq("company_id", companyId)
        .select("id")
        .then((r) => ({ u, ...r }), (err) => ({ u, error: err })),
    ));
    for (const { u, data, error } of outcomes) {
      if (error) result.failed.push({ rowNum: u.rowNum, cells: u.cells, material: u.material, reason: error.message });
      else if (!data?.length) result.failed.push({ rowNum: u.rowNum, cells: u.cells, material: u.material, reason: "Not updated: the product no longer exists or you do not have permission" });
      else result.updated.push({ rowNum: u.rowNum, material: u.material, id: u.productId });
    }
    done += chunk.length;
    progress();
  }

  progress();
  return result;
}

// ── Skipped rows file ────────────────────────────────────────────────────────

export function buildSkippedRowsWorkbook(headers, plan, result = null) {
  const failed = result?.failed || [];
  const rows = [
    ...plan.skipped.map((s) => ({ rowNum: s.rowNum, reason: s.reason, cells: s.cells })),
    ...failed.map((f) => ({ rowNum: f.rowNum, reason: `Write failed: ${f.reason}`, cells: f.cells || [] })),
  ].sort((a, b) => a.rowNum - b.rowNum);

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([
    ["Row", "Reason", ...headers],
    ...rows.map((r) => [r.rowNum, r.reason, ...r.cells]),
  ]);
  XLSX.utils.book_append_sheet(wb, ws1, "Skipped rows");

  if (plan.fieldIssues.length) {
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Row", "Column", "Value", "Reason"],
      ...plan.fieldIssues.map((f) => [f.rowNum, fieldLabel(f.field), f.value, `${f.reason}; the rest of the row was imported`]),
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, "Fields not imported");
  }
  return { wb, count: rows.length + plan.fieldIssues.length };
}

export function formatFieldValue(field, v) {
  if (v === null || v === undefined || v === "") return "—";
  const type = FIELD_BY_KEY[field]?.type;
  if (type === "bool") return v ? "Active" : "Inactive";
  if (type === "number") {
    const n = Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : String(v);
  }
  return String(v);
}
