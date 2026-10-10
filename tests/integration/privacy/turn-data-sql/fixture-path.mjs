import { join } from 'node:path';
export const fixturePath = name => join(process.env.VP_TURN_SQL_FIXTURE_DIR || '/tmp', name);
