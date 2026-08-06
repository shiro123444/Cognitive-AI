export class EduFishError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "UNKNOWN", status = 0) {
    super(message);
    this.name = "EduFishError";
    this.code = code;
    this.status = status;
  }
}

export class AuthenticationError extends EduFishError {
  constructor(message = "Invalid or missing API key") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "AuthenticationError";
  }
}

export class NotFoundError extends EduFishError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends EduFishError {
  constructor(message = "Validation failed") {
    super(message, "UNPROCESSABLE", 422);
    this.name = "ValidationError";
  }
}

export class ServerError extends EduFishError {
  constructor(message = "Internal server error") {
    super(message, "INTERNAL_ERROR", 500);
    this.name = "ServerError";
  }
}
