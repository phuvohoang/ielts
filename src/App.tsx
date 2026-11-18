import { useEffect, useState } from "react";
import {
  BrowserRouter,
  HashRouter,
  NavLink,
  Route,
  Routes,
  Link,
  useSearchParams,
} from "react-router-dom";
import {
  BookOpen,
  LayoutDashboard,
  Route as PathIcon,
  Layers,
  PencilLine,
  FlaskConical,
  CircleAlert,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  ArrowUpRight,
  ArrowRight,
  Check,
  Flame,
  Menu,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import {
  families,
  questions,
  types,
  grade,
  shuffle,
  type Question,
} from "./lib/content";
import { useLearning } from "./lib/store";
import {
  db,
  record,
  exportBackup,
  importBackup,
  resolveAttempt,
} from "./lib/db";
import curriculum from "./data/curriculum.json";
import { sections } from "./data/lessons";
const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/path", "Learning Path", PathIcon],
  ["/lessons", "Grammar Lessons", BookOpen],
  ["/families", "Word Families", Layers],
  ["/practice", "Practice Lab", FlaskConical],
  ["/writing", "Writing Trainer", PencilLine],
  ["/errors", "Error Bank", CircleAlert],
  ["/progress", "Progress & Analytics", ChartNoAxesCombined],
  ["/settings", "Settings", SettingsIcon],
] as const;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
function useStats() {
  const s = useLearning();
  const judged = s.attempts.filter((a) => a.result !== "review");
  const recognition = judged.filter((a) =>
    ["Identify Word Class", "Error Detection"].includes(a.type),
  );
  const production = judged.filter(
    (a) => !["Identify Word Class", "Error Detection"].includes(a.type),
  );
  return {
    ...s,
    accuracy: pct(
      judged.filter((a) => a.result === "correct").length,
      judged.length,
    ),
    recognition: pct(
      recognition.filter((a) => a.result === "correct").length,
      recognition.length,
    ),
    production: pct(
      production.filter((a) => a.result === "correct").length,
      production.length,
    ),
    due: s.progress.filter((p) => p.next <= Date.now()),
    mastered:
      recognition.length >= 10 &&
      production.length >= 20 &&
      pct(
        recognition.filter((a) => a.result === "correct").length,
        recognition.length,
      ) >= 90 &&
      pct(
        production.filter((a) => a.result === "correct").length,
        production.length,
      ) >= 80 &&
      s.writing.some((w) => w.applied),
  };
}
// GitHub Pages cannot rewrite application paths; hashes keep deep links refreshable.
const AppRouter = import.meta.env.VITE_ROUTER_MODE === "hash" ? HashRouter : BrowserRouter;

