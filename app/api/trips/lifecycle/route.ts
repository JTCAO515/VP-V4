import type { NextRequest } from "next/server";
import { webTripLifecycleHTTP } from "@/lib/server/trip/lifecycle/web-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return webTripLifecycleHTTP(request, "read"); }
export async function POST(request: NextRequest) { return webTripLifecycleHTTP(request, "execute"); }
