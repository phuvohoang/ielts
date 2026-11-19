import {
  publicExerciseSchema,
  practiceResultSchema,
  type PracticeRecord,
} from "./schema";
import { db } from "../db";
const base = () =>
  (import.meta.env.VITE_GRAMMAR_API_URL || "/api/grammar/grade").replace(
    /\/grammar\/grade\/?$/,
    "/practice",
  );
async function request(operation: string, body: unknown, audio = false) {
  const response = await fetch(`${base()}/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(operation === "generate" ? 200000 : 120000),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw Error(
      typeof value.error === "string"
        ? value.error
        : "Dịch vụ chưa sẵn sàng. Bài làm vẫn được lưu.",
    );
  }
  return audio ? response.blob() : response.json();
}
export async function generatePractice(settings: unknown) {
  return publicExerciseSchema.parse(await request("generate", settings));
}
export async function gradePractice(record: PracticeRecord) {
  const result = practiceResultSchema.parse(
    await request("grade", {
      id: record.id,
      token: record.exercise.token,
      answers: record.answers,
    }),
  );
  if (
    JSON.stringify(Object.entries(result.submittedAnswers).sort()) !==
    JSON.stringify(Object.entries(record.answers).sort())
  )
    throw Error("Phản hồi không khớp bài đã nộp.");
  return result;
}
export async function loadAudio(record: PracticeRecord) {
  const saved = await db.practiceAudio.get(record.id);
  if (saved) return saved.blob;
  const blob = (await request(
    "audio",
    { id: record.id, token: record.exercise.token },
    true,
  )) as Blob;
  if (!blob.type.startsWith("audio/"))
    throw Error("Dịch vụ chưa trả về âm thanh hợp lệ.");
  await db.practiceAudio.put({ id: record.id, blob });
  return blob;
}
