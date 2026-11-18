import type { z } from "zod";
import type { questionSchema } from "./schemas";
import { lessonById } from "./foundation";
type Q = z.infer<typeof questionSchema>;
export function linkGrammar(q: Q): Q {
  if (q.grammar_rule_ids.length) return q;
  const text = (q.prompt + " " + q.explanation).toLowerCase();
  let ids: string[];
  if (q.type === "Identify Word Class")
    ids = [
      (
        {
          noun: "pos-noun",
          verb: "pos-verb",
          adjective: "pos-adjective",
          adverb: "pos-adverb",
        } as Record<string, string>
      )[q.answers[0]] ?? "wf-derivation",
    ];
  else if (
    /advice|equipment|evidence|information|research|progresses/.test(text)
  )
    ids = ["na-countability"];
  else if (/avoid|avoided|insist|succeeded|capable/.test(text))
    ids = ["vp-gerund"];
  else if (
    /decided|decide to|encouraged|requires candidates|require.*to have/.test(
      text,
    )
  )
    ids = ["vp-infinitive"];
  else if (/interested|responsible|depend on/.test(text))
    ids = ["vp-prepositions"];
  else if (
    /explain me|suggested me|described me|explain.*to someone|discussed about|entered into|emphasized on/.test(
      text,
    )
  )
    ids = ["vp-transitivity"];
  else if (
    /linking|linking verb|quietly|happily|sounds reasonably|impressively/.test(
      text,
    )
  )
    ids = ["aa-modifiers"];
  else ids = ["wf-derivation"];
  if (q.type === "Sentence Building")
    ids = [...new Set(["sf-svo-order", ...ids])];
  return {
    ...q,
    grammar_rule_ids: ids,
    prerequisite_lesson_ids: [
      ...new Set(
        ids.flatMap((id) => [
          id,
          ...(lessonById.get(id)?.prerequisite_lesson_ids ?? []),
        ]),
      ),
    ],
  };
}
