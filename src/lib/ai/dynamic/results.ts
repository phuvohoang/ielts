import type { PracticeSession, PublicQuestion } from "./schema";
import { formatLabels, topics } from "./topics";
import { summary } from "../schema";
export function retryQuestionIds(session: PracticeSession) {
  return session.questions
    .filter(
      (q) =>
        !session.answers[q.id]?.trim() ||
        session.results[q.id]?.status === "incorrect",
    )
    .map((q) => q.id);
}
export function practiceReport(session: PracticeSession) {
  const questions = session.retryIds
    ? session.questions.filter((q) => session.retryIds!.includes(q.id))
    : session.questions;
  const scored = questions.flatMap((q) =>
    session.results[q.id] ? [session.results[q.id]] : [],
  );
  const totals = summary(scored);
  const group = (
    key: (q: PublicQuestion) => string,
    label: (id: string) => string,
  ) => {
    const ids = [...new Set(questions.map(key))];
    return ids.map((id) => {
      const rows = questions.filter((q) => key(q) === id);
      const values = summary(
        rows.flatMap((q) =>
          session.results[q.id] ? [session.results[q.id]] : [],
        ),
      );
      return {
        id,
        label: label(id),
        ...values,
        total: rows.length,
        unanswered: rows.filter((q) => !session.answers[q.id]?.trim()).length,
      };
    });
  };
  return {
    questions,
    ...totals,
    percentage: totals.maxScore
      ? Math.round((100 * totals.score) / totals.maxScore)
      : null,
    unanswered: questions.filter((q) => !session.answers[q.id]?.trim()).length,
    ungraded: questions.filter(
      (q) => session.answers[q.id]?.trim() && !session.results[q.id],
    ).length,
    categories: group(
      (q) => q.topicId,
      (id) => topics.find((t) => t.topicId === id)?.displayName ?? id,
    ),
    formats: group(
      (q) => q.exerciseType,
      (id) => formatLabels[id as keyof typeof formatLabels] ?? id,
    ),
  };
}
