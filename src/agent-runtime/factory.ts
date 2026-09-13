import {
  AgentTurn,
} from "../agent/index.js";

import {
  TongyuNativeRuntime,
} from "./tongyu-native-runtime.js";

import type {
  AgentRuntime,
} from "./types.js";

/**
 * Composition boundary for Tongyu's native agent runtime.
 *
 * The caller provides AgentTurn's dependencies, while this
 * factory owns the concrete AgentTurn + TongyuNativeRuntime
 * assembly.
 *
 * ConstructorParameters keeps this factory aligned with the
 * real AgentTurn constructor without duplicating that contract.
 */
export function createTongyuNativeRuntime(
  ...args:
    ConstructorParameters<
      typeof AgentTurn
    >
): AgentRuntime {
  const agentTurn =
    new AgentTurn(
      ...args,
    );

  return new TongyuNativeRuntime(
    agentTurn,
  );
}
