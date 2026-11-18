import { z } from "zod";
import {
  knownResult,
  resultSchema,
  type Exercise,
  type GradeResult,
} from "./schema";
const responseSchema = z.object({
  results: z.array(
    z.object({
      exerciseId: z.string(),
      result: resultSchema.optional(),
      error: z.string().optional(),
      errorCode: z
        .enum(["AI_TIMEOUT", "AI_RESPONSE_INVALID", "AI_PROVIDER_ERROR"])
        .optional(),
      reason: z.string().max(120).optional(),
    }),
  ),
});
const inFlight = new Map<string, Promise<GradeResult>>();
export function gradeExercise(
  q: Exercise,
  userAnswer: string,
): Promise<GradeResult> {
  const known = knownResult(q, userAnswer);
  if (known) return Promise.resolve(known);
  const key = JSON.stringify([q.id, q.version, userAnswer]);
  if (inFlight.has(key)) return inFlight.get(key)!;
  const work = (async () => {
    const endpoint =
      import.meta.env.VITE_GRAMMAR_API_URL || "/api/grammar/grade";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissions: [{ exerciseId: q.id, version: q.version, userAnswer }],
        }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw Error(
          response.status === 429
            ? "Bạn đã gửi nhiều bài. Hãy thử lại sau một phút."
            : "AI tạm thời không khả dụng. Bài này chưa được chấm điểm.",
        );
      const item = responseSchema
        .parse(await response.json())
        .results.find((r) => r.exerciseId === q.id);
      if (!item?.result) {
        console.warn(
          "Grammar grading unavailable",
          item?.errorCode ?? "UNKNOWN",
          item?.reason ?? "unknown",
        );
        throw Error(item?.error ?? "AI chưa trả về kết quả. Hãy thử lại.");
      }
      if (
        item.result.exerciseId !== q.id ||
        item.result.userAnswer !== userAnswer
      )
        throw Error("Kết quả không khớp với bài gửi. Hãy thử lại.");
      return item.result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw Error(
          "AI chấm quá lâu. Bài này chưa được chấm điểm; hãy thử lại.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
