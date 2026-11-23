// Clock reads below are for due-date/expiry decisions and persisted review timestamps.
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { db } from "../../lib/db";
import { getReviewExercise, gradeReview } from "../../lib/writing/client";
import { mergePatterns } from "../../lib/writing/persistence";
import type {
  Assessment,
  Pattern,
  ReviewExercise,
  ReviewGrade,
  ReviewOutcome,
} from "../../lib/writing/schema";
import { categoryLabels } from "./AssessmentReport";
import { PracticePanel, PracticeLoading } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Badge } from "../reui/badge";
import { Alert, AlertDescription } from "../reui/alert";
const views = {
  daily: "Daily Review",
  mistakes: "My Mistakes",
  collocations: "Collocation Bank",
  mastered: "Mastered",
  progress: "Progress",
};
const levels = [
  "1 — Sửa lỗi",
  "2 — Dịch Việt → Anh",
  "3 — Chuyển sang ngữ cảnh mới",
  "4 — Viết tự do, không gợi ý",
];
export function WritingReview() {
  const [params, setParams] = useSearchParams();
  const view =
    (params.get("view") ?? "") in views ? params.get("view")! : "daily";
  const [patterns, setPatterns] = useState<Pattern[]>([]),
    [assessments, setAssessments] = useState<Assessment[]>([]),
    [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [exercise, setExercise] = useState<ReviewExercise>(),
    [result, setResult] = useState<ReviewGrade>();
  const lock = useRef(false);
  const selectedLevels = useRef<Record<string, number>>({});
  async function load() {
    setError("");
    try {
      const [p, a, o] = await Promise.all([
        db.writingPatterns.toArray(),
        db.writingAssessments.orderBy("createdAt").reverse().toArray(),
        db.writingOutcomes.toArray(),
      ]);
      setPatterns(p.filter((v) => v.status !== "merged"));
      setAssessments(a);
      setOutcomes(o);
      const id = params.get("exercise");
      if (id) {
        const cached = await db.writingExercises.get(id);
        if (!cached) throw Error("Không tìm thấy bài luyện đã lưu.");
        setExercise(cached);
        setResult(o.find((v) => v.exerciseId === id)?.result);
      }
      setLoaded(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không đọc được ngân hàng lỗi.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [params]);
  async function start(pattern: Pattern, level: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const e = await getReviewExercise(pattern, level);
      setExercise(e);
      setResult(undefined);
      setParams({ view, exercise: e.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa tạo được bài ôn.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function back() {
    setExercise(undefined);
    setResult(undefined);
    setParams({ view });
  }
  const due = patterns.filter((p) => p.dueAt <= Date.now());
  const reviewable = patterns.filter((p) => p.status !== "mastered");
  const rows =
    view === "daily"
      ? due
      : view === "collocations"
        ? patterns.filter((p) => p.category === "collocation")
        : view === "mastered"
          ? patterns.filter((p) => p.status === "mastered")
          : reviewable;
  return (
    <div className="writing-stack">
      <div className="heading">
        <h1>Writing Review</h1>
        <p>
          Ôn lại từ lỗi đã duyệt. Viết trong ngữ cảnh mới để ghi nhớ lâu dài.
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void load()}
            >
              Thử tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!loaded && !error && <PracticeLoading title="Đang đọc lịch ôn…" />}
      {busy && (
        <PracticeLoading title="Đang tạo bài ôn cá nhân…">
          Bài tập sẽ mở ngay tại đây.
        </PracticeLoading>
      )}
      {loaded && exercise ? (
        <ReviewWork
          key={exercise.id}
          exercise={exercise}
          result={result}
          onResult={async (value) => {
            setResult(value);
            await load();
          }}
          onBack={back}
        />
      ) : (
        loaded && (
          <>
            <div className="writing-review-summary">
              <span>{due.length} mẫu đến hạn</span>
              <span>
                {patterns.filter((p) => p.status === "mastered").length}{" "}
                mastered
              </span>
              <span>{outcomes.length} lượt ôn đã lưu</span>
            </div>
            <Tabs value={view} onValueChange={(v) => setParams({ view: v })}>
              <div className="writing-tabs-scroll">
                <TabsList aria-label="Writing Review sections">
                  {Object.entries(views).map(([id, label]) => (
                    <TabsTrigger key={id} value={id}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {Object.keys(views).map((id) => (
                <TabsContent key={id} value={id}>
                  {id === "progress" ? (
                    <PracticePanel title="Review progress">
                      <dl className="workspace-metrics">
                        <div>
                          <dt>Mẫu đang học</dt>
                          <dd>{reviewable.length}</dd>
                        </div>
                        <div>
                          <dt>Mastered</dt>
                          <dd>
                            {
                              patterns.filter((p) => p.status === "mastered")
                                .length
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>Lượt đúng</dt>
                          <dd>
                            {
                              outcomes.filter(
                                (o) => o.result.status === "correct",
                              ).length
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>Cần kiểm tra thêm</dt>
                          <dd>
                            {
                              outcomes.filter(
                                (o) => o.result.status === "needs_review",
                              ).length
                            }
                          </dd>
                        </div>
                      </dl>
                      <p>
                        Mastery cần ít nhất 3 ngữ cảnh độc lập ở Level 3–4,
                        trong ít nhất 2 ngày UTC khác nhau, có một bài Level 4
                        đạt yêu cầu. Câu nhớ máy móc chưa đủ.
                      </p>
                      <p>
                        Lịch ôn theo chuỗi 1, 3, 7, 14, 30, 60 ngày. Trả lời sai
                        quay lại 1 ngày; phản hồi chưa chắc chắn không thay đổi
                        mức học. Luyện trước hạn được lưu nhưng không tăng lịch ôn hay mastery.
                      </p>
                    </PracticePanel>
                  ) : (
                    <div className="writing-stack">
                      {!rows.length && (
                        <PracticePanel
                          title={
                            id === "daily"
                              ? "Hôm nay chưa có mẫu đến hạn"
                              : "Chưa có mẫu trong mục này"
                          }
                        >
                          <p>
                            {patterns.length
                              ? "Các mẫu chưa đến hạn vẫn có trong My Mistakes. Bạn có thể chủ động luyện thêm."
                              : "Chấm một bài viết và duyệt lỗi để bắt đầu lịch ôn cá nhân."}
                          </p>
                          <Button asChild>
                            <Link to="/writing-assessment">Chấm bài viết</Link>
                          </Button>
                        </PracticePanel>
                      )}
                      {rows
                        .sort((a, b) => a.dueAt - b.dueAt)
                        .map((pattern) => (
                          <PatternCard
                            key={pattern.id}
                            pattern={pattern}
                            all={patterns}
                            busy={busy}
                            selectedLevel={selectedLevels.current[pattern.id]}
                            onLevelChange={(level) => { selectedLevels.current[pattern.id] = level; }}
                            onStart={start}
                            onRefresh={load}
                          />
                        ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
            <PracticePanel title="Bài viết đã chấm">
              <Button asChild variant="outline">
                <Link to="/writing-assessment">Chấm bài viết mới</Link>
              </Button>
              {assessments.length ? (
                <div className="practice-history-list">
                  {assessments.map((a) => (
                    <Link key={a.id} to={`/writing-assessment?id=${a.id}`}>
                      <span>
                        {a.task === "task1" ? "Task 1" : "Task 2"} ·{" "}
                        {a.bandEstimate === null
                          ? "Chưa chắc chắn"
                          : `Band ${a.bandEstimate.toFixed(1)}`}{" "}
                        · {new Date(a.createdAt).toLocaleDateString("vi-VN")}
                      </span>
                      <small>
                        {
                          a.issues.filter(
                            (i) => i.status === "pending" && i.kind === "error",
                          ).length
                        }{" "}
                        lỗi chờ duyệt
                      </small>
                    </Link>
                  ))}
                </div>
              ) : (
                <p>Chưa có assessment nào được lưu.</p>
              )}
            </PracticePanel>
          </>
        )
      )}
    </div>
  );
}
function PatternCard({
  pattern,
  all,
  busy,
  onStart,
  onRefresh,
  selectedLevel,
  onLevelChange,
}: {
  pattern: Pattern;
  all: Pattern[];
  busy: boolean;
  selectedLevel?: number;
  onLevelChange: (level: number) => void;
  onStart: (p: Pattern, level: number) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [level, setLevel] = useState(selectedLevel ?? Math.min(pattern.streak + 1, 4)),
    [merge, setMerge] = useState(""),
    [error, setError] = useState("");
  return (
    <PracticePanel
      title={pattern.targetPattern}
      accessory={
        <Badge
          variant={pattern.status === "mastered" ? "success-light" : "outline"}
        >
          {pattern.status}
        </Badge>
      }
    >
      <div className="writing-row">
        <Badge variant="outline">{categoryLabels[pattern.category]}</Badge>
        <span className="muted">
          Ôn tiếp: {new Date(pattern.dueAt).toLocaleString("vi-VN")}
        </span>
      </div>
      <p>{pattern.explanationVi}</p>
      <details>
        <summary>
          {pattern.evidenceIds.length} ví dụ gốc · {pattern.essayIds.length} bài
          viết
        </summary>
        {pattern.originalExamples.map((original, i) => (
          <blockquote className="essay-text" key={i}>
            {original}
          </blockquote>
        ))}
        <p>Bản sửa tham khảo: {pattern.correction}</p>
        <p>Cách khác: {pattern.alternatives.join(" / ")}</p>
        {pattern.essayIds.map((id) => (
          <p key={id}>
            <Link to={`/writing-assessment?id=${id}`}>Mở bài viết nguồn</Link>
          </p>
        ))}
      </details>
      <label>
        Cấp độ bài ôn
        <NativeSelect
          aria-label={`Cấp độ ${pattern.id}`}
          value={level}
          disabled={busy}
          onChange={(e) => { const next = Number(e.target.value); setLevel(next); onLevelChange(next); }}
        >
          {levels.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button
        type="button"
        disabled={busy}
        onClick={() => void onStart(pattern, level)}
      >
        Luyện mẫu này
      </Button>
      {all.length > 1 && (
        <details>
          <summary>Gộp với mẫu cùng quy tắc</summary>
          <p>
            Chọn khi hai mục thực sự là cùng mẫu học. Giữ mọi ví dụ nguồn; đánh
            giá mastery sẽ bắt đầu lại.
          </p>
          <NativeSelect
            aria-label={`Gộp ${pattern.id}`}
            value={merge}
            disabled={busy}
            onChange={(e) => setMerge(e.target.value)}
          >
            <option value="">Chọn mẫu đích</option>
            {all
              .filter((p) => p.id !== pattern.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.targetPattern}
                </option>
              ))}
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            disabled={!merge || busy}
            onClick={() => {
              void mergePatterns(pattern.id, merge)
                .then(onRefresh)
                .catch((e) => setError(e.message));
            }}
          >
            Gộp mẫu
          </Button>
          {error && <p role="alert">{error}</p>}
        </details>
      )}
    </PracticePanel>
  );
}
function ReviewWork({
  exercise,
  result,
  onResult,
  onBack,
}: {
  exercise: ReviewExercise;
  result?: ReviewGrade;
  onResult: (r: ReviewGrade) => Promise<void>;
  onBack: () => void;
}) {
  const [answer, setAnswer] = useState(exercise.draftAnswer ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lock = useRef(false);

  const expired = exercise.expiresAt <= Date.now();
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await queue.current;
      const grade = await gradeReview(exercise, answer);
      await onResult(grade);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa chấm được bài ôn.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <PracticePanel
      title={
        exercise.level === 4
          ? "Viết tự do — Level 4"
          : `Bài ôn cá nhân — Level ${exercise.level}`
      }
    >
      <p>{exercise.promptVi}</p>
      {exercise.promptEn && <p>{exercise.promptEn}</p>}
      <p>{exercise.context}</p>
      <label>
        Câu trả lời tiếng Anh
        <Textarea
          aria-label="Câu trả lời ôn viết"
          className="field-sizing-fixed"
          rows={exercise.level === 4 ? 8 : 4}
          maxLength={8000}
          value={answer}
          disabled={busy || !!result}
          onChange={(e) => {
            const value = e.target.value;
            setAnswer(value);
            queue.current = queue.current
              .catch(() => undefined)
              .then(() =>
                db.writingExercises.update(exercise.id, { draftAnswer: value }),
              )
              .catch(() => setError("Chưa lưu được bản nháp."));
          }}
        />
      </label>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!result && (
        <Button
          type="button"
          disabled={busy || expired || !answer.trim()}
          onClick={() => void submit()}
        >
          {busy ? "AI đang chấm…" : "Chấm câu trả lời"}
        </Button>
      )}
      {busy && (
        <p role="status">
          Đang đối chiếu ngữ nghĩa và ngữ pháp; bài làm đã được giữ.
        </p>
      )}
      {expired && !result && (
        <p role="alert">
          Bài này đã hết thời hạn chấm. Quay lại ngân hàng để tạo bài ôn mới.
        </p>
      )}
      {result && (
        <section className="writing-stack" role="status">
          <h3>
            {result.status === "correct"
              ? "Đúng"
              : result.status === "incorrect"
                ? "Cần sửa"
                : "Cần xem lại — chưa tính sai"}
          </h3>
          <p>{result.feedbackVi}</p>
          <p>
            <strong>Bài gốc:</strong> {result.answer}
          </p>
          <p>
            <strong>Bản sửa / cách viết hợp lệ:</strong> {result.correction}
          </p>
          <p>Các cách khác: {result.alternatives.join(" / ")}</p>
          <details>
            <summary>Ví dụ tham khảo sau khi nộp</summary>
            {result.referenceAnswers.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </details>
          <p>
            {result.contextualEvidence && exercise.level >= 3
              ? "Bài này có bằng chứng dùng mẫu trong ngữ cảnh mới; mastery chỉ tăng ở lượt ôn đến hạn."
              : "Chưa có đủ bằng chứng chuyển mẫu sang ngữ cảnh mới để xét mastery."}
          </p>
        </section>
      )}
      <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
        Về Writing Review
      </Button>
    </PracticePanel>
  );
}
