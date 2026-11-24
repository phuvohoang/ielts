import { PresentTensesLesson } from "./components/lessons/PresentTensesLesson";
import { WritingAssessment } from "./components/writing/WritingAssessment";
import { WritingReview } from "./components/writing/WritingReview";
import { Input } from "./components/ui/input";
import { Skeleton } from "./components/ui/skeleton";
import { Alert, AlertDescription } from "./components/reui/alert";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarSeparator,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Separator } from "./components/ui/separator";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
  FrameFooter,
} from "./components/reui/frame";
import { PracticePanel } from "./components/practice/PracticePanel";
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  HashRouter,
  NavLink,
  Route,
  Routes,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import {
  Headphones,
  BookOpen,
  PencilLine,
  Languages,
  LayoutDashboard,
  GraduationCap,
  ChevronRight,
  Check,
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
    meta: "10 câu · Audio AI",
  },
  {
    path: "/reading",
    title: "Đọc",
    subtitle: "General Reading",
    icon: BookOpen,
    description:
      "Đọc tình huống đời sống và công việc. Đối chiếu dẫn chứng sau khi nộp.",
    meta: "10 câu · Đoạn đọc mới",
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
  return (
    <AppRouter>
      <TooltipProvider>
        <SidebarProvider className="margin-app">
          <PracticeShell />
        </SidebarProvider>
      </TooltipProvider>
    </AppRouter>
  );
}
const routeNames: Record<string, string> = {
  "/": "Tổng quan",
  "/listening": "Luyện nghe",
  "/reading": "Luyện đọc",
  "/writing": "Luyện viết",
  "/writing-assessment": "Writing Assessment",
  "/writing-review": "Writing Review",
  "/grammar": "Ngữ pháp",
  "/grammar/lessons/present-tenses": "G01 · Thói quen và thay đổi hiện tại",
  "/history": "Lịch sử bài làm",
  "/settings": "Cài đặt",
};
function PracticeShell() {
  const { pathname } = useLocation();
  const { setOpenMobile, state, isMobile } = useSidebar();
  const compact = state === "collapsed" && !isMobile;
  const current = routeNames[pathname] ?? "Luyện tập";
  const closeMobile = () => setOpenMobile(false);
  return (
    <>
      <a
        className="skip-link"
        href="#practice-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("practice-content")?.focus();
        }}
      >
        Đến nội dung chính
      </a>
      <Sidebar variant="floating" collapsible="icon">
        <SidebarHeader>
          <div className="workspace-brand-row">
            <Link to="/" className="workspace-brand" onClick={closeMobile}>
              <span className="workspace-mark" aria-hidden="true">
                i.
              </span>
              <span className="group-data-[collapsible=icon]:hidden">
                IELTS Practice
              </span>
            </Link>
            <SidebarTrigger
              aria-label="Thu gọn sidebar"
              className="group-data-[collapsible=icon]:hidden"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  tooltip={compact ? "Tổng quan" : undefined}
                >
                  <NavLink to="/" onClick={closeMobile}>
                    <LayoutDashboard aria-hidden="true" />
                    <span>Tổng quan</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel>Luyện tập</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {skills.map((skill) => (
                  <SidebarMenuItem key={skill.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === skill.path}
                      tooltip={compact ? skill.title : undefined}
                    >
                      <NavLink to={skill.path} onClick={closeMobile}>
                        <skill.icon aria-hidden="true" />
                        <span>{skill.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel>Bài làm của bạn</SidebarGroupLabel>
            <SidebarMenu>
              {[
                {
                  path: "/writing-review",
                  label: "Writing Review",
                  icon: PencilLine,
                },
                {
                  path: "/history",
                  label: "Lịch sử bài làm",
                  icon: HistoryIcon,
                },
                {
                  path: "/settings",
                  label: "Sao lưu & cài đặt",
                  icon: SettingsIcon,
                },
              ].map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.path}
                    tooltip={compact ? item.label : undefined}
                  >
                    <NavLink to={item.path} onClick={closeMobile}>
                      <item.icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                tooltip={compact ? "Mục tiêu IELTS 6.5" : undefined}
              >
                <Link to="/settings" onClick={closeMobile}>
                  <GraduationCap aria-hidden="true" />
                  <span className="workspace-profile">
                    <strong>IELTS General</strong>
                    <small>Mục tiêu Overall 6.5</small>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="workspace-inset">
        <header className="workspace-header">
          <SidebarTrigger
            aria-label="Toggle navigation"
            className={state === "expanded" ? "md:hidden" : undefined}
          />
          <Separator
            orientation="vertical"
            className={state === "expanded" ? "hidden" : "h-4"}
          />
          <nav aria-label="breadcrumb" className="workspace-breadcrumb">
            <Link to="/">Workspace</Link>
            <ChevronRight size={14} aria-hidden="true" />
            <span aria-current="page">{current}</span>
          </nav>
          <span className="workspace-save">
            <Check size={14} aria-hidden="true" /> Tự động lưu
          </span>
        </header>
        <div className="workspace-scroll">
          <div
            id="practice-content"
            className="workspace-content"
            tabIndex={-1}
          >
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
              <Route
                path="/writing-assessment"
                element={<WritingAssessment />}
              />
              <Route path="/writing-review" element={<WritingReview />} />
              <Route path="/grammar" element={<GrammarExercise />} />
              <Route path="/grammar/lessons/present-tenses" element={<PresentTensesLesson />} />
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
          <footer className="workspace-footer">
            <span>IELTS General Practice</span>
            <span>
              Nội dung và phản hồi do AI tạo · Điểm luyện tập không phải kết quả
              thi chính thức.
            </span>
          </footer>
        </div>
      </SidebarInset>
    </>
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
        {skills.map((s) => (
          <Frame
            key={s.path}
            spacing="default"
            dense
            className="skill-frame [--frame-radius:var(--radius-lg)]"
          >
            <FrameHeader>
              <div className="skill-frame-heading">
                <s.icon size={16} aria-hidden="true" />
                <div>
                  <FrameTitle>{s.title}</FrameTitle>
                  <FrameDescription>{s.subtitle}</FrameDescription>
                </div>
              </div>
            </FrameHeader>
            <FramePanel>
              <Link to={s.path} className="home-skill-link">
                <span className="skill-frame-metric">
                  {s.title === "Viết"
                    ? "Task 1 / 2"
                    : s.title === "Ngữ pháp"
                      ? "10–50 câu"
                      : "10 câu"}
                </span>
                <p>{s.description}</p>
                <span className="home-skill-action">
                  Bắt đầu luyện <ArrowUpRight size={16} aria-hidden="true" />
                </span>
              </Link>
            </FramePanel>
            <FrameFooter>
              <div className="skill-frame-footer">
                <span>{s.meta}</span>
                <span>AI Practice</span>
              </div>
            </FrameFooter>
          </Frame>
        ))}
      </div>
      <HomeActivity />
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
function HomeActivity() {
  const [data, setData] = useState<{
    runs: PracticeRecord[];
    grammarCount: number;
    completedGrammar: number;
  }>();
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const [runs, grammar] = await Promise.all([
        db.practiceRuns.orderBy("updatedAt").reverse().toArray(),
        db.practiceSessions.toArray(),
      ]);
      setData({
        runs,
        grammarCount: grammar.length,
        completedGrammar: grammar.filter((s) => s.status === "completed")
          .length,
      });
    } catch {
      setError("Không đọc được bài làm đã lưu.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="home-activity-grid">
      <PracticePanel
        title="Bài luyện gần đây"
        description="Bài nghe, đọc và viết trên thiết bị này"
      >
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button
                type="button"
                variant="outline"
                onClick={() => void load()}
              >
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        ) : !data ? (
          <div
            role="status"
            aria-label="Đang đọc bài làm"
            className="loading-question"
          >
            <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
          </div>
        ) : data.runs.length ? (
          <div className="practice-history-list">
            {data.runs.slice(0, 5).map((run) => (
              <Link
                key={run.id}
                to={`/${run.exercise.settings.skill}?id=${run.id}`}
              >
                <span>{run.exercise.title}</span>
                <small>
                  {skillNames[run.exercise.settings.skill]} ·{" "}
                  {new Date(run.date).toLocaleDateString("vi-VN")} ·{" "}
                  {run.result ? "Đã chấm" : "Tiếp tục làm"}
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <div className="home-empty">
            <BookOpen size={24} aria-hidden="true" />
            <h2>Chưa có bài luyện đã lưu</h2>
            <p>Tạo bài đầu tiên để bắt đầu lưu tiến độ tại đây.</p>
            <Button asChild variant="outline">
              <Link to="/listening">Tạo bài nghe</Link>
            </Button>
          </div>
        )}
        <Button asChild variant="ghost">
          <Link to="/history">
            Xem lịch sử bài làm <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </PracticePanel>
      <PracticePanel
        title="Không gian học tập"
        description="IELTS General Training"
      >
        {data ? (
          <dl className="workspace-metrics">
            <div>
              <dt>Bài luyện đã tạo</dt>
              <dd>{data.runs.length + data.grammarCount}</dd>
            </div>
            <div>
              <dt>Bài đã hoàn thành</dt>
              <dd>
                {data.runs.filter((r) => r.result).length +
                  data.completedGrammar}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            {error ? "Chưa đọc được dữ liệu" : "Đang đọc tiến độ…"}
          </p>
        )}
        <div className="workspace-goal">
          <span>Mục tiêu Overall</span>
          <strong>6.5</strong>
          <p>Nghe 7.0 · Đọc 7.0 · Viết 6.0+</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/settings">Sao lưu & cài đặt</Link>
        </Button>
      </PracticePanel>
    </div>
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
      <PracticePanel title="Bài luyện AI">
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
      </PracticePanel>
      <PracticePanel>
        <details className="practice-history">
          <summary>Lịch sử cũ ({legacy.length} bài làm)</summary>
          <p>
            Dữ liệu trước khi đổi giao diện vẫn được giữ. Bạn có thể xuất toàn
            bộ trong phần sao lưu.
          </p>
          {legacy.map((x) => (
            <div className="answer-feedback" key={x.id}>
              <p>{x.text}</p>
              <p>{x.feedback}</p>
            </div>
          ))}
        </details>
      </PracticePanel>
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
      <PracticePanel title="Learning profile">
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
          <Input
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
      </PracticePanel>
    </>
  );
}
export default App;
