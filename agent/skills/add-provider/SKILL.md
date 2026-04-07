---
name: add-provider
description: Research a new model provider, check API compatibility with pi, add model entries to models.json (if not built-in), create an auth.json placeholder, and instruct the user to fill in their API key.
---

# Add Provider

Workflow for adding a new AI model provider to pi when the user asks about one.

## Overview

3 phases — research, configure, instruct:

1. **Research** — Figure out what the provider offers and whether pi already supports it
2. **Configure** — Add the right entries to `auth.json` and (if needed) `models.json`
3. **Instruct** — Tell the user exactly what to do to finish setup

## Phase 1: Research

When the user asks about a provider:

1. **Web search** the provider's API docs. Determine:
   - Base URL / endpoint
   - Auth method (Bearer token? custom header?)
   - API compatibility — does it speak one of pi's supported APIs?
     - `openai-completions` (most third-party providers)
     - `openai-responses`
     - `anthropic-messages`
     - `google-generative-ai`
     - Or a fully custom protocol requiring `streamSimple`
   - Available models, their capabilities (reasoning/thinking, image input, context window, max output tokens)
   - Pricing per million tokens (input/output/cache) if available
   - Any compat quirks (thinking format, max_tokens field name, role naming, etc.)

2. **Check if pi already has it built-in.** Read `~/.pi/agent/models.json` and the providers doc at:
   ```
   /home/ishan/.nvm/versions/node/v25.6.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/providers.md
   ```
   Look for the provider name in the env var / auth.json key table. If it's already there, pi ships built-in models — skip `models.json` and go straight to auth.

3. **Present findings** to the user:
   - Whether the provider is built-in or needs custom config
   - API compatibility (which `api` type)
   - Models that will be available
   - Any limitations or quirks

## Phase 2: Configure

### If built-in provider (listed in providers.md table)

Only `auth.json` needs an entry. Skip `models.json` entirely — pi already knows the models.

### If custom provider (not built-in)

Add an entry to `~/.pi/agent/models.json` under `providers`:

```json
"<provider-name>": {
  "baseUrl": "<api-base-url>",
  "apiKey": "<ENV_VAR_NAME>",
  "api": "<api-type>",
  "authHeader": true,
  "models": [
    {
      "id": "<model-id>",
      "name": "<Human Name>",
      "reasoning": <true|false>,
      "input": ["text"] or ["text", "image"],
      "contextWindow": <number>,
      "maxTokens": <number>,
      "cost": { "input": <$/M>, "output": <$/M>, "cacheRead": <$/M>, "cacheWrite": <$/M> },
      "compat": { ... }
    }
  ]
}
```

Key decisions:
- Set `"authHeader": true` if the provider uses `Authorization: Bearer` (most do)
- Set `"compat"` flags for known quirks:
  - `"thinkingFormat"`: `"openai"`, `"zai"`, or `"qwen"` for providers with extended thinking
  - `"maxTokensField"`: `"max_tokens"` vs `"max_completion_tokens"`
  - `"supportsDeveloperRole"`: `false` if provider uses `"system"` role instead of `"developer"`
  - `"supportsUsageInStreaming"`: `false` if provider doesn't support `stream_options.include_usage`
- Set costs to `0` if pricing is unknown — user can fill in later

### Auth entry (always)

Add a placeholder to `~/.pi/agent/auth.json`:

```json
"<provider-key>": {
  "type": "api_key",
  "key": "YOUR_<PROVIDER>_KEY_HERE"
}
```

The `<provider-key>` is:
- The `auth.json` key from the providers.md table (if built-in)
- The provider name from `models.json` (if custom) — pi resolves `apiKey` field values as env vars, but `auth.json` entries match by provider name

**Important**: `auth.json` is gitignored and has `0600` permissions. Don't commit it. Don't log the key.

## Phase 3: Instruct

Tell the user:

1. What was configured and where
2. **Replace the placeholder key** in `~/.pi/agent/auth.json` — give the exact field path
3. How to get an API key (link to the provider's key/signup page if found during research)
4. How to verify: use `/model` in pi to switch to the new provider's models
5. Mention that `auth.json` also supports:
   - Environment variable names as values: `"key": "MY_PROVIDER_KEY"`
   - Shell commands for secret managers: `"key": "!op read 'op://vault/provider/key'"`

## Gotchas

- **Don't remove existing entries** in `models.json` or `auth.json` — merge alongside them
- **Built-in providers don't need models.json** — adding models there can create duplicates or override built-in defaults. Only add `models.json` entries for built-in providers if you need to override specific model settings (use `modelOverrides` for that)
- **Coding plan vs API access** — some providers (e.g. Z.AI) have subscription "coding plans" with different endpoints than their standard API. Note this if it applies
- **auth.json takes priority** over env vars in pi's credential resolution order. If the user already has an env var set, the auth.json entry will shadow it
- **models.json reloads live** — no restart needed. Auth.json is also read on demand
