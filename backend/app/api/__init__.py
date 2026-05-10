"""API v1 blueprint — versioned engine endpoints.

Route modules that register on api_bp automatically appear under /api/v1/.
"""

from flask import Blueprint

api_bp = Blueprint("api", __name__, url_prefix="/api/v1")

# Global error handlers (must import before routes so handlers are registered)
from . import errors  # noqa: E402,F401

# Route modules
from . import courses  # noqa: E402,F401
from . import activities  # noqa: E402,F401
from . import graph  # noqa: E402,F401
from . import materials  # noqa: E402,F401
from . import review  # noqa: E402,F401
from . import tutor  # noqa: E402,F401
from . import agents  # noqa: E402,F401
from . import users  # noqa: E402,F401
from . import assignments  # noqa: E402,F401
from . import progress  # noqa: E402,F401
from . import jobs  # noqa: E402,F401
from . import agent_runs  # noqa: E402,F401
from . import edu  # noqa: E402,F401
from . import experiments  # noqa: E402,F401
from . import settings  # noqa: E402,F401
from . import auth  # noqa: E402,F401
