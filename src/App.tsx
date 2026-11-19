import { useEffect, useState } from "react";
import {
  BrowserRouter,
  HashRouter,
  NavLink,
  Route,
  Routes,
  Link,
  Navigate,
} from "react-router-dom";
import {
  Headphones,
  BookOpen,
  PencilLine,
  Languages,
  Menu,
  X,
  ArrowUpRight,
  History as HistoryIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { GrammarExercise } from "./components/ai/GrammarExercise";
import { SkillPractice, skillNames } from "./components/practice/SkillPractice";
import { Button } from "./components/ui/button";
import { db, exportBackup, importBackup } from "./lib/db";
import type { PracticeRecord } from "./lib/practice/schema";
const skills = [
  {
    path: "/listening",
    title: "Nghe",
    subtitle: "Listening",
    icon: Headphones,
    description:
      "Audio mới, câu hỏi rõ ràng. Nghe và trả lời theo cách của bạn.",
    meta: "5 câu · Audio AI",
  },
  {
    path: "/reading",
    title: "Đọc",
    subtitle: "General Reading",
    icon: BookOpen,
    description:
      "Đọc tình huống đời sống và công việc. Đối chiếu dẫn chứng sau khi nộp.",
    meta: "5 câu · Đoạn đọc mới",
  },
  {
    path: "/writing",
    title: "Viết",
    subtitle: "General Writing",
    icon: PencilLine,
    description:
      "Thư Task 1 hoặc bài luận Task 2. Nhận góp ý ngay trên bài viết.",
    meta: "Task 1 / 2 · Phản hồi AI",
  },
  {
    path: "/grammar",
    title: "Ngữ pháp",
    subtitle: "Grammar",
    icon: Languages,
    description:
      "Tự điền từ, sửa câu và diễn đạt lại. Luyện đúng điểm bạn muốn cải thiện.",
    meta: "10–50 câu · Chấm AI",
  },
];
const AppRouter =
  import.meta.env.VITE_ROUTER_MODE === "hash" ? HashRouter : BrowserRouter;
function App() {
  const [open, setOpen] = useState(false);
  return (
    <AppRouter>
      <div className="app practice-app">
        <aside className={open ? "sidebar open" : "sidebar"}>
          <Link className="brand" to="/" onClick={() => setOpen(false)}>
            <span className="brand-mark">i.</span>
            <span>
              ielts<span className="brand-light">practice</span>
              <small>GENERAL TRAINING · YOUR DAILY PRACTICE</small>
            </span>
          </Link>
          <p className="nav-caption">CHỌN KỸ NĂNG</p>
          <nav aria-label="Kỹ năng luyện tập">
            {skills.map((s) => (
              <NavLink to={s.path} key={s.path} onClick={() => setOpen(false)}>
                <s.icon size={19} />
                {s.title}
                <span className="nav-skill-en">{s.subtitle}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="eyebrow">LÀM BÀI. NHẬN PHẢN HỒI. TIẾN BỘ.</span>
            <p>
              Một bài luyện
              <br />
              mỗi ngày.
            </p>
            <span>IELTS General · Mục tiêu 6.5</span>
          </div>
          <nav aria-label="Dữ liệu cá nhân" className="utility-nav">
            <NavLink to="/history" onClick={() => setOpen(false)}>
              <HistoryIcon size={18} />
              Lịch sử bài làm
            </NavLink>
            <NavLink to="/settings" onClick={() => setOpen(false)}>
              <SettingsIcon size={18} />
              Sao lưu & cài đặt
            </NavLink>
          </nav>
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
            <Link to="/">YOUR PRACTICE SPACE</Link>
            <div>
              <span className="status-dot" /> Tự động lưu trên thiết bị này
            </div>
          </header>
          <div className="page">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/listening"
                element={<SkillPractice key="listening" skill="listening" />}
              />
              <Route
                path="/reading"
                element={<SkillPractice key="reading" skill="reading" />}
              />
              <Route
                path="/writing"
                element={<SkillPractice key="writing" skill="writing" />}
              />
              <Route path="/grammar" element={<GrammarExercise />} />
              <Route path="/history" element={<PracticeHistory />} />
              <Route path="/settings" element={<Settings />} />
              {[
                "/path",
                "/learn/:lessonId",
                "/lessons",
                "/lessons/*",
                "/families/*",
                "/practice",
                "/errors",
                "/progress",
              ].map((path) => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <Navigate
                      to={
                        path === "/errors" || path === "/progress"
                          ? "/history"
                          : "/grammar"
                      }
                      replace
                    />
                  }
                />
              ))}
              <Route
                path="*"
                element={
                  <>
                    <h1>Không tìm thấy trang</h1>
                    <Link to="/">Chọn kỹ năng luyện tập</Link>
                  </>
                }
              />
            </Routes>
          </div>
          <footer>
            IELTS GENERAL PRACTICE
            <span>
              Nội dung và phản hồi do AI tạo · Điểm luyện tập không phải kết quả
              thi chính thức.
            </span>
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
function Home() {
  return (
    <>
      <Heading tag="IELTS GENERAL TRAINING" title="Hôm nay bạn muốn luyện gì?">
        Chọn một kỹ năng. Tạo bài mới bằng AI. Làm bài và nhận phản hồi.
      </Heading>
      <div className="practice-home-grid">
        {skills.map((s, i) => (
          <Link to={s.path} className="practice-home-card" key={s.path}>
            <div className="practice-card-top">
              <span className="skill-number">0{i + 1}</span>
              <s.icon size={27} />
            </div>
            <div>
              <span className="eyebrow">{s.subtitle}</span>
              <h2>{s.title}</h2>
              <p>{s.description}</p>
            </div>
            <div className="practice-card-bottom">
              <small>{s.meta}</small>
              <span>
                Bắt đầu <ArrowUpRight size={18} />
              </span>
            </div>
          </Link>
        ))}
      </div>
      <div className="practice-home-note">
        <span className="status-dot" />
        <p>
          Bài làm tự động lưu trên trình duyệt này. Bạn có thể dừng và tiếp tục
          khi quay lại.
        </p>
        <Link to="/history">Xem bài đã lưu →</Link>
      </div>
    </>
  );
}
function PracticeHistory() {
  const [runs, setRuns] = useState<PracticeRecord[]>([]),
    [legacy, setLegacy] = useState<
      { id: string; text: string; feedback: string }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      db.practiceRuns.orderBy("updatedAt").reverse().toArray(),
      db.aiAttempts.orderBy("date").reverse().toArray(),
      db.writing.toArray(),
      db.attempts.orderBy("date").reverse().toArray(),
    ])
      .then(([r, a, w, old]) => {
        setRuns(r);
        setLegacy([
          ...a.map((x) => ({
            id: x.id,
            text: x.userAnswer,
            feedback: x.result.feedbackVi,
          })),
          ...w.map((x) => ({
            id: `w-${x.id}`,
            text: x.text,
            feedback: "Bài viết đã lưu trước khi chuyển sang luyện AI.",
          })),
          ...old.map((x) => ({
            id: `a-${x.id}`,
            text: x.answer,
            feedback:
              x.result === "correct"
                ? "Đúng"
                : x.result === "incorrect"
                  ? "Chưa đúng"
                  : "Cần xem lại",
          })),
        ]);
      })
      .catch(() => setError("Không đọc được lịch sử. Hãy tải lại trang."));
  }, []);
  return (
    <>
      <Heading tag="YOUR WORK" title="Lịch sử bài làm">
        Bài đã tạo, bài đang làm và phản hồi của bạn.
      </Heading>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <h2>Bài luyện AI</h2>
        {runs.length ? (
          <div className="practice-history-list">
            {runs.map((r) => (
              <Link key={r.id} to={`/${r.exercise.settings.skill}?id=${r.id}`}>
                <span>{r.exercise.title}</span>
                <small>
                  {skillNames[r.exercise.settings.skill]} ·{" "}
                  {new Date(r.date).toLocaleDateString("vi-VN")} ·{" "}
                  {r.result ? "Đã chấm" : "Tiếp tục làm"}
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <p>
            Chưa có bài Nghe, Đọc hoặc Viết mới.{" "}
            <Link to="/">Chọn một kỹ năng để bắt đầu.</Link>
          </p>
        )}
        <p>
          <Link to="/grammar">Mở bài ngữ pháp và các bài đã lưu →</Link>
        </p>
      </section>
      <details className="panel practice-history">
        <summary>Lịch sử cũ ({legacy.length} bài làm)</summary>
        <p>
          Dữ liệu trước khi đổi giao diện vẫn được giữ. Bạn có thể xuất toàn bộ
          trong phần sao lưu.
        </p>
        {legacy.map((x) => (
          <div className="answer-feedback" key={x.id}>
            <p>{x.text}</p>
            <p>{x.feedback}</p>
          </div>
        ))}
      </details>
    </>
  );
}

function Settings() {
  const [message, setMessage] = useState("");
  const refresh = async () => {};
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
        <p>Listening 7.0 · Reading 7.0 · Writing 6.0+</p>
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
                  "Invalid backup or restore failed. Use a valid backup.",
                );
              }
            }}
          />
        </label>
        <p role="status">{message}</p>
        <p>
          Bốn kỹ năng: Nghe, Đọc, Viết và Ngữ pháp. Không có bài học lý thuyết
          hay điều kiện mở khoá.
        </p>
        <p>
          Âm thanh đã tải được lưu trên thiết bị này; bản sao lưu JSON chứa bài
          làm và kết quả, không kèm file âm thanh.
        </p>
      </section>
    </>
  );
}
export default App;
