// Clock reads below are for persisted session expiry and review due dates.
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { db } from "../../lib/db";
import { books, knowledge, unit } from "../../lib/curriculum/catalog";
import {
  curriculumProgressSchema,
  curriculumRunSchema,
} from "../../lib/curriculum/schema";
import {
  generateLesson,
  gradeLesson,
  saveLessonAnswer,
} from "../../lib/curriculum/client";
import { PracticePanel, PracticeLoading } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { Textarea } from "../ui/textarea";
import { Badge } from "../reui/badge";
import { Alert, AlertDescription } from "../reui/alert";
const formatLabels: Record<string, string> = {
  multiple_choice: "Chọn đáp án",
  fill_blank: "Điền chỗ trống",
  error_correction: "Sửa lỗi",
  sentence_transformation: "Chuyển đổi câu",
  paraphrasing: "Diễn đạt lại",
  translation: "Dịch Việt → Anh",
  guided_writing: "Viết có hướng dẫn",
  free_writing: "Viết tự do",
};
type Run = z.infer<typeof curriculumRunSchema>;
type Progress = z.infer<typeof curriculumProgressSchema>;
export function Curriculum() {
  const [params] = useSearchParams();
  const [book, setBook] = useState("grammar-ielts"),
    [topic, setTopic] = useState(params.get("pattern") || "all"),
    [difficulty, setDifficulty] = useState("all"),
    [skill, setSkill] = useState("all"),
    [weakOnly, setWeakOnly] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]),
    [weakIds, setWeakIds] = useState<string[]>([]),
    [run, setRun] = useState<Run>(),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function load() {
    setError("");
    try {
      const [p, runs, mistakes] = await Promise.all([
        db.curriculumProgress.toArray(),
        db.curriculumRuns.orderBy("updatedAt").reverse().toArray(),
        db.writingPatterns.toArray(),
      ]);
      setProgress(p);
      setRun(runs[0]);
      setWeakIds(
        knowledge
          .filter(
            (k) =>
              k.kind === "grammar" &&
              mistakes.some(
                (m) =>
                  m.status !== "merged" &&
                  m.status !== "mastered" &&
                  k.ruleIds.includes(m.ruleId),
              ),
          )
          .map((k) => k.id),
      );
      setLoaded(true);
    } catch {
      setError("Không đọc được dữ liệu bài học. Hãy thử lại.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const visible = knowledge.filter(
    (k) =>
      k.unitId === unit.id &&
      book === unit.bookId &&
      (topic === "all" || topic === k.id) &&
      (difficulty === "all" || k.cefr === difficulty) &&
      (skill === "all" || k.skills.some((s) => s === skill)) &&
      (!weakOnly ||
        weakIds.includes(k.id) ||
        progress.some((p) => p.id === k.id && p.incorrect > 0)),
  );
  async function generate() {
    if (lock.current || !visible.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setRun(
        await generateLesson(
          unit.id,
          visible.map((k) => k.id),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được bài luyện.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit(questionId: string) {
    if (!run || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await gradeLesson(run, questionId, run.answers[questionId] || "");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa chấm được câu trả lời.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function answer(questionId: string, value: string) {
    if (!run) return;
    setRun({ ...run, answers: { ...run.answers, [questionId]: value } });
    try {
      await saveLessonAnswer(run.id, questionId, value);
    } catch {
      setError("Chưa lưu được câu trả lời. Giữ trang này và thử lại.");
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-6 text-sm">
      <div className="flex flex-col gap-1">
        <h1>Books & Curriculum</h1>
        <p className="text-muted-foreground">
          Học theo nguồn đã đối chiếu. Ví dụ và bài tập được biên soạn riêng.
        </p>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void load()}
            >
              Thử lại đọc dữ liệu
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <PracticePanel
        title="Chọn bài học"
        description="Bản thử nghiệm: một unit đã xác minh; CEFR là mức biên soạn của ứng dụng."
      >
        <div className="flex flex-wrap gap-4">
          <label className="flex min-w-0 flex-col gap-1">
            Sách
            <NativeSelect
              aria-label="Sách"
              size="sm"
              value={book}
              onChange={(e) => setBook(e.target.value)}
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1">
            Chủ đề
            <NativeSelect
              aria-label="Chủ đề"
              size="sm"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="all">Tất cả chủ đề</option>
              {knowledge.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1">
            CEFR
            <NativeSelect
              aria-label="CEFR"
              size="sm"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="all">Tất cả mức</option>
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1">
            Kỹ năng
            <NativeSelect
              aria-label="Kỹ năng"
              size="sm"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
            >
              <option value="all">Tất cả kỹ năng</option>
              <option value="writing">Writing</option>
              <option value="reading">Reading</option>
              <option value="listening">Listening</option>
              <option value="speaking">Speaking</option>
            </NativeSelect>
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={weakOnly}
            onClick={() => setWeakOnly(!weakOnly)}
          >
            {weakOnly ? "Hiện tất cả" : "Điểm yếu của tôi"}
          </Button>
        </div>
        <p>{books.find((b) => b.id === book)?.status}</p>
      </PracticePanel>
      {!loaded ? (
        <PracticeLoading title="Đang đọc bài học">
          Khôi phục tiến độ trên thiết bị…
        </PracticeLoading>
      ) : !visible.length ? (
        <PracticePanel title="Chưa có bài đã xác minh">
          <p>
            Sách hoặc lựa chọn này chưa có nội dung đủ điều kiện. Các trang
            thiếu text cần OCR và đối chiếu trước khi mở bài học.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setBook(unit.bookId);
              setTopic("all");
              setDifficulty("all");
              setSkill("all");
              setWeakOnly(false);
            }}
          >
            Mở Unit 1 Grammar
          </Button>
        </PracticePanel>
      ) : (
        <>
          <PracticePanel
            title={`Unit 1 · ${unit.title}`}
            description="Hiện tại đơn · Hiện tại tiếp diễn · Động từ trạng thái"
          >
            {visible.map((k) => {
              const p = progress.find((p) => p.id === k.id);
              return (
                <section key={k.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold tracking-tight">{k.title}</h3>
                    <Badge variant="success-light">Đã đối chiếu</Badge>
                    <span>{k.cefr}</span>
                  </div>
                  <p>{k.explanationVi}</p>
                  <ul className="list-disc pl-5">
                    {k.objectivesVi.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                  {k.examples.map((v) => (
                    <p lang="en" key={v}>
                      {v}
                    </p>
                  ))}
                  <details>
                    <summary>Lỗi thường gặp và cách diễn đạt khác</summary>
                    <ul className="list-disc pl-5">
                      {[...k.commonMistakesVi, ...k.alternatives].map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </details>
                  <p className="text-xs text-muted-foreground">
                    Nguồn: PDF trang {k.sources[0].pdfPages.join(", ")} · trang
                    in {k.sources[0].printedPages} · đối chiếu{" "}
                    {k.sources[0].reviewedOn}.
                  </p>
                  <p className="text-xs">
                    {p
                      ? `${p.correct} câu đúng · ${p.incorrect} cần luyện lại · Ôn tiếp: ${new Date(p.dueAt).toLocaleDateString("vi-VN")}`
                      : "Chưa có tiến độ. Làm bài luyện đầu tiên để bắt đầu lịch ôn."}
                  </p>
                </section>
              );
            })}
            <Button
              type="button"
              size="sm"
              disabled={busy || !loaded}
              onClick={() => void generate()}
            >
              Tạo 10 câu mới với Gemini
            </Button>
            <p className="text-xs text-muted-foreground">
              Câu hỏi phải qua kiểm tra cấu trúc và một lượt AI kiểm định riêng.
              Đáp án chỉ mở sau khi nộp.
            </p>
          </PracticePanel>
        </>
      )}
      {busy && (
        <PracticeLoading title="Đang xử lý bài luyện">
          Đang tạo, kiểm định hoặc chấm câu trả lời. Bạn có thể giữ nguyên
          trang.
        </PracticeLoading>
      )}
      {run && (
        <PracticePanel
          title="Bài luyện đã lưu"
          description={`${Object.keys(run.results).length}/10 câu đã chấm · ${run.patternIds.map((id) => knowledge.find((k) => k.id === id)?.title || "Bài học đã lưu").join(" · ")}`}
        >
          {run.expiresAt <= Date.now() && (
            <Alert role="status">
              <AlertDescription>
                Bộ này đã hết hạn chấm. Câu trả lời và kết quả vẫn được giữ; tạo
                bộ mới ở bài học.
              </AlertDescription>
            </Alert>
          )}
          {run.questions.map((q, i) => {
            const result = run.results[q.id];
            return (
              <section key={q.id} className="flex min-w-0 flex-col gap-3">
                <h3 className="font-semibold tracking-tight">
                  Câu {i + 1} · {formatLabels[q.format] || q.format}
                </h3>
                <p>{q.instructions}</p>
                <p
                  className="whitespace-pre-wrap"
                  lang={q.format === "translation" ? "vi" : "en"}
                >
                  {q.question}
                </p>
                {q.options.length ? (
                  <fieldset disabled={busy || !!result}>
                    <legend>Chọn một đáp án</legend>
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((option, n) => (
                        <label className="flex items-center gap-2" key={option}>
                          <input
                            type="radio"
                            name={q.id}
                            checked={run.answers[q.id] === option}
                            onChange={() => void answer(q.id, option)}
                          />
                          {String.fromCharCode(65 + n)}. {option}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <label className="flex flex-col gap-1">
                    Câu trả lời {i + 1}
                    <Textarea
                      aria-label={`Câu trả lời ${i + 1}`}
                      maxLength={8000}
                      value={run.answers[q.id] || ""}
                      disabled={busy || !!result}
                      onChange={(e) => void answer(q.id, e.target.value)}
                    />
                  </label>
                )}
                {!result && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      busy ||
                      !run.answers[q.id]?.trim() ||
                      run.expiresAt <= Date.now()
                    }
                    onClick={() => void submit(q.id)}
                  >
                    Chấm câu {i + 1}
                  </Button>
                )}
                {result && (
                  <div role="status" className="flex flex-col gap-2">
                    <Badge
                      variant={
                        result.status === "correct"
                          ? "success-light"
                          : result.status === "incorrect"
                            ? "destructive-light"
                            : "warning-light"
                      }
                    >
                      {result.status === "correct"
                        ? "Đúng"
                        : result.status === "incorrect"
                          ? "Cần sửa"
                          : "Cần xem lại"}
                    </Badge>
                    <p>{result.feedbackVi}</p>
                    <p>Ví dụ đáp án: {result.expectedAnswer}</p>
                    {result.acceptedAlternatives.length > 0 && (
                      <p>
                        Cách khác: {result.acceptedAlternatives.join(" / ")}
                      </p>
                    )}
                    <p>{result.explanationVi}</p>
                    {!result.demonstratesPattern && (
                      <p>Kết quả này chưa cung cấp bằng chứng nắm vững mẫu.</p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </PracticePanel>
      )}
      <p>
        <Link to="/writing-review">Mở Writing Review</Link> để xem bằng chứng
        lỗi và lịch ôn theo ngữ cảnh.
      </p>
    </div>
  );
}
