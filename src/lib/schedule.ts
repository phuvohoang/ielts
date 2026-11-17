import type { Progress } from "./db";
export const intervals = [1, 3, 7, 14, 30, 60] as const;
export function schedule(
  previous: Progress | undefined,
  id: string,
  correct: boolean,
  now: number,
): Progress {
  const streak = correct ? (previous?.streak ?? 0) + 1 : 0;
  return {
    id,
    correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
    incorrect: (previous?.incorrect ?? 0) + (correct ? 0 : 1),
    reviews: (previous?.reviews ?? 0) + 1,
    streak,
    last: now,
    next:
      now + (correct ? intervals[Math.min(streak - 1, 5)] * 86400000 : 600000),
    mastered: streak >= 6,
  };
}
