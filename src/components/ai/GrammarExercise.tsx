import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
// Date.now() below preserves existing saved-run timestamps and server expiry checks.
// These C4 exceptions are data lifecycle logic, not render keys or animation.
import { Alert, AlertTitle, AlertDescription } from "../reui/alert";
import { Badge } from "../reui/badge";
import { PracticePanel, PracticeLoading } from "../practice/PracticePanel";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { CorrectionDiff } from "./CorrectionDiff";
import { db } from "../../lib/db";
import { summary } from "../../lib/ai/schema";
import {
  formatLabels,
  ieltsTopics,
  isChoiceFormat,
} from "../../lib/ai/dynamic/topics";
import { questionDisplay } from "../../lib/ai/dynamic/question-display";
import { PracticeResults } from "./PracticeResults";
import { retryQuestionIds } from "../../lib/ai/dynamic/results";
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
  topics: ["all"],
  ieltsTopic: "all",
  subtopics: {},
  questionCount: 20,
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
  const [resultScreen, setResultScreen] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[] | undefined>();
  const [settings, setSettings] = useState<Settings>(initial),
    [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<PracticeSession>(),
    [saved, setSaved] = useState<PracticeSession[]>([]),
    [historyCount, setHistoryCount] = useState(0);
  const [creating, setCreating] = useState(false),
    [generating, setGenerating] = useState(false),
    [grading, setGrading] = useState(false),
    [moving, setMoving] = useState(false);
  const [generationError, setGenerationError] = useState(""),
    [error, setError] = useState("");
  const live = useRef<PracticeSession | undefined>(undefined),
    generationLock = useRef(false),
    gradeLock = useRef(false),
    createLock = useRef(false),
    examLock = useRef(false),
    navigationLock = useRef(false),
    generationRequests = useRef({ key: "", count: 0 }),
    practiceRef = useRef<HTMLDivElement>(null);
  function show(value: PracticeSession | undefined) {
    live.current = value;
    setSession(value);
  }
  function update(patch: Partial<PracticeSession>) {
    if (!live.current || navigationLock.current) return;
    const next = { ...live.current, ...patch, updatedAt: Date.now() };
    show(next);
    void saveSession(next).catch(() =>
      setError(
        "Không lưu được tiến độ. Kiểm tra dung lượng trình duyệt trước khi tải lại.",
      ),
    );
  }
  async function move(index: number) {
    const current = live.current;
    if (!current || navigationLock.current || !current.questions[index]) return;
    navigationLock.current = true;
    setMoving(true);
    const next = { ...current, currentIndex: index, updatedAt: Date.now() };
    try {
      // Once the next card is visible, its position must already be durable.
      await saveSession(next);
      if (live.current?.sessionId === current.sessionId) {
        show(next);
        setError("");
      }
    } catch {
      setError("Chưa lưu được vị trí câu hỏi. Hãy thử chuyển câu lại.");
    } finally {
      navigationLock.current = false;
      setMoving(false);
    }
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
    const key = `${current.sessionId}:${current.nextBatch}`;
    if (generationRequests.current.key !== key)
      generationRequests.current = { key, count: 0 };
    generationRequests.current.count++;
    generationLock.current = true;
    setGenerating(true);
    setGenerationError("");
    try {
      const batch = await loadBatch(current);
      const latest = live.current;
      if (latest?.sessionId !== current.sessionId) return;
      const next = {
        ...latest,
        questions: [
          ...new Map(
            [...latest.questions, ...batch.questions].map((q) => [q.id, q]),
          ).values(),
        ].sort((a, b) => a.ordinal - b.ordinal),
        nextBatch: batch.nextBatch,
        generationComplete: batch.complete,
        updatedAt: Date.now(),
      };
      const activeId = latest.questions[latest.currentIndex]?.id;
      if (activeId)
        next.currentIndex = Math.max(
          0,
          next.questions.findIndex((q) => q.id === activeId),
        );
      if (
        batch.nextBatch === current.nextBatch &&
        generationRequests.current.count >= 3
      )
        setGenerationError(
          "AI chưa trả đủ câu hỏi. Hãy thử lại để hoàn tất bộ đề.",
        );
      await saveSession(next);
      show(next);
      await refreshHistory();
    } catch (e) {
      if (generationRequests.current.count >= 2)
        setGenerationError(
          e instanceof Error
            ? e.message
            : "Chưa tạo được câu tiếp theo. Bài làm của bạn vẫn được giữ.",
        );
    } finally {
      generationLock.current = false;
      setGenerating(false);
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
    if (createLock.current) return;
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
    if (gradeLock.current || navigationLock.current || !live.current) return;
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
        latest.questions
          .filter((q) => !latest.retryIds || latest.retryIds.includes(q.id))
          .every((q) => latest.results[q.id])
      ) {
        update({ status: "completed" });
        setReviewIds(undefined);
        setResultScreen(true);
      }
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
  const q = session?.generationComplete
    ? session.questions[session.currentIndex]
    : undefined;
  const result = q && session?.results[q.id],
    reveal = q && session?.reveals[q.id],
    answer = q ? (session?.answers[q.id] ?? "") : "";
  useEffect(() => {
    if (!q) return;
    practiceRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    practiceRef.current
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "input:not([disabled]),textarea:not([disabled])",
      )
      ?.focus({ preventScroll: true });
  }, [q?.id]);
  const visibleQuestions =
    session?.questions.filter(
      (question) =>
        (reviewIds ?? session.retryIds)?.includes(question.id) ?? true,
    ) ?? [];
  const position = q
    ? visibleQuestions.findIndex((question) => question.id === q.id)
    : 0;
  const goToPosition = (index: number) => {
    const target = visibleQuestions[index];
    if (target && session)
      void move(
        session.questions.findIndex((question) => question.id === target.id),
      );
  };
  async function retryIncorrect() {
    if (!session) return;
    const ids = retryQuestionIds(session);
    if (!ids.length) return;
    const keep = <T,>(record: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(record).filter(([id]) => !ids.includes(id)),
      );
    const next: PracticeSession = {
      ...session,
      retryIds: ids,
      previousRounds: [
        ...(session.previousRounds ?? []),
        {
          date: Date.now(),
          answers: session.answers,
          results: session.results,
          reveals: session.reveals,
        },
      ],
      answers: keep(session.answers),
      results: keep(session.results),
      reveals: keep(session.reveals),
      currentIndex: session.questions.findIndex((q) => q.id === ids[0]),
      status: "practicing",
      updatedAt: Date.now(),
    };
    await saveSession(next);
    show(next);
    setReviewIds(undefined);
    setResultScreen(false);
    await refreshHistory();
  }
  const display = q ? questionDisplay(q) : undefined;
  const totals = summary(
      visibleQuestions.flatMap((q) =>
        session?.results[q.id] ? [session.results[q.id]] : [],
      ),
    ),
    answered =
      visibleQuestions.filter((q) => session?.answers[q.id]?.trim()).length ??
      0;
  const exam = session?.settings.feedbackMode === "exam" && !session?.retryIds,
    locked = !!result || (!!session?.examSubmitted && !session?.retryIds);
  const expired = !!session && session.expiresAt <= Date.now();
  const resume = async (id: string) => {
    const row = await db.practiceSessions.get(id);
    if (row) {
      show(localSessionSchema.parse(row));
      setResultScreen(false);
      setReviewIds(undefined);
      setSettings(row.settings);
      setError("");
      setGenerationError("");
    }
  };
  return (
    <div className="practice-redesign">
      <div className="heading">
        <div className="eyebrow">IELTS GENERAL TRAINING · AI PRACTICE</div>
        <h1>IELTS Grammar Practice</h1>
        <p>Tự viết câu trả lời. Nhận góp ý cụ thể. Luyện lại chỗ chưa vững.</p>
      </div>
      {!session && (
        <SessionBuilder
          settings={settings}
          setSettings={setSettings}
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
      )}
      {!loaded && <PracticeLoading title="Loading saved progress…" />}
      {(creating || (generating && !session?.generationComplete)) && (
        <PracticeLoading title="Đang tạo bộ câu hỏi…">
          Đã tạo {session?.questions.length ?? 0}/
          {session?.settings.questionCount ?? settings.questionCount} câu. Bộ đề
          sẽ mở ngay khi tạo đủ.
        </PracticeLoading>
      )}
      {generationError && !session?.generationComplete && (
        <PracticePanel role="alert">
          <h2>Chưa có câu hỏi sẵn sàng</h2>
          <p>{generationError}</p>
          <Button
            type="button"
            disabled={generating || expired}
            onClick={() => {
              generationRequests.current.count = 0;
              void generateNext();
            }}
          >
            Retry Generation
          </Button>
        </PracticePanel>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Chưa thể hoàn tất</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {session?.generationComplete && resultScreen && (
        <PracticeResults
          session={session}
          onReturn={() => setResultScreen(false)}
          onReview={() => {
            const ids = session.questions
              .filter((q) =>
                ["incorrect", "partially_correct"].includes(
                  session.results[q.id]?.status,
                ),
              )
              .map((q) => q.id);
            setReviewIds(ids);
            setResultScreen(false);
            if (ids[0])
              void move(session.questions.findIndex((q) => q.id === ids[0]));
          }}
          onRetry={() => void retryIncorrect()}
          onConfigure={() => {
            show(undefined);
            setResultScreen(false);
            setReviewIds(undefined);
            setError("");
          }}
          onGenerate={() => {
            show(undefined);
            setResultScreen(false);
            setReviewIds(undefined);
            void start();
          }}
        />
      )}
      {session?.generationComplete && !resultScreen && (
        <>
          <div className="practice-toolbar" aria-label="Session progress">
            <div>
              <div className="practice-mode">
                <Badge variant="outline">{session.settings.difficulty}</Badge>
                <strong>{exam ? "Exam Mode" : "Instant Feedback"}</strong>
                <Badge variant="success-light">Đã lưu</Badge>
              </div>
              <span>
                {answered}/{visibleQuestions.length} answered ·{" "}
                {visibleQuestions.length} ready
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={grading || moving}
              onClick={() => {
                setReviewIds(undefined);
                setResultScreen(true);
              }}
            >
              View Results
            </Button>
            {(reviewIds || session.retryIds) && (
              <Button
                type="button"
                variant="ghost"
                disabled={grading || moving}
                onClick={() => {
                  setReviewIds(undefined);
                  update({
                    retryIds: undefined,
                    status: session.questions.every(
                      (q) => session.results[q.id],
                    )
                      ? "completed"
                      : "practicing",
                  });
                }}
              >
                Tất cả câu hỏi
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={grading || moving || generating || creating}
              onClick={() => {
                show(undefined);
                setReviewIds(undefined);
                setResultScreen(false);
                setGenerationError("");
                setError("");
              }}
            >
              Tạo bài luyện mới
            </Button>
          </div>
          {expired && (
            <p role="alert">
              Thời hạn chấm bài đã hết. Bài làm và phản hồi đã lưu vẫn được giữ;
              hãy tạo bài luyện mới để tiếp tục chấm.
            </p>
          )}
          {q && (
            <div className="grammar-practice-layout">
              <PracticePanel
                ref={practiceRef}
                title={`${formatLabels[q.exerciseType]} · Question ${position + 1}/${visibleQuestions.length}`}
                className="ai-card practice-workspace"
                data-exercise-id={q.id}
                aria-label="Bài tập hiện tại"
              >
                <progress
                  aria-label="Question progress"
                  value={position + 1}
                  max={visibleQuestions.length}
                />
                <p className="eyebrow">
                  {q.grammarSubtopic}
                  {q.ieltsTopic &&
                    ` · ${ieltsTopics.find((t) => t.id === q.ieltsTopic)?.label ?? q.ieltsTopic}`}
                </p>
                <h2>{q.instruction}</h2>
                <p className="ai-question">
                  {display?.parts.map((part, index) =>
                    part.underline ? (
                      <u
                        key={index}
                        style={{
                          textUnderlineOffset: "0.2em",
                          textDecorationThickness: "2px",
                        }}
                      >
                        {part.text}
                      </u>
                    ) : (
                      <span key={index}>{part.text}</span>
                    ),
                  )}
                </p>
                {display?.missingUnderline && (
                  <p role="note" className="practice-error">
                    Đề này nhắc đến phần gạch chân nhưng không cung cấp vị trí.
                    Chọn câu khác trong bảng số câu để tiếp tục.
                  </p>
                )}
                {q.requiredOpening && (
                  <p>
                    Begin with: <strong>{q.requiredOpening}</strong>
                  </p>
                )}
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
                  {q.exerciseType === "sentence_reordering" && (
                    <div className="order-tokens" aria-label="Words to arrange">
                      {q.reorderTokens?.map((token, index) => (
                        <button
                          key={index}
                          type="button"
                          disabled={
                            grading ||
                            moving ||
                            locked ||
                            answer.split(/\s+/).filter((word) => word === token)
                              .length >=
                              (q.reorderTokens
                                ?.slice(0, index + 1)
                                .filter((word) => word === token).length ?? 1)
                          }
                          onClick={() =>
                            update({
                              answers: {
                                ...session.answers,
                                [q.id]: `${answer} ${token}`.trim(),
                              },
                            })
                          }
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  )}
                  {isChoiceFormat(q.exerciseType) ? (
                    <fieldset disabled={grading || moving || locked}>
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
                        <Input
                          id="dynamic-answer"
                          autoComplete="off"
                          value={answer}
                          maxLength={3000}
                          disabled={grading || moving || locked}
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
                        <Textarea
                          className="field-sizing-fixed"
                          id="dynamic-answer"
                          rows={3}
                          value={answer}
                          maxLength={3000}
                          disabled={grading || moving || locked}
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
                      disabled={grading || moving || expired || !answer.trim()}
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
                      {isChoiceFormat(q.exerciseType)
                        ? q.options.find((o) => o.id === result.userAnswer)
                            ?.text
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
                              {q.options.find((o) => o.id === d.optionId)?.text}
                              :
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
                        type="button"
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
                    type="button"
                    variant="outline"
                    disabled={grading || moving || position === 0}
                    onClick={() => goToPosition(position - 1)}
                  >
                    Previous Question
                  </Button>
                  {position + 1 < visibleQuestions.length && (
                    <Button
                      type="button"
                      disabled={grading || moving}
                      onClick={() => goToPosition(position + 1)}
                    >
                      Next Question
                    </Button>
                  )}
                </div>
              </PracticePanel>
              <PracticePanel
                role="complementary"
                title="Câu hỏi"
                className="question-navigator"
                aria-label="Điều hướng câu hỏi"
              >
                <p>
                  {answered}/{visibleQuestions.length} đã trả lời
                </p>
                <progress
                  aria-label="Tiến độ trả lời"
                  value={answered}
                  max={visibleQuestions.length}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    grading || moving || answered === visibleQuestions.length
                  }
                  onClick={() => {
                    const next = visibleQuestions.find(
                      (item) => !session.answers[item.id]?.trim(),
                    );
                    if (next)
                      void move(
                        session.questions.findIndex(
                          (item) => item.id === next.id,
                        ),
                      );
                  }}
                >
                  Câu chưa làm tiếp theo
                </Button>
                <div className="question-legend">
                  <Badge variant="success-light">✓ Đã trả lời</Badge>
                  <Badge variant="outline">○ Chưa trả lời</Badge>
                </div>
                <p className="question-current-hint">Viền đậm: câu đang mở</p>
                <nav className="question-grid" aria-label="Chọn câu hỏi">
                  {visibleQuestions.map((question) => {
                    const index = session.questions.findIndex(
                      (q) => q.id === question.id,
                    );
                    const done = !!session.answers[question.id]?.trim();
                    const current = index === session.currentIndex;
                    return (
                      <button
                        key={question.id}
                        type="button"
                        className={`question-jump ${done ? "is-answered" : "is-unanswered"}`}
                        aria-label={`Câu ${index + 1} — ${done ? "Đã trả lời" : "Chưa trả lời"}`}
                        aria-current={current ? "step" : undefined}
                        disabled={grading || moving}
                        onClick={() => void move(index)}
                      >
                        <span>{index + 1}</span>
                        <span aria-hidden="true" className="question-status">
                          {done ? "✓" : "○"}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </PracticePanel>
            </div>
          )}
          {exam && (
            <div className="practice-exam-submit">
              <Button
                type="button"
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
              {!session.generationComplete && (
                <p>
                  Chờ đủ câu hỏi trước khi nộp bài kiểm tra. Các câu trả lời đã
                  được lưu.
                </p>
              )}
            </div>
          )}
          {session.status === "completed" && (
            <PracticePanel>
              <h2>Kết quả bài luyện</h2>
              <h3>Session complete</h3>
              <p>
                {totals.correct} correct · {totals.partial} partially correct ·{" "}
                {totals.incorrect} incorrect · {totals.pending} pending review
              </p>
              <p>
                Score {totals.score}/{totals.maxScore} graded.
              </p>
            </PracticePanel>
          )}
          {session.questions.length > 0 && (
            <details className="practice-record">
              <summary>Tiến độ và kết quả</summary>
              <p>
                Previous attempts: {historyCount}. All attempts are kept;
                unscored answers are excluded from the score.
              </p>
              <p>
                Correct {totals.correct} · Partially correct {totals.partial} ·
                Incorrect {totals.incorrect} · Pending review {totals.pending}
              </p>
            </details>
          )}
        </>
      )}
      <PracticePanel>
        <details className="practice-history">
          <summary>Bài luyện đã lưu ({saved.length})</summary>
          <h2>Lịch sử bài luyện</h2>
          <p>
            Bài làm tự động lưu trên trình duyệt này. Chọn một bài để tiếp tục;
            lịch sử cũ luôn được giữ.
          </p>
          {saved.length === 0 ? (
            <p>No generated sessions yet.</p>
          ) : (
            <div className="saved-sessions">
              {saved.map((s) => (
                <Button
                  type="button"
                  key={s.sessionId}
                  variant="outline"
                  disabled={grading || moving || generating || creating}
                  onClick={() => void resume(s.sessionId)}
                >
                  {new Date(s.createdAt).toLocaleDateString()} ·{" "}
                  {s.settings.difficulty} · {s.settings.questionCount} questions
                  · {Object.keys(s.results).length} evaluated
                </Button>
              ))}
            </div>
          )}
        </details>
      </PracticePanel>
    </div>
  );
}
