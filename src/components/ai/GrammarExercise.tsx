import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { CorrectionDiff } from "./CorrectionDiff";
import { db } from "../../lib/db";
import { summary } from "../../lib/ai/schema";
import { formatLabels } from "../../lib/ai/dynamic/topics";
import { SessionBuilder } from "./SessionBuilder";
import {
  localSessionSchema,
  validateSettings,
  type PracticeSession,
  type Settings,
} from "../../lib/ai/dynamic/schema";
import {
  createSession,
  loadBatch,
  gradeAnswers,
  submitExam,
} from "../../lib/ai/dynamic/client";
import { saveSession, saveGraded } from "../../lib/ai/dynamic/persistence";
const initial: Settings = {
  topics: ["word-formation"],
  questionCount: 10,
  difficulty: "B2",
  exerciseType: "mixed",
  feedbackMode: "instant",
};
const labels = {
  correct: "Correct",
  partially_correct: "Partially correct",
  incorrect: "Incorrect",
  needs_review: "Needs review",
};
export function GrammarExercise() {
  const [settings, setSettings] = useState<Settings>(initial),
    [learned, setLearned] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<PracticeSession>(),
    [saved, setSaved] = useState<PracticeSession[]>([]),
    [historyCount, setHistoryCount] = useState(0);
  const [creating, setCreating] = useState(false),
    [generating, setGenerating] = useState(false),
    [grading, setGrading] = useState(false);
  const [generationError, setGenerationError] = useState(""),
    [error, setError] = useState(""),
    [phase, setPhase] = useState("");
  const live = useRef<PracticeSession | undefined>(undefined),
    generationLock = useRef(false),
    gradeLock = useRef(false),
    createLock = useRef(false),
    examLock = useRef(false);
  function show(value: PracticeSession | undefined) {
    live.current = value;
    setSession(value);
  }
  function update(patch: Partial<PracticeSession>) {
    if (!live.current) return;
    const next = { ...live.current, ...patch, updatedAt: Date.now() };
    show(next);
    void saveSession(next).catch(() =>
      setError(
        "Không lưu được tiến độ. Kiểm tra dung lượng trình duyệt trước khi tải lại.",
      ),
    );
  }
  async function refreshHistory() {
    setSaved(
      await db.practiceSessions.orderBy("updatedAt").reverse().toArray(),
    );
    setHistoryCount(await db.aiAttempts.count());
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      db.practiceSessions.orderBy("updatedAt").reverse().toArray(),
      db.aiAttempts.count(),
    ])
      .then(([sessions, count]) => {
        if (!active) return;
        setSaved(sessions);
        setHistoryCount(count);
        if (sessions[0]) {
          show(localSessionSchema.parse(sessions[0]));
          setSettings(sessions[0].settings);
        }
        setLoaded(true);
      })
      .catch(() =>
        setError("Không đọc được tiến độ đã lưu. Hãy tải lại trang."),
      );
    return () => {
      active = false;
    };
  }, []);
  async function generateNext() {
    const current = live.current;
    if (!current || current.generationComplete || generationLock.current)
      return;
    generationLock.current = true;
    setGenerating(true);
    setGenerationError("");
    setPhase(
      `Creating questions · batch ${current.nextBatch + 1}/${current.settings.questionCount / 10}. AI is also checking question quality.`,
    );
    try {
      const batch = await loadBatch(current);
      setPhase(
        "Validating questions · checking the session, schema and ordering.",
      );
      const latest = live.current;
      if (latest?.sessionId !== current.sessionId) return;
      const next = {
        ...latest,
        questions: [...latest.questions, ...batch.questions],
        nextBatch: batch.nextBatch,
        generationComplete: batch.complete,
        updatedAt: Date.now(),
      };
      setPhase("Preparing session · saving validated questions.");
      await saveSession(next);
      show(next);
      await refreshHistory();
    } catch (e) {
      setGenerationError(
        e instanceof Error ? e.message : "Không tạo được câu hỏi. Hãy thử lại.",
      );
    } finally {
      generationLock.current = false;
      setGenerating(false);
      setPhase("");
    }
  }
  useEffect(() => {
    if (
      session &&
      !session.generationComplete &&
      !generationError &&
      !generationLock.current
    )
      void generateNext();
    // Each successful batch advances the persistent cursor. A failed batch requires an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, session?.nextBatch, generationError, generating]);
  async function start() {
    if (createLock.current || !learned) return;
    createLock.current = true;
    setCreating(true);
    setError("");
    setGenerationError("");
    try {
      const config = validateSettings(settings),
        old = await db.practiceSessions.orderBy("updatedAt").toArray(),
        attempts = await db.aiAttempts
          .orderBy("date")
          .reverse()
          .limit(100)
          .toArray();
      const recent = old
        .flatMap((s) => s.questions.map((q) => q.questionText))
        .slice(-60);
      const weak = [
        ...new Set(
          attempts
            .filter(
              (a) =>
                a.result.status === "incorrect" ||
                a.result.status === "partially_correct",
            )
            .flatMap(
              (a) =>
                old
                  .flatMap((s) => s.questions)
                  .find((q) => q.id === a.exerciseId)?.targetSkills ?? [],
            ),
        ),
      ].slice(0, 15);
      const response = await createSession(config, recent, weak);
      const next: PracticeSession = {
        ...response,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nextBatch: 0,
        generationComplete: false,
        questions: [],
        answers: {},
        results: {},
        reveals: {},
        currentIndex: 0,
        status: "practicing",
        examSubmitted: false,
      };
      await saveSession(next);
      show(next);
      await refreshHistory();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không tạo được phiên học. Hãy thử lại.",
      );
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  }
  async function grade(ids: string[]) {
    if (gradeLock.current || !live.current) return;
    gradeLock.current = true;
    setGrading(true);
    setError("");
    try {
      const current = live.current,
        missing: string[] = [];
      for (let start = 0; start < ids.length; start += 8) {
        const items = await gradeAnswers(current, ids.slice(start, start + 8));
        const latest = live.current;
        if (latest?.sessionId !== current.sessionId) return;
        const results = { ...latest.results },
          reveals = { ...latest.reveals };
        for (const item of items) {
          if (item.result) {
            results[item.exerciseId] = item.result;
            if (item.reveal) reveals[item.exerciseId] = item.reveal;
          } else missing.push(item.exerciseId);
        }
        const next = { ...latest, results, reveals, updatedAt: Date.now() };
        await saveGraded(
          next,
          items.flatMap((item) => (item.result ? [item.result] : [])),
        );
        show(next);
      }
      const latest = live.current!;
      if (
        latest.generationComplete &&
        latest.questions.every((q) => latest.results[q.id])
      )
        update({ status: "completed" });
      await refreshHistory();
      if (missing.length)
        setError(
          `${missing.length} câu chưa được chấm. Câu trả lời đã lưu; hãy thử Retry grading.`,
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI chưa sẵn sàng. Câu trả lời vẫn được lưu và chưa bị tính sai.",
      );
    } finally {
      gradeLock.current = false;
      setGrading(false);
    }
  }
  async function finishExam() {
    if (!live.current || gradeLock.current || examLock.current) return;
    examLock.current = true;
    setError("");
    setGrading(true);
    try {
      if (!live.current.examSubmitted) {
        const frozenAnswers = await submitExam(live.current);
        update({
          answers: frozenAnswers,
          examSubmitted: true,
          status: "submitted",
        });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không nộp được bài. Hãy thử lại.",
      );
      setGrading(false);
      examLock.current = false;
      return;
    }
    setGrading(false);
    const current = live.current;
    await grade(
      current.questions
        .filter(
          (q) => !current.results[q.id] || current.results[q.id].needsReview,
        )
        .map((q) => q.id),
    );
    examLock.current = false;
  }
  const q = session?.questions[session.currentIndex],
    result = q && session?.results[q.id],
    reveal = q && session?.reveals[q.id],
    answer = q ? (session?.answers[q.id] ?? "") : "";
  const totals = summary(Object.values(session?.results ?? {})),
    answered =
      session?.questions.filter((q) => session.answers[q.id]?.trim()).length ??
      0;
  const exam = session?.settings.feedbackMode === "exam",
    locked = !!result || !!session?.examSubmitted;
  const expired = !!session && session.expiresAt <= Date.now();
  const resume = async (id: string) => {
    const row = await db.practiceSessions.get(id);
    if (row) {
      show(localSessionSchema.parse(row));
      setSettings(row.settings);
      setError("");
      setGenerationError("");
    }
  };
  return (
    <>
      <div className="heading">
        <div className="eyebrow">
          OPTIONAL ADVANCED PRACTICE · FOUNDATION 01.2
        </div>
        <h1>Grammar Practice</h1>
        <p>
          Fresh questions. Focused practice. English you can produce
          independently.
        </p>
      </div>
      <SessionBuilder
        settings={settings}
        setSettings={setSettings}
        learned={learned}
        setLearned={setLearned}
        loaded={loaded}
        creating={creating}
        generating={generating}
        grading={grading}
        hasSession={!!session}
        onGenerate={() => void start()}
        onNewSession={() => {
          show(undefined);
          setGenerationError("");
          setError("");
        }}
      />
      {!loaded && <p role="status">Loading saved progress…</p>}
      {(creating || generating) && (
        <section className="panel generation-progress" role="status">
          <h2>{creating ? "Preparing session" : phase}</h2>
          <p>
            {session?.questions.length ?? 0}/
            {session?.settings.questionCount ?? settings.questionCount}{" "}
            validated questions ready. Batches contain 10 questions. You can
            practise ready questions while the next batch is prepared.
          </p>
        </section>
      )}
      {generationError && (
        <section className="panel" role="alert">
          <p>{generationError}</p>
          <Button
            disabled={generating || expired}
            onClick={() => void generateNext()}
          >
            Retry Generation
          </Button>
        </section>
      )}
      {error && (
        <p className="practice-error" role="alert">
          {error}
        </p>
      )}
      {session && (
        <>
          <section className="panel" aria-label="Session progress">
            <div className="builder-heading">
              <h2>
                {session.settings.feedbackMode === "exam"
                  ? "Exam Mode"
                  : "Instant Feedback"}{" "}
                · {session.settings.difficulty}
              </h2>
              <span className="session-tag">
                {session.settings.questionCount} questions
              </span>
            </div>
            <p>
              {answered}/{session.settings.questionCount} answered ·{" "}
              {session.questions.length} ready · Score {totals.score}/
              {totals.maxScore} graded
            </p>
            <p>
              Correct {totals.correct} · Partially correct {totals.partial} ·
              Incorrect {totals.incorrect} · Pending review {totals.pending}
            </p>
            <p>
              Previous attempts: {historyCount}. All attempts are kept; unscored
              answers are excluded from the score.
            </p>
            {expired && (
              <p role="alert">
                Server answer keys have expired. Your saved questions and
                feedback remain available. Start a new session for new grading.
              </p>
            )}
            <Button
              variant="outline"
              disabled={grading}
              onClick={() => {
                const index = session.questions.findIndex(
                  (q) => !session.answers[q.id]?.trim(),
                );
                update({ currentIndex: index < 0 ? 0 : index });
              }}
            >
              Resume Session
            </Button>
            {exam && (
              <Button
                disabled={
                  grading ||
                  expired ||
                  !session.generationComplete ||
                  answered !== session.settings.questionCount
                }
                onClick={() => void finishExam()}
              >
                {grading
                  ? "Grading exam…"
                  : session.examSubmitted
                    ? "Retry exam grading"
                    : "Submit session"}
              </Button>
            )}
            {!exam &&
              session.generationComplete &&
              session.questions.every((q) => session.results[q.id]) && (
                <h3>Session complete</h3>
              )}
          </section>
          {q && (
            <section className="panel ai-card" data-exercise-id={q.id}>
              <p className="eyebrow">
                {formatLabels[q.exerciseType]} · Question{" "}
                {session.currentIndex + 1}/{session.settings.questionCount}
              </p>
              <progress
                aria-label="Question progress"
                value={session.currentIndex + 1}
                max={session.settings.questionCount}
              />
              <h2>{q.instruction}</h2>
              <p className="ai-question">{q.questionText}</p>
              {q.rootWord && (
                <p>
                  Root word: <strong>{q.rootWord}</strong>
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!exam) void grade([q.id]);
                }}
              >
                {q.exerciseType === "multiple_choice" ? (
                  <fieldset disabled={grading || locked}>
                    <legend>Your answer</legend>
                    <div className="mcq-options">
                      {q.options.map((option) => (
                        <label key={option.id}>
                          <input
                            type="radio"
                            name={`choice-${q.id}`}
                            value={option.id}
                            checked={answer === option.id}
                            onChange={() =>
                              update({
                                answers: {
                                  ...session.answers,
                                  [q.id]: option.id,
                                },
                              })
                            }
                          />
                          {option.text}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <>
                    <label htmlFor="dynamic-answer">Your answer</label>
                    {["word_formation", "fill_blank"].includes(
                      q.exerciseType,
                    ) ? (
                      <input
                        id="dynamic-answer"
                        autoComplete="off"
                        value={answer}
                        maxLength={3000}
                        disabled={grading || locked}
                        onChange={(e) =>
                          update({
                            answers: {
                              ...session.answers,
                              [q.id]: e.target.value,
                            },
                          })
                        }
                      />
                    ) : (
                      <textarea
                        id="dynamic-answer"
                        rows={3}
                        value={answer}
                        maxLength={3000}
                        disabled={grading || locked}
                        onChange={(e) =>
                          update({
                            answers: {
                              ...session.answers,
                              [q.id]: e.target.value,
                            },
                          })
                        }
                      />
                    )}
                  </>
                )}
                {!exam && !result && (
                  <Button
                    type="submit"
                    disabled={grading || expired || !answer.trim()}
                  >
                    {grading
                      ? "Grading…"
                      : error
                        ? "Retry grading"
                        : "Check Answer"}
                  </Button>
                )}
              </form>
              {exam && !session.examSubmitted && (
                <p>
                  Answer saved. Feedback and answer keys appear only after you
                  submit the complete session.
                </p>
              )}
              {grading && (
                <p role="status">
                  AI đang kiểm tra bài. Câu trả lời đã được lưu.
                </p>
              )}
              {result && (
                <div className="ai-feedback" role="status">
                  <h3>
                    {labels[result.status]} ·{" "}
                    {result.score === null ? "Unscored" : `${result.score}/1`}
                  </h3>
                  <p>
                    <strong>Your original answer:</strong>{" "}
                    {q.exerciseType === "multiple_choice"
                      ? q.options.find((o) => o.id === result.userAnswer)?.text
                      : result.userAnswer}
                  </p>
                  <p>{result.feedbackVi}</p>
                  {result.status !== "correct" &&
                    result.correctedAnswer &&
                    q.exerciseType !== "multiple_choice" && (
                      <CorrectionDiff
                        answer={result.userAnswer}
                        correction={result.correctedAnswer}
                      />
                    )}
                  <h3>Grammar explanation</h3>
                  <p>{result.grammarRule}</p>
                  <p>{result.explanationVi}</p>
                  {reveal && (
                    <>
                      <h3>Reference answer</h3>
                      <p>{reveal.referenceAnswers.join(" / ")}</p>
                      {reveal.acceptedVariants.length > 0 && (
                        <p>
                          Also accepted: {reveal.acceptedVariants.join(" / ")}
                        </p>
                      )}
                      {reveal.distractorExplanations.map((d) => (
                        <p key={d.optionId}>
                          <strong>
                            {q.options.find((o) => o.id === d.optionId)?.text}:
                          </strong>{" "}
                          {d.explanationVi}
                        </p>
                      ))}
                    </>
                  )}
                  {result.needsReview && (
                    <p>AI chưa chắc chắn. Bài này chưa được tính điểm.</p>
                  )}
                  {!exam && (
                    <Button
                      variant="outline"
                      disabled={grading}
                      onClick={() => {
                        const results = { ...session.results };
                        delete results[q.id];
                        const reveals = { ...session.reveals };
                        delete reveals[q.id];
                        update({ results, reveals, status: "practicing" });
                        setError("");
                      }}
                    >
                      Retry exercise
                    </Button>
                  )}
                </div>
              )}
              <div className="practice-navigation">
                <Button
                  variant="outline"
                  disabled={grading || session.currentIndex === 0}
                  onClick={() => {
                    update({ currentIndex: session.currentIndex - 1 });
                    setError("");
                  }}
                >
                  Previous Question
                </Button>
                <Button
                  disabled={
                    grading ||
                    session.currentIndex + 1 >= session.questions.length
                  }
                  onClick={() => {
                    update({ currentIndex: session.currentIndex + 1 });
                    setError("");
                  }}
                >
                  Next Question
                </Button>
              </div>
            </section>
          )}
          <section className="panel">
            <h2>Session Summary</h2>
            <p>
              {totals.correct} correct · {totals.partial} partially correct ·{" "}
              {totals.incorrect} incorrect · {totals.pending} pending review
            </p>
            <p>
              Score {totals.score}/{totals.maxScore} graded.{" "}
              {session.settings.questionCount - answered} unanswered.
            </p>
            <p>
              {session.generationComplete
                ? "All questions generated."
                : "More questions will appear as validated batches are saved."}{" "}
              {session.status === "completed" ? "All answers evaluated." : ""}
            </p>
          </section>
        </>
      )}
      <section className="panel">
        <h2>Saved sessions</h2>
        <p>
          Refresh resumes the same questions. New sessions keep all earlier
          attempts. Server keys remain available for 7 days; saved feedback
          stays on this device.
        </p>
        {saved.length === 0 ? (
          <p>No generated sessions yet.</p>
        ) : (
          <div className="saved-sessions">
            {saved.map((s) => (
              <Button
                key={s.sessionId}
                variant="outline"
                disabled={grading || generating || creating}
                onClick={() => void resume(s.sessionId)}
              >
                {new Date(s.createdAt).toLocaleDateString()} ·{" "}
                {s.settings.difficulty} · {s.settings.questionCount} questions ·{" "}
                {Object.keys(s.results).length} evaluated
              </Button>
            ))}
          </div>
        )}
        <p>
          <Link to="/lessons/01.2/archive">
            Open the original 25-question lesson and its history
          </Link>
        </p>
      </section>
    </>
  );
}
