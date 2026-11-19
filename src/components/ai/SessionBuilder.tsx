import { Button } from "../ui/button";
import {
  topics,
  levels,
  formats,
  formatLabels,
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
  return (
    <section className="panel session-builder" aria-labelledby="builder-title">
      <div className="builder-heading">
        <div>
          <h2 id="builder-title">Build your practice session</h2>
          <p>
            Choose your focus. Every new session is generated and checked by AI.
          </p>
        </div>
        <span className="session-tag">Grammar · A1–C1</span>
      </div>
      <fieldset disabled={creating}>
        <legend>Grammar topics · select one or more</legend>
        <div className="topic-grid">
          {topics.map((topic) => (
            <label
              key={topic.topicId}
              className={`topic-choice ${!topic.enabled ? "topic-upcoming" : ""}`}
            >
              <input
                type="checkbox"
                checked={settings.topics.includes(topic.topicId)}
                disabled={!topic.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exerciseType: "mixed",
                    topics: e.target.checked
                      ? [...settings.topics, topic.topicId]
                      : settings.topics.filter((id) => id !== topic.topicId),
                  })
                }
              />
              <span>
                <strong>{topic.displayName}</strong>
                {!topic.enabled && <small>Coming Soon</small>}
                <span>{topic.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="builder-controls">
        <label>
          Question count
          <select
            aria-label="Question count"
            value={settings.questionCount}
            disabled={creating}
            onChange={(e) =>
              setSettings({
                ...settings,
                questionCount: Number(
                  e.target.value,
                ) as Settings["questionCount"],
              })
            }
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n} questions
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
                difficulty: e.target.value as Settings["difficulty"],
              })
            }
          >
            {levels.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
        <label>
          Exercise type
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
                (format) =>
                  format === "mixed" ||
                  settings.topics.every((id) =>
                    topics
                      .find((t) => t.topicId === id)
                      ?.supportedExerciseTypes.includes(format),
                  ),
              )
              .map((format) => (
                <option key={format} value={format}>
                  {formatLabels[format]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Feedback mode
          <select
            aria-label="Feedback mode"
            value={settings.feedbackMode}
            disabled={creating}
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
        <Button
          variant="ghost"
          disabled={generating || grading || creating}
          onClick={onNewSession}
        >
          New Session
        </Button>
      )}
    </section>
  );
}
