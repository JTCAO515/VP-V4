最终 head：`9891052926210b673d47bfcb032ae84277fc8cff`  
对比：`65ec0cae07277e356710e3db3e887c2f2fdd350c`

**Standards：0 findings。** Chat 已复用现有 `state.libraryChatText`；此前唯一 P3 重复格式化问题已消除。

**Spec：0 findings。** helper 按精确 materialID 查找当前资料并返回 title/content；缺失返回 nil，无关联、无全局 fallback。此改动保持原有格式和条件行为，未改变自由上下文或 journey 行为。

仅核对两处改动及 helper 实现；未运行测试、构建或网络操作，未写入。未受影响的完整双轴审查证据继续适用。