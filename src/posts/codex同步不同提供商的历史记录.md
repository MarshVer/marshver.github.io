---
title: "codex同步不同提供商的历史记录"
date: "2026-06-05 00:13:48"
---

model_provider = "codex"
model = "gpt-5.5"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.codex]
name = "codex"
base_url = "https://XXX"
wire_api = "responses"
requires_openai_auth = true

# 保持codex不动就行
