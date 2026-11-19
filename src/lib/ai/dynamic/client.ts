import { topics } from "./topics";
import { z } from "zod";
import {
  generationResponseSchema,
  publicQuestionSchema,
  revealSchema,
  type PracticeSession,
  type Settings,
} from "./schema";
import { resultSchema } from "../schema";
export function dynamicEndpoint(path: string) {
  const base = import.meta.env.VITE_GRAMMAR_API_URL || "/api/grammar/grade";
  return base.replace(/\/grade\/?$/, "/" + path);
}
const pending = new Map<string, Promise<unknown>>();
async function post(
  path: string,
  body: unknown,
  timeout = 100000,
): Promise<unknown> {
  const key = JSON.stringify([path, body]);
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(dynamicEndpoint(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const value = await response.json();
      if (!response.ok)
        throw Error(
          typeof value?.error === "string"
            ? value.error
            : "Dịch vụ chưa sẵn sàng. Hãy thử lại.",
        );
      return value;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError")
        throw Error("Yêu cầu quá lâu. Tiến độ vẫn được giữ; hãy thử lại.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
export async function createSession(
  settings: Settings,
  recentQuestions: string[],
  failedSkills: string[],
) {
  const recent: string[] = [];
  let bytes = 0;
  for (const text of [...recentQuestions].reverse()) {
    const size = new TextEncoder().encode(text).byteLength;
    if (bytes + size > 16000 || recent.length === 60) break;
    recent.unshift(text);
    bytes += size;
  }
  return generationResponseSchema.parse(
    await post("generate", {
      ...settings,
      recentQuestions: recent,
      failedSkills: failedSkills.slice(-15),
    }),
  );
}
export async function loadBatch(session: PracticeSession) {
  const response = generationResponseSchema.parse(
    await post("generate", {
      sessionId: session.sessionId,
      accessToken: session.accessToken,
      batchIndex: session.nextBatch,
    }),
  );
  if (
    response.sessionId !== session.sessionId ||
    response.accessToken !== session.accessToken ||
    JSON.stringify(response.settings) !== JSON.stringify(session.settings) ||
    ![session.nextBatch, session.nextBatch + 1].includes(response.nextBatch) ||
    response.questions.length < 1 ||
    response.questions.length > 10 ||
    (response.nextBatch === session.nextBatch + 1 &&
      response.questions.length !== 10) ||
    (response.nextBatch === session.nextBatch &&
      response.questions.length === 10) ||
    response.complete !==
      (response.nextBatch * 10 === session.settings.questionCount)
  )
    throw Error("Bộ câu hỏi không khớp với phiên học. Hãy thử lại.");
  const ids = new Set<string>(),
    ordinals = new Set<number>();
  response.questions.forEach((q) => {
    const existing = session.questions.find((old) => old.ordinal === q.ordinal);
    if (
      q.sessionId !== session.sessionId ||
      q.ordinal < session.nextBatch * 10 ||
      q.ordinal >= (session.nextBatch + 1) * 10 ||
      q.difficulty !== session.settings.difficulty ||
      (!session.settings.topics.includes("all") &&
        !session.settings.topics.includes(q.topicId)) ||
      !topics.some((t) => t.topicId === q.topicId) ||
      (!!session.settings.ieltsTopic &&
        session.settings.ieltsTopic !== "all" &&
        q.ieltsTopic !== session.settings.ieltsTopic) ||
      ids.has(q.id) ||
      ordinals.has(q.ordinal) ||
      (existing &&
        (JSON.stringify(
          publicQuestionSchema.parse({
            ...existing,
            underlinedText: q.underlinedText,
            requiredOpening: q.requiredOpening,
          }),
        ) !== JSON.stringify(q) ||
          (existing.underlinedText !== undefined &&
            existing.underlinedText !== q.underlinedText) ||
          (existing.requiredOpening !== undefined &&
            existing.requiredOpening !== q.requiredOpening))) ||
      session.questions.some(
        (old) => old.id === q.id && old.ordinal !== q.ordinal,
      )
    )
      throw Error("Thứ tự câu hỏi không hợp lệ.");
    ids.add(q.id);
    ordinals.add(q.ordinal);
  });
  if (
    session.questions.some(
      (q) => q.ordinal >= session.nextBatch * 10 && !ids.has(q.id),
    )
  )
    throw Error("Các câu đã lưu không được thay đổi khi tạo bù.");
  return response;
}
const gradeResponse = z.object({
  results: z.array(
    z.object({
      exerciseId: z.string(),
      result: resultSchema.optional(),
      reveal: revealSchema.optional(),
      error: z.string().optional(),
    }),
  ),
});
export async function gradeAnswers(session: PracticeSession, ids: string[]) {
  const submissions = ids.map((exerciseId) => ({
    exerciseId,
    version: 1,
    userAnswer: session.answers[exerciseId].trim(),
  }));
  const body = gradeResponse.parse(
    await post(
      "grade",
      {
        sessionId: session.sessionId,
        accessToken: session.accessToken,
        submissions,
        ...(session.retryIds ? { retry: true } : {}),
      },
      225000,
    ),
  );
  if (
    body.results.length !== ids.length ||
    new Set(body.results.map((r) => r.exerciseId)).size !== ids.length ||
    body.results.some(
      (r) =>
        !ids.includes(r.exerciseId) ||
        (r.result &&
          (r.result.exerciseId !== r.exerciseId ||
            r.result.userAnswer !== session.answers[r.exerciseId].trim())),
    )
  )
    throw Error("Kết quả không khớp với bài gửi.");
  return body.results;
}
export async function submitExam(session: PracticeSession) {
  const committed = z
    .object({
      submitted: z.literal(true),
      answers: z.record(z.string(), z.string().min(1).max(3000)),
    })
    .parse(
      await post("submit-exam", {
        sessionId: session.sessionId,
        accessToken: session.accessToken,
        answers: Object.fromEntries(
          Object.entries(session.answers).map(([id, a]) => [id, a.trim()]),
        ),
      }),
    );
  if (
    Object.keys(committed.answers).length !== session.questions.length ||
    session.questions.some((q) => !committed.answers[q.id])
  )
    throw Error("Bài nộp không khớp với phiên học.");
  return committed.answers;
}
