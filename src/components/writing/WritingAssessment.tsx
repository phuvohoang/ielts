// Date.now below records draft persistence time; it is not a render key or animation.
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { db } from "../../lib/db";
import { assessWriting } from "../../lib/writing/client";
import type { Assessment } from "../../lib/writing/schema";
import { AssessmentReport } from "./AssessmentReport";
import { PracticePanel, PracticeLoading } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { NativeSelect } from "../ui/native-select";
import { Alert, AlertDescription } from "../reui/alert";
export function WritingAssessment() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState({
      id: "manual",
      task: "task1" as "task1" | "task2",
      prompt: "",
      essay: "",
    }),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<Assessment>();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const identity = useRef(crypto.randomUUID());
  const lock = useRef(false);
  async function load() {
    setError("");
    try {
      const id = params.get("id");
      if (id) {
        const a = await db.writingAssessments.get(id);
        if (!a) throw Error("Không tìm thấy bài đã lưu.");
        setResult(a);
      } else {
        const saved = await db.writingDrafts.get("manual");
        if (saved) setDraft({ ...saved, task: saved.task });
      }
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được bản nháp.");
    }
  }
  useEffect(() => {
    void load();
  }, [params]);
  function change(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    queue.current = queue.current
      .catch(() => undefined)
      .then(() => db.writingDrafts.put({ ...next, updatedAt: Date.now() }))
      .catch(() =>
        setError("Chưa lưu được bản nháp. Kiểm tra dung lượng trình duyệt."),
      );
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await queue.current;
      const a = await assessWriting({
        essayId: identity.current,
        task: draft.task,
        prompt: draft.prompt,
        essay: draft.essay,
      });
      setResult(a);
      await db.writingDrafts.delete("manual");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI chưa hoàn tất.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="writing-stack">
      <div className="heading">
        <h1>Writing Assessment</h1>
        <p>Task 1 và Task 2 · Phản hồi tiếng Việt · Giữ nguyên bài gốc</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {!loaded && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void load()}
              >
                Thử lại
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!loaded && !error && <PracticeLoading title="Đang đọc bản nháp…" />}
      {loaded && !result && (
        <PracticePanel
          title="Chấm bài viết của bạn"
          description="Dán đầy đủ đề bài và bài viết. Không cần tự sửa trước khi nộp."
        >
          <label>
            Dạng bài
            <NativeSelect
              aria-label="Dạng bài assessment"
              value={draft.task}
              disabled={busy}
              onChange={(e) => {
                identity.current = crypto.randomUUID();
                change({ task: e.target.value as typeof draft.task });
              }}
            >
              <option value="task1">General Task 1 — Thư</option>
              <option value="task2">General Task 2 — Bài luận</option>
            </NativeSelect>
          </label>
          <label>
            Đề bài
            <Textarea
              aria-label="Đề bài writing"
              className="field-sizing-fixed"
              rows={5}
              maxLength={4000}
              value={draft.prompt}
              disabled={busy}
              onChange={(e) => {
                identity.current = crypto.randomUUID();
                change({ prompt: e.target.value });
              }}
            />
          </label>
          <label>
            Bài viết gốc
            <Textarea
              aria-label="Bài viết gốc"
              className="field-sizing-fixed"
              rows={14}
              maxLength={12000}
              value={draft.essay}
              disabled={busy}
              onChange={(e) => {
                identity.current = crypto.randomUUID();
                change({ essay: e.target.value });
              }}
            />
          </label>
          <p className="muted">
            {draft.essay.trim().split(/\s+/).filter(Boolean).length} từ · Gợi ý
            tối thiểu {draft.task === "task1" ? 150 : 250} từ. Bài ngắn vẫn được
            chấm và giải thích.
          </p>
          <Button
            type="button"
            disabled={busy || !draft.prompt.trim() || !draft.essay.trim()}
            onClick={() => void submit()}
          >
            {busy ? "AI đang đánh giá…" : "Chấm bài viết"}
          </Button>
        </PracticePanel>
      )}
      {busy && (
        <PracticeLoading title="Đang đánh giá bốn tiêu chí…">
          Bài gốc đã được giữ trên thiết bị này.
        </PracticeLoading>
      )}
      {result && (
        <>
          <AssessmentReport assessment={result} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void db.writingDrafts.delete("manual").then(() => {
                setResult(undefined);
                setDraft({
                  id: "manual",
                  task: "task1",
                  prompt: "",
                  essay: "",
                });
                identity.current = crypto.randomUUID();
                setParams({});
              });
            }}
          >
            Chấm một bài khác
          </Button>
        </>
      )}
      <Button asChild variant="ghost">
        <Link to="/writing">Quay lại tạo đề Writing</Link>
      </Button>
    </div>
  );
}
