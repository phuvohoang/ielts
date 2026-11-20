// Date.now() below preserves existing saved-run timestamps and server expiry checks.
// These C4 exceptions are data lifecycle logic, not render keys or animation.
import { NativeSelect } from "../ui/native-select";
import { Alert, AlertTitle, AlertDescription } from "../reui/alert";
import { Badge } from "../reui/badge";
import { PracticePanel, PracticeLoading } from "./PracticePanel";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../ui/button";
import { db } from "../../lib/db";
import {
  generatePractice,
  gradePractice,
  loadAudio,
} from "../../lib/practice/client";
import {
  practiceRecordSchema,
  type PracticeRecord,
  type Skill,
} from "../../lib/practice/schema";
export const skillNames = {
  listening: "Nghe",
  reading: "Đọc",
  writing: "Viết",
};
export function SkillPractice({ skill }: { skill: Skill }) {
  const [params] = useSearchParams();
  const [record, setRecord] = useState<PracticeRecord>();
  const [history, setHistory] = useState<PracticeRecord[]>([]);
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState("");
  const [error, setError] = useState(""),
    [audioError, setAudioError] = useState("");
  const [level, setLevel] = useState("B2"),
    [task, setTask] = useState("task1"),
    [focus, setFocus] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioLoading, setAudioLoading] = useState(false);
  const work = useRef<HTMLElement>(null),
    live = useRef<PracticeRecord | undefined>(undefined),
    lock = useRef(false);
  const audioRef = useRef("");
  useEffect(
    () => () => {
      live.current = undefined;
    },
    [],
  );
  function show(value: PracticeRecord | undefined) {
    live.current = value;
    setRecord(value);
  }
  async function refresh() {
    setHistory(
      await db.practiceRuns
        .orderBy("updatedAt")
        .reverse()
        .filter((r) => r.exercise.settings.skill === skill)
        .toArray(),
    );
  }
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError("");
    show(undefined);
    db.practiceRuns
      .orderBy("updatedAt")
      .reverse()
      .filter((r) => r.exercise.settings.skill === skill)
      .toArray()
      .then((rows) => {
        if (!active) return;
        setHistory(rows);
        const saved =
          rows.find((r) => r.id === params.get("id")) ??
          rows.find((r) => !r.result) ??
          rows[0];
        if (saved) show(practiceRecordSchema.parse(saved));
        setLoaded(true);
      })
      .catch(() =>
        setError("Không đọc được bài làm đã lưu. Hãy tải lại trang."),
      );
    return () => {
      active = false;
    };
  }, [skill, params]);
  async function audio(current: PracticeRecord) {
    setAudioError("");
    setAudioLoading(true);
    try {
      const blob = await loadAudio(current);
      if (live.current?.id !== current.id) return;
      if (audioRef.current) URL.revokeObjectURL(audioRef.current);
      const url = URL.createObjectURL(blob);
      audioRef.current = url;
      setAudioUrl(url);
    } catch (e) {
      if (live.current?.id === current.id)
        setAudioError(
          e instanceof Error ? e.message : "Chưa tạo được audio. Hãy thử lại.",
        );
    } finally {
      if (live.current?.id === current.id) setAudioLoading(false);
    }
  }
  useEffect(() => {
    setAudioUrl("");
    setAudioError("");
    setAudioLoading(false);
    if (record?.exercise.settings.skill === "listening") void audio(record);
    return () => {
      if (audioRef.current) {
        URL.revokeObjectURL(audioRef.current);
        audioRef.current = "";
      }
    };
    // A draft edit must never regenerate audio.
  }, [record?.id]);
  useEffect(() => {
    if (record)
      work.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [record?.id]);
  async function create() {
    if (lock.current) return;
    lock.current = true;
    setBusy("generate");
    setError("");
    try {
      const exercise = await generatePractice({
        skill,
        level,
        task,
        focus,
        recentTitles: history.slice(0, 12).map((r) => r.exercise.title),
      });
      if (exercise.settings.skill !== skill)
        throw Error("Dịch vụ trả về sai kỹ năng.");
      const next = practiceRecordSchema.parse({
        id: exercise.id,
        // Existing persistence timestamps identify saved runs; unrelated to UI rendering.
        date: Date.now(),
        updatedAt: Date.now(),
        exercise,
        answers: {},
        submitted: false,
      });
      await db.practiceRuns.put(next);
      show(next);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa tạo được bài luyện. Hãy thử lại.",
      );
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  function answer(key: string, value: string) {
    if (!live.current || live.current.submitted) return;
    const next = {
      ...live.current,
      answers: { ...live.current.answers, [key]: value },
      updatedAt: Date.now(),
    };
    show(next);
    void db.practiceRuns
      .put(next)
      .catch(() =>
        setError("Chưa lưu được bài làm. Kiểm tra dung lượng trình duyệt."),
      );
  }
  async function submit() {
    if (!live.current || lock.current) return;
    lock.current = true;
    setBusy("grade");
    setError("");
    const current = {
      ...live.current,
      answers: Object.fromEntries(
        Object.entries(live.current.answers).map(([k, v]) => [k, v.trim()]),
      ),
      submitted: true,
      updatedAt: Date.now(),
    };
    try {
      await db.practiceRuns.put(current);
      show(current);
      const result = await gradePractice(current);
      const next = { ...current, result, updatedAt: Date.now() };
      await db.practiceRuns.put(next);
      show(next);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI chưa chấm xong. Bài làm vẫn được giữ.",
      );
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  const exercise = record?.exercise,
    result = record?.result;
  const allAnswered =
    !!record &&
    (skill === "writing"
      ? !!record.answers.writing?.trim()
      : exercise!.questions.every((q) =>
          record.answers[String(q.number)]?.trim(),
        ));
  const words =
    record?.answers.writing?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const expired = !!exercise && exercise.expiresAt <= Date.now();
  return (
    <div className="practice-redesign">
      <div className="heading">
        <div className="eyebrow">IELTS GENERAL TRAINING · AI PRACTICE</div>
        <h1>Luyện {skillNames[skill].toLowerCase()}</h1>
        <p>
          {skill === "listening"
            ? "Nghe audio, trả lời câu hỏi và nhận phản hồi sau khi nộp."
            : skill === "reading"
              ? "Đọc một đoạn mới, trả lời câu hỏi và đối chiếu dẫn chứng."
              : "Viết theo đề mới và nhận góp ý cụ thể cho bài của bạn."}
        </p>
      </div>
      {!loaded && <PracticeLoading title="Đang đọc bài làm đã lưu…" />}
      {loaded && !record && (
        <PracticePanel className="practice-setup">
          <div className="builder-heading">
            <div>
              <span className="eyebrow">BẮT ĐẦU TẠI ĐÂY</span>
              <h2>Tạo bài luyện</h2>
              <p>Một đề mới, phù hợp với mục tiêu của bạn.</p>
            </div>
            <Badge variant="outline">{skillNames[skill]} · AI</Badge>
          </div>
          <div className="builder-controls">
            <label>
              Độ khó
              <NativeSelect
                aria-label="Độ khó"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                disabled={!!busy}
              >
                {["A2", "B1", "B2", "C1"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </NativeSelect>
            </label>
            {skill === "writing" && (
              <label>
                Dạng bài
                <NativeSelect
                  aria-label="Dạng bài"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  disabled={!!busy}
                >
                  <option value="task1">Task 1 · Thư (150+ từ)</option>
                  <option value="task2">Task 2 · Bài luận (250+ từ)</option>
                </NativeSelect>
              </label>
            )}
            <label>
              Chủ đề (tuỳ chọn)
              <input
                aria-label="Chủ đề"
                value={focus}
                maxLength={120}
                onChange={(e) => setFocus(e.target.value)}
                disabled={!!busy}
                placeholder="Công việc, đi lại, cộng đồng…"
              />
            </label>
          </div>
          <Button type="button" onClick={() => void create()} disabled={!!busy}>
            {busy ? "Đang tạo bài tập…" : "Tạo bài bằng AI"}
          </Button>
        </PracticePanel>
      )}
      {busy === "generate" && (
        <PracticeLoading title="Đang chuẩn bị bài tập…">
          AI đang tạo nội dung. Bài tập sẽ hiện tại đây.
        </PracticeLoading>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Chưa thể hoàn tất</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {record && exercise && (
        <>
          <div className="practice-toolbar">
            <span>
              {exercise.settings.level} ·{" "}
              {skill === "writing"
                ? exercise.settings.task === "task1"
                  ? "Task 1 · Thư"
                  : "Task 2 · Bài luận"
                : "5 câu hỏi"}{" "}
              · Tự động lưu
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => {
                show(undefined);
                setError("");
              }}
            >
              Tạo bài luyện mới
            </Button>
          </div>
          <section
            ref={work}
            className={`skill-workspace ${skill === "writing" ? "writing-workspace" : ""}`}
            aria-label="Bài tập hiện tại"
          >
            <PracticePanel className="skill-source">
              <Badge variant="outline">
                {skillNames[skill]} · {exercise.settings.level}
              </Badge>
              <h2>{exercise.title}</h2>
              <p>{exercise.instructionsVi}</p>
              {skill === "reading" && (
                <div className="reading-passage">
                  {exercise.passage.split(/\n\s*\n/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
              {skill === "writing" && (
                <>
                  <div className="writing-prompt">{exercise.writingPrompt}</div>
                  <p className="muted">
                    Ít nhất {exercise.minWords} từ ·{" "}
                    {exercise.settings.task === "task1"
                      ? "Khoảng 20 phút"
                      : "Khoảng 40 phút"}
                  </p>
                </>
              )}
              {skill === "listening" && (
                <>
                  {audioLoading && <p role="status">Đang tạo audio AI…</p>}
                  {audioUrl && (
                    <audio
                      controls
                      src={audioUrl}
                      aria-label="Audio bài nghe"
                      preload="metadata"
                      onError={() =>
                        setAudioError(
                          "Không phát được audio. Hãy tải lại âm thanh.",
                        )
                      }
                    />
                  )}
                  {audioError && (
                    <div role="alert">
                      <p>{audioError}</p>
                      <Button
                        type="button"
                        disabled={audioLoading}
                        variant="outline"
                        onClick={() => void audio(record)}
                      >
                        Thử tải audio lại
                      </Button>
                    </div>
                  )}
                  <p className="muted">
                    Audio được tạo bằng AI. Transcript chỉ mở sau khi nộp bài.
                    Bạn có thể nghe lại để luyện tập.
                  </p>
                </>
              )}
              {result?.transcript && (
                <details className="transcript">
                  <summary>Transcript và đối chiếu</summary>
                  <p>{result.transcript}</p>
                </details>
              )}
            </PracticePanel>
            <PracticePanel className="skill-answers">
              <form
                className="skill-answer-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <h2>
                  {skill === "writing"
                    ? "Bài viết của bạn"
                    : "Câu trả lời của bạn"}
                </h2>
                {skill === "writing" ? (
                  <>
                    <label htmlFor="writing-answer">Viết bằng tiếng Anh</label>
                    <textarea
                      id="writing-answer"
                      rows={18}
                      value={record.answers.writing ?? ""}
                      maxLength={8000}
                      disabled={record.submitted || !!busy}
                      onChange={(e) => answer("writing", e.target.value)}
                      placeholder="Start writing here…"
                    />
                    <p aria-live="polite">
                      {words} từ / tối thiểu {exercise.minWords}
                    </p>
                  </>
                ) : (
                  exercise.questions.map((q) => (
                    <fieldset
                      className="comprehension-question"
                      key={q.number}
                      disabled={record.submitted || !!busy}
                    >
                      <legend>
                        {q.number}. {q.prompt}
                      </legend>
                      {q.type === "multiple_choice" ? (
                        q.options.map((o) => (
                          <label className="answer-choice" key={o.id}>
                            <input
                              type="radio"
                              name={`question-${q.number}`}
                              value={o.id}
                              checked={record.answers[q.number] === o.id}
                              onChange={() => answer(String(q.number), o.id)}
                            />
                            {o.text}
                          </label>
                        ))
                      ) : q.type === "true_false_not_given" ? (
                        <NativeSelect
                          aria-label={`Câu ${q.number}`}
                          value={record.answers[q.number] ?? ""}
                          onChange={(e) =>
                            answer(String(q.number), e.target.value)
                          }
                        >
                          <option value="">Chọn câu trả lời</option>
                          {["TRUE", "FALSE", "NOT GIVEN"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <>
                          <label
                            className="muted"
                            htmlFor={`answer-${q.number}`}
                          >
                            Không quá {q.wordLimit} từ
                          </label>
                          <input
                            id={`answer-${q.number}`}
                            aria-label={`Câu ${q.number}`}
                            autoComplete="off"
                            value={record.answers[q.number] ?? ""}
                            maxLength={300}
                            onChange={(e) =>
                              answer(String(q.number), e.target.value)
                            }
                          />
                        </>
                      )}
                    </fieldset>
                  ))
                )}
                {!result && (
                  <Button
                    type="submit"
                    disabled={
                      !!busy ||
                      !allAnswered ||
                      expired ||
                      (skill === "listening" && !audioUrl)
                    }
                  >
                    {busy === "grade"
                      ? "AI đang chấm…"
                      : record.submitted
                        ? "Thử chấm lại bài đã nộp"
                        : "Nộp bài và chấm bằng AI"}
                  </Button>
                )}
                {expired && !result && (
                  <p role="alert">
                    Bài đã hết thời hạn chấm. Nội dung và bài làm đã lưu vẫn
                    được giữ.
                  </p>
                )}
                {busy === "grade" && (
                  <p role="status">
                    Đang đối chiếu bài làm. Bạn không cần nhập lại câu trả lời.
                  </p>
                )}
              </form>
            </PracticePanel>
          </section>
          {result && (
            <PracticePanel
              className="skill-feedback"
              aria-label="Kết quả chấm AI"
            >
              <Badge variant="success-light">Đã chấm bài</Badge>
              <div className="eyebrow">PHẢN HỒI SAU KHI NỘP</div>
              <h2>
                {skill === "writing"
                  ? result.bandEstimate === null
                    ? "Bài viết cần xem lại"
                    : `Band ước lượng: ${result.bandEstimate.toFixed(1)}`
                  : `Kết quả: ${result.score}/${result.maxScore}`}
              </h2>
              {skill !== "writing" && (
                <p>
                  Điểm của bài luyện ngắn, không quy đổi thành IELTS band. Câu
                  AI chưa chắc chắn được để riêng, không tính sai.
                </p>
              )}
              {result.items.map((item) => {
                const reveal = result.reveals.find(
                  (q) => q.number === item.number,
                );
                return (
                  <div className="answer-feedback" key={item.number}>
                    <h3>
                      Câu {item.number} ·{" "}
                      {item.status === "correct"
                        ? "Đúng"
                        : item.status === "incorrect"
                          ? "Chưa đúng"
                          : "Cần xem lại"}
                    </h3>
                    <p>{item.feedbackVi}</p>
                    {reveal && (
                      <>
                        <p>
                          <strong>Đáp án tham khảo:</strong>{" "}
                          {reveal.answers
                            .map(
                              (a) =>
                                reveal.options.find((o) => o.id === a)?.text ??
                                a,
                            )
                            .join(" / ")}
                        </p>
                        {reveal.evidence && (
                          <blockquote>{reveal.evidence}</blockquote>
                        )}
                        <p>{reveal.explanationVi}</p>
                      </>
                    )}
                  </div>
                );
              })}
              {result.writing && (
                <>
                  <p>
                    Ước lượng luyện tập bằng AI, không phải điểm IELTS chính
                    thức.
                  </p>
                  <div className="writing-scores">
                    {[
                      [
                        "Task Achievement / Response",
                        result.writing.taskResponse,
                      ],
                      ["Coherence & Cohesion", result.writing.coherence],
                      ["Lexical Resource", result.writing.vocabulary],
                      ["Grammar", result.writing.grammar],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                  <p>{result.writing.feedbackVi}</p>
                  <h3>Điểm làm tốt</h3>
                  <ul>
                    {result.writing.strengthsVi.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <h3>Ưu tiên cải thiện</h3>
                  <ul>
                    {result.writing.improvementsVi.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  {result.writing.corrections.map((c, i) => (
                    <div className="answer-feedback" key={i}>
                      <p>
                        <del>{c.original}</del> → <strong>{c.corrected}</strong>
                      </p>
                      <p>{c.reasonVi}</p>
                    </div>
                  ))}
                </>
              )}
            </PracticePanel>
          )}
        </>
      )}
      {history.length > 0 && (
        <details className="panel practice-history">
          <summary>
            Bài {skillNames[skill].toLowerCase()} đã lưu ({history.length})
          </summary>
          <div className="practice-history-list">
            {history.map((r) => (
              <button
                key={r.id}
                disabled={!!busy}
                onClick={() => {
                  show(r);
                  setError("");
                }}
              >
                <span>{r.exercise.title}</span>
                <small>
                  {new Date(r.date).toLocaleDateString("vi-VN")} ·{" "}
                  {r.result ? "Đã chấm" : r.submitted ? "Chờ chấm" : "Đang làm"}
                </small>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
