import type {
  ModelProvider,
  ModelStreamOptions,
} from "./provider.js";

import type {
  ModelRequest,
  ModelStreamEvent,
} from "./types.js";

const DEFAULT_BASE_URL =
  "https://api.openai.com/v1";

const DEFAULT_MODEL =
  "gpt-5.6-luna";

type FetchImplementation =
  typeof fetch;

type JsonRecord =
  Record<
    string,
    unknown
  >;

export interface OpenAIResponsesProviderOptions {
  apiKey:
    string;

  model?:
    string;

  baseUrl?:
    string;

  reasoningEffort?:
    "none"
    | "low"
    | "medium"
    | "high";

  fetchImpl?:
    FetchImplementation;
}

function asRecord(
  value:
    unknown,
): JsonRecord | undefined {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value,
    )
  ) {
    return undefined;
  }

  return value as
    JsonRecord;
}

function readString(
  value:
    JsonRecord,
  key:
    string,
): string | undefined {
  const candidate =
    value[key];

  return typeof candidate ===
    "string"
      ? candidate
      : undefined;
}

function parseArguments(
  text:
    string,
): Record<
  string,
  unknown
> {
  let value:
    unknown;

  try {
    value =
      JSON.parse(
        text,
      );
  } catch {
    throw new Error(
      "OpenAI returned invalid JSON tool arguments.",
    );
  }

  const record =
    asRecord(
      value,
    );

  if (!record) {
    throw new Error(
      "OpenAI tool arguments must be a JSON object.",
    );
  }

  return record;
}

function stringifyToolOutput(
  result:
    unknown,
  isError:
    boolean,
): string {
  try {
    return JSON.stringify({
      isError,
      result,
    });
  } catch {
    return JSON.stringify({
      isError:
        true,

      result: {
        code:
          "TOOL_RESULT_SERIALIZATION_FAILED",

        message:
          "Tongyu could not serialize the tool result.",
      },
    });
  }
}

function modelMessagesToInput(
  request:
    ModelRequest,
): JsonRecord[] {
  const input:
    JsonRecord[] = [];

  for (
    const message
    of request.messages
  ) {
    /*
     * Keep this adapter deliberately structural.
     *
     * The Model layer owns Tongyu's internal message
     * contract; this provider is the translation
     * boundary into OpenAI Responses input items.
     */
    const raw =
      message as unknown as {
        role?:
          string;

        content?:
          unknown;

        toolCalls?:
          readonly {
            id:
              string;

            name:
              string;

            arguments:
              Record<
                string,
                unknown
              >;
          }[];

        toolCallId?:
          string;

        result?:
          unknown;

        isError?:
          boolean;
      };

    if (
      raw.role ===
        "system" ||
      raw.role ===
        "user"
    ) {
      input.push({
        role:
          raw.role,

        content:
          typeof raw.content ===
            "string"
            ? raw.content
            : "",
      });

      continue;
    }

    if (
      raw.role ===
        "assistant"
    ) {
      if (
        typeof raw.content ===
          "string" &&
        raw.content.length >
          0
      ) {
        input.push({
          role:
            "assistant",

          content:
            raw.content,
        });
      }

      if (
        Array.isArray(
          raw.toolCalls,
        )
      ) {
        for (
          const call
          of raw.toolCalls
        ) {
          input.push({
            type:
              "function_call",

            call_id:
              call.id,

            name:
              call.name,

            arguments:
              JSON.stringify(
                call.arguments,
              ),
          });
        }
      }

      continue;
    }

    if (
      raw.role ===
        "tool"
    ) {
      if (
        typeof raw.toolCallId !==
          "string" ||
        raw.toolCallId.length ===
          0
      ) {
        throw new Error(
          "Tongyu tool message is missing toolCallId.",
        );
      }

      input.push({
        type:
          "function_call_output",

        call_id:
          raw.toolCallId,

        output:
          stringifyToolOutput(
            raw.result,
            raw.isError ===
              true,
          ),
      });

      continue;
    }

    throw new Error(
      `Unsupported Tongyu model role: ${String(raw.role)}`,
    );
  }

  return input;
}

