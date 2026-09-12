export type ModelProviderErrorCode =
  | "MODEL_AUTH_FAILED"
  | "MODEL_RATE_LIMITED"
  | "MODEL_PROVIDER_UNAVAILABLE"
  | "MODEL_NETWORK_ERROR"
  | "MODEL_PROTOCOL_ERROR"
  | "MODEL_REQUEST_FAILED"
  | "MODEL_PROVIDER_ERROR";

export class ModelProviderError
  extends Error {
  readonly code:
    ModelProviderErrorCode;

  readonly status:
    number | undefined;

  constructor(
    code:
      ModelProviderErrorCode,
    message:
      string,
    status?:
      number,
  ) {
    super(
      message,
    );

    this.name =
      "ModelProviderError";

    this.code =
      code;

    this.status =
      status;
  }
}
