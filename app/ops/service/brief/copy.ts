export type Locale = 'zh' | 'en';
export const copy = {
  zh: {
    title: '已分享的旅客简报', intro: '仅展示旅客为本服务任务明确分享给你的字段。缺少字段表示未知或未分享；不能据此推断旅客的人格或完整偏好。',
    language: '语言', back: '返回服务任务', login: '员工登录', refresh: '重新核验', loading: '正在核验当前分享与来源…',
    empty: '请选择服务任务。', ready: '已核验本次读取。来源更改、撤权或到期后需要重新核验。', unavailable: '简报不可读取，或来源、版本、授权已变更。需要旅客重新预览并分享。', auth: '请使用获授权的员工会话登录。', expired: '简报或会话已到期，正文已清除。', invalid: '服务任务编号无效。',
    case: '服务任务', revision: '简报版本', expires: '有效至', source: '来源', sourceRevision: '来源版本', updated: '来源更新时间', explicit: '旅客显式提供', unknown: '未知 / 未分享（unknown）',
    problem: '问题', travel_pace: '旅行节奏', preference: '已分享偏好', budget: '每晚住宿预算', requirements: '需求', response_detail: '表达详细程度',
    caseSource: '本服务任务', profile_pace: '旅行节奏设置', memory: '旅客选定的偏好', intake: '本任务的旅行需求输入',
    city: '城市', durationDays: '天数', partySize: '人数', interests: '兴趣', dates: '日期', mobilityConstraints: '出行限制',
    relaxed: '轻松', balanced: '均衡', packed: '充实', fast: '快节奏', food: '美食', photography: '摄影', culture: '文化', nature: '自然',
  },
  en: {
    title: 'Shared Traveler Brief', intro: 'Only fields explicitly shared with you for this service task are shown. Missing fields are unknown or unshared; they do not describe personality or a complete preference history.',
    language: 'Language', back: 'Back to service tasks', login: 'Staff sign in', refresh: 'Recheck access', loading: 'Checking current share and sources…',
    empty: 'Select a service task.', ready: 'This read was checked. Recheck after source, access or expiry changes.', unavailable: 'Brief unavailable, or its sources, version or access changed. The traveler needs to preview and share again.', auth: 'Sign in with the authorized staff session.', expired: 'Brief or session expired. Content cleared.', invalid: 'Invalid service task ID.',
    case: 'Service task', revision: 'Brief revision', expires: 'Expires', source: 'Source', sourceRevision: 'Source revision', updated: 'Source updated', explicit: 'Explicitly provided by the traveler', unknown: 'Unknown / not shared',
    problem: 'Problem', travel_pace: 'Travel pace', preference: 'Shared preferences', budget: 'Lodging budget per night', requirements: 'Requirements', response_detail: 'Response detail',
    caseSource: 'This service task', profile_pace: 'Travel pace setting', memory: 'Traveler-selected preference', intake: 'Travel intake for this task',
    city: 'City', durationDays: 'Days', partySize: 'Party size', interests: 'Interests', dates: 'Dates', mobilityConstraints: 'Mobility constraints',
    relaxed: 'Relaxed', balanced: 'Balanced', packed: 'Packed', fast: 'Fast', food: 'Food', photography: 'Photography', culture: 'Culture', nature: 'Nature',
  },
} as const;
