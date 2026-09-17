import type { NextRequest } from "next/server";
import { isSameOriginMutation } from "@/lib/server/identity/request-guards";
import { handleIntake } from "@/lib/server/intake/http";
import { createIntakeRpc } from "@/lib/server/intake/runtime";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return handleIntake(request, createIntakeRpc(), isSameOriginMutation(request));
}
