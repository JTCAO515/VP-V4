import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";

export function failureResponse(code: FailureCode) {
  return { error: { code }, status: FAILURE_TAXONOMY[code].httpStatus };
}
