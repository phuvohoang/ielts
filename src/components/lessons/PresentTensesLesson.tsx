import { Skeleton } from "../ui/skeleton";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { guidedLesson as lesson } from "../../lib/guided-lesson";
import {
  gradeGuided,
  readGuidedDrafts,
  readGuidedResults,
  writeGuidedDrafts,
} from "../../lib/guided-practice";
import type { GradeResult } from "../../lib/ai/schema";
import { PracticePanel, PracticeLoading } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { Textarea } from "../ui/textarea";
import { Badge } from "../reui/badge";
import { Alert, AlertDescription } from "../reui/alert";
const statuses = {
  correct: "Đúng",
  partially_correct: "Đúng một phần",
  incorrect: "Cần sửa",
  needs_review: "Cần xem lại",
};
export function PresentTensesLesson() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, GradeResult>>({});
  const [index, setIndex] = useState(0),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const practice = useRef<HTMLDivElement>(null);
  const q = lesson.questions[index],
    answer = drafts[q.id] || "";
  const result =
    results[q.id]?.userAnswer === answer.trim() ? results[q.id] : undefined;
  async function load() {
    setError("");
    try {
      const saved = readGuidedDrafts();
      const reports = await readGuidedResults();
      setDrafts(saved);
      setResults(reports);
      setLoaded(true);
    } catch {
      setError(
        "Chưa đọc được bài làm trên thiết bị. Hãy thử lại; dữ liệu cũ chưa bị xóa.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function change(value: string) {
    const next = { ...drafts, [q.id]: value };
    setDrafts(next);
    try {
      writeGuidedDrafts(next);
      setError("");
    } catch {
      setError(
        "Chưa lưu được bản nháp. Giữ trang này và thử lại trước khi rời đi.",
      );
    }
  }
  async function submit() {
    if (lock.current || !answer.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      writeGuidedDrafts(drafts);
      const report = await gradeGuided(q.id, answer);
      setResults((old) => ({ ...old, [q.id]: report }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa chấm được. Bản nháp vẫn được giữ.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function select(i: number) {
    setIndex(i);
  }
  const completed = lesson.questions.filter((q) => results[q.id]).length;
  const correct = lesson.questions.filter(
    (q) => results[q.id]?.status === "correct",
  ).length;
  return (
    <div className="flex min-w-0 flex-col gap-6 text-sm">
      <div className="heading">
        <div className="eyebrow">GRAMMAR · BÀI MẪU G01</div>
        <h1>{lesson.title}</h1>
        <p>{lesson.subtitle}</p>
        <Link to="/grammar">← Về luyện Ngữ pháp</Link>
      </div>
      <PracticePanel
        title="Bạn sẽ làm được gì?"
        description={`${lesson.level} · ${lesson.duration}`}
      >
        <ul className="list-disc pl-5">
          {lesson.objectives.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p role="status">
          Đã luyện {completed}/25 câu · {correct} câu đúng. Đây là tiến độ luyện
          tập, không phải chứng nhận mastery hay điểm IELTS.
        </p>
        <p className="text-muted-foreground">
          Bản nháp lưu trên thiết bị này. Bài tự viết dùng AI cần kết nối; bạn
          vẫn có thể học lý thuyết và tự đối chiếu toàn bộ đáp án.
        </p>
      </PracticePanel>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                try {
                  if (!loaded) {
                    void load();
                    return;
                  }
                  writeGuidedDrafts(drafts);
                  setError("");
                } catch {
                  setError(
                    "Thiết bị chưa cho phép lưu bản nháp. Hãy sao chép bài làm trước khi rời trang.",
                  );
                }
              }}
            >
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <PracticePanel
        title="Lý thuyết và ví dụ"
        description="Đọc ý nghĩa trước, rồi mới chọn cấu trúc."
      >
        {lesson.sections.map((section, i) => (
          <details key={section.title} open={i === 0}>
            <summary className="font-semibold">{section.title}</summary>
            <div className="flex flex-col gap-4">
              {section.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {section.examples.map(([example, explanation]) => (
                <div key={example} className="flex flex-col gap-1">
                  <p lang="en" className="font-medium">
                    {example}
                  </p>
                  <p className="text-muted-foreground">{explanation}</p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </PracticePanel>
      {!loaded ? (
        <PracticeLoading title="Đang khôi phục bài làm">
          Đọc tiến độ và bản nháp…
        </PracticeLoading>
      ) : (
        <PracticePanel
          ref={practice}
          title="25 bài tập nguyên bản"
          description="Từ nhận biết cấu trúc đến tự viết thư."
          aria-label="Bài tập G01"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              Chọn câu
              <NativeSelect
                aria-label="Chọn câu G01"
                size="sm"
                value={index}
                disabled={busy}
                onChange={(e) => select(Number(e.target.value))}
              >
                {lesson.questions.map((item, i) => (
                  <option key={item.id} value={i}>
                    Câu {i + 1} · {item.stage}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <span>Câu {index + 1}/25</span>
          </div>
          <h3 className="font-semibold tracking-tight">
            {q.stage} · Câu {index + 1}
          </h3>
          <p lang="en">{q.instruction}</p>
          <p lang="en" className="whitespace-pre-wrap">
            {q.prompt}
          </p>
          {q.kind === "choice" ? (
            <fieldset disabled={busy}>
              <legend>Chọn một đáp án</legend>
              <div className="flex flex-col gap-2">
                {q.choices.map((choice, i) => (
                  <label key={choice} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answer === choice}
                      onChange={() => change(choice)}
                    />
                    {String.fromCharCode(65 + i)}.{" "}
                    <span lang="en">{choice}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label className="flex flex-col gap-2">
              Câu trả lời của bạn
              <Textarea
                aria-label="Câu trả lời G01"
                disabled={busy}
                maxLength={3000}
                value={answer}
                onChange={(e) => change(e.target.value)}
              />
              {(q.kind === "writing" || q.kind === "guided") && (
                <span className="text-xs text-muted-foreground">
                  {answer.trim() ? answer.trim().split(/\s+/).length : 0} từ
                </span>
              )}
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={
                busy ||
                !answer.trim() ||
                (!!result && result.status !== "needs_review")
              }
              onClick={() => void submit()}
            >
              {busy ? "Đang chấm…" : "Chấm câu trả lời"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || index === 0}
              onClick={() => select(index - 1)}
            >
              Câu trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || index === 24}
              onClick={() => select(index + 1)}
            >
              Câu tiếp
            </Button>
          </div>
          {busy && (
            <div role="status" className="flex flex-col gap-3">
              <p>
                AI đang đánh giá nghĩa và cách dùng; không cần giống hệt đáp án
                tham khảo.
              </p>
              <Skeleton className="h-16 w-full motion-reduce:animate-none" />
            </div>
          )}
          {result && (
            <div role="status" className="flex flex-col gap-2">
              <Badge
                variant={
                  result.status === "correct"
                    ? "success-light"
                    : result.status === "needs_review"
                      ? "warning-light"
                      : "destructive-light"
                }
              >
                {statuses[result.status]}
              </Badge>
              <p>{result.feedbackVi}</p>
              <p>{result.explanationVi}</p>
              <p lang="en">{result.correctedAnswer}</p>
            </div>
          )}
          <details>
            <summary>Đáp án và giải thích câu này</summary>
            <div className="flex flex-col gap-3">
              <p lang="en" className="whitespace-pre-wrap">
                {q.answers.join("\n\nhoặc / or\n\n")}
              </p>
              <p>{q.explanationVi}</p>
              {["translation", "guided", "writing"].includes(q.kind) && (
                <p>
                  Đây là các đáp án minh họa. Câu đúng ngữ pháp, giữ đúng ý và
                  đáp ứng yêu cầu vẫn được chấp nhận dù cách viết khác.
                </p>
              )}
            </div>
          </details>
        </PracticePanel>
      )}
      <PracticePanel
        title="Ứng dụng Writing General"
        description="Giải thích lịch thường lệ, thay đổi tạm thời và đưa ra đề nghị."
      >
        <ul className="list-disc pl-5">
          {lesson.writingRubric.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!loaded || busy}
          onClick={() => {
            select(24);
            practice.current?.scrollIntoView({ block: "start" });
          }}
        >
          Làm bài thư Task 1
        </Button>
        <details>
          <summary>Danh sách tự kiểm tra trước khi nộp</summary>
          <ul className="list-disc pl-5">
            {lesson.reviewChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      </PracticePanel>
      <PracticePanel
        title="Đáp án của 25 câu"
        description="Mỗi câu có lý do; đáp án mở không giới hạn ở một chuỗi mẫu."
      >
        {lesson.questions.map((item, i) => (
          <details key={item.id}>
            <summary>
              Câu {i + 1} · {item.stage}
            </summary>
            <div className="flex flex-col gap-3">
              <p lang="en">{item.prompt}</p>
              <p lang="en" className="whitespace-pre-wrap">
                {item.answers.join("\n\nhoặc / or\n\n")}
              </p>
              <p>{item.explanationVi}</p>
            </div>
          </details>
        ))}
      </PracticePanel>
      <PracticePanel title="Luyện thêm theo bài này">
        <p>
          Gemini tạo bài bổ sung chỉ từ mục tiêu và các quy tắc của G01. Câu hỏi
          cần qua kiểm tra; khác đáp án mẫu không tự động là sai.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/grammar?lesson=g01-present-tenses">
            Mở luyện bổ sung với Gemini
          </Link>
        </Button>
      </PracticePanel>
      <p className="text-xs text-muted-foreground">
        Biên soạn nguyên bản cho IELTS General, tham khảo Grammar for IELTS —
        Unit 1; cách học từ/cụm từ tham khảo hai sách Vocabulary và
        Collocations. Chưa phải toàn bộ chương trình đã được duyệt.
      </p>
    </div>
  );
}
