import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../ui/button";
import { QuestionPrompt } from "../QuestionPrompt";
import { canStudy, lessonById, theories } from "../../lib/foundation";
import {
  stages,
  nextStage,
  lessonStatus,
  type Stage,
  type MasteryCheck,
} from "../../lib/learning-model";
import {
  startLesson,
  completeTheory,
  stageQuestions,
  recordLearningAnswer,
  verifyLearningAnswer,
  beginMastery,
  finishMastery,
} from "../../lib/learning";
import { questionById, shuffle } from "../../lib/content";
import { useLearning } from "../../lib/store";
const labels: Record<Stage, string> = {
  learn: "Learn",
  understand: "Understand",
  guided: "Guided Practice",
  independent: "Independent Practice",
  apply: "Apply",
  review: "Review",
  mastery: "Mastery Check",
};
export function LessonFlow() {
  const { lessonId = "" } = useParams();
  const store = useLearning();
  const outline = lessonById.get(lessonId);
  const theory = theories.find((t) => t.id === lessonId);
  const progress = store.lessons.find((p) => p.id === lessonId);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<Stage>("learn");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [check, setCheck] = useState<MasteryCheck>();
  useEffect(() => {
    let live = true;
    setReady(false);
    setCheck(undefined);
    setResult("");
    setAnswer("");
    setIndex(0);
    setError("");
    startLesson(lessonId)
      .then(async (row) => {
        await store.refresh();
        if (live) {
          const phase = row.masteredAt ? "learn" : nextStage(row);
          setActive(phase);
          const history = useLearning
            .getState()
            .attempts.filter(
              (a) =>
                a.lessonId === lessonId &&
                a.learningStage === phase &&
                !a.checkId &&
                (phase !== "review" || a.date >= (row.reviewDueAt ?? Infinity)),
            );
          const latest = new Map(
            history
              .sort(
                (a, b) => (a.reviewedAt ?? a.date) - (b.reviewedAt ?? b.date),
              )
              .map((a) => [a.questionId, a]),
          );
          const pool = stageQuestions(lessonId, phase);
          const pending = pool.findIndex(
            (q) => latest.get(q.id)?.result !== "correct",
          );
          setIndex(pending < 0 ? 0 : pending);
          setReady(true);
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, [lessonId, store.refresh]);
  const displayedChoices = useMemo(
    () =>
      shuffle(
        (active === "mastery"
          ? questionById.get(check?.questionIds[index] ?? "")
          : stageQuestions(lessonId, active)[index]
        )?.choices ?? [],
      ),
    [lessonId, active, index, check?.id],
  );
  if (!outline?.available || !theory)
    return (
      <section className="panel">
        <h1>Lesson upcoming</h1>
        <p>This lesson has no activated content yet.</p>
        <Link to="/path">Return to Learning Path</Link>
      </section>
    );
  if (!canStudy(lessonId, store.lessons))
    return (
      <section className="panel">
        <h1>Study the prerequisite theory first.</h1>
        <p>
          Theory and examples in the preceding lesson prepare you for this rule.
        </p>
        <Link to="/path">Open Learning Path</Link>
      </section>
    );
  if (!ready) return <p role="status">Loading your lesson progress…</p>;
  const allowed = (stage: Stage) =>
    stages.indexOf(stage) <= stages.indexOf(nextStage(progress));
  const pool =
    active === "mastery"
      ? (check?.questionIds
          .map((id) => questionById.get(id)!)
          .filter(Boolean) ?? [])
      : stageQuestions(lessonId, active);
  const q = pool[index];
  const relevant = store.attempts.filter(
    (a) =>
      a.lessonId === lessonId &&
      a.learningStage === active &&
      (active === "mastery" ? a.checkId === check?.id : !a.checkId),
  );
  const saved = relevant
    .filter((a) => a.questionId === q?.id)
    .sort((a, b) => b.date - a.date)[0];
  function move(stage: Stage) {
    setActive(stage);
    let pending = 0;
    if (stage === "mastery" && check && !check.finishedAt) {
      pending = check.questionIds.findIndex(
        (id) =>
          !store.attempts.some(
            (a) => a.checkId === check.id && a.questionId === id,
          ),
      );
      if (pending < 0) pending = check.questionIds.length;
    }
    setIndex(pending);
    setAnswer("");
    setResult("");
    setError("");
    setVerified(false);
  }
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save learning progress.",
      );
    } finally {
      setBusy(false);
    }
  }
  function next() {
    setIndex((i) => i + 1);
    setAnswer("");
    setResult("");
    setVerified(false);
  }
  const reviewWaiting =
    active === "review" &&
    !result &&
    !progress?.completed.includes("review") &&
    Date.now() < (progress?.reviewDueAt ?? Infinity);
  return (
    <>
      <div className="heading">
        <div className="eyebrow">
          SENTENCE FOUNDATIONS · {lessonStatus(progress)}
        </div>
        <h1>{outline.title}</h1>
        <p>
          One rule at a time. Your learning progress is saved on this device.
        </p>
      </div>
      <div className="learning-steps">
        {stages.map((stage, i) => (
          <Button
            variant={active === stage ? "default" : "outline"}
            disabled={!allowed(stage)}
            key={stage}
            onClick={() => move(stage)}
          >
            {i + 1}. {labels[stage]}{" "}
            {progress?.completed.includes(stage) ? "✓" : ""}
          </Button>
        ))}
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {active === "learn" ? (
        <section className="panel theory" lang="vi">
          <h2>Hiểu quy tắc trước khi làm bài</h2>
          {[
            ["what", "Quy tắc là gì?"],
            ["why", "Vì sao quy tắc này hoạt động?"],
            ["when", "Khi nào dùng và kiểm tra ra sao?"],
            ["exceptions", "Ngoại lệ và giới hạn"],
          ].map(([key, label]) => (
            <article key={key}>
              <h3>{label}</h3>
              <p>{theory[key as "what" | "why" | "when" | "exceptions"]}</p>
            </article>
          ))}
          <Button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await completeTheory(lessonId, "learn");
                await store.refresh();
                move("understand");
              })
            }
          >
            I have studied the rule → Understand
          </Button>
        </section>
      ) : active === "understand" ? (
        <section className="panel theory">
          <h2>Understand through examples</h2>
          {theory.examples.map(([en, vi, note]) => (
            <article className="annotated-example" key={en}>
              <h3>{en}</h3>
              <p lang="vi">{vi}</p>
              <p className="annotation" lang="vi">
                {note}
              </p>
            </article>
          ))}
          <h2>Common mistakes</h2>
          {theory.mistakes.map(([wrong, correct, note]) => (
            <article className="rule" key={wrong}>
              <p className="example bad">✕ {wrong}</p>
              <p className="example good">✓ {correct}</p>
              <p lang="vi">{note}</p>
            </article>
          ))}
          <Button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await completeTheory(lessonId, "understand");
                await store.refresh();
                move("guided");
              })
            }
          >
            I understand the examples → Guided Practice
          </Button>
        </section>
      ) : reviewWaiting ? (
        <section className="panel">
          <h2>Let memory do some work.</h2>
          <p>
            This review becomes available{" "}
            {progress?.reviewDueAt
              ? new Date(progress.reviewDueAt).toLocaleString()
              : "after your application tasks"}
            . Missed review items return the following day.
          </p>
          <p>
            You can keep learning prerequisite-ready lessons while this review
            waits.
          </p>
          <Button variant="outline" onClick={() => move("learn")}>
            Revisit theory
          </Button>
          <Link className="button button-outline" to="/path">
            Continue the Learning Path
          </Link>
        </section>
      ) : active === "mastery" && !check ? (
        <section className="panel">
          <h2>Check what you can produce independently.</h2>
          <p>
            Six held-back questions from this lesson and previously completed
            study cycles. No hints. At least 80% is required; unresolved answers
            need review before a result can be awarded.
          </p>
          <Button
            disabled={busy || !progress?.completed.includes("review")}
            onClick={() =>
              void action(async () => {
                const c = await beginMastery(lessonId);
                setCheck(c);
                const history = store.attempts.filter(
                  (a) => a.checkId === c.id,
                );
                const pending = c.questionIds.findIndex(
                  (id) => !history.some((a) => a.questionId === id),
                );
                setIndex(pending < 0 ? c.questionIds.length : pending);
              })
            }
          >
            Start / resume mastery check
          </Button>
        </section>
      ) : check?.finishedAt && active === "mastery" ? (
        <section className="panel">
          <h2>
            {check.passed ? "Lesson mastered." : "Keep building the rule."}
          </h2>
          <p>
            Mastery check: {Math.round(check.score ?? 0)}%.{" "}
            {check.passed
              ? "A completed check, application and spaced review support this status."
              : "Revisit the theory and return for the next due review before checking again."}
          </p>
          <Link className="button button-primary" to="/path">
            Back to Learning Path
          </Link>
        </section>
      ) : q ? (
        <section className="panel practice-card" data-question-id={q.id}>
          <div className="section-heading">
            <span className="badge">
              {labels[active]} · {index + 1} / {pool.length}
            </span>
          </div>
          {active === "guided" && (
            <aside className="guided-hint" lang="vi">
              <strong>Gợi ý từ quy tắc</strong>
              <p>{theories.find((t) => t.id === q.lesson_id)?.hint}</p>
            </aside>
          )}
          <QuestionPrompt question={q} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const r = await recordLearningAnswer(q.id, answer, {
                  checkId: active === "mastery" ? check?.id : undefined,
                });
                await store.refresh();
                setResult(r);
              });
            }}
          >
            {q.choices.length ? (
              <div className="choices">
                {displayedChoices.map((choice) => (
                  <label className="choice" key={choice}>
                    <input
                      type="radio"
                      name="lesson-answer"
                      checked={answer === choice}
                      disabled={!!result || busy}
                      onChange={() => setAnswer(choice)}
                    />
                    {choice}
                  </label>
                ))}
              </div>
            ) : (
              <label className="field">
                Your answer
                <textarea
                  value={answer}
                  disabled={!!result || busy}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            )}
            {!result && (
              <Button disabled={!answer.trim() || busy} type="submit">
                Check answer
              </Button>
            )}
          </form>
          {result && (
            <div className={`feedback ${result}`} role="status">
              <h3>
                {result === "correct"
                  ? "Correct."
                  : result === "review"
                    ? "Needs review."
                    : "Revisit the specific rule."}
              </h3>
              <strong>
                Rule: {lessonById.get(q.grammar_rule_ids[0])?.title}
              </strong>
              <p lang="vi">{q.explanation}</p>
              <p>Reference answer: {q.answers[0]}</p>
              {result === "review" && saved?.id && (
                <>
                  <p>
                    This sentence may be valid even when it differs from the
                    reference. There is no automated grammar assessment. Compare
                    it with the rule before confirming.
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={verified}
                      onChange={(e) => setVerified(e.target.checked)}
                    />
                    I checked the required structure, meaning, and sentence
                    boundaries against the rule.
                  </label>
                  <Button
                    variant="outline"
                    disabled={!verified || busy}
                    onClick={() =>
                      void action(async () => {
                        await verifyLearningAnswer(saved.id!, true);
                        await store.refresh();
                        setResult("correct");
                      })
                    }
                  >
                    Confirm this answer follows the rule
                  </Button>
                </>
              )}
              <Button disabled={busy} onClick={next}>
                Next exercise
              </Button>
              <Button variant="ghost" onClick={() => move("learn")}>
                Revisit theory
              </Button>
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <h2>{labels[active]} · stage summary</h2>
          {active === "mastery" ? (
            <>
              <p>
                Finish to calculate the result from this complete check. Pending
                reviews cannot count as passed.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const completed = await finishMastery(check!.id);
                    setCheck(completed);
                    await store.refresh();
                  })
                }
              >
                Finish mastery check
              </Button>
              <Link className="button button-ghost" to="/errors">
                Resolve pending answers in Error Bank
              </Link>
            </>
          ) : progress?.completed.includes(active) ? (
            <>
              <p>All tasks in this stage are complete.</p>
              <Button onClick={() => move(stages[stages.indexOf(active) + 1])}>
                Continue to {labels[stages[stages.indexOf(active) + 1]]}
              </Button>
            </>
          ) : (
            <>
              <p>
                Some tasks still need a correct response or review. Revisit the
                theory before trying the focused stage again.
              </p>
              <Button onClick={() => move("learn")}>Revisit theory</Button>
              <Button variant="outline" onClick={() => move(active)}>
                Revisit this stage
              </Button>
            </>
          )}
        </section>
      )}
      <Link className="button button-ghost" to="/path">
        Back to Learning Path
      </Link>
    </>
  );
}
