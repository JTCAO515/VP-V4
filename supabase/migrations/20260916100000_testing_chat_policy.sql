-- Internal-testing-only text_policies row for the standalone testing chatbot
-- (testing.go2china.space). Not a public product feature: the operator (the
-- VisePanda AI Core team) is the only expected consenting user. Reuses the
-- existing grounded-turn/1 machinery (knowledge_intent_v1) unmodified.
insert into turn_private.text_policies(
  id, provider, recipient, endpoint, source_region, processing_region, storage_region,
  terms_version, notice_version, notice_hash, notice_zh, notice_en, retention,
  effective_at, expires_at, terms_recheck_at, context_mode
) values (
  '84b7b1ee-e6ef-407e-b660-d27d9f7ef3fd',
  'glm',
  'VisePanda AI Core internal testing team',
  'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  'CN', 'CN', 'CN',
  'internal-testing-v1',
  'internal-testing-v1',
  'a9f6d20e9d48be172e40b88381bac190cd40dbb8271c8e402f5d5fefee65cf95',
  '这是 VisePanda AI Core 团队内部测试工具，非面向公众的产品功能。你输入的问题文本会发送给第三方AI模型供应商（智谱GLM，中国）进行处理，不共享其他个人数据。回答可能不完整、不准确或暂时不可用，本工具不用于真实旅行决策。关闭会话后，数据可能仍保留用于内部调试。',
  'This is an internal testing tool for the VisePanda AI Core team, not a public product feature. Your question text is sent to a third-party AI model provider (GLM / Zhipu AI, China) for processing; no other personal data is shared. Responses may be incomplete, inaccurate, or unavailable, and this tool is not intended for real travel decisions. Data may be retained for internal debugging after you close this session.',
  'retain_after_hide_v1',
  now(), now() + interval '1 year', now() + interval '11 months',
  'knowledge_intent_v1'
);
