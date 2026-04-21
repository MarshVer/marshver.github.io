---
title: "codex-threadripper同步不同提供商的历史记录"
date: "2026-04-21 01:54:40"
---

# 1. 安装 Rust (如果尚未安装)
```
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

# 2. 用 Cargo 安装工具
```
cargo install codex-threadripper
```

# 3. 运行命令
```
codex-threadripper sync  # 执行一次同步
```
# 或者，启动后台监听模式，自动处理未来的变化
```
codex-threadripper watch 
```
