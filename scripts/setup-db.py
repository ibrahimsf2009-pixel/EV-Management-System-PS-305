"""One-shot MySQL setup for GridPulse.

Reads credentials from backend/.env (or environment), loads
database/schema.sql (which creates the database, tables, and seed data),
and verifies everything works. Safe to re-run — the schema is idempotent.

Usage:
    python scripts/setup-db.py
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "backend" / ".env"

# Load backend/.env if present (no external deps).
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

CFG = {
    "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.environ.get("MYSQL_PORT", "3306")),
    "user": os.environ.get("MYSQL_USER", "root"),
    "password": os.environ.get("MYSQL_PASSWORD", ""),
    "database": os.environ.get("MYSQL_DATABASE", "gridpulse"),
}


def fail(message: str) -> "NoReturn":  # type: ignore[name-defined]
    print(f"\n[FAIL] {message}")
    print("\nFix backend/.env (copy of backend/.env.example) and re-run:")
    print("    python scripts/setup-db.py")
    sys.exit(1)


def main() -> int:
    try:
        import mysql.connector
    except ImportError:
        fail("mysql-connector-python is not installed. Run: pip install -r backend/requirements.txt")

    if not CFG["password"]:
        print("[WARN] MYSQL_PASSWORD is empty — if root has a password, set it in backend/.env")

    # 1. Server reachable + credentials valid (connect without a database first)
    print(f"Connecting to mysql://{CFG['user']}@{CFG['host']}:{CFG['port']} ...")
    try:
        server = mysql.connector.connect(
            host=CFG["host"], port=CFG["port"], user=CFG["user"], password=CFG["password"],
            connection_timeout=8,
        )
    except mysql.connector.Error as exc:
        code = exc.errno
        if code == 1045:
            fail(
                f"Access denied for '{CFG['user']}'. Wrong password in backend/.env "
                "(MYSQL_PASSWORD) — or the password is set but the field is empty."
            )
        if code == 2003:
            fail(f"Cannot reach the MySQL server at {CFG['host']}:{CFG['port']}. Is the MySQL80 service running?")
        fail(f"MySQL error {code}: {exc.msg}")

    print("  [OK] server reachable, credentials valid")

    # 2. Load schema.sql (creates database, tables, seed data — idempotent)
    schema = (ROOT / "database" / "schema.sql").read_text(encoding="utf-8")
    raw_statements = [s.strip() for s in re.split(r";\s*(?:\n|$)", schema) if s.strip()]
    cur = server.cursor()
    for statement in raw_statements:
        # Drop comment lines everywhere (leading or between statements),
        # then execute whatever executable text remains.
        body = "\n".join(l for l in statement.splitlines() if not l.strip().startswith("--")).strip()
        if body:
            cur.execute(body)
    server.commit()
    print("  [OK] schema.sql applied (gridpulse DB, 5 tables, seed data)")

    # 3. Verify against the real database
    cur.execute(f"USE {CFG['database']}")
    cur.execute("SELECT COUNT(*) FROM vehicles")
    vehicles = cur.fetchone()[0]
    cur.execute("SELECT grid_capacity, building_demand, solar_generation FROM simulation_state WHERE id='main'")
    state = cur.fetchone()
    cur.execute("SHOW TABLES")
    tables = [row[0] for row in cur.fetchall()]
    cur.close()
    server.close()

    expected = {"charging_allocations", "charging_sessions", "grid_readings", "simulation_state", "vehicles"}
    missing = expected - set(tables)
    if missing:
        fail(f"Tables missing after setup: {missing}")

    print(f"  [OK] tables: {', '.join(sorted(tables))}")
    print(f"  [OK] seed vehicles: {vehicles} (expected 5)")
    print(f"  [OK] simulation state: {state}")

    print("\n[DONE] MySQL is ready. Start the app with:")
    print("    cd backend && python app.py")
    print("The log line 'persistence: MySQL' confirms the real database is in use.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
