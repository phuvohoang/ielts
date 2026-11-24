// The G01 supplement deliberately practises only present-continuous be agreement.
// An AI audit cannot establish that a source sentence really contains an error.
export function guidedAgreementCorrection(source: string): string | undefined {
  const match = /^(I|You|We|They|He|She) (am|is|are) ([a-z]+ing\b[^.!?]*[.!?])$/.exec(source);
  if (!match) return;
  const expected = match[1] === 'I' ? 'am' : ['He','She'].includes(match[1]) ? 'is' : 'are';
  if (match[2] === expected) return;
  return source.replace(/^(I|You|We|They|He|She) (am|is|are) /, `${match[1]} ${expected} `);
}
