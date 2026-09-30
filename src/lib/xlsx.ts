import { inflateRawSync } from "node:zlib";

/**
 * Minimal .xlsx reader — enough to pull a grid of values out of the first
 * worksheet, and nothing more.
 *
 * Written by hand rather than pulling in a spreadsheet library: the popular
 * ones each drag in dependencies with open advisories, and all we need is
 * "read the cells". An .xlsx file is a ZIP containing XML, and Node can
 * already unzip and we only need a light touch of XML parsing.
 *
 * Returns rows of strings/numbers/nulls, in sheet order.
 */

export type Cell = string | number | Date | null;
export type Grid = Cell[][];

// ---------------------------------------------------------------------------
// ZIP reading
// ---------------------------------------------------------------------------

/** Pull the named files out of a ZIP archive. */
function unzip(buf: Buffer, wanted: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>();

  // Find the End Of Central Directory record, scanning back from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (no ZIP directory found).");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // offset of central directory

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;

    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    if (wanted(name)) {
      // Re-read the sizes from the local header, whose extra field length
      // often differs from the central directory's.
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" doesn't become "<"
}

/** All the text inside an element, tags stripped. */
function textOf(xml: string) {
  return decodeEntities(xml.replace(/<[^>]*>/g, ""));
}

/** "BC12" -> { col: 54, row: 12 } (0-based column) */
function parseRef(ref: string) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the first worksheet of an .xlsx file into a grid of values. */
export function readXlsx(buf: Buffer): Grid {
  const sheets = readXlsxAllSheets(buf);
  if (sheets.length === 0) throw new Error("Couldn't find a worksheet in that file.");
  return sheets[0].grid;
}

/**
 * Read every worksheet, in workbook order, with its tab name. The expense
 * workbooks keep one month per tab, and the tab name is the only reliable
 * record of which month the rows belong to.
 */
export function readXlsxAllSheets(buf: Buffer): { name: string; grid: Grid }[] {
  const files = unzip(
    buf,
    (n) =>
      n === "xl/sharedStrings.xml" ||
      n === "xl/workbook.xml" ||
      n === "xl/_rels/workbook.xml.rels" ||
      n === "xl/styles.xml" ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(n)
  );

  // Which style indexes are date formats? Excel stores dates as numbers, and
  // only the style tells them apart from ordinary values.
  const dateStyles = new Set<number>();
  const stylesXml = files.get("xl/styles.xml")?.toString("utf8");
  if (stylesXml) {
    const customDateFmts = new Set<number>();
    for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
      if (/[dmyh]/i.test(m[2].replace(/\[[^\]]*\]/g, ""))) customDateFmts.add(Number(m[1]));
    }
    // 14-22 and 45-47 are Excel's built-in date/time formats.
    const isDateFmt = (id: number) =>
      (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || customDateFmts.has(id);

    const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
    let xfIndex = 0;
    for (const m of cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)) {
      const id = Number(/numFmtId="(\d+)"/.exec(m[1])?.[1] ?? "0");
      if (isDateFmt(id)) dateStyles.add(xfIndex);
      xfIndex++;
    }
  }

  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";

  const relTarget = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relTarget.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const sheetList: { name: string; path: string }[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decodeEntities(/name="([^"]*)"/.exec(m[1])?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1];
    const target = rid ? relTarget.get(rid) : undefined;
    if (target) sheetList.push({ name, path: "xl/" + target });
  }

  // Fall back to whatever sheet files exist, if the workbook index is missing.
  if (sheetList.length === 0) {
    for (const key of files.keys()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(key)) {
        sheetList.push({ name: key.replace(/^.*\/(sheet\d+)\.xml$/, "$1"), path: key });
      }
    }
  }

  const shared: string[] = [];
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8");
  if (sharedXml) {
    for (const m of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      shared.push(textOf(m[1]));
    }
  }

  return sheetList
    .filter((s) => files.has(s.path))
    .map((s) => ({
      name: s.name,
      grid: parseSheetXml(files.get(s.path)!.toString("utf8"), shared, dateStyles),
    }));
}

function parseSheetXml(sheetXml: string, shared: string[], dateStyles: Set<number>): Grid {
  const grid: Grid = [];

  for (const rowM of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowM[1];
    const rowNumM = /\br="(\d+)"/.exec(rowAttrs);
    const rowIndex = rowNumM ? Number(rowNumM[1]) - 1 : grid.length;
    const cells: Cell[] = [];

    for (const cM of rowM[2].matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cM[1];
      const inner = cM[3] ?? "";

      const refM = /\br="([A-Z]+\d+)"/.exec(attrs);
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const styleIdx = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? "-1");
      const colIndex = refM ? parseRef(refM[1])?.col ?? cells.length : cells.length;

      let value: Cell = null;
      if (type === "s") {
        const idx = Number(textOf(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ""));
        value = Number.isFinite(idx) ? shared[idx] ?? null : null;
      } else if (type === "inlineStr") {
        value = textOf(inner) || null;
      } else if (type === "str" || type === "e") {
        value = textOf(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "") || null;
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw != null && raw !== "") {
          const n = Number(raw);
          if (Number.isFinite(n)) {
            // A date-formatted number is a date: days since 1899-12-30.
            value =
              dateStyles.has(styleIdx) && n > 1
                ? new Date(Math.round((n - 25569) * 86400 * 1000))
                : n;
          } else {
            value = decodeEntities(raw);
          }
        }
      }

      while (cells.length < colIndex) cells.push(null);
      cells[colIndex] = value;
    }

    while (grid.length < rowIndex) grid.push([]);
    grid[rowIndex] = cells;
  }

  return grid;
}

/** Read a CSV file into the same grid shape, so callers treat both alike. */
export function readCsv(text: string): Grid {
  // Strip a UTF-8 BOM, which Excel exports often carry.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const grid: Grid = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const pushField = () => {
    const t = field.trim();
    if (t === "") {
      row.push(null);
    } else {
      // Keep numbers as numbers, but leave things like "01/08/2026" alone.
      const n = Number(t.replace(/,/g, ""));
      row.push(Number.isFinite(n) && /^-?[\d,]*\.?\d+$/.test(t) ? n : t);
    }
    field = "";
  };
  const pushRow = () => {
    pushField();
    grid.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = true;
      i++;
    } else if (ch === ",") {
      pushField();
      i++;
    } else if (ch === "\r") {
      i++;
    } else if (ch === "\n") {
      pushRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }

  if (field !== "" || row.length > 0) pushRow();
  return grid;
}
