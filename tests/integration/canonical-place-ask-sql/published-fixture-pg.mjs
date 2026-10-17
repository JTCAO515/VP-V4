// Compatibility pointer for the existing db Proxy; cleanup authority stays in the closure.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createDiagnosticPg,diagnosticArtifactRoot} from './diagnostic-owned-pg.mjs';
function bytes(path){try{return readFileSync(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function same(a,b){return a===null?b===null:b!==null&&a.equals(b);}
export function createPublishedFixturePg(options){
 const owned=createDiagnosticPg(options),pointer=diagnosticArtifactRoot+'/local-resource.json';
 let previous;try{previous=bytes(pointer);}catch(error){owned.cleanup();throw error;}
 const published=Buffer.from(JSON.stringify(owned.descriptor));let didPublish=false;
 return Object.freeze({descriptor:owned.descriptor,descriptorPath:owned.descriptorPath,bootstrap:owned.bootstrap,connect:owned.connect,
  publish(){if(didPublish)throw Error('Fixture pointer already published');if(!same(bytes(pointer),previous))throw Error('Fixture pointer changed during initialization');writeFileSync(pointer,published,{mode:0o600});didPublish=true;},
  cleanup(){owned.cleanup();if(didPublish&&same(bytes(pointer),published)){if(previous===null)unlinkSync(pointer);else writeFileSync(pointer,previous);didPublish=false;}}
 });
}
