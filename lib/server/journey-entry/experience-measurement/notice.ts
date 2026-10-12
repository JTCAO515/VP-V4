import { NOTICE, PURPOSE, SCHEMA, TTL } from './contract.ts';
export const MEASUREMENT_NOTICE = {
  schemaVersion: SCHEMA, purpose: PURPOSE, noticeVersion: NOTICE, retentionMs: TTL,
  zh: '你可以选择加入新想法、材料导入或在途回访的体验评价。我们只为评价可用成果、明确采用或保存、连续体验和必要提问重复率，记录最少的闭合元数据及原来源引用，最多保留30天。不收集想法、材料、聊天原文或错误正文，不用于营销、训练或原文研究。你可以撤回、导出或删除；拒绝或撤回不影响正常旅行功能。',
  en: 'You can opt in to experience evaluation for new ideas, material import or journey return. Its only purpose is to evaluate useful results, explicit adoption or saving, continuity and repeated necessary questions. We retain only minimal closed metadata and original source references for at most 30 days. We do not collect idea, material, chat or error text, or use this data for marketing, training or raw-text research. You can withdraw, export or delete it. Declining or withdrawing does not affect normal travel features.',
} as const;
