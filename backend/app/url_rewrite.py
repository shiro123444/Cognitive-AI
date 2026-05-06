"""Rewrite public tunnel URLs to localhost to avoid Cloudflare hairpin routing."""

# Maps public tunnel hostnames to their local service addresses.
# When the backend calls a URL whose host matches a key here,
# it is rewritten to the corresponding local address so the
# request stays on the machine instead of going out through
# Cloudflare and back.
_TUNNEL_TO_LOCAL: dict[str, str] = {
    "portal.wbuai.me": "http://127.0.0.1:8080",
}


def rewrite_base_url(url: str) -> str:
    """If *url* targets a known tunnel host, rewrite it to localhost."""
    for host, local in _TUNNEL_TO_LOCAL.items():
        if host in url:
            return url.replace(f"https://{host}", local).replace(f"http://{host}", local)
    return url
