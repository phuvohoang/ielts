import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { families, shuffle } from "../lib/content";
import {
  blankAnswers,
  gradeRecall,
  recallResult,
  wordClasses,
  type RecallAnswers,
  type RecallFeedback,
  type RecallFamily,
} from "../lib/recall";
import { record } from "../lib/db";
import { useLearning } from "../lib/store";

type Round = { family: RecallFamily; feedback: RecallFeedback };
export function FamilyRecall() {
  const [params] = useSearchParams();
  const selected = families.find((f) => f.id === params.get("family"));
  const [topic, setTopic] = useState("all");
  const [size, setSize] = useState("10");
  const [allForms, setAllForms] = useState(true);
  const [queue, setQueue] = useState<RecallFamily[]>(
    selected ? [selected] : [],
  );
  const [started, setStarted] = useState(!!selected);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<RecallAnswers>(blankAnswers);
  const [feedback, setFeedback] = useState<RecallFeedback | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstInput = useRef<HTMLInputElement>(null);
  const { refresh } = useLearning();
  const family = queue[index];
  function start(
    pool = families.filter((f) => topic === "all" || f.topic === topic),
  ) {
    setQueue(shuffle(pool).slice(0, Number(size)));
    setIndex(0);
    setStarted(true);
    setAnswers(blankAnswers());
    setFeedback(null);
    setRounds([]);
    setHint(false);
    setError("");
  }
  async function submit() {
    if (busy || feedback || !family) return;
    setBusy(true);
    setError("");
    const graded = gradeRecall(family, answers, allForms);
    try {
      await record({
        questionId: `recall-${family.id}`,
        family: family.id,
        type: "Word Family Recall",
        answer:
          wordClasses.map((part) => `${part}: ${answers[part]}`).join("\n") +
          (hint ? "\nRoot hint used." : ""),
        result: recallResult(graded),
        date: Date.now(),
      });
      await refresh();
      setFeedback(graded);
      setRounds((old) => [...old, { family, feedback: graded }]);
    } catch {
      setError("Your answers could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function next() {
    setIndex((i) => i + 1);
    setAnswers(blankAnswers());
    setFeedback(null);
    setHint(false);
    setError("");
    // The inputs remain mounted across cards, so restore keyboard focus explicitly.
    setTimeout(() => firstInput.current?.focus(), 0);
  }
  const missed = rounds.filter(
    (round) => recallResult(round.feedback) !== "correct",
  );
  return (
    <>
      <div className="heading">
        <div className="eyebrow">WORD FAMILIES · ACTIVE RECALL</div>
        <h1>Build the whole family.</h1>
        <p>
          Type the noun, adjective, adverb and verb from memory. No answer
          choices.
        </p>
      </div>
      {!started ? (
        <section className="panel">
          <h2>Recall before you reveal.</h2>
          <p>
            You’ll see a Vietnamese meaning and a topic. Fill all four word
            classes. Use commas for multiple forms, and type <strong>—</strong>{" "}
            or <strong>none</strong> when no common form is taught.
          </p>
          <div className="filter-grid">
            <label className="field">
              Topic
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="all">All topics</option>
                {[...new Set(families.map((f) => f.topic))].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Families per session
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                {["5", "10", "25"].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Recall goal
              <select
                value={allForms ? "all" : "one"}
                onChange={(e) => setAllForms(e.target.value === "all")}
              >
                <option value="all">All taught forms · harder</option>
                <option value="one">One valid form per class</option>
              </select>
            </label>
          </div>
          <Button onClick={() => start()}>
            Start word-family recall <ArrowRight size={16} />
          </Button>
        </section>
      ) : family ? (
        <section className="panel recall-card">
          <div className="section-heading">
            <span className="badge">
              {family.topic} · {family.cefr}
            </span>
            <span className="muted">
              Family {index + 1} / {queue.length}
            </span>
          </div>
          <progress value={index} max={queue.length} />
          <p className="eyebrow recall-cue-label">VIETNAMESE MEANING</p>
          <h2 lang="vi">{family.meaning}</h2>
          <p className="muted">
            {allForms
              ? "Recall every form taught in the library."
              : "Recall at least one valid form per class."}{" "}
            Separate words with commas. Type “none” if no common form is taught.
          </p>
          {!feedback && (
            <Button
              variant="ghost"
              onClick={() => setHint(true)}
              disabled={hint}
            >
              {hint ? `Root hint: ${family.root}` : "Show root hint"}
            </Button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="recall-grid">
              {wordClasses.map((part, i) => (
                <div
                  className={`recall-field ${feedback?.[part].result ?? ""}`}
                  key={part}
                >
                  <label className="field">
                    <span className="recall-class">
                      {part === "adjective"
                        ? "Adjective (adj)"
                        : part === "adverb"
                          ? "Adverb (adv)"
                          : part[0].toUpperCase() + part.slice(1)}
                    </span>
                    <input
                      ref={i === 0 ? firstInput : undefined}
                      autoFocus={i === 0}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={answers[part]}
                      required
                      disabled={!!feedback || busy}
                      onChange={(e) =>
                        setAnswers((old) => ({
                          ...old,
                          [part]: e.target.value,
                        }))
                      }
                      placeholder="Recall from memory…"
                    />
                  </label>
                  {feedback && (
                    <div className="recall-answer" role="status">
                      <strong>
                        {feedback[part].result === "correct"
                          ? "✓ Recalled"
                          : feedback[part].result === "review"
                            ? "Check an unlisted form"
                            : "Keep practising"}
                      </strong>
                      <p>
                        Study forms:{" "}
                        <span>
                          {feedback[part].expected.join(", ") ||
                            "No common form taught"}
                        </span>
                      </p>
                      {allForms && feedback[part].missing.length > 0 && (
                        <p>Missing: {feedback[part].missing.join(", ")}</p>
                      )}
                      {feedback[part].result === "review" && (
                        <p>
                          This word is outside the study list. Verify it before
                          marking it correct in your Error Bank.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!feedback && (
              <Button
                type="submit"
                disabled={
                  busy || wordClasses.some((part) => !answers[part].trim())
                }
              >
                {busy ? "Saving…" : "Check all four forms"}
              </Button>
            )}
          </form>
          {error && <p role="alert">{error}</p>}
          {feedback && (
            <div className="feedback">
              <h3>
                {family.root} ·{" "}
                {
                  wordClasses.filter(
                    (part) => feedback[part].result === "correct",
                  ).length
                }{" "}
                / 4 word classes recalled
              </h3>
              <p>{family.examples[0]}</p>
              {family.mistakes.slice(1).map((note) => (
                <p key={note}>{note}</p>
              ))}
              <Button onClick={next}>
                {index === queue.length - 1
                  ? "View recall summary"
                  : "Next family"}{" "}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            className="end-session"
            onClick={() => setIndex(queue.length)}
          >
            End recall session
          </Button>
        </section>
      ) : (
        <section className="panel">
          <h2>Recall session complete.</h2>
          <p>
            {rounds.length} families attempted · {rounds.length - missed.length}{" "}
            fully recalled · {missed.length} to revisit
          </p>
          <div className="actions">
            <Button
              disabled={!missed.length}
              onClick={() => start(missed.map((round) => round.family))}
            >
              <RotateCcw size={16} /> Retry missed families
            </Button>
            <Button variant="outline" onClick={() => setStarted(false)}>
              New recall session
            </Button>
            <Link className="button button-outline" to="/errors">
              Open Error Bank
            </Link>
          </div>
        </section>
      )}
      <Link className="button button-ghost" to="/families">
        Back to word-family library
      </Link>
    </>
  );
}
