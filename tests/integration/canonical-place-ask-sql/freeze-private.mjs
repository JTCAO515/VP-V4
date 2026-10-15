import {readFileSync,writeFileSync} from 'node:fs';import {connect,root} from './db.mjs';
const files=['source-chain.sql','shape.sql','private.sql','qualification.sql','binding.sql','history.sql','settlement.sql','worker.sql','schema.sql','source-row.sql'];
const c=await connect();const pins=[];
try{for(const file of files){const s=readFileSync(root+'/'+file,'utf8');const rx=/create or replace function ([^(]+)\([^]*?\bas\s+(\$[a-z_]*\$)([^]*?)\2/ig;for(const match of s.matchAll(rx)){
 const name=match[1];const rs=(await c.query("select p.oid::regprocedure::text signature,p.prosrc,md5(pg_get_functiondef(p.oid)) md5,pg_get_userbyid(proowner) owner,proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=$1",[name])).rows;
 if(rs.length!==1||rs[0].prosrc!==match[3])throw Error('private authored body mismatch '+name);const {prosrc,...pin}=rs[0];pins.push(pin);
 }}writeFileSync(root+'/private-pins.json',JSON.stringify(pins,null,2)+'\n');console.log('FROZEN_AUTHORED_PRIVATE_FUNCTIONS',pins.length);}finally{await c.end();}
