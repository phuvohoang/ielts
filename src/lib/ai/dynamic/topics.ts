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
    ["verb-tenses", "Verb Tenses"],
    ["nouns-articles", "Nouns & Articles"],
    ["sentence-structure", "Sentence Structure"],
    ["subject-verb-agreement", "Subject–Verb Agreement"],
    ["prepositions", "Prepositions"],
    ["adjectives-adverbs", "Adjectives & Adverbs"],
    ["conditionals", "Conditionals"],
    ["passive-voice", "Passive Voice"],
    ["relative-clauses", "Relative Clauses"],
  ].map(([topicId, displayName]): Topic => ({
    topicId,
    displayName,
    description: "Generation rules are being prepared.",
    enabled: false,
    supportedExerciseTypes: [],
    supportedLevels: [],
    generationGuidelines: "",
    gradingRubric: "",
  })),
];
export const difficultyGuidelines = {
  A1: "Very common concrete vocabulary, one short simple clause, elementary noun/adjective/verb families. No advanced affixes or embedded clauses.",
  A2: "Common daily, travel and work vocabulary; simple coordination and common affixes; short sentences.",
  B1: "Familiar work, community and study contexts; straightforward complex clauses; productive prefixes and suffixes.",
  B2: "IELTS General work and public-life contexts; abstract vocabulary, varied clause structures and contextual word-family contrasts.",
  C1: "Precise abstract vocabulary, sophisticated but natural collocations, nominalisation and varied complex sentences; no obscure trivia.",
};
