/** Render source annotations as text; never interpret model-authored HTML. */
export function questionDisplay(question: {
  questionText: string;
  instruction: string;
  underlinedText?: string | null;
}) {
  const parts: { text: string; underline: boolean }[] = [];
  const source = question.questionText;
  const target = question.underlinedText;
  const position = target ? source.indexOf(target) : -1;
  if (
    target &&
    position >= 0 &&
    source.indexOf(target, position + target.length) === -1
  ) {
    parts.push(
      { text: source.slice(0, position), underline: false },
      { text: target, underline: true },
      { text: source.slice(position + target.length), underline: false },
    );
  } else {
    // Backward compatibility for previously generated literal <u> or __ spans.
    const pattern = /<u>([^<>]+)<\/u>|(?<!_)__([^_]+)__(?!_)/g;
    let offset = 0;
    for (const match of source.matchAll(pattern)) {
      parts.push({ text: source.slice(offset, match.index), underline: false });
      parts.push({ text: match[1] ?? match[2], underline: true });
      offset = match.index! + match[0].length;
    }
    parts.push({ text: source.slice(offset), underline: false });
  }
  return {
    parts,
    missingUnderline:
      /underlin(?:ed|e)|gạch chân/i.test(question.instruction) &&
      !parts.some((p) => p.underline),
  };
}
