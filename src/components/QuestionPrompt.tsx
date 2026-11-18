import type { Question } from "../lib/content";
export function QuestionPrompt({ question }: { question: Question }) {
  const prompt = question.tokens
    ? question.prompt.slice(0, question.prompt.indexOf(":") + 1)
    : question.prompt;
  return (
    <>
      <h2>{<HighlightedText text={prompt} />}</h2>
      {question.tokens && (
        <div className="token-list" aria-label="Sentence tokens">
          {question.tokens.map((token, i) => (
            <span key={i}>{token}</span>
          ))}
        </div>
      )}
    </>
  );
}

export function HighlightedText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\[\[.*?\]\])/g)
        .map((part, i) =>
          part.startsWith("[[") ? (
            <mark key={i}>{part.slice(2, -2)}</mark>
          ) : (
            part
          ),
        )}
    </>
  );
}
