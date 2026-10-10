import schema from './direction-turn-source-schema.json' with { type: 'json' };
import { validDirectionExportRow, type DirectionExportSection } from './export-rows.ts';
export const DIRECTION_TURN_SOURCE_SCHEMA = schema;
const sections: Record<string, DirectionExportSection> = {
  'turn_private.assistant_directions_intakes_v1': 'directionIntakes',
  'turn_private.directions_result_sources_v1': 'directionSources',
  'turn_private.directions_operations_v1': 'directionOperations',
};
/** SQL raw owner rows use decimal bigint strings; adapt only the reviewed closed projection. */
export function validDirectionTurnExportRow(relation: string, row: Record<string, unknown>): boolean {
  const section = sections[relation];
  if (!section) return false;
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'owner_id') continue;
    projected[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  if (section === 'directionIntakes') {
    if (typeof row.message_sequence !== 'string' || !/^[1-9][0-9]*$/.test(row.message_sequence)
      || BigInt(row.message_sequence) > BigInt(1000000)) return false;
    projected.messageSequence = Number(row.message_sequence);
  }
  return validDirectionExportRow(section, projected);
}
