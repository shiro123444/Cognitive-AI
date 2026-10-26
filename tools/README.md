# Claude CLI 插件任务

这些脚本直接调用本机 `claude` 命令，默认使用当前 Claude 配置，不会修改模型、网关或用户配置。三个实现任务分别拥有后端、独立包和示例目录；约束见 `docs/plugin/IMPLEMENTATION-CONTRACT.md`。

```powershell
# 并行启动三个任务
python tools\run_claude_plugin_tasks.py

# 查看摘要，原始日志保存在已忽略的 tmp/claude-plugin-work/
python tools\claude_plugin_status.py

# 恢复特定会话，并发送后续修正指令
python tools\run_claude_plugin_tasks.py example --resume --instruction 'Follow-up instruction here'
```

`--model` 可覆盖当前模型；模型名需要符合用户所配置网关的格式。任务代码编辑权限采用 Claude 的 `acceptEdits` 模式及明确的工具允许列表；没有关闭权限检查。遇到需要额外许可的命令时，任务会收到拒绝，协调者应使用受控命令完成必要检查。

本轮实现已结束，验证结果见 `docs/plugin/ACCEPTANCE.md`。重新启动实现任务可能再次编辑其所属文件；日常构建与验证应使用仓库根目录的 `plugin:*` npm 命令。
