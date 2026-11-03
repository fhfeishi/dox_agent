日期：2026-11-03
来源：本轮用户 Step D；main bd8130b 的生产代码；此前 High2 最小修复面清单
状态：草案

# High#2 当前代码复核

结论：本轮 P1 是预览测试提交，不是任务线 P1-0 的安全修复。对象级授权 High#2 仍不能关闭。以下为静态复核，不是攻击实测，不改生产代码或安全验收口径。

| 当前代码位置 | 事实与收口边界 |
|---|---|
| `src/api/reports.py:69`、`src/artifacts.py:177` | 旧 reports 列表仍仅传 session/run/limit，没有可信 owner 集合。不能把新 artifacts 列表的过滤外推到旧路由。 |
| `src/api/reports.py:403`、`:423` | get_report 与 resolve_artifact 读取后未进行作者检查；别名解析、版本存在和 run_available 均不是授权。 |
| `src/api/reports.py:648` | artifact_figure 直接读取 image，未经过 resolve_artifact；未来只修共享解析器仍会遗漏此入口。 |
| `src/api/reports.py:434`、`:448`、`:454` | artifacts 列表已有 visible_owners，trash/purge 已有 may_delete；restore 未进入该作者检查分支。应保留已存在的隔离，不笼统宣称所有成果接口都无权限。 |
| `src/runs.py:66`、`src/api/reports.py:418` | 运行快照字段白名单未持久化可信作者；get_run 直接按 ID 读取。先确定历史无主记录策略，不从客户端 session_key 推断作者。 |
| `src/api/chat.py:402`、`:418` | events 在全局内存日志命中后直接返回，cancel 直接查任务并取消；只保护持久化 replay 不能保护实时分支。 |

建议保持原修复面清单为入口，不新建平行全矩阵。实施时先冻结 ordinary-user A/B、管理员、历史无主对象的访问口径，再验证：跨账户不可读、不可写、不可取消；拒绝后不创建任务、不消费缓存、不生成导出文件；同账户和明确允许的管理员路径仍可用。

未复核范围：本轮未重新逐条检查 web 缓存、review 导出、workspace 会话及 target job 全矩阵；没有复跑 High#2 攻击用例。quick 的角色路由矩阵通过也不代表这些对象所有权边界通过。当前旁审不授权安全修复、push 或合并。
