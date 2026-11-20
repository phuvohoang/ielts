import { Badge } from "../reui/badge";
import { PracticePanel } from "../practice/PracticePanel";
import { CorrectionDiff } from "./CorrectionDiff";
import { Button } from "../ui/button";
import { practiceReport, retryQuestionIds } from "../../lib/ai/dynamic/results";
import type { PracticeSession } from "../../lib/ai/dynamic/schema";
interface Props {
  session: PracticeSession;
  onReturn: () => void;
  onReview: () => void;
  onRetry: () => void;
  onGenerate: () => void;
  onConfigure: () => void;
}
export function PracticeResults({
  session,
  onReturn,
  onReview,
  onRetry,
  onGenerate,
  onConfigure,
}: Props) {
  const report = practiceReport(session),
    retry = retryQuestionIds(session);
  const mistakes = report.questions.filter((q) =>
    ["incorrect", "partially_correct"].includes(session.results[q.id]?.status),
  );
  const renderBreakdown = (rows: typeof report.categories) => (
    <ul className="result-breakdown">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="breakdown-heading">
            <strong>{r.label}</strong>
            <span className="tabular-nums">
              {r.score}/{r.maxScore} điểm
            </span>
          </div>
          <progress
            aria-label={`${r.label}: điểm đã chấm`}
            value={r.score}
            max={r.maxScore || 1}
          />
          <div className="breakdown-detail">
            <span>{r.correct} đúng</span>
            <span>{r.incorrect} sai</span>
            <span>{r.partial} đúng một phần</span>
            <span>{r.pending} cần xem lại</span>
            <span>{r.unanswered} chưa trả lời</span>
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <PracticePanel className="practice-results" aria-labelledby="results-title">
      <div className="builder-heading">
        <div>
          <span className="eyebrow">NHÌN LẠI BÀI LUYỆN</span>
          <h2 id="results-title">Practice Results</h2>
        </div>
        <Badge variant="outline">{session.settings.difficulty}</Badge>
      </div>
      <div className="results-overview">
        <div>
          <p>
            Score {report.score}/{report.maxScore} graded.
          </p>
          <p className="results-score">
            {report.score}/{report.maxScore} điểm ·{" "}
            {report.percentage === null
              ? "Chưa có câu được chấm"
              : `${report.percentage}%`}
          </p>
          <p>
            {report.correct} đúng · {report.partial} đúng một phần ·{" "}
            {report.incorrect} sai · {report.unanswered} chưa trả lời ·{" "}
            {report.pending} cần xem lại
          </p>
        </div>
        <dl className="result-metrics">
          <div>
            <dt>Đã chấm</dt>
            <dd>
              {report.correct + report.partial + report.incorrect}/
              {report.questions.length}
            </dd>
          </div>
          <div>
            <dt>Chưa trả lời</dt>
            <dd>{report.unanswered}</dd>
          </div>
          <div>
            <dt>Cần xem lại</dt>
            <dd>{report.pending}</dd>
          </div>
        </dl>
      </div>
      {report.ungraded > 0 && (
        <p>
          {report.ungraded} câu đã nhập nhưng chưa nộp chấm. Điểm chưa tính các
          câu chưa chấm/cần xem lại.
        </p>
      )}
      <div className="results-actions">
        <Button type="button" variant="outline" onClick={onReturn}>
          Tiếp tục làm bài
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onReview}
          disabled={!mistakes.length}
        >
          Review Mistakes
        </Button>
        <Button
          type="button"
          onClick={onRetry}
          disabled={
            !retry.length ||
            (session.settings.feedbackMode === "exam" &&
              !session.examSubmitted &&
              !session.retryIds)
          }
        >
          Retry Incorrect Questions ({retry.length})
        </Button>
        <Button type="button" variant="outline" onClick={onGenerate}>
          Generate Another Practice
        </Button>
        <Button type="button" variant="ghost" onClick={onConfigure}>
          Back to Configuration
        </Button>
      </div>
      <div className="results-breakdown-grid">
        <section>
          <h3>Performance by grammar category</h3>
          {renderBreakdown(report.categories)}
        </section>
        <section>
          <h3>Performance by exercise format</h3>
          {renderBreakdown(report.formats)}
        </section>
      </div>
      <h3>Gợi ý ôn tập</h3>
      <ul className="review-suggestions">
        {report.categories
          .filter((r) => r.incorrect || r.partial || r.unanswered)
          .slice(0, 5)
          .map((r) => (
            <li key={r.id}>
              {r.label} — {r.incorrect + r.partial} câu cần luyện thêm;{" "}
              {r.unanswered} câu chưa trả lời.
            </li>
          ))}
      </ul>
      {!report.categories.some(
        (r) => r.incorrect || r.partial || r.unanswered,
      ) && (
        <p>
          Không có câu sai hoặc chưa trả lời. Bạn có thể xem lại phản hồi từng
          câu bên dưới.
        </p>
      )}
      <h3>Chi tiết bài làm</h3>
      {report.questions.map((q) => {
        const result = session.results[q.id],
          reveal = session.reveals[q.id];
        return (
          <details key={q.id} className="result-question">
            <summary>
              Câu {q.ordinal + 1} ·{" "}
              {result?.status ??
                (session.answers[q.id]?.trim() ? "Chưa chấm" : "Chưa trả lời")}
            </summary>
            <p>{q.instruction}</p>
            <p>{q.questionText}</p>
            <p>Bài làm: {session.answers[q.id] || "Chưa trả lời"}</p>
            {result && (
              <>
                <p>{result.feedbackVi}</p>
                <CorrectionDiff
                  answer={result.userAnswer}
                  correction={result.correctedAnswer}
                />
                <p>Sửa: {result.correctedAnswer}</p>
                <p>{result.explanationVi}</p>
              </>
            )}
            {reveal && (
              <p>Reference answer: {reveal.referenceAnswers.join(" / ")}</p>
            )}
          </details>
        );
      })}
      {!!session.previousRounds?.length && (
        <details>
          <summary>
            Các lượt làm trước ({session.previousRounds.length})
          </summary>
          {session.previousRounds.map((round, i) => (
            <p key={i}>
              {new Date(round.date).toLocaleString()} ·{" "}
              {Object.keys(round.results).length} kết quả đã lưu
            </p>
          ))}
        </details>
      )}
    </PracticePanel>
  );
}
