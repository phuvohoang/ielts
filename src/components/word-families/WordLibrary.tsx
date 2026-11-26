import { useEffect, useMemo, useRef, useState } from "react";
import { PracticePanel } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { Input } from "../ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Alert, AlertDescription } from "../reui/alert";
import { Badge } from "../reui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";
import {
  parts,
  labels,
  familyInputSchema,
  type Family,
  type Selection,
  selectedFamilies,
} from "../../lib/word-families/model";
import {
  parseImport,
  previewImport,
  toCsv,
  type ImportRows,
} from "../../lib/word-families/import";
import {
  saveFamily,
  deleteFamily,
  importFamilies,
  setFamilySelection,
  clearFamilySelection,
} from "../../lib/word-families/storage";
const empty = { meaning_vi: "", noun: "", adjective: "", adverb: "", verb: "" };
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
export function WordLibrary({
  families,
  selections,
  practiceSelected,
  reload,
}: {
  families: Family[];
  selections: Selection[];
  practiceSelected: () => void;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [editor, setEditor] = useState<{ id?: string; fields: typeof empty }>(),
    [deleting, setDeleting] = useState<Family>(),
    [rows, setRows] = useState<ImportRows>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const preview = useMemo(
    () =>
      rows
        ? previewImport(
            rows,
            families.map((f) => f.data),
          )
        : [],
    [rows, families],
  );
  const [selectionFilter, setSelectionFilter] = useState("all");
  const [pendingSelection, setPendingSelection] = useState<Set<string>>();
  const selectedIds =
    pendingSelection ??
    new Set(selectedFamilies(families, selections).map((f) => f.id));
  const selectAll = useRef<HTMLInputElement>(null);
  const filtered = families.filter(
    (f) =>
      (selectionFilter === "all" ||
        (selectionFilter === "selected"
          ? selectedIds.has(f.id)
          : !selectedIds.has(f.id))) &&
      fold(
        [f.data.meaning_vi, ...parts.flatMap((p) => f.data[p])].join(" "),
      ).includes(fold(search.trim())),
  );
  const filteredSelected = filtered.filter((f) => selectedIds.has(f.id)).length;
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        filteredSelected > 0 && filteredSelected < filtered.length;
  }, [filteredSelected, filtered.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25)),
    currentPage = Math.min(page, pages - 1);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa lưu được. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  }
  async function selectWords(ids: string[], selected: boolean) {
    if (busy) return;
    const next = new Set(selectedIds);
    for (const id of ids) {
      if (selected) next.add(id);
      else next.delete(id);
    }
    setPendingSelection(next);
    try {
      await action(() => setFamilySelection(ids, selected));
    } finally {
      setPendingSelection(undefined);
    }
  }
  async function clearSelection() {
    if (busy) return;
    setPendingSelection(new Set());
    try {
      await action(clearFamilySelection);
    } finally {
      setPendingSelection(undefined);
    }
  }
  async function readFile(file?: File) {
    if (!file) return;
    setRows(undefined);
    setNotice("");
    await action(async () => {
      if (file.size > 2 * 1024 * 1024) throw Error("File tối đa 2 MB.");
      const format = file.name.toLowerCase().endsWith(".csv")
        ? "csv"
        : file.name.toLowerCase().endsWith(".json")
          ? "json"
          : undefined;
      if (!format) throw Error("Chọn file .json hoặc .csv.");
      setRows(parseImport(await file.text(), format));
    });
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}
            <p>
              Sửa dữ liệu rồi thực hiện lại thao tác, hoặc tải lại thư viện.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void action(reload)}
            >
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Đang xử lý dữ liệu…</p>}
      {editor && (
        <PracticePanel
          title={editor.id ? "Sửa word family" : "Thêm word family"}
          description="Nhiều đáp án: ngăn cách bằng |. Để trống dạng từ không có; không tự tạo dạng từ."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const data = familyInputSchema.parse({
                  ...editor.fields,
                  ...Object.fromEntries(
                    parts.map((p) => [
                      p,
                      editor.fields[p]
                        .split("|")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    ]),
                  ),
                });
                await saveFamily(data, editor.id);
                setEditor(undefined);
                setNotice("Đã lưu word family.");
              });
            }}
          >
            <label className="flex flex-col gap-2">
              Nghĩa tiếng Việt
              <Input
                required
                maxLength={500}
                value={editor.fields.meaning_vi}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    fields: { ...editor.fields, meaning_vi: e.target.value },
                  })
                }
                disabled={busy}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              {parts.map((p) => (
                <label key={p} className="flex flex-col gap-2">
                  {labels[p]}
                  <Input
                    value={editor.fields[p]}
                    maxLength={3600}
                    disabled={busy}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        fields: { ...editor.fields, [p]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                Lưu word family
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setEditor(undefined)}
              >
                Hủy chỉnh sửa
              </Button>
            </div>
          </form>
        </PracticePanel>
      )}
      <PracticePanel
        title="Word Library"
        description={`${families.length} word families · Dữ liệu lưu trên thiết bị này và có trong Sao lưu & cài đặt.`}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              setEditor({ fields: { ...empty } });
              setError("");
            }}
          >
            Thêm word family
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              download(
                "word-families-template.json",
                JSON.stringify(
                  [
                    {
                      meaning_vi: "",
                      noun: [],
                      adjective: [],
                      adverb: [],
                      verb: [],
                    },
                  ],
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            Tải mẫu JSON
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              download(
                "word-families-template.csv",
                "meaning_vi,noun,adjective,adverb,verb\r\n,,,,",
                "text/csv;charset=utf-8",
              )
            }
          >
            Tải mẫu CSV
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!families.length}
            onClick={() =>
              download(
                "word-families.json",
                JSON.stringify(
                  families.map((f) => f.data),
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            Xuất JSON
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!families.length}
            onClick={() =>
              download(
                "word-families.csv",
                toCsv(families.map((f) => f.data)),
                "text/csv;charset=utf-8",
              )
            }
          >
            Xuất CSV
          </Button>
        </div>
        <label className="flex flex-col gap-2">
          Nhập JSON hoặc CSV
          <Input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            disabled={busy}
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-muted-foreground">
          CSV dùng năm cột meaning_vi, noun, adjective, adverb, verb; các đáp án
          trong một ô ngăn bằng |. Các mục trùng nghĩa hoặc trùng toàn bộ dạng
          từ sẽ được bỏ qua sau khi bạn duyệt bản xem trước.
        </p>
        <label className="flex flex-col gap-2">
          Tìm từ hoặc nghĩa tiếng Việt
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-col gap-2">
            Hiển thị
            <NativeSelect
              aria-label="Library selection filter"
              size="sm"
              value={selectionFilter}
              onChange={(e) => {
                setSelectionFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">All words</option>
              <option value="selected">Selected words</option>
              <option value="unselected">Unselected words</option>
            </NativeSelect>
          </label>
          <p role="status">{selectedIds.size} word families đã chọn</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !selectedIds.size}
            onClick={() => void clearSelection()}
          >
            Clear selection
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !selectedIds.size}
            onClick={practiceSelected}
          >
            Practice selected words ({selectedIds.size})
          </Button>
        </div>
        {!families.length ? (
          <div>
            <p>
              Thư viện trống. Nhập file của bạn hoặc thêm word family đầu tiên.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditor({ fields: { ...empty } })}
            >
              Thêm từ đầu tiên
            </Button>
          </div>
        ) : !filtered.length ? (
          <div>
            <p>Không tìm thấy kết quả.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSearch("");
                setSelectionFilter("all");
              }}
            >
              Xóa tìm kiếm
            </Button>
          </div>
        ) : (
          <>
            <Table aria-label="Word Library">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      ref={selectAll}
                      type="checkbox"
                      className="accent-primary"
                      aria-label="Select all filtered words"
                      aria-checked={
                        filteredSelected > 0 &&
                        filteredSelected < filtered.length
                          ? "mixed"
                          : filtered.length > 0 &&
                            filteredSelected === filtered.length
                      }
                      checked={
                        filtered.length > 0 &&
                        filteredSelected === filtered.length
                      }
                      disabled={busy || !filtered.length}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        void selectWords(
                          filtered.map((f) => f.id),
                          checked,
                        );
                      }}
                    />
                  </TableHead>
                  <TableHead>Nghĩa tiếng Việt</TableHead>
                  {parts.map((p) => (
                    <TableHead key={p}>{labels[p]}</TableHead>
                  ))}
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered
                  .slice(currentPage * 25, currentPage * 25 + 25)
                  .map((f) => (
                    <TableRow
                      key={f.id}
                      data-state={
                        selectedIds.has(f.id) ? "selected" : undefined
                      }
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          className="accent-primary"
                          aria-label={`Select ${f.data.meaning_vi}`}
                          checked={selectedIds.has(f.id)}
                          disabled={busy}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            void selectWords([f.id], checked);
                          }}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal break-words">
                        {f.data.meaning_vi}
                      </TableCell>
                      {parts.map((p) => (
                        <TableCell
                          key={p}
                          className="whitespace-normal break-words"
                          lang="en"
                        >
                          {f.data[p].join(" / ") || "—"}
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label={`Sửa ${f.data.meaning_vi}`}
                            onClick={() =>
                              setEditor({
                                id: f.id,
                                fields: {
                                  meaning_vi: f.data.meaning_vi,
                                  ...Object.fromEntries(
                                    parts.map((p) => [
                                      p,
                                      f.data[p].join(" | "),
                                    ]),
                                  ),
                                } as typeof empty,
                              })
                            }
                          >
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label={`Xóa ${f.data.meaning_vi}`}
                            onClick={() => setDeleting(f)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Trang trước
              </Button>
              <span>
                Trang {currentPage + 1}/{pages} · {filtered.length} kết quả
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Trang sau
              </Button>
            </div>
          </>
        )}
      </PracticePanel>
      {rows && (
        <PracticePanel
          title="Xem trước dữ liệu nhập"
          description={`${preview.filter((r) => r.data && !r.duplicate).length} mục mới · ${preview.filter((r) => r.duplicate).length} mục trùng · ${preview.filter((r) => r.error).length} dòng lỗi. Chưa có dữ liệu nào được lưu.`}
        >
          <p>
            Chỉ xác nhận khi file không còn dòng lỗi. Dòng trùng được bỏ qua;
            mục hiện có không bị thay thế.
          </p>
          <Table aria-label="Xem trước nhập">
            <TableHeader>
              <TableRow>
                <TableHead>Dòng</TableHead>
                <TableHead>Nghĩa tiếng Việt</TableHead>
                {parts.map((p) => (
                  <TableHead key={p}>{labels[p]}</TableHead>
                ))}
                <TableHead>Kiểm tra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.slice(0, 100).map((row) => (
                <TableRow key={row.row}>
                  <TableCell>{row.row}</TableCell>
                  <TableCell>{row.data?.meaning_vi || "—"}</TableCell>
                  {parts.map((p) => (
                    <TableCell key={p}>
                      {row.data?.[p].join(" / ") || "—"}
                    </TableCell>
                  ))}
                  <TableCell>
                    {row.error ? (
                      <span>{row.error}</span>
                    ) : (
                      <Badge
                        variant={
                          row.duplicate ? "warning-light" : "success-light"
                        }
                      >
                        {row.duplicate ? "Trùng — bỏ qua" : "Hợp lệ"}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {preview.length > 100 && (
            <p>
              Hiển thị 100 dòng đầu; toàn bộ {preview.length} dòng đã được kiểm
              tra.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={
                busy ||
                preview.some((r) => r.error) ||
                !preview.some((r) => r.data && !r.duplicate)
              }
              onClick={() =>
                void action(async () => {
                  const result = await importFamilies(
                    preview.flatMap((r) =>
                      r.data && !r.duplicate ? [r.data] : [],
                    ),
                  );
                  setNotice(
                    `Đã nhập ${result.added} word families; ${preview.filter((r) => r.duplicate).length + result.skipped} mục trùng được bỏ qua.`,
                  );
                  setRows(undefined);
                })
              }
            >
              Xác nhận nhập
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setRows(undefined)}
            >
              Hủy nhập
            </Button>
          </div>
        </PracticePanel>
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa word family?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.data.meaning_vi}. Mục này sẽ rời thư viện và danh sách
              điểm yếu; lịch sử các phiên cũ vẫn giữ nguyên.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busy}>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void action(async () => {
                  await deleteFamily(deleting!.id);
                  setDeleting(undefined);
                  setNotice("Đã xóa word family.");
                });
              }}
            >
              Xác nhận xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
