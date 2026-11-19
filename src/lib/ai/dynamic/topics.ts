export const formats = [
  "fill_blank",
  "word_formation",
  "error_correction",
  "sentence_transformation",
  "multiple_choice",
  "paraphrasing",
] as const;
export const levels = ["A1", "A2", "B1", "B2", "C1"] as const;
export const formatLabels: Record<(typeof formats)[number] | "mixed", string> =
  {
    mixed: "Mixed Practice",
    fill_blank: "Fill in the Blank",
    word_formation: "Word Formation",
    error_correction: "Error Correction",
    sentence_transformation: "Sentence Transformation",
    multiple_choice: "Multiple Choice",
    paraphrasing: "Paraphrasing",
  };
export interface Topic {
  topicId: string;
  displayName: string;
  description: string;
  supportedExerciseTypes: readonly (typeof formats)[number][];
  supportedLevels: readonly (typeof levels)[number][];
  generationGuidelines: string;
  gradingRubric: string;
  enabled: boolean;
}
export const topics: Topic[] = [
  {
    topicId: "word-formation",
    displayName: "Word Formation",
    description: "Build word families and use the right form in context.",
    supportedExerciseTypes: formats,
    supportedLevels: levels,
    enabled: true,
    generationGuidelines:
      "Rotate noun, verb, adjective and adverb families; affixes, negative prefixes and contextual contrasts. Keep root and answer in the same real English word family. A1 uses common daily words/simple clauses; A2 common affixes; B1 everyday work and study; B2 abstract/workplace vocabulary and meaning-preserving transformations; C1 nuanced collocation, nominalisation and register. No invented derivatives. Single blanks need a clear grammatical slot. Error correction supplies ONE genuine word-form error. Transformation/paraphrase explicitly states the target form or opening. Do not confuse adjective statistical with adverb statistically before significant. Avoid overusing success, significant and economy.",
    gradingRubric:
      "Accept grammatical natural equivalents preserving meaning, tense, intensity and explicit instructions. Exact reference wording is not mandatory for sentences. A validated single-word set is authoritative for ordinary forms; unfamiliar alternatives need AI assessment. Do not penalise stylistic differences.",
  },
  ...[
    [
      "verb-tenses",
      "Verb Tenses",
      "Practise tense choice and verb forms in clear time contexts. Preserve sequence, aspect and time markers; never penalise a valid alternative tense where the context permits it.",
    ],
    [
      "nouns-articles",
      "Nouns & Articles",
      "Practise a/an/the/zero article, countability, quantifiers and singular/plural agreement. Supply sufficient discourse context to make article choice defensible; avoid ambiguous generic/specific readings.",
    ],
    [
      "sentence-structure",
      "Sentence Structure",
      "Practise complete sentences, subject/verb/object/complement order, clauses and verb patterns. Error correction must contain one genuine grammatical defect, not an optional stylistic preference.",
    ],
    [
      "subject-verb-agreement",
      "Subject–Verb Agreement",
      "Practise subject–verb agreement with clear referents and number. Avoid regional collective-noun conventions with multiple valid answers unless all valid variants are accepted.",
    ],
    [
      "prepositions",
      "Prepositions",
      "Practise natural prepositions of time/place and common verb/adjective collocations. Do not invent exclusive rules; accept standard British and American variants where appropriate.",
    ],
    [
      "adjectives-adverbs",
      "Adjectives & Adverbs",
      "Practise adjective/adverb placement, linking verbs, comparison and degree. Distinguish grammar from style and preserve explicit intensity in rewrites.",
    ],
    [
      "conditionals",
      "Conditionals",
      "Practise real, hypothetical and past counterfactual conditions with enough context to select the intended meaning. Allow natural modal alternatives that retain meaning.",
    ],
    [
      "passive-voice",
      "Passive Voice",
      "Practise active/passive transformations while preserving tense, aspect, participants and agent information. Use only transitive constructions supporting natural passives.",
    ],
    [
      "relative-clauses",
      "Relative Clauses",
      "Practise defining/non-defining relative clauses with clear antecedents, punctuation and pronoun omission. Accept standard valid pronouns and equivalent clause structures.",
    ],
  ].map(
    ([topicId, displayName, guidance]): Topic => ({
      topicId,
      displayName,
      description: guidance.split(".")[0] + ".",
      enabled: true,
      supportedExerciseTypes: formats.filter((f) => f !== "word_formation"),
      supportedLevels: levels,
      generationGuidelines: guidance,
      gradingRubric:
        "Judge the stated grammar rule in its full context. Accept natural equivalent English preserving meaning, time, degree and explicit instructions. Do not require exact reference wording or invent hidden restrictions. " +
        guidance,
    }),
  ),
];
export const difficultyGuidelines = {
  A1: "Very common concrete vocabulary, one short simple clause, elementary noun/adjective/verb families. No advanced affixes or embedded clauses.",
  A2: "Common daily, travel and work vocabulary; simple coordination and common affixes; short sentences.",
  B1: "Familiar work, community and study contexts; straightforward complex clauses; productive prefixes and suffixes.",
  B2: "IELTS General work and public-life contexts; abstract vocabulary, varied clause structures and contextual word-family contrasts.",
  C1: "Precise abstract vocabulary, sophisticated but natural collocations, nominalisation and varied complex sentences; no obscure trivia.",
};
