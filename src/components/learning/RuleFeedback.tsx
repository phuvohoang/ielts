import { Link } from "react-router-dom";
import type { Question } from "../../lib/content";
import { lessonById } from "../../lib/foundation";
export function RuleFeedback({ question }: { question: Question }) {
  return (
    <div className="rule-feedback">
      <strong>Specific grammar rule</strong>
      {question.grammar_rule_ids.map((id) => {
        const rule = lessonById.get(id);
        return (
          <p key={id}>
            {rule?.title ?? id}{" "}
            {rule?.available ? (
              <Link to={`/learn/${id}`}>Revisit this rule →</Link>
            ) : (
              <span className="badge">
                Theory lesson upcoming · Advanced mode
              </span>
            )}
          </p>
        );
      })}
    </div>
  );
}