function App() {
  const [open, setOpen] = useState(false);
  const { refresh, error } = useLearning();
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <AppRouter>
      <div className="app">
        <aside className={open ? "sidebar open" : "sidebar"}>
          <Link className="brand" to="/">
            <span className="brand-mark">i.</span>
            <span>
              grammar<span className="brand-light">studio</span>
              <small>YOUR IELTS STUDY COMPANION</small>
            </span>
          </Link>
          <p className="nav-caption">YOUR WORKSPACE</p>
          <nav>
            {nav.map(([path, label, Icon]) => (
              <NavLink
                end={path === "/"}
                onClick={() => setOpen(false)}
                key={path}
                to={path}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="eyebrow">A LITTLE, EVERY DAY</span>
            <p>
              Accuracy grows
              <br />
              with practice.
            </p>
            <span>One sentence at a time.</span>
          </div>
          <div className="profile">
            <span className="avatar">L</span>
            <div>
              Independent learner<small>General Training · Target 6.5</small>
            </div>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <button
              aria-label="Toggle navigation"
              className="mobile-menu"
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
            <span>MY LEARNING SPACE</span>
            <div>
              <span className="status-dot" /> Saved on this device{" "}
              <span className="avatar small">L</span>
            </div>
          </header>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          <div className="page">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/path" element={<Curriculum />} />
              <Route path="/lessons" element={<Lessons />} />
              <Route path="/families" element={<Families />} />
              <Route path="/practice" element={<Practice />} />
              <Route path="/writing" element={<Writing />} />
              <Route path="/errors" element={<Errors />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/settings" element={<Settings />} />
              <Route
                path="*"
                element={
                  <>
                    <h1>Page not found</h1>
                    <Link to="/">Return to dashboard</Link>
                  </>
                }
              />
            </Routes>
          </div>
          <footer>
            BUILT FOR STEADY PROGRESS{" "}
            <span>Learn it. Recall it. Make it yours.</span>
          </footer>
        </main>
      </div>
    </AppRouter>
  );
}
function Heading({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div className="eyebrow">{tag}</div>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
function Dashboard() {
  const s = useStats();
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dates = new Set([
    ...s.attempts.map((a) => new Date(a.date).toLocaleDateString("en-CA")),
    ...s.writing.map((w) => new Date(w.date).toLocaleDateString("en-CA")),
  ]);
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(cursor.toLocaleDateString("en-CA")))
    cursor.setDate(cursor.getDate() - 1);
  while (dates.has(cursor.toLocaleDateString("en-CA"))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return (
    <>
      <div className="date-line">
        {today}
        <span>
          <Flame size={15} /> {streak} day streak
        </span>
      </div>
      <Heading
        tag="SMALL STEPS. STRONGER ENGLISH."
        title="Make room for progress."
      >
        Build the grammar confidence to turn your ideas into clear English.
      </Heading>
      <section className="hero">
        <div>
          <span className="pill">YOUR NEXT STEP · LESSON 01</span>
          <h2>
            Good writing starts
            <br />
            with the right words.
          </h2>
          <p>
            Understand the role of every word.
            <br />
            Then put your knowledge into practice.
          </p>
          <Link className="button button-primary" to="/lessons">
            {s.attempts.length ? "Continue learning" : "Start learning"}{" "}
            <ArrowRight size={17} />
          </Link>
          <span className="hero-meta">
            Parts of Speech & Word Formation · 4 sections
          </span>
        </div>
        <div className="word-art" aria-hidden="true">
          <span className="art-label">A WORD. MANY POSSIBILITIES.</span>
          <div className="word-card one">
            <small>NOUN</small>success<span> /səkˈses/</span>
          </div>
          <div className="word-card two">
            <small>ADJECTIVE</small>successful
            <Check size={21} />
          </div>
          <div className="word-card three">
            <small>ADVERB</small>successfully<span>↗</span>
          </div>
          <div className="art-dots">
            · · · · ·<br />· · · · ·<br />· · · · ·
          </div>
        </div>
      </section>
      <div className="stats-grid">
        {[
          ["Due for review", s.due.length, "Keep yesterday’s learning alive"],
          [
            "Practice accuracy",
            s.attempts.length ? `${s.accuracy}%` : "—",
            `${s.attempts.length} answers submitted`,
          ],
          [
            "Word families",
            `${s.progress.length} / 25`,
            "Your vocabulary, taking shape",
          ],
          [
            "Lesson mastery",
            s.mastered ? "1 / 1" : "0 / 1",
            "Foundation starts here",
          ],
        ].map(([label, value, hint]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="section-heading">
            <h2>Today’s study plan</h2>
            <span className="muted">180 min / day</span>
          </div>
          {[
            [
              "01",
              "Learn the foundations",
              "Grammar lesson + active recall",
              "45 min",
              "/lessons",
            ],
            [
              "02",
              "Make the words stick",
              "Word families + spaced review",
              "30 min",
              "/practice?due=1",
            ],
            [
              "03",
              "Put it into your own words",
              "Writing practice + self-correction",
              "45 min",
              "/writing",
            ],
          ].map(([n, title, sub, time, url]) => (
            <Link className="plan-row" to={url} key={n}>
              <span className="step">{n}</span>
              <div>
                <strong>{title}</strong>
                <small>{sub}</small>
              </div>
              <span>{time}</span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
          <p className="plan-foot">
            + 60 min of independent listening, reading & speaking practice.
          </p>
        </section>
        <section className="panel weekly">
          <div className="section-heading">
            <h2>Your week, so far</h2>
            <ChartNoAxesCombined size={20} />
          </div>
          <div className="week-bars">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - 6 + i);
              const n = s.attempts.filter(
                (a) => new Date(a.date).toDateString() === d.toDateString(),
              ).length;
              return (
                <div key={i}>
                  <span className="bar-track">
                    <span style={{ height: `${Math.min(n * 5, 100)}%` }} />
                  </span>
                  <small>
                    {d.toLocaleDateString("en", { weekday: "narrow" })}
                  </small>
                </div>
              );
            })}
          </div>
          <p>
            {s.attempts.length
              ? "Every attempt is a step forward."
              : "A fresh start looks good on you."}
          </p>
          <small>Your activity will appear as you practise.</small>
          <Link to="/progress">
            View your progress <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <section className="panel focus-panel">
        <div>
          <h3>Due today · {s.due.length}</h3>
          {s.due.length ? (
            <p>
              {s.due
                .map((p) => families.find((f) => f.id === p.id)?.root)
                .join(", ")}
            </p>
          ) : (
            <p>No reviews due. New practice will build your queue.</p>
          )}
          <Link to="/practice?due=1">Open review queue →</Link>
        </div>
        <div>
          <h3>New word families · {families.length - s.progress.length}</h3>
          <p>
            {families
              .filter((f) => !s.progress.some((p) => p.id === f.id))
              .slice(0, 4)
              .map((f) => f.root)
              .join(", ") || "All families started."}
          </p>
          <Link to="/families">Explore the library →</Link>
        </div>
        <div>
          <h3>
            Writing errors to revisit ·{" "}
            {
              s.attempts.filter(
                (a) =>
                  [
                    "Sentence Correction",
                    "Writing Error Recall",
                    "Vietnamese to English",
                  ].includes(a.type) && a.result !== "correct",
              ).length
            }
          </h3>
          <p>
            {s.attempts.some((a) => a.result === "incorrect")
              ? "Focus rule: word class and word formation."
              : "Weak grammar rules appear after your first corrections."}
          </p>
          <Link to="/errors">Review your errors →</Link>
        </div>
      </section>
    </>
  );
}
function Curriculum() {
  return (
    <>
      <Heading tag="THE BIG PICTURE" title="Your learning path.">
        Eight weeks of foundations within your 24-week IELTS journey.
      </Heading>
      <div className="notice">
        Lesson 01 is ready. Lessons 02–32 are upcoming and stay locked after
        mastery.
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <section className="panel curriculum" key={i}>
          <h2>Week {i + 1}</h2>
          {curriculum
            .filter((l) => l.week === i + 1)
            .map((l) => (
              <div className="curriculum-row" key={l.id}>
                <span>{String(l.id).padStart(2, "0")}</span>
                <strong>{l.title}</strong>
                {l.available ? (
                  <Link to="/lessons">Start lesson →</Link>
                ) : (
                  <span className="badge">Upcoming</span>
                )}
              </div>
            ))}
        </section>
      ))}
    </>
  );
}
function Lessons() {
  const [active, setActive] = useState(0);
  const s = sections[active];
  const stats = useStats();
  return (
    <>
      <Heading
        tag="GRAMMAR FOUNDATION · LESSON 01"
        title="Parts of Speech & Word Formation."
      >
        Learn the pattern. Notice the difference. Build your own sentence.
      </Heading>
      <div className="tabs">
        {sections.map((x, i) => (
          <Button
            variant={active === i ? "default" : "outline"}
            key={x.code}
            onClick={() => setActive(i)}
          >
            {x.code} · {x.title}
          </Button>
        ))}
      </div>
      <section className="panel lesson">
        <span className="eyebrow">{s.code}</span>
        <h2>{s.title}</h2>
        <p lang="vi">{s.intro}</p>
        {s.rules.map(([title, rule, good, bad]) => (
          <article className="rule" key={title}>
            <h3>{title}</h3>
            <p lang="vi">{rule}</p>
            <p className="example good">✓ {good}</p>
            <p className="example bad">✕ {bad}</p>
          </article>
        ))}
        {active === 1 && (
          <p>
            Common suffixes: noun -tion, -ment, -ness; adjective -ful, -ive,
            -al; adverb -ly. These are clues, not universal rules. Good → well;
            fast → fast; hard ≠ hardly (hầu như không). “Information” is
            uncountable; “informations” is incorrect.
          </p>
        )}
        {active === 2 && (
          <p>
            Learn chunks: make a decision, achieve success, depend on someone,
            explain something to someone. “Economic” relates to the economy;
            “economical” means using few resources. “Interested” describes a
            feeling; “interesting” describes its cause.
          </p>
        )}
        <Link
          className="button button-primary"
          to={`/practice?section=${active}`}
        >
          Practise {s.code} <ArrowRight size={16} />
        </Link>
      </section>
      <div className="notice">
        Mastery: recognition {stats.recognition}% / 90% · production{" "}
        {stats.production}% / 80% · writing application{" "}
        {stats.writing.some((w) => w.applied) ? "self-reviewed" : "pending"}.
        Minimum 10 recognition and 20 production attempts.{" "}
        {stats.mastered ? "Mastered." : "Keep practising."}
      </div>
    </>
  );
}
function Families() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { progress } = useLearning();
  const list = families.filter((f) =>
    `${f.root} ${f.meaning} ${f.topic}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        tag="YOUR LEXICAL TOOLKIT"
        title="One root. A family of possibilities."
      >
        25 word families · Empty forms mean no common form is taught.
      </Heading>
      <label className="field">
        Search by word, topic or Vietnamese meaning
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Try education or Work…"
        />
      </label>
      <div className="family-grid">
        {list.map((f) => (
          <section className="panel family" key={f.id}>
            <div className="section-heading">
              <span className="badge">
                {f.cefr} · {f.topic}
              </span>
              <span className="muted">
                {progress.find((p) => p.id === f.id)?.mastered
                  ? "Mastered"
                  : progress.some((p) => p.id === f.id)
                    ? "Learning"
                    : "New"}
              </span>
            </div>
            <h2>{f.root}</h2>
            <p className="muted">
              /{f.ipa}/ · {f.meaning}
            </p>
            {Object.entries(f.forms).map(([pos, words]) => (
              <div className="form-row" key={pos}>
                <span>{pos}</span>
                <strong>{words.join(", ") || "—"}</strong>
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() => setSelected(selected === f.id ? null : f.id)}
            >
              {selected === f.id ? "Close details" : "Explore family"}{" "}
              <ArrowUpRight size={16} />
            </Button>
            {selected === f.id && (
              <div className="family-details">
                <p>{f.examples[0]}</p>
                <h3>Collocations & patterns</h3>
                <p>{f.collocations.join(" · ")}</p>
                <p>{f.verbPatterns.join(" · ")}</p>
                <h3>Watch out</h3>
                <p>{f.mistakes[0]}</p>
                <Link to={`/practice?family=${f.id}`}>
                  Practise this family →
                </Link>
              </div>
            )}
          </section>
        ))}
      </div>
      {!list.length && <p>No families match your search.</p>}
    </>
  );
}
function Practice() {
  const [params] = useSearchParams();
  const stats = useStats();
  const [kind, setKind] = useState("all");
  const [family, setFamily] = useState(params.get("family") || "all");
  const [topic, setTopic] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [count, setCount] = useState("10");
  const [queue, setQueue] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState("");
  const [results, setResults] = useState<{ q: Question; r: string }[]>([]);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const due = params.has("due");
  const section = params.get("section");
  const sectionTypes =
    section === "0"
      ? ["Identify Word Class", "Error Detection"]
      : section === "1"
        ? ["Word Formation", "Fill in the Blank"]
        : section === "2"
          ? ["Vietnamese to English", "Sentence Building"]
          : section === "3"
            ? ["Sentence Correction", "Writing Error Recall"]
            : null;
  const pool = questions.filter(
    (q) =>
      (kind === "all" || q.type === kind) &&
      (family === "all" || q.family === family) &&
      (topic === "all" || q.topic === topic) &&
      (difficulty === "all" || q.difficulty === difficulty) &&
      (!due || stats.due.some((p) => p.id === q.family)) &&
      (!sectionTypes || sectionTypes.includes(q.type)),
  );
  function start(items = pool) {
    setQueue(
      shuffle(items)
        .sort((a, b) => {
          const pa = stats.progress.find((p) => p.id === a.family);
          const pb = stats.progress.find((p) => p.id === b.family);
          return (pb?.incorrect ?? 0) - (pa?.incorrect ?? 0);
        })
        .slice(0, count === "unlimited" ? items.length : Number(count)),
    );
    setIndex(0);
    setResults([]);
    setStarted(true);
    setResult("");
    setAnswer("");
  }
  async function submit() {
    if (!answer.trim() || busy || result) return;
    setBusy(true);
    try {
      const q = queue[index];
      const r = grade(q, answer);
      await record({
        questionId: q.id,
        family: q.family,
        type: q.type,
        answer,
        result: r,
        date: Date.now(),
      });
      await stats.refresh();
      setResult(r);
      setResults((old) => [...old, { q, r }]);
    } catch {
      setError("Could not save your answer. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const q = queue[index];
  return (
    <>
      <Heading
        tag={due ? "SPACED REPETITION" : "ACTIVE RECALL"}
        title={due ? "Bring it back to mind." : "Your practice lab."}
      >
        Think first. Write it yourself. Learn from the correction.
      </Heading>
      {!started ? (
        <section className="panel">
          <div className="filter-grid">
            <label className="field">
              Exercise type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All eight types</option>
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Word family
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value)}
              >
                <option value="all">All families</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.root}
                  </option>
                ))}
              </select>
            </label>
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
              Difficulty
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="all">All levels</option>
                <option>foundation</option>
                <option>stretch</option>
              </select>
            </label>
            <label className="field">
              Session size
              <select value={count} onChange={(e) => setCount(e.target.value)}>
                {["10", "20", "50", "100", "unlimited"].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {pool.length} questions available.{" "}
            {count === "unlimited"
              ? "Unlimited mode repeats the pool until you end the session."
              : "Sessions use available matching questions without duplicates."}
          </p>
          <Button disabled={!pool.length} onClick={() => start()}>
            Start practice <ArrowRight size={16} />
          </Button>
          {!pool.length && (
            <p>
              No questions match.{" "}
              {due ? "You have no reviews due today." : "Try broader filters."}
            </p>
          )}
        </section>
      ) : q ? (
        <section className="panel practice-card">
          <div className="section-heading">
            <span className="badge">{q.type}</span>
            <span>
              {index + 1} / {count === "unlimited" ? "∞" : queue.length}
            </span>
          </div>
          <progress value={index} max={queue.length} />
          <h2>{q.prompt}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {q.choices.length ? (
              <div className="choices">
                {q.choices.map((c) => (
                  <label
                    key={c}
                    className={answer === c ? "choice selected" : "choice"}
                  >
                    <input
                      type="radio"
                      name="answer"
                      value={c}
                      checked={answer === c}
                      disabled={!!result}
                      onChange={() => setAnswer(c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            ) : (
              <label className="field">
                Your answer
                <textarea
                  autoFocus
                  value={answer}
                  disabled={!!result}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Write your answer here…"
                />
              </label>
            )}
            {!result && (
              <Button disabled={!answer.trim() || busy} type="submit">
                {busy ? "Saving…" : "Check answer"}
              </Button>
            )}
          </form>
          {error && <p role="alert">{error}</p>}
          {result && (
            <div className={`feedback ${result}`} role="status">
              <h3>
                {result === "correct"
                  ? "Well done."
                  : result === "review"
                    ? "Saved for review."
                    : "Let’s learn from this."}
              </h3>
              <p>{q.explanation}</p>
              {result !== "correct" && (
                <p>
                  Reference answer: <strong>{q.answers[0]}</strong>
                </p>
              )}
              {result === "review" && (
                <p>
                  Open writing has many valid answers. This response is excluded
                  from accuracy and awaits your review in the Error Bank.
                </p>
              )}
              <Button
                onClick={() => {
                  if (count === "unlimited" && index === queue.length - 1)
                    setQueue((old) => [...old, ...shuffle(pool)]);
                  setIndex((i) => i + 1);
                  setAnswer("");
                  setResult("");
                }}
              >
                Next question <ArrowRight size={16} />
              </Button>
            </div>
          )}
          <Button
            className="end-session"
            variant="ghost"
            onClick={() => setIndex(queue.length)}
          >
            End session
          </Button>
        </section>
      ) : (
        <section className="panel">
          <h2>Practice, completed.</h2>
          <p>
            {results.length} attempts ·{" "}
            {results.filter((r) => r.r === "correct").length} correct ·{" "}
            {results.filter((r) => r.r === "review").length} requiring review
          </p>
          <div className="actions">
            <Button
              onClick={() =>
                start(
                  results.filter((r) => r.r === "incorrect").map((r) => r.q),
                )
              }
              disabled={!results.some((r) => r.r === "incorrect")}
            >
              Retry incorrect answers
            </Button>
            <Button variant="outline" onClick={() => setStarted(false)}>
              New session
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
function Writing() {
  const { writing, refresh } = useLearning();
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  async function save() {
    try {
      await db.writing.add({
        text,
        original,
        date: Date.now(),
        applied: checks.length === 3,
      });
      await refresh();
      setMessage("Writing saved on this device.");
      setText("");
      setChecks([]);
    } catch {
      setMessage("Saving failed. Please try again.");
    }
  }
  return (
    <>
      <Heading tag="FROM KNOWING TO USING" title="Make the words your own.">
        General Training Task 1 · Write a letter to a community centre
        suggesting a new course.
      </Heading>
      <section className="panel">
        <p>
          Write at least 150 words. Explain the course, why residents would
          benefit, and how you could help. Use at least three word families from
          Lesson 01.
        </p>
        <div className="notice">
          This is a self-review trainer. It does not provide an IELTS band score
          or automated grammar certification.
        </div>
        <label className="field">
          First draft (optional)
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
          />
        </label>
        <label className="field">
          Your revised writing
          <textarea
            className="writing-area"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dear Sir or Madam,…"
          />
        </label>
        <span className="muted">
          {text.trim() ? text.trim().split(/\s+/).length : 0} words
        </span>
        <h3>Application checklist</h3>
        {[
          "I checked noun, verb, adjective and adverb positions.",
          "I used at least three families and checked collocations.",
          "I corrected errors and can explain my changes.",
        ].map((c) => (
          <label className="check-row" key={c}>
            <input
              type="checkbox"
              checked={checks.includes(c)}
              onChange={(e) =>
                setChecks(
                  e.target.checked
                    ? [...checks, c]
                    : checks.filter((x) => x !== c),
                )
              }
            />
            {c}
          </label>
        ))}
        <Button
          disabled={text.trim().split(/\s+/).length < 150}
          onClick={() => void save()}
        >
          Save writing application
        </Button>
        <p role="status">{message}</p>
      </section>
      <h2>Your writing journal</h2>
      {writing.length ? (
        writing
          .slice()
          .reverse()
          .map((w) => (
            <article className="panel" key={w.id}>
              <span className="badge">
                {w.applied ? "Self-reviewed application" : "Draft saved"}
              </span>
              <p className="preserve">{w.text}</p>
              <small>{new Date(w.date).toLocaleString()}</small>
            </article>
          ))
      ) : (
        <p className="muted">
          Your saved drafts and revisions will appear here.
        </p>
      )}
    </>
  );
}
function Errors() {
  const { attempts, refresh } = useLearning();
  const [message, setMessage] = useState("");
  async function resolve(id: number, result: "correct" | "incorrect") {
    try {
      await resolveAttempt(id, result);
      await refresh();
    } catch {
      setMessage("Could not save review.");
    }
  }
  return (
    <>
      <Heading tag="MISTAKES ARE LEARNING MATERIAL" title="Your error bank.">
        Revisit incorrect answers and review open writing against the reference.
      </Heading>
      <p role="status">{message}</p>
      {attempts.filter((a) => a.result !== "correct").length ? (
        attempts
          .filter((a) => a.result !== "correct")
          .slice()
          .reverse()
          .map((a) => {
            const q = questions.find((q) => q.id === a.questionId);
            return (
              <section className="panel" key={a.id}>
                <span className="badge">
                  {a.result === "review" ? "Requires review" : "Needs practice"}{" "}
                  · {a.type}
                </span>
                <h3>{q?.prompt}</h3>
                <p>Your answer: {a.answer}</p>
                <p>Reference: {q?.answers[0]}</p>
                <p lang="vi">{q?.explanation}</p>
                {a.result === "review" && (
                  <div className="actions">
                    <Button
                      variant="outline"
                      onClick={() => void resolve(a.id!, "correct")}
                    >
                      I verified this is correct
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void resolve(a.id!, "incorrect")}
                    >
                      Needs correction
                    </Button>
                  </div>
                )}
                <Link to={`/practice?family=${a.family}`}>
                  Practise this family →
                </Link>
              </section>
            );
          })
      ) : (
        <section className="panel">
          <h2>A clean slate.</h2>
          <p>
            Your incorrect answers and responses requiring review will appear
            here.
          </p>
          <Link to="/practice">Start practising →</Link>
        </section>
      )}
    </>
  );
}
function Progress() {
  const s = useStats();
  const weak = s.progress
    .slice()
    .sort((a, b) => b.incorrect - a.incorrect)
    .filter((p) => p.incorrect);
  return (
    <>
      <Heading tag="EVIDENCE OF YOUR EFFORT" title="Progress you can see.">
        Every number comes from your activity on this device.
      </Heading>
      <div className="stats-grid">
        {[
          ["Recognition", s.recognition + "%"],
          ["Production", s.production + "%"],
          ["Writing saved", s.writing.length],
          [
            "Needs review",
            s.attempts.filter((a) => a.result === "review").length,
          ],
        ].map(([l, v]) => (
          <div className="stat" key={l}>
            <span>{l}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2>Focus for your next session</h2>
        {weak.length ? (
          weak.map((p) => (
            <p key={p.id}>
              <Link to={`/practice?family=${p.id}`}>
                {families.find((f) => f.id === p.id)?.root}
              </Link>{" "}
              · {p.incorrect} incorrect · next review{" "}
              {new Date(p.next).toLocaleDateString()}
            </p>
          ))
        ) : (
          <p>
            No weak families identified yet. Complete a practice session to find
            your focus.
          </p>
        )}
        <h3>Weak grammar rules</h3>
        {s.attempts.some((a) => a.result === "incorrect") ? (
          <p>
            Word class and word formation need review. Revisit the relevant
            corrections in your <Link to="/errors">Error Bank</Link>.
          </p>
        ) : (
          <p>No recorded grammar errors yet.</p>
        )}
        <h3>Mastery requirements</h3>
        <p>
          Recognition ≥90% (10+ attempts), production ≥80% (20+ attempts), and a
          self-reviewed writing application. Lesson 01:{" "}
          {s.mastered ? "mastered" : "in progress"}.
        </p>
      </section>
    </>
  );
}
function Settings() {
  const [message, setMessage] = useState("");
  const { refresh } = useLearning();
  async function backup() {
    try {
      const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "grammar-studio-backup.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Backup downloaded.");
    } catch {
      setMessage("Export failed.");
    }
  }
  return (
    <>
      <Heading tag="YOUR SPACE, YOUR DATA" title="Settings.">
        Your learning history is stored locally in this browser.
      </Heading>
      <section className="panel">
        <h2>Learning profile</h2>
        <p>
          IELTS General Training · Current estimate 5.0–5.5 · Overall target 6.5
        </p>
        <p>Listening 7.0 · Reading 7.0 · Writing 6.0+ · Speaking 6.0+</p>
        <p>Daily plan: 180 minutes · 24 weeks</p>
        <h2>Backup & restore</h2>
        <p>
          Export regularly to keep your progress when switching devices or
          clearing browser data.
        </p>
        <Button onClick={() => void backup()}>Export backup</Button>
        <label className="field import">
          Restore backup (replaces local progress)
          <input
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const data = JSON.parse(await file.text());
                if (
                  !window.confirm(
                    "Replace all local learning progress with this backup?",
                  )
                )
                  return;
                await importBackup(data);
                await refresh();
                setMessage("Backup restored.");
              } catch {
                setMessage(
                  "Invalid backup or restore failed. Your backup must match version 1.",
                );
              }
            }}
          />
        </label>
        <p role="status">{message}</p>
        <h3>Available now</h3>
        <p>
          Lesson 01, word families, practice, spaced reviews and writing
          self-review.
        </p>
        <h3>Upcoming</h3>
        <p>
          Lessons 02–32, automated writing feedback, listening and reading
          modules.
        </p>
      </section>
    </>
  );
}
export default App;
