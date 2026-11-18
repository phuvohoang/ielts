import { Link } from "react-router-dom";
import { modules, canStudy, lessonById } from "../../lib/foundation";
import { lessonStatus } from "../../lib/learning-model";
import { useLearning } from "../../lib/store";
export function LearningPath() {
  const { lessons } = useLearning();
  const labels = [
    "Not Started",
    "Learning",
    "Practicing",
    "Reviewing",
    "Mastered",
  ];
  return (
    <>
      <div className="heading">
        <div className="eyebrow">GRAMMAR LEARNING PATH</div>
        <h1>Understand first. Practise with purpose.</h1>
        <p>
          Learn → Understand → Guided Practice → Independent Practice → Apply →
          Review → Mastery Check
        </p>
      </div>
      <section className="panel">
        <h2>Advanced · Lesson 01.2</h2>
        <p>
          Word Formation B2: 25 typed questions with AI feedback. Optional
          advanced study; does not unlock foundation rules.
        </p>
        <Link className="button button-outline" to="/lessons/01.2">
          Open Word Formation B2
        </Link>
      </section>
      <div className="learning-statuses">
        {labels.map((label) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>
              {
                modules
                  .filter((m) => m.available)
                  .flatMap((m) => m.lessons)
                  .filter(
                    (l) =>
                      lessonStatus(lessons.find((p) => p.id === l.id)) ===
                      label,
                  ).length
              }
            </strong>
          </div>
        ))}
      </div>
      {modules.map((m, i) => (
        <section className="panel" key={m.id}>
          <div className="section-heading">
            <h2>
              {String(i + 1).padStart(2, "0")} · {m.title}
            </h2>
            <span className="badge">
              {m.available ? "4 complete lessons" : "Upcoming · outline only"}
            </span>
          </div>
          {m.lessons.map((l) => (
            <div className="curriculum-row" key={l.id}>
              <div>
                <strong>{l.title}</strong>
                <small className="prerequisite">
                  {l.prerequisite_lesson_ids.length
                    ? "Prerequisite: " +
                      l.prerequisite_lesson_ids
                        .map((id) => lessonById.get(id)?.title ?? id)
                        .join(" · ")
                    : "No prerequisite lesson"}
                </small>
              </div>
              <span className="badge">
                {l.available
                  ? lessonStatus(lessons.find((p) => p.id === l.id))
                  : "Upcoming"}
              </span>
              {l.available && canStudy(l.id, lessons) ? (
                <Link to={`/learn/${l.id}`}>
                  {lessons.find((p) => p.id === l.id)?.masteredAt
                    ? "Revisit lesson"
                    : lessons.some((p) => p.id === l.id)
                      ? "Continue lesson"
                      : "Start lesson"}{" "}
                  →
                </Link>
              ) : l.available ? (
                <span className="muted">
                  Study the prerequisite theory first
                </span>
              ) : null}
            </div>
          ))}
        </section>
      ))}
      <p className="muted">
        Your previous exercise history is preserved. Earlier scores do not
        automatically complete these new theory lessons.
      </p>
      <Link className="button button-outline" to="/lessons/legacy">
        Open the previous Lesson 01 reference
      </Link>
    </>
  );
}
