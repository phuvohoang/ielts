import type { Attempt } from "./db";
import { shuffle, type Question } from "./content";
const days = [1, 3, 7, 14, 30, 60];
export function questionStates(attempts: Attempt[]) {
  const states = new Map<
    string,
    { last: number; next: number; streak: number; result: Attempt["result"] }
  >();
  for (const a of [...attempts].sort(
    (a, b) => (a.reviewedAt ?? a.date) - (b.reviewedAt ?? b.date),
  )) {
    const old = states.get(a.questionId);
    const date = a.reviewedAt ?? a.date;
    if (a.result === "review") {
      states.set(a.questionId, {
        last: date,
        next: Infinity,
        streak: old?.streak ?? 0,
        result: a.result,
      });
      continue;
    }
    const streak = a.result === "correct" ? (old?.streak ?? 0) + 1 : 0;
    states.set(a.questionId, {
      last: date,
      next:
        date +
        (a.result === "incorrect" ? 1 : days[Math.min(streak - 1, 5)]) *
          86400000,
      streak,
      result: a.result,
    });
  }
  return states;
}
export function selectSession(
  pool: Question[],
  attempts: Attempt[],
  options: {
    now: number;
    limit: number;
    dueOnly?: boolean;
    exclude?: string[];
    random?: () => number;
  },
) {
  const states = questionStates(attempts);
  const excluded = new Set(options.exclude ?? []);
  const unique = [...new Map(pool.map((q) => [q.id, q])).values()].filter(
    (q) => !excluded.has(q.id),
  );
  const tiers = [
    unique.filter((q) => !states.has(q.id) && !options.dueOnly),
    unique.filter((q) => {
      const s = states.get(q.id);
      return s && s.next <= options.now && s.result === "incorrect";
    }),
    unique.filter((q) => {
      const s = states.get(q.id);
      return s && s.next <= options.now && s.result === "correct";
    }),
  ];
  const chosen: Question[] = [];
  const counts = new Map<string, number>();
  let previous = pool.find(
    (q) =>
      q.id === [...attempts].sort((a, b) => b.date - a.date)[0]?.questionId,
  );
  for (const tier of tiers) {
    const available = shuffle(tier, options.random);
    while (available.length && chosen.length < options.limit) {
      let best = 0;
      let bestScore = -Infinity;
      available.forEach((q, i) => {
        const score =
          100 / (1 + (counts.get(`type:${q.type}`) ?? 0)) +
          35 / (1 + (counts.get(`topic:${q.topic}`) ?? 0)) +
          25 / (1 + (counts.get(`level:${q.difficulty}`) ?? 0)) -
          (previous?.type === q.type ? 20 : 0) -
          (previous?.group && previous.group === q.group ? 1000 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      const q = available.splice(best, 1)[0];
      chosen.push(q);
      previous = q;
      for (const k of [
        `type:${q.type}`,
        `topic:${q.topic}`,
        `level:${q.difficulty}`,
      ])
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return chosen;
}
