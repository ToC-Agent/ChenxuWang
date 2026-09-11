export class DuplicateToolError
  extends Error {

  constructor(
    name: string,
  ) {
    super(
      `Tongyu tool is already registered: ${name}`,
    );

    this.name =
      "DuplicateToolError";
  }
}

export class ToolNotFoundError
  extends Error {

  constructor(
    name: string,
  ) {
    super(
      `Tongyu tool was not found: ${name}`,
    );

    this.name =
      "ToolNotFoundError";
  }
}

export class InvalidToolCallError
  extends Error {

  constructor(
    message: string,
  ) {
    super(
      `Invalid Tongyu tool call: ${message}`,
    );

    this.name =
      "InvalidToolCallError";
  }
}
