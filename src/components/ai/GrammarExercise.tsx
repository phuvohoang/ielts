import { useEffect, useRef, useState } from "react";
import { diffWordsWithSpace } from "diff";
import { b2Exercises, mixedB2Exercises } from "../../lib/ai/content";
import { gradeExercise } from "../../lib/ai/client";
import {
  summary,
  type GradeResult,
  type AIExerciseAttempt,
} from "../../lib/ai/schema";
import { db } from "../../lib/db";
import { Button } from "../ui/button";
const labels = {
  correct: "Correct",
  partially_correct: "Partially correct",
  incorrect: "Incorrect",
  needs_review: "Needs review",
};
function CorrectionDiff({
  answer,
  correction,
}: {
  answer: string;
  correction: string;
}) {
  return (
    <p className="answer-diff" aria-label="Answer correction">
      {diffWordsWithSpace(answer, correction).map((part, i) =>
        part.removed ? (
          <del key={i}>
            <span className="sr-only">Removed: </span>
            {part.value}
          </del>
        ) : part.added ? (
          <ins key={i}>
            <span className="sr-only">Added: </span>
            {part.value}
          </ins>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}
export function GrammarExercise() {
  const [history, setHistory] = useState<AIExerciseAttempt[]>([]),
    [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0),
    [answer, setAnswer] = useState(""),
    [result, setResult] = useState<GradeResult>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [learned, setLearned] = useState(false),
    [done, setDone] = useState(false),
    [retryIds, setRetryIds] = useState<string[]>();
  const lock = useRef(false);
  const [sessionId, setSessionId] = useState("");
  const [mixed, setMixed] = useState(false);
  const pool = retryIds
    ? b2Exercises.filter((q) => retryIds.includes(q.id))
    : mixed
      ? mixedB2Exercises
      : b2Exercises;
  const q = pool[index];
  useEffect(() => {
    let active = true;
    db.aiAttempts
      .orderBy("date")
      .toArray()
      .then((rows) => {
        if (!active) return;
        setHistory(rows);
        setSessionId(rows.at(-1)?.sessionId ?? crypto.randomUUID());
        setLoaded(true);
      })
      .catch(() => setError("Không đọc được tiến độ. Hãy tải lại trang."));
    return () => {
      active = false;
    };
  }, []);
  const current = history.filter((a) => a.sessionId === sessionId);
  const latest = new Map<string, AIExerciseAttempt>();
  for (const a of current) latest.set(a.exerciseId, a);
  const totals = summary([...latest.values()].map((a) => a.result));
  async function submit() {
    if (lock.current || !answer.trim() || !q) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const report = await gradeExercise(q, answer.trim());
      const attempt: AIExerciseAttempt = {
        id: crypto.randomUUID(),
        sessionId,
        exerciseId: q.id,
        version: q.version,
        userAnswer: answer.trim(),
        date: Date.now(),
        result: report,
      };
      await db.aiAttempts.add(attempt);
      setHistory((old) => [...old, attempt]);
      setResult(report);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không kết nối được AI. Bài này chưa được chấm điểm.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function select(i: number) {
    setIndex(i);
    const old = latest.get(pool[i].id);
    setAnswer(old?.userAnswer ?? "");
    setResult(old?.result);
    setError("");
  }
  const weak = [
    ...new Set(
      current
        .filter((a) => a.result.status !== "correct")
        .flatMap(
          (a) =>
            b2Exercises.find((q) => q.id === a.exerciseId)?.grammarRules ?? [],
        ),
    ),
  ];
  return (
    <>
      <div className="heading">
        <div className="eyebrow">ADVANCED · GRAMMAR FOUNDATION 01.2</div>
        <h1>Word Formation B2</h1>
        <p>25 câu · Word Families → Context → Sentence Transformation</p>
      </div>
      <section className="panel">
        <h2>Learn before you practise</h2>
        <p>
          Bài nâng cao tự chọn. Bài này không mở khóa các quy tắc trong Learning
          Path.
        </p>
        <p>
          <strong>Word Families:</strong> economic nói về nền kinh tế;
          economical = tiết kiệm. considerable = đáng kể; considerate = chu đáo.
          historic = có tầm quan trọng lịch sử; historical = thuộc về lịch sử.
          sensible = hợp lý; sensitive = nhạy cảm. Hai nghĩa có thể chồng lấn:
          luôn xét ngữ cảnh.
        </p>
        <p>
          <strong>Sentence Transformation:</strong> Giữ Subject, ý nghĩa, thời
          và mức độ. “gave a very careful reply” → “explained extremely
          clearly”; bỏ very làm giảm mức độ. “find + Object + Adjective” →
          “found the room warm”. Có thể dùng mệnh đề “found that the room was
          warm”.
        </p>
        <p>
          <strong>Word Formation:</strong> Adjective bổ nghĩa Noun hoặc làm
          Complement sau be; Adverb bổ nghĩa Verb hoặc Adjective: “statistically
          significant”. Noun professionalism chỉ tác phong; effective mô tả tác
          dụng. Prefix un-/im- có thể đổi nghĩa phủ định: unclear, impractical.
          Không có một suffix đúng cho mọi ngữ cảnh.
        </p>
        <label>
          <input
            type="checkbox"
            checked={learned}
            onChange={(e) => setLearned(e.target.checked)}
          />{" "}
          Tôi đã đọc phần lý thuyết và muốn luyện tập nâng cao.
        </label>
      </section>
      {!loaded ? (
        <p role="status">Loading saved progress…</p>
      ) : (
        learned && (
          <>
            <section className="panel">
              <h2>Session progress</h2>
              <label>
                <input
                  type="checkbox"
                  checked={mixed}
                  disabled={busy}
                  onChange={(e) => {
                    setMixed(e.target.checked);
                    setRetryIds(undefined);
                    setIndex(0);
                    setAnswer("");
                    setResult(undefined);
                    setDone(false);
                  }}
                />{" "}
                Mixed Grammar Practice · mix all parts
              </label>
              <p>
                {latest.size}/25 answered · Score {totals.score}/
                {totals.maxScore} graded · Correct {totals.correct} · Partially
                correct {totals.partial} · Incorrect {totals.incorrect} ·
                Pending review {totals.pending}
              </p>
              <p>
                Previous attempts: {history.length}. All attempts are kept.
                Pending answers are excluded from the score.
              </p>
              {weak.length > 0 && (
                <p>Suggested review topics: {weak.join(" · ")}</p>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const next = pool.findIndex((q) => !latest.has(q.id));
                  select(next < 0 ? 0 : next);
                  setDone(false);
                }}
              >
                Resume unfinished questions
              </Button>{" "}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setSessionId(crypto.randomUUID());
                  setRetryIds(undefined);
                  setIndex(0);
                  setAnswer("");
                  setResult(undefined);
                  setDone(false);
                }}
              >
                New session
              </Button>
            </section>
            {done ? (
              <section className="panel">
                <h2>Session summary</h2>
                <p>
                  {totals.correct} correct · {totals.partial} partially correct
                  · {totals.incorrect} incorrect · {totals.pending} pending
                  review
                </p>
                <p>
                  Score: {totals.score}/{totals.maxScore} graded.{" "}
                  {25 - latest.size} unanswered.
                </p>
                <Button
                  onClick={() => {
                    const ids = [...latest.values()]
                      .filter((a) => a.result.status !== "correct")
                      .map((a) => a.exerciseId);
                    if (!ids.length) return;
                    setRetryIds(ids);
                    setIndex(0);
                    setAnswer("");
                    setResult(undefined);
                    setDone(false);
                  }}
                  disabled={
                    ![...latest.values()].some(
                      (a) => a.result.status !== "correct",
                    )
                  }
                >
                  Retry incorrect / pending questions
                </Button>
              </section>
            ) : (
              q && (
                <section className="panel ai-card" data-exercise-id={q.id}>
                  <p className="eyebrow">
                    Part {q.part} · {q.difficulty} · Question {index + 1}/
                    {pool.length}
                  </p>
                  <progress
                    aria-label="Question progress"
                    value={index + 1}
                    max={pool.length}
                  />
                  <h2>{q.instruction}</h2>
                  <p className="ai-question">{q.question}</p>
                  {q.rootWord && (
                    <p>
                      Root word: <strong>{q.rootWord}</strong>
                    </p>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    <label htmlFor="ai-answer">Your answer</label>
                    {q.type === "word_formation" || q.type === "fill_blank" ? (
                      <input
                        id="ai-answer"
                        value={answer}
                        maxLength={3000}
                        onChange={(e) => setAnswer(e.target.value)}
                        disabled={busy || !!result}
                      />
                    ) : (
                      <textarea
                        id="ai-answer"
                        value={answer}
                        maxLength={3000}
                        rows={3}
                        onChange={(e) => setAnswer(e.target.value)}
                        disabled={busy || !!result}
                      />
                    )}
                    {!result && (
                      <Button type="submit" disabled={busy || !answer.trim()}>
                        {busy
                          ? "Grading…"
                          : error
                            ? "Retry grading"
                            : "Submit answer"}
                      </Button>
                    )}
                  </form>
                  {busy && (
                    <p role="status">
                      AI đang kiểm tra ngữ pháp, ý nghĩa, thời và mức độ…
                    </p>
                  )}
                  {error && (
                    <p role="alert">
                      {error} Câu trả lời vẫn được giữ trên màn hình.
                    </p>
                  )}
                  {result && (
                    <div className="ai-feedback" role="status">
                      <h3>
                        {labels[result.status]}
                        {result.score !== null
                          ? ` · ${result.score}/1`
                          : " · Unscored"}
                      </h3>
                      <p>
                        <strong>Your original answer:</strong>{" "}
                        {result.userAnswer}
                      </p>
                      <p>{result.feedbackVi}</p>
                      {result.status !== "correct" &&
                        result.correctedAnswer && (
                          <CorrectionDiff
                            answer={result.userAnswer}
                            correction={result.correctedAnswer}
                          />
                        )}
                      <h3>Grammar explanation</h3>
                      <p>{result.grammarRule}</p>
                      <p>{result.explanationVi}</p>
                      <h3>Reference answer</h3>
                      <p>{q.referenceAnswers[0]}</p>
                      {result.alternativeAnswers.length > 0 && (
                        <>
                          <h3>Alternative acceptable answers</h3>
                          <ul>
                            {result.alternativeAnswers.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {result.needsReview && (
                        <p>
                          AI chưa chắc chắn. Kết quả này chưa được tính điểm.
                          Bạn có thể thử chấm lại hoặc hỏi giáo viên.
                        </p>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          setResult(undefined);
                          setError("");
                        }}
                      >
                        Retry exercise
                      </Button>{" "}
                      <Button
                        onClick={() => {
                          if (index === pool.length - 1) setDone(true);
                          else select(index + 1);
                        }}
                      >
                        Next question
                      </Button>
                    </div>
                  )}
                  <p>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDone(true)}
                    >
                      End session & summary
                    </Button>
                  </p>
                </section>
              )
            )}
          </>
        )
      )}
      {error && !loaded && <p role="alert">{error}</p>}
    </>
  );
}
