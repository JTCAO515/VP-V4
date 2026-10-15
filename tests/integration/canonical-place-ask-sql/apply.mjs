import {readFileSync} from 'node:fs';import {connect} from './db.mjs';
const c=await connect();try{await c.query('begin');await c.query(readFileSync('supabase/migrations/20261015083120_agent005_canonical_place_ask.sql','utf8'));await c.query('commit');console.log('FULL_PRODUCT_APPEND_APPLIED');}catch(e){console.error(e.message);await c.query('rollback');throw e;}finally{await c.end();}
