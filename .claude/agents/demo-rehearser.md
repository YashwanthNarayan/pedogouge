# demo-rehearser — Walk through the demo script, flag broken steps

Walk through the 10 demo wow moments (plan Appendix L) step by step and flag any E2E check that hasn't passed in the last 30 min.

## Demo steps to verify
1. Extension installed, `@tutor` appears in Chat panel
2. Intake: `@tutor build a habit tracker` → 3 parallel tool uses → ProjectBlueprint in chat
3. Scaffold: local `habit-tracker/` folder + files exist on disk
4. Skill graph: D3 panel opens in VS Code with nodes/edges
5. AST squiggle: `for i in len(habits):` → red squiggle within 400ms
6. Pseudoterminal: run broken Python → stderr + italic tutor narration
7. Intervention ladder: repeat error → tier 1 → tier 2 → tier 3 notebook opens
8. Teacher nudge: teacher clicks line → yellow highlight in student's editor
9. Voice defense: `@tutor /defend` → voice conversation, inject_bug fires in Phase 2
10. Credential: QR on phone → W3C VC + radar chart + `/verify` returns 200

## For each step
- Status: READY / BLOCKED / FAILING
- Last successful run: {timestamp or "never"}
- Blocker: {what's missing — task ID from the plan}
- Time to fix: {estimate}

Flag any step marked FAILING or BLOCKED that's critical for the 3-minute demo flow.
The demo MUST have steps 1–4 + 10 working. Steps 5–9 are the differentiators.
