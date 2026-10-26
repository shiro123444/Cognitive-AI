# 独立插件 v0.1 验收记录

日期：2026-10-26。

本轮通过三个 Claude CLI 任务，使用当前配置的 DeepSeek 分别完成 Python 领域接口、TypeScript 插件包、独立宿主与文档。协调阶段修正了图谱跨课程授权、关键词误匹配、路径脱敏和示例重复实现等问题，并完成最终验证。

## 交付内容

- `packages/edufish-plugin/`：独立 ESM 包 `@edufish/plugin@0.1.0`，包含严格输入输出契约、可发现操作清单、可注入传输、HTTP 传输、超时、取消、销毁和调用事件。
- `backend/app/plugin/` 与 `backend/app/api/plugin.py`：正式 Python 插件服务及认证接口，沿用真实课程、文本块、图谱、测验、学习事件、实验和产物数据。
- `examples/plugin-host/`：独立 Node CLI、本机临时后端与真实 HTTP 冒烟测试。临时后端挂载正式 API，只有样例数据、开发登录握手和临时数据库属于示例。
- `tools/run_claude_plugin_tasks.py`：Claude CLI 并行任务、指定任务、恢复会话和交接指令入口；任务提示在 `tools/claude-plugin-tasks/`，本地日志不纳入版本控制。

公开操作共八个：`course.read`、`material.search`、`graph.neighborhood`、`quiz.read`、`quiz.submit`、`progress.read`、`lab.start`、`lab.status`，统一以 `edufish.` 开头。

## 最终验证

| 检查 | 结果 |
| --- | --- |
| 后端全量 pytest | 272 项通过 |
| 独立插件 Vitest | 6 个文件、54 项通过 |
| 独立示例 pytest | 15 项通过 |
| 正式 API + 已构建插件 HTTP 冒烟测试 | 70 项检查通过，覆盖全部八个操作 |
| TypeScript 构建 | 通过，输出 JS、类型声明和 source maps |
| 本地 npm 打包 | 通过，`edufish-plugin-0.1.0.tgz`，70 个文件，约 50 KiB |
| 临时目录安装与消费包 | 通过，可导入工厂、枚举八个操作并执行读取 |
| 现有 Node Runtime 回归基线 | 15 个文件、68 项通过；本轮未修改该运行时 |
| 原有前端改动保护 | 先前九个已修改文件的 SHA-256 保持一致；未修改既有 Vue 界面 |

后端最终验证命令（在 `backend/` 下）：

```powershell
.\.venv\Scripts\python.exe -m pytest app/tests -q --tb=short -p no:cacheprovider --basetemp ..\tmp\pytest-plugin-final
```

仓库根目录入口：

```bash
npm run plugin:build
npm run plugin:test
npm run plugin:fixture-test
npm run plugin:smoke
```

本地产物位于 `tmp/claude-plugin-work/edufish-plugin-0.1.0.tgz`。源码与锁文件可重建该包；此目录及任务日志已忽略。

## 当前边界

- 尚未接入 Qingzhou；未修改其代码或分支，也未发布插件或推送提交。
- 检索明确标记为真实文本块的关键词匹配；测验按规范化文本进行确定性评分，不承诺语义评分或掌握度判断。
- 课程访问采用已发布状态及可选的用户课程允许列表，尚无完整选课 / 成员模型；开启多租户时插件拒绝访问。
- 实验沿用现有线程池队列。客户端取消不保证撤销已提交的实验，服务进程重启后的任务恢复、自动重试和孤立请求记录处理仍需后续建设。
- 包仅支持 ESM，标记 `private` / `UNLICENSED`。安装和本地组合已验证，未发布到注册表。

详细配置和运行方式见 [开发指南](README.md)；协议见 [实现契约](IMPLEMENTATION-CONTRACT.md)。
