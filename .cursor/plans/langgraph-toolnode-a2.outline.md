# Outline — ToolNode A2 (plan riêng, chưa implement)

**Parent:** LG SoT cleanup (checkpointer, FR subgraph, rename, queue/ReAct).  
**Status:** Deferred until Steps 1–5 of parent are stable.

## Objective

Migrate tool *selection/execution shell* toward LangGraph prebuilt `ToolNode` / `toolsCondition` **without** collapsing Pattern B subgraphs (`addNode(compiled)` for FR / WHAT sections / HOW secs).

## Non-goals

- Replace Gate HTTP with interrupt.
- Nuốt mọi sec vào một `ToolNode([allTools])` batch.
- Re-introduce enterTools / awaitWave on phase graphs.

## ADR required before code

| Option | When |
|--------|------|
| **A — Hybrid** | `selectTools` emits AIMessage.tool_calls; plain tools → `ToolNode`; Pattern B sec/FR stay `Send` → named subgraph nodes |
| **B — tool() wrappers** | Each subgraph wrapped as LangChain `tool()` invoked by ToolNode — only if SharedChannels/reducers proven safe |

**Default recommendation:** A (Hybrid). B needs proof Parallel Send semantics preserved.

## Files likely touched (future plan)

- `orchestration/toolSelectNodes.js` (ex-reactAgentNodes)
- `orchestration/whatPhaseGraph.js` / `howPhaseGraph.js`
- `orchestration/toolSubgraphAdapter.js`
- Optional: LangChain `tool()` adapters under `orchestration/lcTools/`

## Success criteria (future)

- [ ] ADR committed choosing A or B
- [ ] No regression on Pattern B FR / section / HOW sec
- [ ] `createReactAgent` only if bindTools + ChatModel path exists; else keep custom selectTools + ToolNode execute
- [ ] Tests: smoke WHAT/HOW + topology

## Risk

ToolNode batch parallel ≠ Send-to-subgraph named nodes — can break sparse container merges and SharedChannels.
