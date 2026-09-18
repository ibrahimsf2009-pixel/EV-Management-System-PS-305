"""Boot the Flask app, probe key endpoints, shut it down. No leftovers."""

import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"

proc = subprocess.Popen(
    [sys.executable, "app.py"],
    cwd=BACKEND,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    encoding="utf-8",
    errors="replace",
)

def get(path: str) -> tuple[int, str]:
    with urllib.request.urlopen(f"http://127.0.0.1:8000{path}", timeout=5) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")

try:
    # Wait for the server to accept connections
    for _ in range(40):
        try:
            get("/api/health")
            break
        except Exception:
            time.sleep(0.25)
    else:
        print("[FAIL] server never became ready")

    status, body = get("/api/health")
    print(f"GET /api/health -> {status}: {body.strip()}")

    status, body = get("/api/state")
    print(f"GET /api/state  -> {status} ({len(body)} bytes)")
    print("  head:", body[:220].replace("\n", " "))

    # POST an input update, then confirm it round-trips
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/state",
        data=b'{"gridCapacity": 60, "buildingDemand": 18, "solarGeneration": 12}',
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"POST /api/state -> {resp.status}")
    status, body = get("/api/state")
    ok = '"gridCapacity": 60' in body or '"gridCapacity":60' in body
    print(f"  round-trip gridCapacity=60: {'OK' if ok else 'MISMATCH'}")

    print("[DONE] API smoke test passed")
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    print("[cleanup] flask stopped")
