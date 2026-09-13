import type {
  AgentTurnEvent,
  AgentTurnInput,
} from "../agent/index.js";

/**
 * Stable execution boundary between Tongyu clients/control-plane
 * code and a concrete agent implementation.
 *
 * Future implementations may include:
 * - Tongyu native runtime
 * - Codex runtime
 * - OpenClaw runtime
 * - Claude Code runtime
 */
export interface AgentRuntime {
  /**
   * Stable runtime identifier.
   */
  readonly id:
    string;

  /**
   * Execute one agent turn and stream runtime events.
   */
  stream(
    input:
      AgentTurnInput,
  ): AsyncIterable<AgentTurnEvent>;
}
