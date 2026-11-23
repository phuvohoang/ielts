import {
  generateRequestSchema,
  submissionSchema as curriculumSubmissionSchema,
} from "../src/lib/curriculum/schema";
import {
  essayInputSchema,
  exerciseRequestSchema,
  reviewSubmissionSchema,
} from "../src/lib/writing/schema";
import { z } from "zod";
import { batchSchema } from "../src/lib/ai/schema";
import { exerciseById } from "../src/lib/ai/content";
import { cachedGrade, boundedMap, readBody, withTimeout } from "./grading";
import {
  createSchema,
  validateSettings,
  UnsupportedSettingsError,
  continuationSchema,
  dynamicGradeSchema,
  examSubmissionSchema,
} from "../src/lib/ai/dynamic/schema";
import { type SessionEnv } from "./sessions";
import { providerConfigured } from "./provider";
import {
  practiceSettingsSchema,
  practiceIdentitySchema,
  practiceSubmissionSchema,
} from "../src/lib/practice/schema";
export { GrammarSessions } from "./sessions";
export default {
  async fetch(request: Request, env: SessionEnv): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed =
      !!origin &&
      env.ALLOWED_ORIGINS?.split(",")
        .map((s) => s.trim())
        .includes(origin);
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Grader-Revision": "source-coverage-grading-1",
      Vary: "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (allowed) headers["Access-Control-Allow-Origin"] = origin;
    const send = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    const path = new URL(request.url).pathname;
    if (
      ![
        "/api/grammar/grade",
        "/api/grammar/generate",
        "/api/grammar/submit-exam",
        "/api/practice/generate",
        "/api/practice/grade",
        "/api/practice/audio",
        "/api/writing/assess",
        "/api/writing/exercise",
        "/api/writing/grade",
        "/api/curriculum/generate",
        "/api/curriculum/grade",
      ].includes(path)
    )
      return send({ error: "Not found" }, 404);
    if (!allowed) return send({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return send({ error: "Method not allowed" }, 405);
    if (!providerConfigured(env) || !env.GRADE_LIMIT || !env.GLOBAL_LIMIT)
      return send({ error: "Grader not configured" }, 503);
    if (!request.headers.get("content-type")?.includes("application/json"))
      return send({ error: "JSON required" }, 415);
    let raw: unknown;
    try {
      raw = await withTimeout(
        () =>
          readBody(
            request,
            path === "/api/grammar/submit-exam"
              ? 640000
              : path.startsWith("/api/writing/")
                ? 128000
                : 32000,
          ),
        3000,
      );
    } catch (e) {
      return send(
        { error: "Invalid or oversized request" },
        e instanceof Error && e.message === "large" ? 413 : 400,
      );
    }
    if (path.startsWith("/api/curriculum/")) {
      if (!env.SESSIONS || !env.GENERATE_LIMIT)
        return send({ error: "Curriculum unavailable" }, 503);
      try {
        const op = path.split("/").at(-1)!;
        const parsed = (
          op === "generate" ? generateRequestSchema : curriculumSubmissionSchema
        ).parse(raw);
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        if (
          !(
            await (
              op === "generate" ? env.GENERATE_LIMIT : env.GRADE_LIMIT
            ).limit({ key: ip })
          ).success ||
          !(await env.GLOBAL_LIMIT.limit({ key: "ielts-grammar" })).success
        )
          return send(
            { error: "Yêu cầu quá nhanh. Thử lại sau một phút." },
            429,
          );
        const id = "id" in parsed ? parsed.id : crypto.randomUUID();
        const response = await env.SESSIONS.get(
          env.SESSIONS.idFromName(`curriculum:${id}`),
        ).fetch(
          new Request(`https://session/curriculum/${op}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-Id": id },
            body: JSON.stringify(parsed),
          }),
        );
        return new Response(response.body, {
          status: response.status,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      } catch (e) {
        return send(
          { error: "Dữ liệu hoặc dịch vụ bài học chưa sẵn sàng." },
          e instanceof z.ZodError ? 400 : 503,
        );
      }
    }
    if (path.startsWith("/api/writing/")) {
      if (!env.SESSIONS || !env.GENERATE_LIMIT)
        return send({ error: "Writing unavailable" }, 503);
      try {
        const op = path.split("/").at(-1)!;
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        if (
          !(
            await (
              op === "exercise" ? env.GENERATE_LIMIT : env.GRADE_LIMIT
            ).limit({ key: ip })
          ).success ||
          !(await env.GLOBAL_LIMIT.limit({ key: "ielts-grammar" })).success
        )
          return send(
            { error: "Yêu cầu quá nhanh. Thử lại sau một phút." },
            429,
          );
        const parsed = (
          op === "assess"
            ? essayInputSchema
            : op === "exercise"
              ? exerciseRequestSchema
              : reviewSubmissionSchema
        ).parse(raw);
        const id =
          "essayId" in parsed
            ? parsed.essayId
            : "id" in parsed
              ? parsed.id
              : crypto.randomUUID();
        const response = await env.SESSIONS.get(
          env.SESSIONS.idFromName(`writing:${id}`),
        ).fetch(
          new Request(`https://session/writing/${op}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-Id": id },
            body: JSON.stringify(parsed),
          }),
        );
        return new Response(response.body, {
          status: response.status,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      } catch (e) {
        return send(
          {
            error:
              e instanceof z.ZodError
                ? "Dữ liệu Writing không hợp lệ."
                : "Writing chưa sẵn sàng. Bài làm vẫn được giữ.",
          },
          e instanceof z.ZodError ? 400 : 503,
        );
      }
    }
    if (path.startsWith("/api/practice/")) {
      if (!env.SESSIONS || !env.GENERATE_LIMIT)
        return send({ error: "Practice unavailable" }, 503);
      const op = path.split("/").at(-1)!;
      try {
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        if (
          !(
            await (op === "grade" ? env.GRADE_LIMIT : env.GENERATE_LIMIT).limit(
              { key: ip },
            )
          ).success ||
          !(await env.GLOBAL_LIMIT.limit({ key: "ielts-grammar" })).success
        )
          return send(
            { error: "Yêu cầu quá nhanh. Hãy thử lại sau một phút." },
            429,
          );
        const parsed = (
          op === "generate"
            ? practiceSettingsSchema
            : op === "grade"
              ? practiceSubmissionSchema
              : practiceIdentitySchema.pick({ id: true, token: true }).strict()
        ).parse(raw);
        const id = "id" in parsed ? parsed.id : crypto.randomUUID();
        const response = await env.SESSIONS.get(
          env.SESSIONS.idFromName(id),
        ).fetch(
          new Request(`https://session/skills/${op}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Session-Id": id },
            body: JSON.stringify(parsed),
          }),
        );
        return new Response(response.body, {
          status: response.status,
          headers: {
            ...headers,
            "Content-Type":
              response.headers.get("Content-Type") || "application/json",
          },
        });
      } catch (e) {
        return send(
          {
            error:
              e instanceof z.ZodError
                ? "Dữ liệu không hợp lệ."
                : "Dịch vụ luyện tập chưa sẵn sàng. Hãy thử lại.",
          },
          e instanceof z.ZodError ? 400 : 503,
        );
      }
    }
    if (
      path !== "/api/grammar/grade" ||
      (typeof raw === "object" && raw !== null && "sessionId" in raw)
    ) {
      if (!env.SESSIONS || !env.GENERATE_LIMIT)
        return send(
          {
            error:
              "Dynamic practice is not configured yet. The existing grader is still available.",
          },
          503,
        );
      try {
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        if (
          !(
            await (
              path === "/api/grammar/generate"
                ? env.GENERATE_LIMIT
                : env.GRADE_LIMIT
            ).limit({ key: ip })
          ).success ||
          !(await env.GLOBAL_LIMIT.limit({ key: "ielts-grammar" })).success
        )
          return send(
            { error: "Too many requests. Please retry in one minute." },
            429,
          );
        let sessionId: string, operation: string, data: unknown;
        if (
          path === "/api/grammar/generate" &&
          !(typeof raw === "object" && raw !== null && "sessionId" in raw)
        ) {
          const parsed = createSchema.parse(raw);
          validateSettings(parsed);
          sessionId = crypto.randomUUID();
          operation = "create";
          data = parsed;
        } else {
          const parsed = (
            path === "/api/grammar/generate"
              ? continuationSchema
              : path === "/api/grammar/submit-exam"
                ? examSubmissionSchema
                : dynamicGradeSchema
          ).parse(raw);
          sessionId = parsed.sessionId;
          operation =
            path === "/api/grammar/generate"
              ? "batch"
              : path === "/api/grammar/submit-exam"
                ? "submit-exam"
                : "grade";
          data = parsed;
        }
        const response = await env.SESSIONS.get(
          env.SESSIONS.idFromName(sessionId),
        ).fetch(
          new Request(`https://session/${operation}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-Id": sessionId,
            },
            body: JSON.stringify(data),
          }),
        );
        return new Response(response.body, {
          status: response.status,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      } catch (e) {
        return send(
          {
            error:
              e instanceof z.ZodError
                ? "Invalid session request"
                : "Session unavailable or unsupported settings",
          },
          e instanceof z.ZodError || e instanceof UnsupportedSettingsError
            ? 400
            : 503,
        );
      }
    }
    let input: z.infer<typeof batchSchema>;
    try {
      input = batchSchema.parse(raw);
    } catch (e) {
      return send(
        {
          error:
            e instanceof Error && e.message === "large"
              ? "Request too large"
              : "Invalid request",
        },
        e instanceof Error && e.message === "large" ? 413 : 400,
      );
    }
    if (input.submissions.some((s) => !exerciseById.has(s.exerciseId)))
      return send({ error: "Unknown exercise" }, 400);
    try {
      // CF-Connecting-IP is supplied by Cloudflare, never trusted from a client-provided JSON identifier.
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (
        !(await env.GRADE_LIMIT.limit({ key: ip })).success ||
        !(await env.GLOBAL_LIMIT.limit({ key: "ielts-grammar" })).success
      )
        return send(
          { error: "Bạn đã gửi nhiều bài. Vui lòng thử lại sau một phút." },
          429,
        );
      const results = await boundedMap(input.submissions, async (s) => {
        try {
          return {
            exerciseId: s.exerciseId,
            result: await cachedGrade(
              env,
              exerciseById.get(s.exerciseId)!,
              s.userAnswer,
            ),
          };
        } catch (error) {
          const failure = error as { code?: string; reason?: string };
          const code = [
            "AI_TIMEOUT",
            "AI_RESPONSE_INVALID",
            "AI_PROVIDER_ERROR",
          ].includes(failure.code ?? "")
            ? failure.code!
            : "AI_PROVIDER_ERROR";
          return {
            exerciseId: s.exerciseId,
            errorCode: code,
            reason: failure.reason ?? "provider",
            error:
              code === "AI_TIMEOUT"
                ? "AI chấm quá lâu. Hãy thử lại; bài này chưa được chấm điểm."
                : code === "AI_RESPONSE_INVALID"
                  ? "AI trả về đánh giá chưa hợp lệ. Hãy thử lại; bài này chưa được chấm điểm."
                  : "AI tạm thời không khả dụng. Hãy thử lại; bài này chưa được chấm điểm.",
          };
        }
      });
      return send({ results });
    } catch {
      return send(
        {
          error:
            "Dịch vụ tạm thời không khả dụng. Bài của bạn chưa được chấm điểm.",
        },
        503,
      );
    }
  },
};
