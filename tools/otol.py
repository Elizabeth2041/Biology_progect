"""Мини-клиент API Open Tree of Life и OneZoom с кэшем на диске.

Все ответы сохраняются в tools/cache/, чтобы повторные запуски не нагружали
чужие серверы и давали тот же результат.
"""
import hashlib
import json
import pathlib
import time
import urllib.error
import urllib.request

CACHE = pathlib.Path(__file__).parent / "cache"
OTOL = "https://api.opentreeoflife.org/v3/"
ONEZOOM = "https://www.onezoom.org/API/"
HEADERS = {"User-Agent": "school-clade-tree/1.0", "Content-Type": "application/json"}


def _cached(key, fetch):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / (hashlib.sha1(key.encode()).hexdigest() + ".json")
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    last = None
    for attempt in range(4):
        try:
            data = fetch()
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            time.sleep(0.15)
            return data
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if isinstance(err, urllib.error.HTTPError) and err.code in (400, 404):
                raise
            last = err
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Не удалось получить {key}: {last!r}")


def otol(method, payload):
    """POST-запрос к Open Tree of Life, например otol('tnrs/match_names', {...})."""
    body = json.dumps(payload, sort_keys=True)

    def fetch():
        req = urllib.request.Request(OTOL + method, data=body.encode(), headers=HEADERS)
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode())

    return _cached("otol:" + method + ":" + body, fetch)


def onezoom(method, query):
    """GET-запрос к OneZoom (публичный ключ 0: не более 5 таксонов за запрос)."""
    url = ONEZOOM + method + "?key=0&" + query

    def fetch():
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode())

    return _cached("onezoom:" + url, fetch)
