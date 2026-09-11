import type {
  ModelProvider,
} from "./provider.js";

import type {
  ModelRequest,
  ModelStreamEvent,
} from "./types.js";

export interface FakeModelProviderOptions {
  prefix?: string;
  chunkSize?: number;
}

const DEFAULT_PREFIX =
  "Fake response: ";

const DEFAULT_CHUNK_SIZE =
  8;

export class FakeModelProvider
implements ModelProvider {
  readonly id =
    "fake";

  private readonly prefix:
    string;

  private readonly chunkSize:
    number;

  constructor(
    options:
      FakeModelProviderOptions = {},
  ) {
    this.prefix =
      options.prefix ??
      DEFAULT_PREFIX;

    this.chunkSize =
      options.chunkSize ??
      DEFAULT_CHUNK_SIZE;

    if (
      !Number.isInteger(
        this.chunkSize,
      ) ||
      this.chunkSize <= 0
    ) {
      throw new RangeError(
        "Fake model chunk size must be a positive integer.",
      );
    }
  }

  async *stream(
    request: ModelRequest,
  ): AsyncIterable<ModelStreamEvent> {
    const lastUserMessage =
      [...request.messages]
        .reverse()
        .find(
          (message) =>
            message.role ===
            "user",
        );

    const responseText =
      `${this.prefix}${lastUserMessage?.content ?? ""}`;

    for (
      let offset = 0;
      offset < responseText.length;
      offset += this.chunkSize
    ) {
      yield {
        type:
          "text.delta",

        text:
          responseText.slice(
            offset,
            offset +
              this.chunkSize,
          ),
      };
    }

    yield {
      type:
        "response.completed",

      finishReason:
        "stop",
    };
  }
}
