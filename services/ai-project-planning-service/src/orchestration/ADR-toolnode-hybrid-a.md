# ADR — ToolNode Hybrid A (WHAT + HOW)

**Status:** Accepted  
**Context:** Agent Core phase graphs used custom `Send` + per-tool nodes for every tool. LangGraph prebuilt `ToolNode` is the standard executor for LangChain `tool()` + `AIMessage.tool_calls`, but Pattern B sec/FR subgraphs must stay named compiled nodes (SharedChannels / sparse container merges).

## Decision

**Hybrid A (not dual, not Option B):**

- **Plain tools** → single graph node `plainTools` = prebuilt `ToolNode` + LC `tool()` wrappers that call `executeHowToolCall` / `executeWhatToolCall` and return `Command({ update })`.
- **Pattern B** (HOW sec, WHAT FR / section) → unchanged `Send(toolName)` → `addNode(compiled subgraph)`.
- Custom `selectTools` + hybrid route remains SoT; do **not** replace routing with stock `toolsCondition` alone (cannot fan-out to named subgraphs).

One tool call takes **exactly one** path (plain XOR Pattern B). Mixed turns may `Send` both `plainTools` and sec nodes in parallel — that is fan-out of *different* tools, not double-run of the same tool.

## Consequences

- HOW plain set today: `BacklogMapTool`, `WbsTool`, `ScheduleTool`, `ProjectPlanTool`.
- WHAT plain set today: empty (all peers are FR/section Pattern B); `plainTools` node kept for parity / future plain tools.
- Messages into `ToolNode` must be `AIMessage` (not bare `{ role: 'assistant' }`).