function toolsToOpenAI(
  request:
    ModelRequest,
): JsonRecord[] {
  return (
    request.tools ??
    []
  ).map(
    (
      tool,
    ) => ({
      type:
        "function",

      name:
        tool.name,

      description:
        tool.description,

      parameters:
        tool.inputSchema,
    }),
  );
}

function parseSseBlock(
  block:
    string,
): unknown | undefined {
  const data =
    block
      .split(
        /\r?\n/,
      )
      .filter(
        (
          line,
        ) =>
          line.startsWith(
            "data:",
          ),
      )
      .map(
        (
          line,
        ) =>
          line
            .slice(
              5,
            )
            .trimStart(),
      )
      .join(
        "\n",
      );

  if (
    !data ||
    data ===
      "[DONE]"
  ) {
    return undefined;
  }

  try {
    return JSON.parse(
      data,
    );
  } catch {
    throw new Error(
      "OpenAI returned an invalid SSE JSON event.",
    );
  }
}

async function* readSseEvents(
  response:
    Response,
): AsyncIterable<
  unknown
> {
  if (
    !response.body
  ) {
    throw new Error(
      "OpenAI streaming response had no body.",
    );
  }

  const reader =
    response.body
      .getReader();

  const decoder =
    new TextDecoder();

  let buffer =
    "";

  try {
    while (
      true
    ) {
      const {
        done,
        value,
      } =
        await reader.read();

      if (
        done
      ) {
        break;
      }

      buffer +=
        decoder.decode(
          value,
          {
            stream:
              true,
          },
        );

      while (
        true
      ) {
        const separator =
          buffer.match(
            /\r?\n\r?\n/,
          );

        if (
          !separator ||
          separator.index ===
            undefined
        ) {
          break;
        }

        const block =
          buffer.slice(
            0,
            separator.index,
          );

        buffer =
          buffer.slice(
            separator.index +
              separator[0].length,
          );

        const event =
          parseSseBlock(
            block,
          );

        if (
          event !==
          undefined
        ) {
          yield event;
        }
      }
    }

    buffer +=
      decoder.decode();

    if (
      buffer.trim()
    ) {
      const event =
        parseSseBlock(
          buffer,
        );

      if (
        event !==
        undefined
      ) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function readErrorMessage(
  response:
    Response,
): Promise<string> {
  let body =
    "";

  try {
    body =
      await response.text();
  } catch {
    return `HTTP ${response.status}`;
  }

  try {
    const parsed =
      asRecord(
        JSON.parse(
          body,
        ),
      );

    const error =
      parsed
        ? asRecord(
            parsed.error,
          )
        : undefined;

    const message =
      error
        ? readString(
            error,
            "message",
          )
        : undefined;

    if (
      message
    ) {
      return `HTTP ${response.status}: ${message}`;
    }
  } catch {
    // Fall back to plain text below.
  }

  return body
    ? `HTTP ${response.status}: ${body.slice(0, 500)}`
    : `HTTP ${response.status}`;
}

export class OpenAIResponsesProvider
  implements ModelProvider {
  readonly id:
    string;

  private readonly apiKey:
    string;

  private readonly model:
    string;

  private readonly baseUrl:
    string;

  private readonly reasoningEffort:
    OpenAIResponsesProviderOptions[
      "reasoningEffort"
    ];

  private readonly fetchImpl:
    FetchImplementation;

  constructor(
    options:
      OpenAIResponsesProviderOptions,
  ) {
    const apiKey =
      options.apiKey.trim();

    if (
      !apiKey
    ) {
      throw new Error(
        "OpenAI API key must not be empty.",
      );
    }

    this.apiKey =
      apiKey;

    this.model =
      options.model ??
      DEFAULT_MODEL;

    this.baseUrl =
      (
        options.baseUrl ??
        DEFAULT_BASE_URL
      ).replace(
        /\/+$/,
        "",
      );

    this.reasoningEffort =
      options.reasoningEffort;

    this.fetchImpl =
      options.fetchImpl ??
      fetch;

    this.id =
      `openai-responses:${this.model}`;
  }

  async *stream(
    request:
      ModelRequest,
    options:
      ModelStreamOptions = {},
  ): AsyncIterable<
    ModelStreamEvent
  > {
    const tools =
      toolsToOpenAI(
        request,
      );

    const payload:
      JsonRecord = {
        model:
          this.model,

        input:
          modelMessagesToInput(
            request,
          ),

        stream:
          true,

        /*
         * Tongyu already owns durable Session history.
         * Do not rely on server-side response state.
         */
        store:
          false,
      };

    if (
      tools.length >
      0
    ) {
      payload.tools =
        tools;

      payload.tool_choice =
        "auto";

      payload.parallel_tool_calls =
        true;
    }

    if (
      this.reasoningEffort
    ) {
      payload.reasoning = {
        effort:
          this.reasoningEffort,
      };
    }

    const response =
      await this.fetchImpl(
        `${this.baseUrl}/responses`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${this.apiKey}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              payload,
            ),

          signal:
            options.signal,
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `OpenAI Responses request failed: ${await readErrorMessage(response)}`,
      );
    }

    let emittedCompletion =
      false;

    let emittedToolCall =
      false;

    for await (
      const rawEvent
      of readSseEvents(
        response,
      )
    ) {
      const event =
        asRecord(
          rawEvent,
        );

      if (
        !event
      ) {
        continue;
      }

      const type =
        readString(
          event,
          "type",
        );

      if (
        type ===
        "response.output_text.delta"
      ) {
        const delta =
          readString(
            event,
            "delta",
          );

        if (
          delta
        ) {
          yield {
            type:
              "text.delta",

            text:
              delta,
          };
        }

        continue;
      }

      if (
        type ===
        "response.output_item.done"
      ) {
        const item =
          asRecord(
            event.item,
          );

        if (
          !item ||
          readString(
            item,
            "type",
          ) !==
            "function_call"
        ) {
          continue;
        }

        const callId =
          readString(
            item,
            "call_id",
          );

        const name =
          readString(
            item,
            "name",
          );

        const argumentsText =
          readString(
            item,
            "arguments",
          );

        if (
          !callId ||
          !name ||
          argumentsText ===
            undefined
        ) {
          throw new Error(
            "OpenAI returned an incomplete function call.",
          );
        }

        emittedToolCall =
          true;

        yield {
          type:
            "tool.call",

          call: {
            id:
              callId,

            name,

            arguments:
              parseArguments(
                argumentsText,
              ),
          },
        };

        continue;
      }

      if (
        type ===
        "response.completed"
      ) {
        emittedCompletion =
          true;

        yield {
          type:
            "response.completed",

          finishReason:
            emittedToolCall
              ? "tool_call"
              : "stop",
        };

        continue;
      }

      if (
        type ===
        "response.incomplete"
      ) {
        emittedCompletion =
          true;

        yield {
          type:
            "response.completed",

          finishReason:
            "length",
        };

        continue;
      }

      if (
        type ===
          "response.failed" ||
        type ===
          "error"
      ) {
        const responseObject =
          asRecord(
            event.response,
          );

        const responseError =
          responseObject
            ? asRecord(
                responseObject.error,
              )
            : undefined;

        const directError =
          asRecord(
            event.error,
          );

        const message =
          (
            responseError &&
            readString(
              responseError,
              "message",
            )
          ) ??
          (
            directError &&
            readString(
              directError,
              "message",
            )
          ) ??
          "OpenAI response failed.";

        throw new Error(
          message,
        );
      }
    }

    if (
      !emittedCompletion
    ) {
      throw new Error(
        "OpenAI response stream ended without a terminal event.",
      );
    }
  }
}
