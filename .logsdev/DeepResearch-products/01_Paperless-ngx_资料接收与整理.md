# Paperless-ngx：先整理资料，再让资料可检索

调研日期：2026-10-16。仓库：[ paperless-ngx/paperless-ngx ](https://github.com/paperless-ngx/paperless-ngx)。
固定快照：`30a24ee02e8869fb0838c903b132acb914cd6b09`；分支 dev；该提交日期 2026-10-16T05:51:55Z。
证据：官方文档与指定源码静态核对；未本地部署产品，未验证真实用户任务耗时。以下“借鉴”均为面向 dox_agent 的设计推断，不是上游产品保证。


## 已核对的产品机制

官方使用文档把文档、标签、类型、对应方、保存视图和批量操作组成整理流程；收件箱标签可表示新收资料，保存视图重用查询条件。文档列表与详情是不同职责，详情提供原文和元数据核对。[使用文档](https://github.com/paperless-ngx/paperless-ngx/blob/30a24ee02e8869fb0838c903b132acb914cd6b09/docs/usage.md)

列表和详情分别有独立组件，列表包含筛选、选择与批量操作；详情维护阅读和属性编辑。源码证据：[文档列表](https://github.com/paperless-ngx/paperless-ngx/blob/30a24ee02e8869fb0838c903b132acb914cd6b09/src-ui/src/app/components/document-list/document-list.component.html)、[文档详情](https://github.com/paperless-ngx/paperless-ngx/blob/30a24ee02e8869fb0838c903b132acb914cd6b09/src-ui/src/app/components/document-detail/document-detail.component.html)。本轮未执行每个动作，不把模板存在当成实机可用性验收。

## 对 dox_agent 的启发

**优先借“待整理视图”，不先复制自动工作流编辑器。**

用户收到一批科研材料后，首先想知道哪些已收到、哪些重复、哪些失败、哪些要核对。建议在现有资料文件页提供“全部 / 新收待核对 / 处理异常”，状态来自现有导入与身份数据，不另复制文件目录。

常用条件可保存成轻量视图，例如“机器人库、本年度、身份待核对”。保存的是筛选，不是新资料库，也不能因此重复统计资料。

批量整理和分析范围选择要分开：改标签/库归属是维护动作，“对比所选”只是固定本次任务输入。列表中的选择在打开原文后保留。

## 不照搬的部分

该产品主要管理文档档案，不提供本项目的基金身份、四维证据、技术谱系和独立专业审查契约。对应方等票据/往来分类不必照搬到科研材料。

官方文档提醒旋转、删除页面等编辑可能改变原文件；dox_agent 的证据链应保留原始版本，不能为了做类似PDF编辑器破坏历史引用。本次不引入这类编辑能力。

## 验收切片

同批上传两份正常材料、一份重复、一份解析失败 → 在同一列表查看状态 → 核对项目关联 → 勾选正常资料发起对比 → 回到列表选择仍在。
不以“增加了待整理标签”作为完成，需证明没有重复归档和丢失范围。

## 许可与验证边界

仓库许可证标识 GPL-3.0，原文：[LICENSE](https://github.com/paperless-ngx/paperless-ngx/blob/30a24ee02e8869fb0838c903b132acb914cd6b09/LICENSE)。本次借鉴交互思想，不复制源码；代码复用需另行审查许可证适用范围。
公开 demo 被 Cloudflare 403 拦截，本轮没有绕过验证，也没有上传任何项目材料。因此这里的产品行为证据来自官方文档与源码，而非demo实测。
