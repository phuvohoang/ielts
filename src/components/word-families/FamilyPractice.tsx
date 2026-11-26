import { useEffect, useRef, useState } from "react";
import { PracticePanel } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Progress } from "../ui/progress";
import { Badge } from "../reui/badge";
import { Alert, AlertDescription } from "../reui/alert";
import {
  parts,
  labels,
  createRun,
  grade,
  summarize,
  type Family,
  type Run,
  type Weakness,
  type Selection,
  practiceFamilies,
  selectedFamilies,
} from "../../lib/word-families/model";
import {
  checkRun,
  saveRun,
  loadRun,
  loadSelectedFamilies,
} from "../../lib/word-families/storage";
// Clock reads below persist draft/history timestamps; never used for render keys.
export function FamilyPractice({
  families,
  runs,
  weaknesses,
  selections,
  selectedPracticeRequest,
  reload,
  openLibrary,
}: {
  families: Family[];
  runs: Run[];
  weaknesses: Weakness[];
  selections: Selection[];
  selectedPracticeRequest: number;
  reload: () => Promise<void>;
  openLibrary: () => void;
}) {
  const [requested, setRequested] = useState<Run["requested"]>(10),
    [pool, setPool] = useState<Run["pool"]>(
      runs.find((r) => !r.completed)?.pool ?? "all",
    );
  const [run, setRun] = useState<Run | undefined>(() =>
    runs.find((r) => !r.completed),
  );
  const current = useRef(run),
    pending = useRef(Promise.resolve()),
    locked = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const first = useRef<HTMLInputElement>(null),
    nextButton = useRef<HTMLButtonElement>(null),
    sourceControl = useRef<HTMLSelectElement>(null),
    focusSelection = useRef(false);
  const [historyPage, setHistoryPage] = useState(0);
  useEffect(() => {
    if (busy) return;
    if (!run && focusSelection.current) {
      sourceControl.current?.focus();
      focusSelection.current = false;
      return;
    }
    if (run?.questions[run.index].checked) nextButton.current?.focus();
    else first.current?.focus();
  }, [run?.id, run?.index, run?.questions[run.index]?.checked, busy]);
  function display(next: Run | undefined) {
    current.current = next;
    setRun(next);
  }
  const incorrectIds = new Set(
    weaknesses
      .filter((w) =>
        w.incorrect.some(
          (p) =>
            p !== "verb" &&
            families.find((f) => f.id === w.familyId)?.data[p].length,
        ),
      )
      .map((w) => w.familyId),
  );
  const selectedTotal = selectedFamilies(families, selections).length;
  const selectedCount = practiceFamilies(
    families,
    "selected",
    selections,
    incorrectIds,
  ).length;
  const allCount = practiceFamilies(
    families,
    "all",
    selections,
    incorrectIds,
  ).length;
  const available = practiceFamilies(families, pool, selections, incorrectIds);
  const appliedRequest = useRef(0);
  useEffect(() => {
    if (
      !selectedPracticeRequest ||
      selectedPracticeRequest <= appliedRequest.current ||
      busy ||
      locked.current
    )
      return;
    appliedRequest.current = selectedPracticeRequest;
    void action(async () => {
      if (current.current) await saveRun(current.current);
      focusSelection.current = true;
      display(undefined);
      setPool("selected");
      setNotice(
        "Đã chọn chế độ Selected words. Chọn số câu rồi bắt đầu luyện.",
      );
    });
  }, [selectedPracticeRequest, busy]);
  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await pending.current;
      await work();
      await reload();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa lưu được phiên luyện. Giữ trang này và thử lại.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function change(part: (typeof parts)[number], value: string) {
    const old = current.current;
    if (!old || old.questions[old.index].checked || locked.current) return;
    const next = {
      ...old,
      updatedAt: Date.now(),
      questions: old.questions.map((q, i) =>
        i === old.index
          ? { ...q, answers: { ...q.answers, [part]: value } }
          : q,
      ),
    };
    display(next);
    pending.current = pending.current
      .then(() => saveRun(next))
      .catch(() =>
        setError(
          "Chưa lưu được bản nháp. Giữ trang này và bấm Thử lại trước khi rời đi.",
        ),
      );
  }
  async function start(
    source: Run["pool"] = pool,
    ids?: Set<string>,
    count: Run["requested"] = requested,
  ) {
    await action(async () => {
      const selected =
        source === "selected"
          ? await loadSelectedFamilies(ids)
          : practiceFamilies(families, source, selections, incorrectIds, ids);
      const next = createRun(selected, count, source);
      await saveRun(next);
      display(next);
      setNotice(
        count !== "all" && count > selected.length
          ? `Bạn chọn ${count} câu nhưng chỉ có ${selected.length} word families phù hợp. Phiên này dùng toàn bộ ${selected.length} mục.`
          : `Đã tạo phiên ${next.questions.length} câu, không lặp word family.`,
      );
    });
  }
  async function check() {
    await action(async () => {
      if (!current.current) return;
      await saveRun(current.current);
      display(await checkRun(current.current));
    });
  }
  async function next() {
    await action(async () => {
      const old = current.current;
      if (!old || !old.questions[old.index].checked) return;
      const next = {
        ...old,
        index: Math.min(old.index + 1, old.questions.length - 1),
        completed: old.index === old.questions.length - 1,
        updatedAt: Date.now(),
      };
      await saveRun(next);
      display(next);
    });
  }
  const q = run?.questions[run.index],
    feedback = q?.checked ? grade(q) : undefined;
  const summary = run ? summarize(run) : undefined;
  const againAvailable = run
    ? practiceFamilies(
        families,
        run.pool,
        selections,
        incorrectIds,
        new Set(run.questions.map((q) => q.family.id)),
      ).length
    : 0;
  const retryIds = new Set(summary?.incorrect.map((x) => x.familyId) ?? []);
  const retrySource = run?.pool === "selected" ? "selected" : "incorrect";
  const retryAvailable = practiceFamilies(
    families,
    retrySource,
    selections,
    incorrectIds,
    retryIds,
  ).length;
  const historyPages = Math.max(1, Math.ceil(runs.length / 20)),
    visibleHistory = Math.min(historyPage, historyPages - 1);
  const recent = runs.slice(visibleHistory * 20, visibleHistory * 20 + 20);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (current.current) await saveRun(current.current);
                })
              }
            >
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {busy && <p role="status">Đang lưu trên thiết bị…</p>}
      {notice && <p role="status">{notice}</p>}
      {!run && (
        <PracticePanel
          title="Thiết lập luyện tập"
          description={`${families.length} word families trong thư viện · ${incorrectIds.size} mục còn từ loại trả lời sai.`}
        >
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-2">
              Số câu
              <NativeSelect
                aria-label="Số câu"
                size="sm"
                value={requested}
                onChange={(e) =>
                  setRequested(
                    e.target.value === "all"
                      ? "all"
                      : (Number(e.target.value) as Run["requested"]),
                  )
                }
              >
                {[10, 20, 30, 50, "all"].map((n) => (
                  <option key={n} value={n}>
                    {n === "all" ? "All" : n}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-2">
              Nguồn luyện
              <NativeSelect
                ref={sourceControl}
                aria-label="Nguồn luyện"
                size="sm"
                value={pool}
                onChange={(e) => {
                  setPool(e.target.value as Run["pool"]);
                  setNotice("");
                }}
              >
                <option value="all">All words ({allCount})</option>
                <option value="selected">
                  Selected words ({selectedCount})
                </option>
                <option value="incorrect">
                  Previously incorrect words ({incorrectIds.size})
                </option>
              </NativeSelect>
            </label>
          </div>
          <p>
            {available.length} word families phù hợp. Chỉ chọn từ trong thư viện
            của bạn; không dùng AI. Verb được cho sẵn; chỉ chấm Noun, Adjective,
            Adverb. Mục chỉ có Verb không đưa vào bài luyện.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !available.length}
              onClick={() => void start()}
            >
              Bắt đầu luyện
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openLibrary}
            >
              Về Word Library
            </Button>
          </div>
          {!available.length && (
            <p>
              {pool === "selected"
                ? selectedTotal
                  ? "Các từ đã chọn chỉ có Verb. Chọn từ có Noun, Adjective hoặc Adverb để luyện."
                  : "Chưa chọn word family nào. Vào Word Library và chọn từ để bắt đầu luyện."
                : families.length && !allCount
                  ? "Thư viện chưa có Noun, Adjective hoặc Adverb để luyện."
                  : families.length
                    ? "Chưa có từ phù hợp với bộ lọc này. Chọn tất cả từ hoặc nhập thêm dữ liệu."
                    : "Thư viện trống. Nhập từ trước khi luyện."}
            </p>
          )}
        </PracticePanel>
      )}
      {run && !run.completed && q && (
        <PracticePanel
          title={`Câu ${run.index + 1}/${run.questions.length}`}
          description="Điền từng từ loại. Enter để kiểm tra; sau phản hồi, dùng Next Question."
        >
          <Progress
            value={
              (run.questions.filter((q) => q.checked).length /
                run.questions.length) *
              100
            }
            aria-label="Tiến độ Word Families"
          />
          <h3 className="font-semibold tracking-tight break-words">
            {q.family.data.meaning_vi}
            {q.verbGiven && (
              <>
                {" "}
                · <span lang="en">{q.family.data.verb.join(" / ") || "—"}</span>
              </>
            )}
          </h3>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (q.checked ? next() : check());
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {q.order
                .filter(
                  (p) =>
                    q.family.data[p].length && !(q.verbGiven && p === "verb"),
                )
                .map((part, i) => {
                  const result = feedback?.find((x) => x.part === part);
                  return (
                    <div key={part} className="flex flex-col gap-2">
                      <label className="flex flex-col gap-2">
                        {labels[part]}
                        <Input
                          ref={i === 0 ? first : undefined}
                          aria-label={labels[part]}
                          className={
                            result?.correct ? "border-success" : undefined
                          }
                          aria-invalid={result ? !result.correct : undefined}
                          aria-describedby={
                            result ? `feedback-${part}` : undefined
                          }
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={500}
                          disabled={busy || q.checked}
                          value={q.answers[part] ?? ""}
                          onChange={(e) => change(part, e.target.value)}
                        />
                      </label>
                      {result && (
                        <div
                          id={`feedback-${part}`}
                          role="status"
                          className="flex flex-col gap-2"
                        >
                          <Badge
                            variant={
                              result.correct
                                ? "success-light"
                                : "destructive-light"
                            }
                          >
                            {result.correct ? "Đúng" : "Sai"}
                          </Badge>
                          <p>
                            Câu bạn nhập:{" "}
                            <span
                              lang="en"
                              className="whitespace-pre-wrap break-words"
                            >
                              {result.answer || "(để trống)"}
                            </span>
                          </p>
                          {!result.correct && (
                            <p>
                              Đáp án chấp nhận:{" "}
                              <span
                                lang="en"
                                className="whitespace-pre-wrap break-words"
                              >
                                {result.accepted.join(" / ")}
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            <p className="text-muted-foreground">
              {parts
                .filter(
                  (p) =>
                    !q.family.data[p].length && !(q.verbGiven && p === "verb"),
                )
                .map((p) => labels[p])
                .join(", ")}
              {parts.some(
                (p) =>
                  !q.family.data[p].length && !(q.verbGiven && p === "verb"),
              )
                ? ": — · Không có trong dữ liệu, không tính điểm."
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy || q.checked}>
                Check Answers
              </Button>
              <Button
                ref={nextButton}
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !q.checked}
                onClick={() => void next()}
              >
                {run.index === run.questions.length - 1
                  ? "Xem kết quả"
                  : "Next Question"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    if (current.current) await saveRun(current.current);
                    display(undefined);
                    setNotice("Đã lưu phiên; bạn có thể mở lại từ lịch sử.");
                  })
                }
              >
                Lưu và về thiết lập
              </Button>
            </div>
          </form>
        </PracticePanel>
      )}
      {run?.completed && summary && (
        <>
          <PracticePanel
            title="Kết quả Word Families"
            description={`${summary.score}/${summary.total} điểm · Độ chính xác ${summary.accuracy}% · ${summary.fullyCorrect}/${run.questions.length} word families đúng hoàn toàn.`}
          >
            <ul>
              {summary.byPart.map((row) => (
                <li key={row.part}>
                  {labels[row.part]}: {row.score}/{row.total} ·{" "}
                  {row.total
                    ? `${Math.round((row.score / row.total) * 100)}%`
                    : "— (không có dạng từ)"}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || !againAvailable}
                onClick={() =>
                  void start(
                    run.pool,
                    new Set(run.questions.map((q) => q.family.id)),
                    run.requested,
                  )
                }
              >
                Practice Again
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !retryAvailable}
                onClick={() => void start(retrySource, retryIds, "all")}
              >
                Retry Incorrect Words
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  display(undefined);
                  setNotice("");
                }}
              >
                Về thiết lập
              </Button>
            </div>
          </PracticePanel>
          <PracticePanel
            title="Câu trả lời sai"
            description="Giữ nguyên câu bạn đã nhập; không tự chấp nhận lỗi chính tả."
          >
            {!summary.incorrect.length ? (
              <p>Bạn đã trả lời đúng tất cả các dạng từ có trong phiên này.</p>
            ) : (
              summary.incorrect.map((item) => (
                <div
                  key={`${item.familyId}:${item.part}`}
                  className="flex flex-col gap-2"
                >
                  <h3 className="font-semibold">
                    {item.meaning} · {labels[item.part]}
                  </h3>
                  <p>
                    Bạn nhập:{" "}
                    <span lang="en" className="whitespace-pre-wrap break-words">
                      {item.answer || "(để trống)"}
                    </span>
                  </p>
                  <p>
                    Đáp án:{" "}
                    <span lang="en" className="whitespace-pre-wrap break-words">
                      {item.accepted.join(" / ")}
                    </span>
                  </p>
                </div>
              ))
            )}
          </PracticePanel>
        </>
      )}
      <PracticePanel
        title="Điểm yếu hiện tại"
        description="Từ loại sai ở lần kiểm tra gần nhất; câu đúng ở lần luyện sau sẽ gỡ điểm yếu tương ứng."
      >
        {!incorrectIds.size ? (
          <p>Chưa có điểm yếu cần ôn. Hoàn thành một phiên để xem thống kê.</p>
        ) : (
          families
            .filter((f) => incorrectIds.has(f.id))
            .slice(0, 50)
            .map((f) => (
              <p key={f.id}>
                {f.data.meaning_vi}:{" "}
                {weaknesses
                  .find((w) => w.familyId === f.id)
                  ?.incorrect.filter((p) => p !== "verb" && f.data[p].length)
                  .map((p) => labels[p])
                  .join(", ")}
              </p>
            ))
        )}
        {incorrectIds.size > 50 && (
          <p>
            Hiển thị 50 mục đầu; bộ lọc luyện sai dùng toàn bộ{" "}
            {incorrectIds.size} mục.
          </p>
        )}
      </PracticePanel>
      <PracticePanel
        title="Lịch sử luyện tập"
        description="Bản nháp, thứ tự câu và đáp án gốc được lưu trên thiết bị; có trong sao lưu chung."
      >
        {!runs.length ? (
          <p>Chưa có phiên luyện. Bắt đầu từ thư viện đã nhập của bạn.</p>
        ) : (
          recent.map((item) => {
            const stats = summarize(item);
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-3">
                <span>
                  {new Date(item.createdAt).toLocaleString("vi-VN")} ·{" "}
                  {item.questions.length} câu ·{" "}
                  {item.completed
                    ? `${stats.score}/${stats.total} điểm`
                    : `Đang luyện ${item.questions.filter((q) => q.checked).length}/${item.questions.length}`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Mở phiên ${item.id}`}
                  onClick={() =>
                    void action(async () => {
                      display(await loadRun(item.id));
                      setNotice("Đã mở phiên đã lưu.");
                    })
                  }
                >
                  {item.completed ? "Xem kết quả" : "Tiếp tục"}
                </Button>
              </div>
            );
          })
        )}
        {runs.length > 20 && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={visibleHistory === 0}
              onClick={() => setHistoryPage(visibleHistory - 1)}
            >
              Lịch sử trước
            </Button>
            <span>
              Trang {visibleHistory + 1}/{historyPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={visibleHistory + 1 >= historyPages}
              onClick={() => setHistoryPage(visibleHistory + 1)}
            >
              Lịch sử sau
            </Button>
          </div>
        )}
      </PracticePanel>
    </div>
  );
}
