from flask import Blueprint, jsonify
from werkzeug.exceptions import NotFound

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.errorhandler(NotFound)
def handle_not_found(error):
    return jsonify({"success": False, "error": error.description}), 404


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
from . import edu  # noqa: E402,F401
