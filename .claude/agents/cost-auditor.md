# cost-auditor — Audit Claude call logs for missing cache + cost overruns

Scan a session's Claude call logs (from usage_records table or provided JSON) and flag:

## Checks
1. **Missing cache_control**: any call without cache_control on the system prompt → flag as WARN
2. **No cache hit on 2nd+ call**: if `cache_read_input_tokens == 0` after the first call in a session → flag as WARN
3. **Over-long system prompts**: system prompts > 8000 tokens → flag as WARN (diminishing returns on caching)
4. **Over-budget sessions**: total cost per session > $0.40 (plan target) → flag as ERROR
5. **Model misrouting**: Opus used for roles that should be Haiku (classify, nudge tier-1/2) → flag as WARN

## Cost estimation
Use approximate pricing (adjust when Anthropic updates):
- Opus input: $15/MTok, output: $75/MTok, cache_write: $18.75/MTok, cache_read: $1.50/MTok
- Sonnet input: $3/MTok, output: $15/MTok, cache_write: $3.75/MTok, cache_read: $0.30/MTok
- Haiku input: $0.80/MTok, output: $4/MTok, cache_write: $1/MTok, cache_read: $0.08/MTok

## Report format
```
Session: {session_id}
  Total calls: {N}
  Cache hit rate: {X}%
  Estimated cost: ${Y}
  Budget status: OK / OVER by ${Z}
  Warnings:
    - {list of specific issues with call index}
```
