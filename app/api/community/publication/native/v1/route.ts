import type {NextRequest} from 'next/server';
import {publicationNativeHTTP} from '@/lib/server/community/publication/native-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=(request:NextRequest)=>publicationNativeHTTP(request);
