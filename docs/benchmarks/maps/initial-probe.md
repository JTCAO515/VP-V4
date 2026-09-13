# #362 初始服务端探针

本切片只准备两家各一次地点搜索和一次步行路线查询。独立脚本及其契约测试是 #362 所需相邻路径；没有产品消费者、地图 SDK 或 Trip 写入。四城120查询、40路线的完整对照仍待准备和实测，不能据此选择最终供应商或关闭 #362/#208。

使用官方账号控制台取得 Web Service 服务端 Key，通过本机安全环境注入 `AMAP_WEB_SERVICE_KEY` 或 `TENCENT_MAP_WEB_SERVICE_KEY`，不要把值写入聊天、仓库、命令参数或日志。分别设置 `AMAP_PROBE_ENABLED=true` 或 `TENCENT_MAP_PROBE_ENABLED=true`；默认停用，不修改项目部署环境。

```sh
node scripts/maps/probe.mjs amap /absolute/private/path/amap-initial.jsonl
node scripts/maps/probe.mjs tencent /absolute/private/path/tencent-initial.jsonl
```

每次必须使用尚不存在的日志文件，脚本以0600权限创建并在请求前同步落盘 admission。发现未完成的 admission，先核对账号用量，不能直接重跑。每家上限2请求、0重试、0矩阵元素；每请求15秒、响应256KiB；固定HTTPS官方域名、拒绝重定向。终止进程或关停开关可停止后续调用。单次日志预算不代表账号全局配额；重复新建运行必须先核对已有账单。

固定输入为北京大学中文搜索与腾讯文档示例的公开合成起终点。GCJ-02，经纬顺序按供应商明确序列化，没有坐标转换或私人位置。入口真实性尚未校准。结果只保留数量、字段是否存在、距离/耗时和错误数值码，不保留完整供应商响应、URL、Key或错误正文。API成功只记 `observed`；实体命中、入口、可执行性、客户端加载与真实地域网络保持UNRUN。调用费用保持unknown，须对照实际账号用量，不能以2次请求推定免费。

2026-09-14核对官方参数：[高德POI 2.0](https://developer.amap.com/api/webservice/guide/api-advanced/newpoisearch)、[高德路线2.0](https://developer.amap.com/api/webservice/guide/api/newroute)、[腾讯地点搜索](https://lbs.qq.com/service/webService/webServiceGuide/webServiceSearch)、[腾讯路线](https://lbs.qq.com/service/webService/webServiceGuide/webServiceRoute)。高德耗时秒，腾讯步行耗时分钟。英文查询效果与英文结果权限是不同问题；初始探针不请求高级英文结果、室内或预测能力。文档不证明当前账号有权限。

当前账号接通状态：UNRUN。有限的环境变量、已知Keychain名称及两个工作区环境文件检查未找到对应安全配置；高德官方控制台显示登录入口，未完成登录。该检查不代表用户没有地图账号或其他位置没有Key。下一步通过官方登录及本机安全配置接通后，执行上述有界探针，保留真实错误和未知价格/配额。
