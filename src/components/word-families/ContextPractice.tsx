import { useEffect, useRef, useState } from "react";
import { PracticePanel, PracticeLoading } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { Progress } from "../ui/progress";
import { Badge } from "../reui/badge";
import { Alert, AlertDescription } from "../reui/alert";
import {
  labels,
  parts,
  type Family,
  type Selection,
} from "../../lib/word-families/model";
import {
  contextSettingsSchema,
  contextCorrect,
  contextSummary,
  contextIncorrectIds,
  eligibleContextFamilies,
  type ContextRun,
  type ContextSettings,
} from "../../lib/word-families/context-model";
import {
  loadContextRuns,
  generateContextRun,
  answerContext,
  nextContext,
  retryContext,
} from "../../lib/word-families/context-storage";
function QuestionFeedback({
  question,
}: {
  question: ContextRun["questions"][number];
}) {
  const q = question.item.question;
  return (
    <div className="flex flex-col gap-3" role="status">
      <Badge
        variant={
          contextCorrect(question) ? "success-light" : "destructive-light"
        }
      >
        {contextCorrect(question) ? "Đúng" : "Chưa đúng"}
      </Badge>
      <p>
        Câu bạn chọn: <span lang="en">{question.answer}</span>
      </p>
      <p>
        Đáp án: <strong lang="en">{q.correct_answer}</strong> · Từ loại:{" "}
        {labels[q.target_pos]}
      </p>
      <p lang="en">{q.sentence.replace("_____", q.correct_answer)}</p>
      <p>{q.explanation_vi}</p>
      <p>{q.translation_vi}</p>
    </div>
  );
}
export function ContextPractice({
  families,
  selections,
  openLibrary,
  selectedPracticeRequest,
  active,
}: {
  families: Family[];
  selections: Selection[];
  openLibrary: () => void;
  selectedPracticeRequest: number;
  active: boolean;
}) {
  const [settings, setSettings] = useState<ContextSettings>({
    count: 10,
    difficulty: "B2",
    target: "all",
    source: "selected",
  });
  const [runs, setRuns] = useState<ContextRun[]>([]),
    [run, setRun] = useState<ContextRun>();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 }),
    [historyPage, setHistoryPage] = useState(0);
  const locked = useRef(false),
    retry = useRef<() => Promise<void>>(async () => {});
  const first = useRef<HTMLButtonElement>(null),
    next = useRef<HTMLButtonElement>(null),
    requestSeen = useRef(selectedPracticeRequest);
  const q = run?.questions[run.index];
  async function refresh() {
    setRuns(await loadContextRuns());
  }
  async function restore() {
    const rows = await loadContextRuns();
    setRuns(rows);
    setRun(rows.find((r) => !r.completed));
    setLoading(false);
  }
  useEffect(() => {
    retry.current = restore;
    let disposed = false;
    void loadContextRuns()
      .then((rows) => {
        if (!disposed) {
          setRuns(rows);
          setRun(rows.find((r) => !r.completed));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "Chưa đọc được lịch sử Word Formation in Context. Dữ liệu chưa bị xóa.",
          );
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (selectedPracticeRequest !== requestSeen.current) {
      requestSeen.current = selectedPracticeRequest;
      setSettings((s) => ({ ...s, source: "selected" }));
      setRun(undefined);
    }
  }, [selectedPracticeRequest]);
  useEffect(() => {
    if (!active || busy || !q || run?.completed) return;
    if (q.answer === undefined) first.current?.focus();
    else next.current?.focus();
  }, [active, busy, run?.id, run?.index, q?.answer, run?.completed]);
  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    retry.current = work;
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Chưa lưu được bài. Hãy thử lại.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
      setProgress({ done: 0, total: 0 });
    }
  }
  // Keep the async function invocation inside the guarded action.
  async function perform(work: () => Promise<void>) {
    await action(async () => {
      await work();
      await refresh();
    });
  }
  const wrongIds = contextIncorrectIds(runs, families);
  const selectedIds = new Set(selections.map((s) => s.familyId));
  const pools = {
    all: eligibleContextFamilies(families, settings.target),
    selected: eligibleContextFamilies(
      families.filter((f) => selectedIds.has(f.id)),
      settings.target,
    ),
    incorrect: eligibleContextFamilies(
      families.filter((f) => wrongIds.has(f.id)),
      settings.target,
    ),
  };
  async function generate(
    ids?: Set<string>,
    fresh = false,
    exclude: string[] = [],
  ) {
    setProgress({ done: 0, total: settings.count });
    const created = await generateContextRun(
      settings,
      (done, total) => setProgress({ done, total }),
      ids,
      fresh,
      exclude,
    );
    setRun(created);
  }
  async function choose(answer: string) {
    if (!run) return;
    await perform(async () => {
      setRun(await answerContext(run.id, run.index, answer));
    });
  }
  const summary = run ? contextSummary(run) : undefined;
  const history = runs.slice(historyPage * 10, historyPage * 10 + 10);
  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void perform(loading ? refresh : retry.current)}
            >
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {busy && progress.total > 0 && (
        <PracticeLoading title="Đang tạo câu ngữ cảnh">
          {progress.done}/{progress.total} câu đã kiểm tra. Lô hợp lệ được giữ
          trong cache nếu cần thử lại.
        </PracticeLoading>
      )}
      {loading ? (
        <PracticeLoading title="Đang đọc bài ngữ cảnh">
          Khôi phục lịch sử trên thiết bị…
        </PracticeLoading>
      ) : !run ? (
        <PracticePanel
          title="Word Formation in Context"
          description="Chọn đúng dạng từ theo ngữ cảnh. Gemini tạo câu; đáp án được chấm trực tiếp trên thiết bị."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              Nguồn từ
              <NativeSelect
                aria-label="Nguồn từ ngữ cảnh"
                disabled={busy}
                value={settings.source}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    source: contextSettingsSchema.shape.source.parse(
                      e.target.value,
                    ),
                  })
                }
              >
                <option value="all">All Words ({pools.all.length})</option>
                <option value="selected">
                  Selected Words ({pools.selected.length})
                </option>
                <option value="incorrect">
                  Previously Incorrect Words ({pools.incorrect.length})
                </option>
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-2">
              Số câu
              <NativeSelect
                aria-label="Số câu ngữ cảnh"
                disabled={busy}
                value={settings.count}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    count: contextSettingsSchema.shape.count.parse(
                      Number(e.target.value),
                    ),
                  })
                }
              >
                {[5, 10, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-2">
              Độ khó
              <NativeSelect
                aria-label="Độ khó ngữ cảnh"
                disabled={busy}
                value={settings.difficulty}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    difficulty: contextSettingsSchema.shape.difficulty.parse(
                      e.target.value,
                    ),
                  })
                }
              >
                {["B1", "B2", "C1", "Mixed"].map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-2">
              Từ loại mục tiêu
              <NativeSelect
                aria-label="Từ loại mục tiêu"
                disabled={busy}
                value={settings.target}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    target: contextSettingsSchema.shape.target.parse(
                      e.target.value,
                    ),
                  })
                }
              >
                <option value="all">All</option>
                {parts.map((p) => (
                  <option key={p} value={p}>
                    {labels[p]}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <p>
            Previously Incorrect Words chỉ dùng lỗi của bài ngữ cảnh. Nếu số câu
            lớn hơn số họ từ, mỗi họ từ sẽ có các câu ngữ cảnh khác nhau.
          </p>
          <p>
            {pools[settings.source].length} họ từ đủ điều kiện. Họ từ cần ít
            nhất hai từ loại có dạng từ phân biệt; dạng viết giống nhau ở nhiều
            từ loại được loại khỏi lựa chọn.
          </p>
          {pools[settings.source].length === 0 && (
            <p role="status">
              {settings.source === "selected"
                ? "Chưa có từ được chọn phù hợp. Hãy chọn từ trong Word Library hoặc đổi từ loại mục tiêu."
                : "Chưa có họ từ phù hợp trong nguồn này. Hãy đổi nguồn hoặc thêm từ."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !pools[settings.source].length}
              onClick={() => void perform(() => generate())}
            >
              Tạo bài ngữ cảnh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={openLibrary}
            >
              Mở Word Library
            </Button>
          </div>
        </PracticePanel>
      ) : run.completed && summary ? (
        <PracticePanel
          title="Kết quả Word Formation in Context"
          description="Thống kê riêng cho bài ngữ cảnh; không gộp vào Word Family Recall."
        >
          <p className="font-semibold tabular-nums">
            {summary.score}/{summary.total} điểm · {summary.accuracy}%
          </p>
          <div className="flex flex-wrap gap-3">
            {summary.byPart.map((p) => (
              <span key={p.part}>
                {labels[p.part]}: {p.score}/{p.total}
                {p.total
                  ? ` · ${Math.round((p.score / p.total) * 100)}%`
                  : " · —"}
              </span>
            ))}
          </div>
          <p>
            Họ từ cần luyện thêm:{" "}
            {[
              ...new Set(
                summary.incorrect.map((q) => q.item.family.data.meaning_vi),
              ),
            ].join("; ") || "Không có"}
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  setRun(await retryContext(run, false));
                })
              }
            >
              Practice Again
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !summary.incorrect.length}
              onClick={() =>
                void perform(async () => {
                  setRun(await retryContext(run, true));
                })
              }
            >
              Retry Incorrect Questions
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !summary.incorrect.length}
              aria-label="Generate New Questions from Incorrect Word Families"
              onClick={() =>
                void perform(async () => {
                  const ids = new Set(
                    summary.incorrect.map((q) => q.item.family.id),
                  );
                  setProgress({ done: 0, total: run.settings.count });
                  setRun(
                    await generateContextRun(
                      run.settings,
                      (done, total) => setProgress({ done, total }),
                      ids,
                      true,
                      run.questions.map((q) => q.item.question.sentence),
                    ),
                  );
                })
              }
            >
              Tạo câu mới từ họ từ sai
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSettings(run.settings);
                setRun(undefined);
              }}
            >
              Về thiết lập
            </Button>
          </div>

          {summary.incorrect.length ? (
            summary.incorrect.map((question, i) => (
              <div key={i} className="flex flex-col gap-3">
                <h3 className="font-semibold">
                  Câu sai {i + 1} · {question.item.family.data.meaning_vi}
                </h3>
                <p lang="en">{question.item.question.sentence}</p>
                <QuestionFeedback question={question} />
              </div>
            ))
          ) : (
            <p>Bạn đã trả lời đúng tất cả câu hỏi.</p>
          )}
        </PracticePanel>
      ) : q && run ? (
        <PracticePanel
          title={`Word Formation in Context · Câu ${run.index + 1}/${run.questions.length}`}
          description="Chọn bằng phím 1–4. Sau phản hồi, nhấn Enter để sang câu tiếp."
        >
          <Progress
            aria-label="Tiến độ bài ngữ cảnh"
            value={
              (run.questions.filter((q) => q.answer !== undefined).length /
                run.questions.length) *
              100
            }
          />
          <div
            className="flex flex-col gap-4"
            onKeyDown={(e) => {
              if (busy || e.altKey || e.ctrlKey || e.metaKey) return;
              if (q.answer === undefined && /^[1-4]$/.test(e.key)) {
                const answer = q.item.question.options[Number(e.key) - 1];
                if (answer) {
                  e.preventDefault();
                  void choose(answer);
                }
              }
            }}
          >
            <p lang="en" className="font-medium">
              {q.item.question.sentence}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {q.item.question.options.map((option, i) => (
                <Button
                  key={option}
                  type="button"
                  ref={i === 0 ? first : undefined}
                  variant="outline"
                  disabled={busy || q.answer !== undefined}
                  aria-label={`Lựa chọn ${i + 1}: ${option}`}
                  onClick={() => void choose(option)}
                >
                  <span lang="en">
                    {i + 1}. {option}
                  </span>
                </Button>
              ))}
            </div>
            {q.answer !== undefined && <QuestionFeedback question={q} />}
            <div className="flex flex-wrap gap-2">
              <Button
                ref={next}
                type="button"
                size="sm"
                disabled={busy || q.answer === undefined}
                onClick={() =>
                  void perform(async () => {
                    setRun(await nextContext(run.id));
                  })
                }
              >
                {run.index === run.questions.length - 1
                  ? "Xem kết quả ngữ cảnh"
                  : "Next Question"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setSettings(run.settings);
                  setRun(undefined);
                }}
              >
                Lưu và về thiết lập
              </Button>
            </div>
          </div>
        </PracticePanel>
      ) : null}
      {!loading && (
        <PracticePanel
          title="Lịch sử Word Formation in Context"
          description="Bài đang làm, câu đã chọn và phản hồi được lưu riêng trên thiết bị."
        >
          {!runs.length ? (
            <>
              <p>Chưa có bài ngữ cảnh. Tạo bài từ các từ đã chọn để bắt đầu.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openLibrary}
              >
                Chọn từ trong thư viện
              </Button>
            </>
          ) : (
            <>
              {history.map((item) => {
                const stats = contextSummary(item);
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <span>
                      {new Date(item.createdAt).toLocaleString("vi-VN")} ·{" "}
                      {item.settings.difficulty} ·{" "}
                      {item.completed
                        ? `${stats.score}/${stats.total} điểm`
                        : `${item.questions.filter((q) => q.answer !== undefined).length}/${item.questions.length} câu đã làm`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setRun(item)}
                    >
                      {item.completed
                        ? "Xem lại bài ngữ cảnh"
                        : "Tiếp tục bài ngữ cảnh"}
                    </Button>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={historyPage === 0}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  Trang trước
                </Button>
                <span>
                  Trang {historyPage + 1}/
                  {Math.max(1, Math.ceil(runs.length / 10))}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={(historyPage + 1) * 10 >= runs.length}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Trang sau
                </Button>
              </div>
            </>
          )}
        </PracticePanel>
      )}
    </div>
  );
}
