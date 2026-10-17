export type SampleMessage = { role: "user" | "sample"; text: string };
export const prompts = [
  { key: "why", label: "为什么 / why", aliases: ["why", "为什么"] },
  { key: "simplify", label: "简化 / simplify", aliases: ["simplify", "简化"] },
  { key: "correction", label: "纠正 / correction", aliases: ["correction", "纠正"] },
] as const;
export const fixtures = [
  {
    id: "synthetic-preparation", name: "示例 A · 准备清单", source: "synthetic fixture A",
    messages: [
      { role: "user", text: "示例问题：如何整理出发前的准备事项？" },
      { role: "sample", text: "固定示例：先列出待核对事项，再标记哪些信息尚未确定。这是交互演示，不提供实际旅行建议。" },
    ] as SampleMessage[],
    responses: {
      why: "固定示例 A：把未知信息单独列出，方便后续核对。本回复未调用模型。",
      simplify: "固定示例 A：列事项 → 标记未知 → 自行核对。没有保存清单。",
      correction: "固定示例 A：将演示清单改为只展示待核对项；真实资料没有被修改。",
    },
  },
  {
    id: "synthetic-comparison", name: "示例 B · 方案比较", source: "synthetic fixture B",
    messages: [
      { role: "user", text: "示例问题：怎样比较两个草稿方案？" },
      { role: "sample", text: "固定示例：分别列出方案甲、方案乙的待确认条件，再决定需要补充什么。没有真实地点、价格或行程承诺。" },
    ] as SampleMessage[],
    responses: {
      why: "固定示例 B：先展示差异与未知条件，帮助理解比较过程。本回复未调用模型。",
      simplify: "固定示例 B：看差异 → 补信息 → 再决定。没有创建或修改 Trip。",
      correction: "固定示例 B：把演示比较改为只看待确认条件；没有提交任何真实方案。",
    },
  },
] as const;

export function sampleReply(fixture: typeof fixtures[number], input: string): string {
  const normalized = input.trim().toLowerCase();
  const prompt = prompts.find(item => item.aliases.some(alias => alias === normalized));
  return prompt ? fixture.responses[prompt.key] : "未接入真实 Agent：这个输入没有预设示例回应。仅支持 why / simplify / correction 或 为什么 / 简化 / 纠正；不会理解、发送或保存任意问题。";
}
