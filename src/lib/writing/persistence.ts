import { db } from "../db";
import {
  assessmentSchema,
  patternSchema,
  reviewExerciseSchema,
  reviewGradeSchema,
  type Assessment,
  type Pattern,
  type ReviewExercise,
  type ReviewGrade,
  type Issue,
} from "./schema";
import { patternKey, schedulePattern } from "./model";
export async function saveAssessment(input: Assessment) {
  const assessment = assessmentSchema.parse(input);
  await db.transaction("rw", db.writingAssessments, async () => {
    const old = await db.writingAssessments.get(assessment.id);
    if (old) {
      if (
        old.originalEssay !== assessment.originalEssay ||
        old.prompt !== assessment.prompt
      )
        throw Error("Bài viết gốc không khớp.");
      return;
    }
    await db.writingAssessments.add(assessment);
  });
}
export async function decideIssue(
  essayId: string,
  issueId: string,
  decision: "accepted" | "dismissed",
  edit?: Partial<
    Pick<
      Issue,
      | "correction"
      | "alternatives"
      | "explanationVi"
      | "targetPattern"
      | "category"
      | "ruleId"
    >
  >,
  now = Date.now(),
) {
  return db.transaction(
    "rw",
    db.writingAssessments,
    db.writingPatterns,
    async () => {
      const a = await db.writingAssessments.get(essayId);
      if (!a) throw Error("Không tìm thấy bài viết.");
      const index = a.issues.findIndex((i) => i.id === issueId);
      if (index < 0) throw Error("Không tìm thấy lỗi.");
      const issue = a.issues[index];
      if (issue.status !== "pending") return;
      const next = { ...issue, ...edit, status: decision };
      if (decision === "accepted") {
        if (issue.kind !== "error" || issue.confidence < 0.8)
          throw Error(
            "Đề xuất phong cách hoặc chưa chắc chắn không được tự coi là lỗi.",
          );
        if (
          next.correction === next.original ||
          next.alternatives.includes(next.original)
        )
          throw Error("Cách diễn đạt gốc đã hợp lệ; hãy bỏ qua đề xuất này.");
        const key = patternKey(next.category, next.ruleId);
        const old = await db.writingPatterns
          .where("key")
          .equals(key)
          .filter((p) => p.status !== "merged")
          .first();
        const recurring = old?.status === "mastered";
        const pattern: Pattern = old
          ? {
              ...old,
              evidenceIds: [...new Set([...old.evidenceIds, issue.id])],
              essayIds: [...new Set([...old.essayIds, a.id])],
              originalExamples: [
                ...new Set([...old.originalExamples, issue.original]),
              ],
              updatedAt: now,
              ...(recurring
                ? {
                    status: "learning",
                    streak: 0,
                    successfulContexts: [],
                    successfulDays: [],
                    freeWritingPassed: false,
                    lapses: old.lapses + 1,
                    intervalDays: 1,
                    dueAt: now + 86400000,
                  }
                : {}),
            }
          : {
              id: key,
              key,
              category: next.category,
              ruleId: next.ruleId,
              targetPattern: next.targetPattern,
              correction: next.correction,
              alternatives: next.alternatives,
              explanationVi: next.explanationVi,
              severity: next.severity,
              status: "learning",
              evidenceIds: [issue.id],
              essayIds: [a.id],
              originalExamples: [issue.original],
              createdAt: now,
              updatedAt: now,
              dueAt: now,
              intervalDays: 0,
              streak: 0,
              lapses: 0,
              successfulContexts: [],
              successfulDays: [],
              freeWritingPassed: false,
            };
        await db.writingPatterns.put(patternSchema.parse(pattern));
        next.patternId = pattern.id;
      }
      a.issues[index] = next;
      await db.writingAssessments.put(assessmentSchema.parse(a));
    },
  );
}
export async function mergePatterns(
  sourceId: string,
  targetId: string,
  now = Date.now(),
) {
  if (sourceId === targetId) throw Error("Chọn hai mẫu khác nhau.");
  await db.transaction(
    "rw",
    db.writingPatterns,
    db.writingAssessments,
    async () => {
      const source = await db.writingPatterns.get(sourceId),
        target = await db.writingPatterns.get(targetId);
      if (
        !source ||
        !target ||
        source.status === "merged" ||
        target.status === "merged"
      )
        throw Error("Không tìm thấy mẫu đang học.");
      await db.writingPatterns.put({
        ...target,
        evidenceIds: [
          ...new Set([...target.evidenceIds, ...source.evidenceIds]),
        ],
        essayIds: [...new Set([...target.essayIds, ...source.essayIds])],
        originalExamples: [
          ...new Set([...target.originalExamples, ...source.originalExamples]),
        ],
        status: "learning",
        streak: 0,
        dueAt: now,
        successfulContexts: [],
        successfulDays: [],
        freeWritingPassed: false,
        updatedAt: now,
      });
      await db.writingPatterns.put({
        ...source,
        status: "merged",
        mergedInto: target.id,
        updatedAt: now,
      });
      for (const a of await db.writingAssessments.toArray()) {
        if (a.issues.some((i) => i.patternId === sourceId))
          await db.writingAssessments.put({
            ...a,
            issues: a.issues.map((i) =>
              i.patternId === sourceId ? { ...i, patternId: targetId } : i,
            ),
          });
      }
    },
  );
}
export async function saveReview(
  exerciseInput: ReviewExercise,
  gradeInput: ReviewGrade,
  now = Date.now(),
) {
  const exercise = reviewExerciseSchema.parse(exerciseInput),
    grade = reviewGradeSchema.parse(gradeInput);
  if (grade.exerciseId !== exercise.id) throw Error("Phản hồi sai bài luyện.");
  return db.transaction(
    "rw",
    db.writingOutcomes,
    db.writingPatterns,
    async () => {
      if (await db.writingOutcomes.get(exercise.id)) return;
      const pattern = await db.writingPatterns.get(exercise.patternId);
      if (!pattern || pattern.status === "merged")
        throw Error("Mẫu này đã được gộp; hãy mở bài luyện của mẫu đích.");
      await db.writingOutcomes.add({
        id: exercise.id,
        exerciseId: exercise.id,
        patternId: pattern.id,
        level: exercise.level,
        date: now,
        result: grade,
      });
      await db.writingPatterns.put(
        schedulePattern(pattern, exercise, grade, now),
      );
    },
  );
}
