"""Bounded, sanitized diagnostics for the current API process."""
from collections import deque
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4
import time
import traceback
from pathlib import Path

CAPACITY = 1000
SESSION_ID = uuid4().hex
STARTED_AT = datetime.now(timezone.utc).isoformat()
_events = deque(maxlen=CAPACITY)
_lock = Lock()
_sequence = 0


def record(level, source, message, **details):
    global _sequence
    with _lock:
        _sequence += 1
        event = dict(id=_sequence, timestamp=datetime.now(timezone.utc).isoformat(),
                     level=level, source=source, message=message, details=details)
        _events.append(event)
        return event


def snapshot():
    with _lock:
        return dict(session_id=SESSION_ID, started_at=STARTED_AT, capacity=CAPACITY,
                    dropped=max(0, _sequence - CAPACITY), events=list(reversed(_events)))


class DiagnosticMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get('path', '')
        if scope['type'] != 'http' or not (path.startswith('/api/') or path == '/health') or path.startswith('/api/diagnostics'):
            return await self.app(scope, receive, send)
        request_id = uuid4().hex[:12]
        scope.setdefault('state', {})['request_id'] = request_id
        start = time.monotonic()
        status = 500
        failure = None
        async def tracked_send(message):
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
                message.setdefault('headers', []).append((b'x-request-id', request_id.encode()))
            await send(message)
        try:
            await self.app(scope, receive, tracked_send)
        except Exception as exc:
            failure = dict(type=type(exc).__name__, frames=[
                dict(file=Path(frame.filename).name, line=frame.lineno, function=frame.name)
                for frame in traceback.extract_tb(exc.__traceback__)[-8:]
            ])
            scope['state']['diagnostic_reason'] = 'Kesalahan internal API. Lokasi kode tersedia pada detail error.'
            raise
        finally:
            # Route template never includes query strings, credentials or payloads.
            route = getattr(scope.get('route'), 'path', None) or '/unknown'
            method = scope.get('method', 'UNKNOWN')
            method = method if method in {'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'} else 'UNKNOWN'
            record('ERROR' if status >= 500 else 'WARN' if status >= 400 else 'INFO',
                   'bridge' if route.startswith('/api/mt5/') else 'api',
                   'Request gagal' if status >= 400 else 'Request selesai',
                   request_id=request_id, method=method, path=route, status=status,
                   duration_ms=round((time.monotonic()-start)*1000, 1),
                   reason=scope['state'].get('diagnostic_reason'), error=failure,
                   upstream_error=scope['state'].get('diagnostic_upstream'))
