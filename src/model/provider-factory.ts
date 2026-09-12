import {
  FakeModelProvider,
} from "./fake-provider.js";

import {
  OpenAICompatibleResponsesProvider,
} from "./openai-responses-provider.js";

import type {
  ModelProvider,
} from "./provider.js";

const DEFAULT_OPENAI_MODEL =
  "gpt-5.6-luna";

type ReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high";

function nonEmpty(
  value:
    string | undefined,
): string | undefined {
  const normalized =
    value?.trim();

  return normalized
    ? normalized
    : undefined;
}

function parseReasoningEffort(
  value:
    string | undefined,
): ReasoningEffort |
  undefined {
  const normalized =
    nonEmpty(
      value,
    );

  if (
    normalized ===
      undefined
  ) {
    return undefined;
  }

  if (
    normalized ===
      "none" ||
    normalized ===
      "low" ||
    normalized ===
      "medium" ||
    normalized ===
      "high"
  ) {
    return normalized;
  }

  throw new Error(
    `Invalid model reasoning effort: ${normalized}`,
  );
}

function createOpenAICompatibleProvider(
  environment:
    NodeJS.ProcessEnv,
): ModelProvider {
  const apiKey =
    nonEmpty(
      environment
        .TONGYU_MODEL_API_KEY,
    );

  if (
    !apiKey
  ) {
    throw new Error(
      "TONGYU_MODEL_API_KEY is required when TONGYU_MODEL_PROVIDER=openai-compatible.",
    );
  }

  const model =
    nonEmpty(
      environment
        .TONGYU_MODEL_NAME,
    );

  if (
    !model
  ) {
    throw new Error(
      "TONGYU_MODEL_NAME is required when TONGYU_MODEL_PROVIDER=openai-compatible.",
    );
  }

  const baseUrl =
    nonEmpty(
      environment
        .TONGYU_MODEL_BASE_URL,
    );

  if (
    !baseUrl
  ) {
    throw new Error(
      "TONGYU_MODEL_BASE_URL is required when TONGYU_MODEL_PROVIDER=openai-compatible.",
    );
  }

  const reasoningEffort =
    parseReasoningEffort(
      environment
        .TONGYU_MODEL_REASONING_EFFORT,
    );

  return new OpenAICompatibleResponsesProvider({
    apiKey,

    model,

    baseUrl,

    reasoningEffort,
  });
}

function createLegacyOpenAIProvider(
  environment:
    NodeJS.ProcessEnv,
): ModelProvider {
  const apiKey =
    nonEmpty(
      environment
        .OPENAI_API_KEY,
    );

  if (
    !apiKey
  ) {
    throw new Error(
      "OPENAI_API_KEY is required when TONGYU_MODEL_PROVIDER=openai.",
    );
  }

  const model =
    nonEmpty(
      environment
        .TONGYU_OPENAI_MODEL,
    ) ??
    DEFAULT_OPENAI_MODEL;

  let reasoningEffort =
    parseReasoningEffort(
      environment
        .TONGYU_OPENAI_REASONING_EFFORT,
    );

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

  return new OpenAICompatibleResponsesProvider({
    apiKey,

    model,

    baseUrl:
      nonEmpty(
        environment
          .TONGYU_OPENAI_BASE_URL,
      ),

    reasoningEffort,
  });
}

export function createModelProviderFromEnvironment(
  environment:
    NodeJS.ProcessEnv =
      process.env,
): ModelProvider {
  const provider =
    (
      nonEmpty(
        environment
          .TONGYU_MODEL_PROVIDER,
      ) ??
      "fake"
    ).toLowerCase();

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
      "openai-compatible"
  ) {
    return createOpenAICompatibleProvider(
      environment,
    );
  }

  /*
   * Legacy configuration retained so existing
   * installations do not break immediately.
   */
  if (
    provider ===
      "openai"
  ) {
    return createLegacyOpenAIProvider(
      environment,
    );
  }

  throw new Error(
    `Unsupported TONGYU_MODEL_PROVIDER: ${provider}`,
  );
}
