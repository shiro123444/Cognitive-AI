"""Multi-tenant isolation middleware.

Extracts tenant_id from X-Tenant-ID header and stores it in Flask g.
All EduFish queries must filter by g.tenant_id when multi-tenancy is enabled.
"""

from flask import Flask, g, request


def _get_tenant_id(app: Flask) -> str:
    if not app.config.get("MULTI_TENANT_ENABLED", False):
        return "default"
    tenant = request.headers.get("X-Tenant-ID", "").strip()
    return tenant or "default"


def register_tenant_middleware(app: Flask):
    @app.before_request
    def _set_tenant():
        g.tenant_id = _get_tenant_id(app)
