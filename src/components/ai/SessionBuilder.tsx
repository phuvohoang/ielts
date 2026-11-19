import { Button } from "../ui/button";
import {
  topics,
  levels,
  formats,
  formatLabels,
  ieltsTopics,
  subtopicsForLevel,
} from "../../lib/ai/dynamic/topics";
import type { Settings } from "../../lib/ai/dynamic/schema";
interface Props {
  settings: Settings;
  setSettings: (value: Settings) => void;
  loaded: boolean;
  creating: boolean;
  generating: boolean;
  grading: boolean;
  hasSession: boolean;
  onGenerate: () => void;
  onNewSession: () => void;
}
export function SessionBuilder({
  settings,
  setSettings,
  loaded,
  creating,
  generating,
  grading,
  hasSession,
  onGenerate,
  onNewSession,
}: Props) {
  const all = settings.topics.includes("all");
  const selected = topics.filter(
    (t) => all || settings.topics.includes(t.topicId),
  );
  const selectTopics = (ids: string[]) =>
    setSettings({
      ...settings,
      topics: ids.length ? ids : ["all"],
      subtopics: {},
      exerciseType: "mixed",
    });
  const summary = `${all ? "All Grammar Types" : selected.map((t) => t.displayName).join(", ")} · ${ieltsTopics.find((t) => t.id === settings.ieltsTopic)?.label ?? "All Topics"} · ${settings.difficulty} · ${settings.questionCount} questions · ${formatLabels[settings.exerciseType]}`;
  return (
    <section className="panel session-builder" aria-labelledby="builder-title">
      <div className="builder-heading">
        <div>
          <h2 id="builder-title">Configure Practice</h2>
          <p>
            Choose grammar skills and context. Questions and grading use AI.
          </p>
        </div>
        <span className="session-tag">Grammar · A2–C1</span>
      </div>
      <fieldset disabled={creating}>
        <legend>Grammar Types</legend>
        <p className="configuration-summary">
          All includes grammar appropriate for {settings.difficulty}. Advanced
          categories become available at B1/B2.
        </p>
        <label className="topic-all">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) =>
              e.target.checked
                ? selectTopics(["all"])
                : setSettings({
                    ...settings,
                    topics: [],
                    subtopics: {},
                    exerciseType: "mixed",
                  })
            }
          />{" "}
          All Grammar Types
        </label>
        <div className="grammar-type-grid">
          {topics.map((topic) => (
            <label
              key={topic.topicId}
              title={
                topic.supportedLevels.includes(settings.difficulty)
                  ? topic.description
                  : `Available from ${topic.supportedLevels[0]}`
              }
            >
              <input
                type="checkbox"
                disabled={!topic.supportedLevels.includes(settings.difficulty)}
                checked={!all && settings.topics.includes(topic.topicId)}
                onChange={(e) =>
                  selectTopics(
                    e.target.checked
                      ? [...(all ? [] : settings.topics), topic.topicId]
                      : settings.topics.filter((id) => id !== topic.topicId),
                  )
                }
              />
              <span>{topic.displayName}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grammar-chips" aria-label="Selected grammar types">
        {all ? (
          <span>All Grammar Types</span>
        ) : (
          selected.map((t) => (
            <button
              type="button"
              key={t.topicId}
              aria-label={`Remove ${t.displayName}`}
              disabled={creating}
              onClick={() =>
                selectTopics(settings.topics.filter((id) => id !== t.topicId))
              }
            >
              {t.displayName} ×
            </button>
          ))
        )}
      </div>
      {!all && (
        <div className="builder-controls">
          {selected
            .filter((t) => t.subtopics?.length)
            .map((t) => (
              <label key={t.topicId}>
                {t.displayName} — Subtopic
                <select
                  aria-label={`${t.displayName} subtopic`}
                  disabled={creating}
                  value={settings.subtopics?.[t.topicId] ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      subtopics: {
                        ...settings.subtopics,
                        [t.topicId]: e.target.value,
                      },
                    })
                  }
                >
                  <option value="">All subtopics</option>
                  {subtopicsForLevel(t, settings.difficulty).map((sub) => (
                    <option key={sub}>{sub}</option>
                  ))}
                </select>
              </label>
            ))}
        </div>
      )}
      <div className="builder-controls">
        <label>
          IELTS Topic
          <select
            aria-label="IELTS Topic"
            disabled={creating}
            value={settings.ieltsTopic ?? "all"}
            onChange={(e) =>
              setSettings({ ...settings, ieltsTopic: e.target.value })
            }
          >
            <option value="all">All Topics</option>
            {ieltsTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select
            aria-label="Difficulty"
            value={settings.difficulty}
            disabled={creating}
            onChange={(e) =>
              setSettings({
                ...settings,
                subtopics: {},
                topics: all
                  ? ["all"]
                  : settings.topics.filter((id) =>
                        topics
                          .find((t) => t.topicId === id)
                          ?.supportedLevels.includes(
                            e.target.value as Settings["difficulty"],
                          ),
                      ).length
                    ? settings.topics.filter((id) =>
                        topics
                          .find((t) => t.topicId === id)
                          ?.supportedLevels.includes(
                            e.target.value as Settings["difficulty"],
                          ),
                      )
                    : ["all"],
                difficulty: e.target.value as Settings["difficulty"],
              })
            }
          >
            {levels
              .filter((l) => l !== "A1")
              .map((l) => (
                <option key={l} value={l}>
                  {l} —{" "}
                  {
                    (
                      {
                        A2: "Elementary",
                        B1: "Intermediate",
                        B2: "Upper Intermediate",
                        C1: "Advanced",
                      } as Record<string, string>
                    )[l]
                  }
                </option>
              ))}
          </select>
        </label>
        <label>
          Exercise Format
          <select
            aria-label="Exercise type"
            value={settings.exerciseType}
            disabled={creating}
            onChange={(e) =>
              setSettings({
                ...settings,
                exerciseType: e.target.value as Settings["exerciseType"],
              })
            }
          >
            {(["mixed", ...formats] as const)
              .filter(
                (f) =>
                  f === "mixed" ||
                  (all
                    ? topics.some((t) => t.supportedExerciseTypes.includes(f))
                    : selected.every((t) =>
                        t.supportedExerciseTypes.includes(f),
                      )),
              )
              .map((f) => (
                <option key={f} value={f}>
                  {formatLabels[f]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Feedback mode
          <select
            aria-label="Feedback mode"
            disabled={creating}
            value={settings.feedbackMode}
            onChange={(e) =>
              setSettings({
                ...settings,
                feedbackMode: e.target.value as Settings["feedbackMode"],
              })
            }
          >
            <option value="instant">Instant Feedback</option>
            <option value="exam">Exam Mode</option>
          </select>
        </label>
      </div>
      <fieldset className="question-count" disabled={creating}>
        <legend>Number of Questions</legend>
        <div className="count-segments">
          {([10, 20, 50] as const).map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="question-count"
                aria-label={`${n} questions`}
                checked={settings.questionCount === n}
                onChange={() => setSettings({ ...settings, questionCount: n })}
              />
              <span>{n}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="configuration-summary" aria-label="Configuration summary">
        {summary}
      </p>
      <Button
        onClick={onGenerate}
        disabled={
          !loaded ||
          !settings.topics.length ||
          creating ||
          generating ||
          grading
        }
      >
        {creating ? "Creating session…" : "Generate Practice"}
      </Button>
      {hasSession && (
        <Button variant="ghost" onClick={onNewSession}>
          New Session
        </Button>
      )}
    </section>
  );
}
