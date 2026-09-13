import type {
  AgentTurn,
  AgentTurnEvent,
  AgentTurnInput,
} from "../agent/index.js";

import type {
  AgentRuntime,
} from "./types.js";

/**
 * Adapter exposing Tongyu's existing AgentTurn implementation
 * through the generic AgentRuntime contract.
 *
 * This class intentionally contains no new agent behavior.
 * AgentTurn remains the execution engine for the native runtime.
 */
export class TongyuNativeRuntime
implements AgentRuntime {
  readonly id =
    "tongyu-native";

  constructor(
    private readonly agentTurn:
      AgentTurn,
  ) {}

  stream(
    input:
      AgentTurnInput,
  ): AsyncIterable<AgentTurnEvent> {
    return this.agentTurn.stream(
      input,
    );
  }
}
