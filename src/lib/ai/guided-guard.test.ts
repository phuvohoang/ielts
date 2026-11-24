import { expect, it } from 'vitest';
import { guidedAgreementCorrection } from './guided-guard';
it('rejects valid sentences and collective-noun ambiguity',()=>{
 expect(guidedAgreementCorrection('Every evening this week, the student is attending a workshop.')).toBeUndefined();
 expect(guidedAgreementCorrection('She is attending a workshop this week.')).toBeUndefined();
 expect(guidedAgreementCorrection('Our local council offer free passes.')).toBeUndefined();
});
it('corrects only a demonstrably wrong pronoun-be agreement',()=>{
 expect(guidedAgreementCorrection('They is attending a workshop this week.')).toBe('They are attending a workshop this week.');
 expect(guidedAgreementCorrection('I are working from home today.')).toBe('I am working from home today.');
});
