import {
  FakeModelProvider,
} from "./fake-provider.js";

import {
  OpenAIResponsesProvider,
} from "./openai-responses-provider.js";

import type {
  ModelProvider,
} from "./provider.js";

const DEFAULT_OPENAI_MODEL =
  "gpt-5.6-luna";

type ReasoningEffort =
  "none"
  | "low"
  | "medium"
  | "high";

function parseReasoningEffort(
  value:
    string | undefined,
): ReasoningEffort |
  undefined {
  if (
    value ===
      undefined ||
    value.trim() ===
      ""
  ) {
    return undefined;
  }

  if (
    value ===
      "none" ||
    value ===
      "low" ||
    value ===
      "medium" ||
    value ===
      "high"
  ) {
    return value;
  }

  throw new Error(
    `Invalid TONGYU_OPENAI_REASONING_EFFORT: ${value}`,
  );
}

export function createModelProviderFromEnvironment(
  environment:
    NodeJS.ProcessEnv =
      process.env,
): ModelProvider {
  const provider =
    (
      environment
        .TONGYU_MODEL_PROVIDER ??
      "fake"
    )
      .trim()
      .toLowerCase();

  if (
    provider ===
      "fake"
  ) {
    return new FakeModelProvider({
      prefix:
        "Tongyu: ",

      chunkSize:
        4,
    });
  }

  if (
    provider ===
      "openai"
  ) {
    const apiKey =
      environment
        .OPENAI_API_KEY
        ?.trim();

    if (
      !apiKey
    ) {
      throw new Error(
        "OPENAI_API_KEY is required when TONGYU_MODEL_PROVIDER=openai.",
      );
    }

    const model =
      environment
        .TONGYU_OPENAI_MODEL
        ?.trim() ||
      DEFAULT_OPENAI_MODEL;

    let reasoningEffort =
      parseReasoningEffort(
        environment
          .TONGYU_OPENAI_REASONING_EFFORT,
      );

    /*
     * GPT-5.6 supports reasoning=none.
     * Keep the first real-agent integration stateless
     * and simple; advanced persisted reasoning comes later.
     */
    if (
      reasoningEffort ===
        undefined &&
      model.startsWith(
        "gpt-5.6",
      )
    ) {
      reasoningEffort =
        "none";
    }

    return new OpenAIResponsesProvider({
      apiKey,

      model,

      baseUrl:
        environment
          .TONGYU_OPENAI_BASE_URL,

      reasoningEffort,
    });
  }

  throw new Error(
    `Unsupported TONGYU_MODEL_PROVIDER: ${provider}`,
  );
}
