export const formats = [
  "fill_blank",
  "word_formation",
  "error_correction",
  "sentence_transformation",
  "multiple_choice",
  "paraphrasing",
  "sentence_reordering",
  "grammar_in_context",
  "meaning_comparison",
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
    sentence_reordering: "Sentence Reordering",
    grammar_in_context: "Grammar in Context",
    meaning_comparison: "Meaning Comparison",
  };
export const isChoiceFormat = (
  format: string,
): format is "multiple_choice" | "meaning_comparison" =>
  ["multiple_choice", "meaning_comparison"].includes(format);
export const ieltsTopics = [
  ["education", "Education"],
  ["work", "Work & Career"],
  ["technology", "Technology"],
  ["environment", "Environment"],
  ["health", "Health & Lifestyle"],
  ["travel", "Travel & Tourism"],
  ["housing", "Housing & Urbanisation"],
  ["society", "Society & Culture"],
  ["government", "Government & Public Services"],
  ["business", "Business & Economy"],
  ["science", "Science & Research"],
  ["family", "Family & Relationships"],
  ["media", "Media & Communication"],
  ["transport", "Transport & Infrastructure"],
].map(([id, label]) => ({ id, label }));
export interface Topic {
  topicId: string;
  displayName: string;
  description: string;
  supportedExerciseTypes: readonly (typeof formats)[number][];
  supportedLevels: readonly (typeof levels)[number][];
  generationGuidelines: string;
  gradingRubric: string;
  enabled: boolean;
  subtopics?: string[];
}
const definitions = [
  [
    "word-formation",
    "Word Formation & Word Families",
    "Noun forms|Verb forms|Adjectives and adverbs|Prefixes and suffixes",
    "Require an actual changed form in the same real word family, never an unchanged root or target already in the source. Preserve meaning, participants, tense and degree. Do not overuse success, economy or significant.",
  ],
  [
    "verb-tenses",
    "Tenses",
    "Present simple and continuous|Past simple and continuous|Future forms|Perfect forms|Perfect continuous",
    "Establish a completed, ongoing, habitual or earlier event in context. Distinguish a process continuing to a reference point. For, since, when and while are clues, not absolute tense rules. Stative verbs can change meaning but are not mechanically continuous.",
  ],
  [
    "nouns-articles",
    "Articles & Determiners",
    "A and an|The and zero article|Quantifiers and determiners",
    "Provide enough discourse context for definite/indefinite and generic/specific readings. Accept standard variants when context permits; never invent exclusive article rules.",
  ],
  [
    "nouns-pronouns",
    "Nouns & Pronouns",
    "Countability and plurals|Possessives|Personal and reflexive pronouns|Relative pronouns",
    "Use natural countability, irregular plurals and explicit pronoun referents. Preserve number and possession; do not penalise regional usage.",
  ],
  [
    "verb-patterns",
    "Verbs & Verb Patterns",
    "Gerunds and infinitives|Stative verbs|Verb complements|Meaning-changing patterns",
    "Use natural verb complementation. Distinguish stop doing from stop to do, remember doing from remember to do using enough context. Stative senses and dynamic senses differ.",
  ],
  [
    "modal-verbs",
    "Modal Verbs",
    "Ability and permission|Possibility and deduction|Obligation and advice|Past modals",
    "Set a realistic degree of certainty, obligation or permission; preserve that degree in rewrites. Do not treat all modals as interchangeable.",
  ],
  [
    "conditionals",
    "Conditionals",
    "Zero and first|Second conditional|Third conditional|Mixed conditionals",
    "Clarify real versus hypothetical time and counterfactual cause/outcome. Preserve time references and allow valid modal variants without hidden requirements.",
  ],
  [
    "passive-voice",
    "Passive Voice",
    "Present and past passive|Perfect and modal passive|Passive reporting structures",
    "Use natural transitive verbs; retain tense, aspect, participants and relevant agent information. Do not invent passives for intransitive verbs.",
  ],
  [
    "relative-clauses",
    "Relative Clauses",
    "Defining clauses|Non-defining clauses|Pronoun omission|Whose and prepositions",
    "Keep antecedents clear. Punctuation changes meaning; accept standard who/that/which/whom variants and omission only where grammatical.",
  ],
  [
    "reported-speech",
    "Reported Speech",
    "Statements|Questions|Commands and requests|Time references and backshift",
    "Specify reporting time and continuing truth where relevant. Backshift is not mandatory for facts still true; retain speaker, addressee and time reference.",
  ],
  [
    "comparatives",
    "Comparatives & Superlatives",
    "Comparative forms|Superlative forms|As ... as|Degree modifiers",
    "Preserve the direction and strength of comparison and the comparison group. Avoid changing not as ... as into a superlative without evidence.",
  ],
  [
    "adjectives-adverbs",
    "Adjectives & Adverbs",
    "Position and order|Linking verbs|Adverb placement|Modifiers and degree",
    "Distinguish complements after linking verbs from action modifiers. Accept natural alternative adverb placement and comparable degree, not only one reference order.",
  ],
  [
    "prepositions",
    "Prepositions",
    "Time|Place and movement|Dependent prepositions",
    "Use natural collocations, enough context and standard British/American variants. Do not invent universal rules from one collocation.",
  ],
  [
    "linking-words",
    "Conjunctions & Linking Words",
    "Coordination|Contrast and concession|Cause and result|Purpose and addition",
    "Make logical links explicit and distinguish conjunctions, prepositions and sentence adverbials. Keep punctuation and clause structure grammatical.",
  ],
  [
    "sentence-structure",
    "Complex Sentences",
    "Subordinate clauses|Contrast and concession|Cause and effect|Purpose and result",
    "Test complete clauses and clear subject/verb relations. Preserve cause, effect, contrast and participants; do not turn optional style choices into grammar errors.",
  ],
  [
    "subject-verb-agreement",
    "Subject–Verb Agreement",
    "Singular and plural subjects|Compound subjects|Intervening phrases|Indefinite pronouns",
    "Use clear referents and number. Do not impose one regional collective-noun convention when multiple readings are valid.",
  ],
  [
    "nominalisation",
    "Nominalisation & Academic Grammar",
    "Verb-to-noun structures|Adjective-to-noun structures|Formal information structure",
    "Require a genuine grammatical conversion while retaining actors and meaning. Affordable housing for young professionals must retain who needs to afford the housing; do not keep affordable unchanged if afford is required.",
  ],
  [
    "inversion",
    "Inversion & Emphasis",
    "Negative adverbials|Only and conditional inversion|Cleft sentences",
    "Use natural emphasis with explicit instructions; distinguish emphatic do, clefts and auxiliary inversion. Preserve time and degree.",
  ],
  [
    "participle-clauses",
    "Participle Clauses & Reduced Clauses",
    "Present participles|Past participles|Perfect participles|Reduced relative clauses",
    "Keep the understood subject unambiguous and avoid dangling participles. Preserve active/passive meaning and earlier-event time.",
  ],
  [
    "sentence-transformation",
    "Sentence Transformation & Paraphrasing",
    "Meaning-preserving rewrites|Required openings|Structure changes",
    "Require a genuine structural change with explicit constraints. Reference sentences are examples, not exhaustive keys. Preserve tense, participants, quantities and emphasis.",
  ],
];
export const topics: Topic[] = definitions.map(
  ([topicId, displayName, subtopics, guidance]) => ({
    topicId,
    displayName,
    subtopics: subtopics.split("|"),
    description: guidance.split(".")[0] + ".",
    enabled: true,
    supportedLevels: levels,
    supportedExerciseTypes:
      topicId === "word-formation"
        ? formats.slice(0, 6)
        : formats.filter((f) => f !== "word_formation"),
    generationGuidelines: guidance,
    gradingRubric:
      "Accept grammatical contextual alternatives; distinguish errors from style. Never require exact reference wording. " +
      guidance,
  }),
);
export const difficultyGuidelines = {
  A1: "Very common concrete vocabulary; one elementary clause. Retained for existing sessions.",
  A2: "Common daily, travel and work vocabulary. One short clause or simple coordination, elementary tense contrasts and explicit context; transparent choices. Do not force advanced terminology or nested clauses.",
  B1: "Familiar work, community and study contexts; one subordinate clause, productive patterns and time relations. Plausible distractors test familiar grammar without ambiguity.",
  B2: "Varied IELTS General clauses, aspect and time relationships, context-sensitive distractors and productive transformations. Abstract vocabulary should remain natural and relevant.",
  C1: "Nuanced aspect, reporting time, reduced clauses, precise emphasis and information structure; plausible distractors distinguish real changes of meaning. Complexity comes from grammar and context, not length or obscure vocabulary.",
};
