"""Global error handlers — unified JSON envelope for all HTTP errors."""

from flask import Flask, jsonify

from app.api import api_bp


def _error_body(code: str, message: str, status: int, details=None):
    payload = {
        "success": False,
        "error": {"code": code, "message": message},
    }
    if details:
        payload["error"]["details"] = details
    return jsonify(payload), status


def register_error_handlers(app: Flask):
    """Register error handlers on the Flask app for unmatched routes."""

    @app.errorhandler(400)
    def _400(error):
        return _error_body("BAD_REQUEST", str(error) or "Bad request", 400)

    @app.errorhandler(404)
    def _404(error):
        return _error_body("NOT_FOUND", str(error) or "Not found", 404)

    @app.errorhandler(405)
    def _405(error):
        return _error_body("METHOD_NOT_ALLOWED", str(error) or "Method not allowed", 405)

    @app.errorhandler(422)
    def _422(error):
        return _error_body("UNPROCESSABLE", str(error) or "Unprocessable entity", 422)

    @app.errorhandler(500)
    def _500(error):
        return _error_body("INTERNAL_ERROR", "Internal server error", 500)


# Blueprint-level handlers for errors raised inside blueprint views

@api_bp.errorhandler(400)
def handle_400(error):
    return _error_body("BAD_REQUEST", str(error) or "Bad request", 400)


@api_bp.errorhandler(401)
def handle_401(error):
    return _error_body("UNAUTHORIZED", str(error) or "Unauthorized", 401)


@api_bp.errorhandler(404)
def handle_404(error):
    return _error_body("NOT_FOUND", str(error) or "Not found", 404)


@api_bp.errorhandler(405)
def handle_405(error):
    return _error_body("METHOD_NOT_ALLOWED", str(error) or "Method not allowed", 405)


@api_bp.errorhandler(422)
def handle_422(error):
    return _error_body("UNPROCESSABLE", str(error) or "Unprocessable entity", 422)


@api_bp.errorhandler(429)
def handle_429(error):
    return _error_body("TOO_MANY_REQUESTS", str(error) or "Rate limit exceeded", 429)


@api_bp.errorhandler(500)
def handle_500(error):
    return _error_body("INTERNAL_ERROR", "Internal server error", 500)
