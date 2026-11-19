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
  const renderTable = (rows: typeof report.categories) => (
    <div className="results-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Nhóm</th>
            <th>Điểm</th>
            <th>Đúng</th>
            <th>Sai</th>
            <th>Đúng một phần</th>
            <th>Cần xem lại</th>
            <th>Chưa trả lời</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              <td>
                {r.score}/{r.maxScore}
              </td>
              <td>{r.correct}</td>
              <td>{r.incorrect}</td>
              <td>{r.partial}</td>
              <td>{r.pending}</td>
              <td>{r.unanswered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="panel practice-results" aria-labelledby="results-title">
      <h2 id="results-title">Practice Results</h2>
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
      {report.ungraded > 0 && (
        <p>
          {report.ungraded} câu đã nhập nhưng chưa nộp chấm. Điểm chưa tính các
          câu chưa chấm/cần xem lại.
        </p>
      )}
      <div className="results-actions">
        <Button variant="outline" onClick={onReturn}>
          Tiếp tục làm bài
        </Button>
        <Button
          variant="outline"
          onClick={onReview}
          disabled={!mistakes.length}
        >
          Review Mistakes
        </Button>
        <Button
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
        <Button variant="outline" onClick={onGenerate}>
          Generate Another Practice
        </Button>
        <Button variant="ghost" onClick={onConfigure}>
          Back to Configuration
        </Button>
      </div>
      <h3>Performance by grammar category</h3>
      {renderTable(report.categories)}
      <h3>Performance by exercise format</h3>
      {renderTable(report.formats)}
      <h3>Gợi ý ôn tập</h3>
      <ul>
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
    </section>
  );
}
