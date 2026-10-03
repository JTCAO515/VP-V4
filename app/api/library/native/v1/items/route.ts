import {libraryNativeSourceHTTP} from '@/lib/server/library/native-sources-http';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>libraryNativeSourceHTTP(request);
