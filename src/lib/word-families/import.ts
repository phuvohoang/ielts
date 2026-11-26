import { familyInputSchema, duplicate, type FamilyInput } from "./model";
export const columns = [
  "meaning_vi",
  "noun",
  "adjective",
  "adverb",
  "verb",
] as const;
function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw Error("CSV có dấu nháy không hợp lệ.");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed) throw Error("Có ký tự sau dấu nháy đóng trong CSV.");
      cell += c;
    }
  }
  if (quoted) throw Error("CSV thiếu dấu nháy đóng.");
  if (cell || row.length || closed) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((row) => row.some((value) => value.trim()));
}
export function parseImport(text: string, format: "json" | "csv") {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw Error("File tối đa 2 MB.");
  text = text.replace(/^\uFEFF/, "");
  let values: unknown[];
  if (format === "json") {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed))
      throw Error("JSON phải là một mảng word families.");
    values = parsed;
  } else {
    const rows = csvRows(text),
      header = rows.shift()?.map((v) => v.trim());
    if (
      !header ||
      header.length !== 5 ||
      new Set(header).size !== 5 ||
      columns.some((c) => !header.includes(c))
    )
      throw Error("CSV cần đúng năm cột: " + columns.join(", "));
    values = rows.map((row) =>
      row.length !== 5
        ? { invalid_csv_columns: row.length }
        : Object.fromEntries(
            header.map((key, i) => [
              key,
              key === "meaning_vi"
                ? row[i]
                : row[i]
                    .split("|")
                    .map((v) => v.trim())
                    .filter(Boolean),
            ]),
          ),
    );
  }
  if (!values.length) throw Error("File không có dòng dữ liệu.");
  if (values.length > 5000)
    throw Error("Mỗi lần nhập tối đa 5.000 word families.");
  return values.map((value, index) => {
    const parsed = familyInputSchema.safeParse(value);
    return parsed.success
      ? { row: index + 1, data: parsed.data, error: "" }
      : {
          row: index + 1,
          data: undefined,
          error: parsed.error.issues
            .map((i) => `${i.path.join(".") || "row"}: ${i.message}`)
            .join("; "),
        };
  });
}
export type ImportRows = ReturnType<typeof parseImport>;
export function previewImport(rows: ImportRows, current: FamilyInput[]) {
  const pending = [...current];
  return rows.map((row) => {
    const matches = row.data
      ? pending.flatMap((data, index) =>
          duplicate(row.data!, [data]) ? [index] : [],
        )
      : [];
    const error =
      row.error ||
      (matches.length > 1
        ? "Dòng khớp nhiều mục khác nhau. Sửa nghĩa hoặc dạng từ trước khi nhập."
        : "");
    const target = matches[0] ?? pending.length;
    if (row.data && !error) pending[target] = row.data;
    return { ...row, error, target, duplicate: matches.length > 0 };
  });
}
export function toCsv(rows: FamilyInput[]) {
  const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    [
      columns.join(","),
      ...rows.map((row) =>
        columns
          .map((c) => quote(c === "meaning_vi" ? row[c] : row[c].join("|")))
          .join(","),
      ),
    ].join("\r\n")
  );
}
