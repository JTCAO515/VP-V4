import type { ResultArtifactRead } from "../../lib/server/artifacts/result-contract.ts";

/** Source records only; neither IDs nor counts establish preference contents or causes. */
export function comparisonBasisFacts(result: Pick<ResultArtifactRead, "source" | "basis">, zh: boolean) {
  const memories = result.basis.memories;
  const versions = memories.map(memory => `v${memory.revision}`).join(zh ? "、" : ", ");
  return {
    heading: zh ? "这份比较依据什么？" : "What is this comparison based on?",
    trip: result.source.tripVersion === null
      ? (zh ? "未记录关联的行程版本。" : "No linked Trip version was recorded.")
      : (zh ? `读取时关联的已保存行程版本：v${result.source.tripVersion}。` : `Linked saved Trip version at this read: v${result.source.tripVersion}.`),
    request: zh ? `关联的请求记录：第 ${result.source.inputSequence} 条。` : `Linked request record: ${result.source.inputSequence}.`,
    memory: memories.length === 0 ? (zh ? "未记录记忆引用。" : "No Memory references were recorded.")
      : (zh ? `记忆引用记录：${memories.length} 项，版本 ${versions}。` : `Memory reference records: ${memories.length} entries, versions ${versions}.`),
    evidence: zh ? "未记录外部证据引用。是否经过检索核验、是否实时，当前记录无法说明。"
      : "No external evidence references were recorded. Search verification and real-time freshness are unknown from this record.",
    explanation: zh ? "原始请求文字、记忆的具体内容，以及它们如何影响这些选项，来源记录没有说明。"
      : "The source record does not provide the original request text or memory contents, or explain how they influenced these choices.",
    currentness: zh ? "此次读取通过了权限和来源版本检查。后续变更可能使成果失效，请刷新核对。"
      : "This read passed the access and source-version checks. Later changes may make it stale; refresh to check again.",
    records: zh ? "版本记录" : "Version records",
  };
}
