"""EDUFISH SDK exceptions."""


class EduFishError(Exception):
    """Base exception for all SDK errors."""

    def __init__(self, message: str, code: str = "UNKNOWN", status: int = 0):
        self.code = code
        self.status = status
        super().__init__(message)


class AuthenticationError(EduFishError):
    """Raised when API key is missing or invalid."""

    def __init__(self, message: str = "Invalid or missing API key"):
        super().__init__(message, code="UNAUTHORIZED", status=401)


class NotFoundError(EduFishError):
    """Raised when a requested resource does not exist."""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, code="NOT_FOUND", status=404)


class ValidationError(EduFishError):
    """Raised when request data fails validation."""

    def __init__(self, message: str = "Validation failed"):
        super().__init__(message, code="UNPROCESSABLE", status=422)


class ServerError(EduFishError):
    """Raised when the engine returns a 5xx error."""

    def __init__(self, message: str = "Internal server error"):
        super().__init__(message, code="INTERNAL_ERROR", status=500)
