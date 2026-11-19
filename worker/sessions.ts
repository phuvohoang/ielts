import {
  rewriteProblem,
  enforceRewriteChange,
} from "../src/lib/ai/dynamic/rewrite-guard";
import { generateBatch } from "./generation";
import { handlePractice } from "./practice";
import { cachedGrade, boundedMap, type Env } from "./grading";
import {
  createSchema,
  validateSettings,
  continuationSchema,
  dynamicGradeSchema,
  examSubmissionSchema,
  makePlan,
  publicQuestion,
  visibleOpening,
  type PrivateQuestion,
  type Settings,
} from "../src/lib/ai/dynamic/schema";
import {
  knownResult,
  normalizeAnswer,
  type Exercise,
  type GradeResult,
} from "../src/lib/ai/schema";
interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(time: number): Promise<void>;
  deleteAll(): Promise<void>;
}
export interface SessionNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface SessionEnv extends Env {
  SESSIONS?: SessionNamespace;
  GENERATE_LIMIT?: Env["GRADE_LIMIT"];
}
interface Meta {
  sessionId: string;
  accessToken: string;
  settings: Settings;
  expiresAt: number;
  nextBatch: number;
  recentQuestions: string[];
  failedSkills: string[];
  examSubmitted: boolean;
}
export const SESSION_TTL = 7 * 86400000;
export function asExercise(q: PrivateQuestion): Exercise {
  return {
    id: q.id,
    version: 1,
    lessonId: `dynamic:${q.sessionId}`,
    type: q.exerciseType === "multiple_choice" ? "fill_blank" : q.exerciseType,
    difficulty: q.difficulty,
    part: "C",
    question: q.questionText,
    instruction: q.instruction,
    ...(q.rootWord ? { rootWord: q.rootWord } : {}),
    ...(visibleOpening(q) ? { requiredOpening: visibleOpening(q)! } : {}),
    referenceAnswers: q.referenceAnswers,
    acceptedVariants: q.acceptedVariants,
    grammarRules: q.grammarRules,
    targetSkills: q.targetSkills,
    explanation: q.explanationVi,
    rubric:
      "Preserve grammar, naturalness, meaning, tense, degree and explicit instructions. " +
      q.instruction +
      (["sentence_transformation", "paraphrasing"].includes(q.exerciseType)
        ? " An unchanged copy of the source does not satisfy this rewrite task."
        : "") +
      (q.targetWord
        ? " The requested changed word-family form is " + q.targetWord + "."
        : ""),
    objective: q.answerForm !== "sentence",
  };
}
function deterministicResult(
  q: PrivateQuestion,
  answer: string,
  correct: boolean,
): GradeResult {
  return {
    exerciseId: q.id,
    status: correct ? "correct" : "incorrect",
    score: correct ? 1 : 0,
    maxScore: 1,
    userAnswer: answer,
    correctedAnswer:
      q.exerciseType === "multiple_choice"
        ? q.options.find((o) => o.id === q.correctOptionId)!.text
        : q.referenceAnswers[0],
    alternativeAnswers: q.acceptedVariants,
    feedbackVi: correct
      ? "Đúng. Dạng từ phù hợp với cấu trúc câu."
      : (q.distractorExplanations.find((d) => d.optionId === answer)
          ?.explanationVi ??
        "Dạng từ hoặc lựa chọn chưa phù hợp với cấu trúc câu."),
    grammarRule: q.grammarRules.join(" · "),
    explanationVi: q.explanationVi,
    errorSpans: [],
    confidence: 1,
    needsReview: false,
  };
}
export async function gradeGenerated(
  env: Env,
  q: PrivateQuestion,
  answer: string,
) {
  if (rewriteProblem(q)) {
    return {
      ...deterministicResult(q, answer, false),
      status: "needs_review" as const,
      score: null,
      needsReview: true,
      confidence: 1,
      correctedAnswer: "",
      alternativeAnswers: [],
      errorSpans: [],
      feedbackVi:
        "Đề bị lỗi: câu gốc đã chứa đáp án hoặc chưa yêu cầu thay đổi dạng từ thực sự. Câu này không tính điểm; bạn không bị trừ điểm.",
      grammarRule: "Bài viết lại phải yêu cầu một thay đổi thực sự.",
      explanationVi:
        "Đây là lỗi của đề, không phải lỗi của người học. Hãy chuyển sang câu khác; bài làm đã lưu vẫn được giữ.",
    };
  }
  if (env.AI_PRACTICE_ONLY === "true") {
    const text =
      q.exerciseType === "multiple_choice"
        ? q.options.find((o) => o.id === answer)?.text
        : answer;
    if (!text) throw Error("Invalid answer");
    const result = await cachedGrade(env, asExercise(q), text, true);
    return enforceRewriteChange(q, answer, { ...result, userAnswer: answer });
  }
  if (q.exerciseType === "multiple_choice")
    return deterministicResult(q, answer, answer === q.correctOptionId);
  const exercise = asExercise(q),
    known = knownResult(exercise, answer);
  if (known) return known;
  if (
    (q.constraint === "adverb_before_adjective" ||
      (q.rootWord?.toLowerCase() === "statistics" &&
        /___\s+significant\b/i.test(q.questionText))) &&
    q.answerForm === "adverb" &&
    q.referenceAnswers.some(
      (a) =>
        normalizeAnswer(a).endsWith("ly") &&
        normalizeAnswer(a).slice(0, -2) === normalizeAnswer(answer),
    )
  ) {
    const result = deterministicResult(q, answer, false);
    result.feedbackVi =
      "Vị trí này cần Adverb bổ nghĩa cho Adjective; dạng Adjective chưa phù hợp.";
    return result;
  }

  // Unknown alternatives go to semantic grading; absence from a finite key is not evidence of incorrectness.
  return enforceRewriteChange(
    q,
    answer,
    await cachedGrade(env, exercise, answer),
  );
}
/** One object per random session; serial queue deduplicates concurrent batch generation, including across tabs. */
export class GrammarSessions {
  private queue: Promise<unknown> = Promise.resolve();
  private storage: Storage;
  private env: SessionEnv;
  constructor(ctx: { storage: Storage }, env: SessionEnv) {
    this.storage = ctx.storage;
    this.env = env;
  }
  async alarm() {
    await this.storage.deleteAll();
  }
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/skills/")) {
      const work = this.queue.then(() =>
        handlePractice(request, this.env, this.storage),
      );
      this.queue = work.catch(() => undefined);
      return work;
    }
    if (
      !["/create", "/batch", "/submit-exam"].includes(
        new URL(request.url).pathname,
      )
    )
      return this.handle(request);
    const work = this.queue.then(() => this.handle(request));
    this.queue = work.catch(() => undefined);
    return work;
  }
  private async examAnswers(batches: number) {
    const answers: Record<string, string> = {};
    for (let i = 0; i < batches; i++)
      Object.assign(
        answers,
        await this.storage.get<Record<string, string>>(`exam:${i}`),
      );
    return answers;
  }
  private async handle(request: Request): Promise<Response> {
    const send = (body: unknown, status = 200) =>
      Response.json(body, { status });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return send({ error: "Invalid JSON" }, 400);
    }
    const path = new URL(request.url).pathname;
    if (path === "/create") {
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) return send({ error: "Invalid settings" }, 400);
      let settings: Settings;
      try {
        settings = validateSettings(parsed.data);
      } catch {
        return send({ error: "Unsupported settings" }, 400);
      }
      if (await this.storage.get("meta"))
        return send({ error: "Session exists" }, 409);
      const sessionId = request.headers.get("X-Session-Id")!;
      const accessToken = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const meta: Meta = {
        sessionId,
        accessToken,
        settings,
        expiresAt: Date.now() + SESSION_TTL,
        nextBatch: 0,
        recentQuestions: parsed.data.recentQuestions,
        failedSkills: parsed.data.failedSkills,
        examSubmitted: false,
      };
      await this.storage.put("meta", meta);
      await this.storage.setAlarm(meta.expiresAt);
      return send({
        ...meta,
        questions: [],
        complete: false,
        recentQuestions: undefined,
        failedSkills: undefined,
        examSubmitted: undefined,
      });
    }
    const parsed =
      path === "/batch"
        ? continuationSchema.safeParse(body)
        : path === "/submit-exam"
          ? examSubmissionSchema.safeParse(body)
          : dynamicGradeSchema.safeParse(body);
    if (!parsed.success) return send({ error: "Invalid session request" }, 400);
    const input = parsed.data;
    const meta = await this.storage.get<Meta>("meta");
    if (
      !meta ||
      meta.sessionId !== input.sessionId ||
      meta.accessToken !== input.accessToken
    )
      return send({ error: "Session unavailable" }, 404);
    if (meta.expiresAt <= Date.now())
      return send(
        {
          error:
            "Answer keys expired. Saved questions and feedback remain on your device. Start a new session to generate more.",
        },
        410,
      );
    if (path === "/batch" && "batchIndex" in input) {
      if (input.batchIndex > meta.nextBatch)
        return send({ error: "Load batches in order" }, 409);
      const total = meta.settings.questionCount / 10;
      if (input.batchIndex >= total)
        return send({ error: "No more batches" }, 400);
      let batch = await this.storage.get<PrivateQuestion[]>(
        `batch:${input.batchIndex}`,
      );
      if (!batch || batch.length < 10) {
        try {
          const previous: PrivateQuestion[] = [];
          for (let i = 0; i < meta.nextBatch; i++)
            previous.push(
              ...((await this.storage.get<PrivateQuestion[]>(`batch:${i}`)) ??
                []),
            );
          const plan = makePlan(meta.settings).slice(
            input.batchIndex * 10,
            (input.batchIndex + 1) * 10,
          );
          batch = await generateBatch(
            this.env,
            meta.settings,
            meta.sessionId,
            plan,
            [
              ...meta.recentQuestions,
              ...previous.map((q) => q.questionText),
            ].slice(-110),
            meta.failedSkills,
            45000,
            {
              accepted: batch ?? [],
              checkpoint: (questions) =>
                this.storage.put(`batch:${input.batchIndex}`, questions),
              publishPartial: input.allowPartial,
            },
          );
          // Persist batch first; a recovered request can finish the metadata update without regenerating it.
          await this.storage.put(`batch:${input.batchIndex}`, batch);
        } catch (error) {
          batch = await this.storage.get<PrivateQuestion[]>(
            `batch:${input.batchIndex}`,
          );
          // Only independently accepted items have been checkpointed. New clients
          // can practise them immediately; older clients keep the full-batch contract.
          if (input.allowPartial && batch?.length) {
            return send({
              sessionId: meta.sessionId,
              accessToken: meta.accessToken,
              settings: meta.settings,
              expiresAt: meta.expiresAt,
              questions: batch.map(publicQuestion),
              nextBatch: meta.nextBatch,
              complete: false,
            });
          }
          const failure = error as { code?: string; reason?: string };
          return send(
            {
              error: failure.reason?.includes("quota_exhausted")
                ? "Dịch vụ AI đã chạm hạn mức. Tiến độ vẫn được giữ. Hãy thử lại sau."
                : "AI chưa trả đủ bộ câu hỏi. Hãy thử lại; tiến độ đã lưu vẫn được giữ.",
              code: failure.code ?? "GENERATION_UNAVAILABLE",
              reason: failure.reason ?? "unknown",
            },
            503,
          );
        }
      }
      if (batch.length === 10)
        meta.nextBatch = Math.max(meta.nextBatch, input.batchIndex + 1);
      await this.storage.put("meta", meta);
      return send({
        sessionId: meta.sessionId,
        accessToken: meta.accessToken,
        settings: meta.settings,
        expiresAt: meta.expiresAt,
        questions: batch.map(publicQuestion),
        nextBatch: meta.nextBatch,
        complete: meta.nextBatch === total,
      });
    }
    if (path === "/submit-exam" && "answers" in input) {
      if (
        meta.settings.feedbackMode !== "exam" ||
        meta.nextBatch * 10 !== meta.settings.questionCount
      )
        return send({ error: "The exam is not ready" }, 409);
      const questions: PrivateQuestion[] = [];
      for (let i = 0; i < meta.nextBatch; i++)
        questions.push(
          ...((await this.storage.get<PrivateQuestion[]>(`batch:${i}`)) ?? []),
        );
      if (
        Object.keys(input.answers).length !== questions.length ||
        questions.some(
          (q) =>
            !input.answers[q.id] ||
            (q.exerciseType === "multiple_choice" &&
              !q.options.some((o) => o.id === input.answers[q.id])),
        )
      )
        return send(
          { error: "Answer every exam question before submission" },
          400,
        );
      if (!meta.examSubmitted) {
        // Keep each stored value below the Durable Object 128 KiB value bound,
        // including 50 maximum-length multilingual answers.
        for (let i = 0; i < meta.nextBatch; i++) {
          const chunk = questions.slice(i * 10, (i + 1) * 10);
          await this.storage.put(
            `exam:${i}`,
            Object.fromEntries(chunk.map((q) => [q.id, input.answers[q.id]])),
          );
        }
        meta.examSubmitted = true;
        await this.storage.put("meta", meta);
      }
      return send({
        submitted: true,
        answers: await this.examAnswers(meta.nextBatch),
      });
    }
    if (path === "/grade" && "submissions" in input) {
      const questions: PrivateQuestion[] = [];
      for (let i = 0; i <= meta.nextBatch; i++)
        questions.push(
          ...((await this.storage.get<PrivateQuestion[]>(`batch:${i}`)) ?? []),
        );
      if (
        input.submissions.some(
          (s) => !questions.some((q) => q.id === s.exerciseId),
        )
      )
        return send({ error: "Unknown session exercise" }, 400);
      if (
        input.submissions.some((s) => {
          const q = questions.find((q) => q.id === s.exerciseId)!;
          return (
            q.exerciseType === "multiple_choice" &&
            !q.options.some((o) => o.id === s.userAnswer)
          );
        })
      )
        return send({ error: "Unknown option ID" }, 400);
      const frozen =
        meta.settings.feedbackMode === "exam" && meta.examSubmitted
          ? await this.examAnswers(meta.nextBatch)
          : {};
      if (
        meta.settings.feedbackMode === "exam" &&
        (!meta.examSubmitted ||
          input.submissions.some((s) => frozen[s.exerciseId] !== s.userAnswer))
      )
        return send(
          {
            error:
              "Submit the complete exam before grading; submitted answers are immutable",
          },
          409,
        );
      const results = await boundedMap(input.submissions, async (s) => {
        const q = questions.find((q) => q.id === s.exerciseId)!;
        try {
          const result = await gradeGenerated(this.env, q, s.userAnswer);
          return {
            exerciseId: q.id,
            result,
            ...(!result.needsReview
              ? {
                  reveal: {
                    referenceAnswers: q.referenceAnswers,
                    acceptedVariants: q.acceptedVariants,
                    explanationVi: q.explanationVi,
                    distractorExplanations: q.distractorExplanations,
                  },
                }
              : {}),
          };
        } catch {
          return {
            exerciseId: q.id,
            error: "AI tạm thời không khả dụng. Bài này chưa được chấm điểm.",
          };
        }
      });
      return send({ results });
    }
    return send({ error: "Not found" }, 404);
  }
}
