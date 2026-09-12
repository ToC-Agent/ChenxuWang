import {
  z,
} from "zod";

import type {
  ModelToolDefinition,
} from "../model/index.js";

import type {
  Tool,
} from "../tool/index.js";

import {
  AgentToolDefinitionError,
} from "./errors.js";

function formatUnknownError(
  error: unknown,
): string {
  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return String(
    error,
  );
}

export function toolsToModelDefinitions(
  tools:
    readonly Tool[],
): ModelToolDefinition[] {
  return tools.map(
    (tool) => {
      let jsonSchema;

      try {
        jsonSchema =
          z.toJSONSchema(
            tool.inputSchema,
            {
              io:
                "input",
            },
          );
      } catch (error) {
        throw new AgentToolDefinitionError(
          tool.name,
          formatUnknownError(
            error,
          ),
        );
      }

      return {
        name:
          tool.name,

        description:
          tool.description,

        inputSchema: {
          ...jsonSchema,
        },
      };
    },
  );
}
