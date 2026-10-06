import logging
import urllib.error
import urllib.request
from collections.abc import Callable

logger = logging.getLogger("ai_analyst.http")

# Type alias for injectable HTTP POST client: (url, headers, body_bytes, timeout_seconds) -> (status_code, response_bytes)
HttpClient = Callable[[str, dict[str, str], bytes, float], tuple[int, bytes]]


def default_http_post(
    url: str, headers: dict[str, str], data: bytes, timeout: float = 12.0
) -> tuple[int, bytes]:
    """Default standard library HTTP POST client."""
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as http_err:
        err_bytes = http_err.read()
        logger.warning("HTTP request failed with status %d: %s", http_err.code, http_err.reason)
        return http_err.code, err_bytes
    except TimeoutError as te:
        logger.warning("HTTP request timed out after %.1fs", timeout)
        raise TimeoutError("Request timed out") from te
    except urllib.error.URLError as url_err:
        if isinstance(url_err.reason, TimeoutError):
            raise TimeoutError("Request timed out") from url_err
        logger.warning("URL request error: %s", url_err.reason)
        raise ConnectionError(str(url_err.reason)) from url_err
