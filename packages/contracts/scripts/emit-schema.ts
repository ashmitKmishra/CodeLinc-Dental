import { writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import * as S from '../src/schemas';

// JSON Schema for backends that aren't TypeScript: `npm run schema`
const targets = {
  Snapshot: S.Snapshot, PlanSummary: S.PlanSummary, Procedure: S.Procedure, EstimateRequest: S.EstimateRequest, Estimate: S.Estimate,
  SequenceRequest: S.SequenceRequest, Sequence: S.Sequence, Message: S.Message, Turn: S.Turn, Preferences: S.Preferences, ApiError: S.ApiError,
};
mkdirSync(new URL('../schema', import.meta.url), { recursive: true });
for (const [name, schema] of Object.entries(targets)) {
  writeFileSync(new URL(`../schema/${name}.schema.json`, import.meta.url), JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n');
}
console.log(`wrote ${Object.keys(targets).length} schemas`);
