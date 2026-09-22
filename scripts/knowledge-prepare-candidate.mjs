import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isKnowledgeOperation } from "../lib/server/knowledge/publication/statement.ts";

/** Prepare one existing Ops operation offline. This grants no review or publication status. */
export function prepareCandidate(batch, editorialId) {
  if (batch?.schemaVersion !== "editorial-statement-batch/1"
      || batch.status !== "editorial_content_not_published"
      || !Array.isArray(batch.records) || batch.recordCount !== batch.records.length
      || batch.records.some(record => !record || typeof record.editorialId !== "string")
      || new Set(batch.records.map(record => record.editorialId)).size !== batch.records.length) {
    throw new Error("Invalid editorial batch or duplicate editorial IDs");
  }
  const record = batch.records.find(record => record.editorialId === editorialId);
  if (!record) throw new Error("Editorial ID not found");
  const operation = {
    action: "submit_statement",
    operationId: randomUUID(),
    candidateId: randomUUID(),
    title: record.title,
    statement: record.statement,
  };
  if (!isKnowledgeOperation(operation)) throw new Error("Statement is not a valid Ops submission");
  return operation;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [batchPath, editorialId, outputPath, ...extra] = process.argv.slice(2);
    if (!batchPath || !editorialId || !outputPath || extra.length) {
      throw new Error("Usage: node scripts/knowledge-prepare-candidate.mjs <batch.json> <editorial-id> <new-output.json>");
    }
    const operation = prepareCandidate(JSON.parse(readFileSync(batchPath, "utf8")), editorialId);
    // Never overwrite a prepared operation: retries must retain both IDs and the exact body.
    writeFileSync(outputPath, `${JSON.stringify(operation, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log("Prepared one candidate locally. Nothing submitted, reviewed or published. Reuse this file for retries.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Candidate preparation failed");
    process.exitCode = 1;
  }
}
