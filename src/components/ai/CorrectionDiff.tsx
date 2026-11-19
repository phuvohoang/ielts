import { diffWordsWithSpace } from "diff";
export function CorrectionDiff({
  answer,
  correction,
}: {
  answer: string;
  correction: string;
}) {
  return (
    <p className="answer-diff" aria-label="Answer correction">
      {diffWordsWithSpace(answer, correction).map((part, i) =>
        part.removed ? (
          <del key={i}>
            <span className="sr-only">Removed: </span>
            {part.value}
          </del>
        ) : part.added ? (
          <ins key={i}>
            <span className="sr-only">Added: </span>
            {part.value}
          </ins>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}
