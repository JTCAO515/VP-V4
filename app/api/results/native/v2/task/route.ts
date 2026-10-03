import {nativeResultReferenceV2HTTP} from '@/lib/server/artifacts/native-result-v2-http';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>nativeResultReferenceV2HTTP(request,'task');
