"""Independent EduFish plugin (protocol v1).

Only the wire protocol and the backend implementation live here.  The
TypeScript package and example host are separate ownership areas and must not
be imported by this module.
"""

from .manifest import PLUGIN_ID, PLUGIN_VERSION, PROTOCOL_VERSION

__all__ = ["PLUGIN_ID", "PLUGIN_VERSION", "PROTOCOL_VERSION"]
