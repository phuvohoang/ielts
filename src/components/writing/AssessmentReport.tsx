import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PracticePanel } from "../practice/PracticePanel";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { NativeSelect } from "../ui/native-select";
import { Badge } from "../reui/badge";
import { Alert, AlertDescription } from "../reui/alert";
import { db } from "../../lib/db";
import { decideIssue, saveAssessment } from "../../lib/writing/persistence";
import type { Assessment, Issue } from "../../lib/writing/schema";
export const categoryLabels = {
  grammar: "Ngữ pháp",
  collocation: "Collocation",
  word_choice: "Chọn từ",
  preposition: "Giới từ",
  article: "Mạo từ",
  sentence_structure: "Cấu trúc câu",
  register: "Văn phong/ngữ vực",
};
export function AssessmentReport({ assessment }: { assessment: Assessment }) {
  const [value, setValue] = useState(assessment),
    [error, setError] = useState("");
  async function refresh() {
    try {
      await saveAssessment(assessment);
      setValue((await db.writingAssessments.get(assessment.id))!);
    } catch {
      setError("Chưa lưu được assessment. Hãy thử lại.");
    }
  }
  useEffect(() => {
    void refresh();
  }, [assessment.id]);
  const pending = value.issues.filter(
    (i) => i.kind === "error" && i.status === "pending",
  );
  return (
    <div className="writing-stack">
      <PracticePanel
        title="Writing Assessment"
        description="Ước lượng luyện tập, không phải kết quả thi IELTS chính thức"
        accessory={
          <Badge variant="outline">
            {value.task === "task1" ? "Task 1" : "Task 2"}
          </Badge>
        }
      >
        <h2>
          {value.bandEstimate === null
            ? "Cần xem lại độ tin cậy của đánh giá"
            : `Band ước lượng: ${value.bandEstimate.toFixed(1)}`}
        </h2>
        <p>{value.summaryVi}</p>
        <div className="writing-criteria">
          {Object.entries(value.criteria).map(([key, c]) => (
            <section key={key}>
              <h3>
                {
                  {
                    task:
                      value.task === "task1"
                        ? "Task Achievement"
                        : "Task Response",
                    coherence: "Coherence & Cohesion",
                    lexical: "Lexical Resource",
                    grammar: "Grammatical Range & Accuracy",
                  }[key]
                }
              </h3>
              <strong>{c.band.toFixed(1)}</strong>
              <p>{c.feedbackVi}</p>
            </section>
          ))}
        </div>
        <h3>Điểm mạnh</h3>
        <ul>
          {value.strengthsVi.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <details>
          <summary>Bài viết gốc — giữ nguyên văn</summary>
          <pre className="essay-text">{value.originalEssay}</pre>
        </details>
        <details>
          <summary>Bản viết sửa tham khảo</summary>
          <pre className="essay-text">{value.revisedEssay}</pre>
        </details>
        {value.omissions.length > 0 && (
          <section className="writing-stack">
            <h3>Thiếu ý / chưa đáp ứng đề bài</h3>
            <p className="muted">
              Đây là yêu cầu nội dung, được tách khỏi lỗi ngôn ngữ.
            </p>
            {value.omissions.map((o, i) => (
              <div key={i}>
                <strong>{o.requirement}</strong>
                <p>{o.explanationVi}</p>
                <p>{o.suggestionVi}</p>
              </div>
            ))}
          </section>
        )}
      </PracticePanel>
      <PracticePanel
        title="Duyệt lỗi sau khi chấm"
        description={`${pending.length} lỗi đang chờ duyệt. Chỉ lỗi bạn chấp nhận mới vào lịch ôn.`}
      >
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <Button
                type="button"
                variant="outline"
                onClick={() => void refresh()}
              >
                Thử lưu lại
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {value.quarantined > 0 && (
          <p role="status">
            {value.quarantined} trích dẫn không đủ căn cứ đã được loại khỏi ngân
            hàng lỗi.
          </p>
        )}
        {value.issues
          .filter((i) => i.kind === "error")
          .map((issue) => (
            <IssueReview
              key={issue.id}
              issue={issue}
              essayId={value.id}
              onChange={refresh}
            />
          ))}
        {!value.issues.some((i) => i.kind === "error") && (
          <p>
            Không có lỗi ngôn ngữ có căn cứ được trích xuất. Bạn vẫn có thể xem
            góp ý về nội dung và cách viết.
          </p>
        )}
        <Button asChild>
          <Link to="/writing-review">Mở Writing Review</Link>
        </Button>
      </PracticePanel>
      {value.issues.some((i) => i.kind === "style") && (
        <PracticePanel title="Gợi ý phong cách — không phải lỗi">
          <p>
            Đây là cách viết khác để tham khảo, không được đưa vào ngân hàng lỗi
            hoặc tính là lỗi sai.
          </p>
          {value.issues
            .filter((i) => i.kind === "style")
            .map((i) => (
              <div key={i.id}>
                <blockquote>{i.original}</blockquote>
                <p>{i.correction}</p>
                <p>{i.explanationVi}</p>
              </div>
            ))}
        </PracticePanel>
      )}
    </div>
  );
}
function IssueReview({
  issue,
  essayId,
  onChange,
}: {
  issue: Issue;
  essayId: string;
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [correction, setCorrection] = useState(issue.correction),
    [alternatives, setAlternatives] = useState(issue.alternatives.join("\n")),
    [explanation, setExplanation] = useState(issue.explanationVi),
    [target, setTarget] = useState(issue.targetPattern),
    [category, setCategory] = useState(issue.category);
  async function decide(value: "accepted" | "dismissed") {
    setBusy(true);
    setError("");
    try {
      await decideIssue(
        essayId,
        issue.id,
        value,
        editing
          ? {
              correction,
              alternatives: alternatives
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
              explanationVi: explanation,
              targetPattern: target,
              category,
            }
          : undefined,
      );
      await onChange();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa lưu được thay đổi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="writing-issue" aria-label={`Lỗi: ${issue.original}`}>
      <div className="writing-row">
        <Badge variant="outline">{categoryLabels[issue.category]}</Badge>
        <Badge
          variant={issue.status === "accepted" ? "success-light" : "outline"}
        >
          {issue.status === "accepted"
            ? "Đã lưu"
            : issue.status === "dismissed"
              ? "Đã bỏ qua"
              : issue.confidence < 0.8
                ? "Cần kiểm tra thêm"
                : "Chờ duyệt"}
        </Badge>
        <span className="muted">
          {issue.severity === "major" ? "Ảnh hưởng lớn" : "Nhẹ"}
        </span>
      </div>
      <blockquote className="essay-text">{issue.original}</blockquote>
      <p>
        <strong>Sửa:</strong> {issue.correction}
      </p>
      <p>{issue.explanationVi}</p>
      <p>
        <strong>Mẫu học:</strong> {issue.targetPattern}
      </p>
      {!!issue.alternatives.length && (
        <p>Cách khác được chấp nhận: {issue.alternatives.join(" / ")}</p>
      )}
      {editing && (
        <div className="writing-stack">
          <label>
            Bản sửa
            <Input
              aria-label="Bản sửa"
              value={correction}
              maxLength={2400}
              onChange={(e) => setCorrection(e.target.value)}
            />
          </label>
          <label>
            Cách khác (mỗi dòng một cách)
            <Textarea
              value={alternatives}
              onChange={(e) => setAlternatives(e.target.value)}
            />
          </label>
          <label>
            Giải thích tiếng Việt
            <Textarea
              value={explanation}
              maxLength={2400}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </label>
          <label>
            Mẫu cần học
            <Input
              value={target}
              maxLength={2400}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label>
            Nhóm lỗi
            <NativeSelect
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {Object.entries(categoryLabels).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {issue.status === "pending" && (
        <div className="writing-row">
          <Button
            type="button"
            disabled={busy || issue.confidence < 0.8}
            onClick={() => void decide("accepted")}
          >
            {busy ? "Đang lưu…" : editing ? "Lưu lỗi đã sửa" : "Chấp nhận lỗi"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setEditing(!editing)}
          >
            Chỉnh sửa
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void decide("dismissed")}
          >
            Bỏ qua
          </Button>
        </div>
      )}
    </section>
  );
}
