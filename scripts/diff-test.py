"""Differential test: run the Python engine on the TS-generated fixtures.

Compares every allocation field, status, reason string, and derived metric.
Exits non-zero on any mismatch.
"""

import json
import math
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from allocation import allocate, compute_derived  # noqa: E402


def norm(x):
    """Normalize floats for comparison (2 decimal places, -0.0 == 0.0)."""
    if isinstance(x, bool):
        return x
    if isinstance(x, (int, float)):
        v = round(float(x), 2)
        return 0.0 if v == 0 else v
    if isinstance(x, dict):
        return {k: norm(v) for k, v in x.items()}
    if isinstance(x, list):
        return [norm(v) for v in x]
    return x


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    fixtures_path = root / "scripts" / "fixtures.json"
    if not fixtures_path.exists():
        print("fixtures.json missing — run diff-generate.mts first", file=sys.stderr)
        return 2

    fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))
    failures = 0

    for fixture in fixtures:
        result = allocate(
            fixture["vehicles"],
            fixture["inputs"]["gridCapacity"],
            fixture["inputs"]["buildingDemand"],
            fixture["inputs"]["solarGeneration"],
            fixture["nowMinutes"],
        )
        derived = compute_derived(
            fixture["inputs"]["gridCapacity"],
            fixture["inputs"]["buildingDemand"],
            fixture["inputs"]["solarGeneration"],
            result["totalAllocatedKw"],
        )

        expected = norm(
            {
                "allocation": fixture["allocation"],
                "derived": fixture["derived"],
            }
        )
        actual = norm({"allocation": result, "derived": derived})

        if expected == actual:
            print(f"  PASS  {fixture['name']}")
            continue

        failures += 1
        print(f"  FAIL  {fixture['name']}")
        _diff(expected, actual, path="$")

    print(f"\n{len(fixtures) - failures}/{len(fixtures)} scenarios match.")
    return 1 if failures else 0


def _diff(expected, actual, path):
    if isinstance(expected, dict) and isinstance(actual, dict):
        for key in sorted(set(expected) | set(actual)):
            e, a = expected.get(key), actual.get(key)
            if e != a:
                _diff(e, a, f"{path}.{key}")
    elif isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            print(f"    {path}: length {len(expected)} != {len(actual)}")
            return
        for i, (e, a) in enumerate(zip(expected, actual)):
            if e != a:
                _diff(e, a, f"{path}[{i}]")
    else:
        print(f"    {path}:\n      ts: {expected!r}\n      py: {actual!r}")


if __name__ == "__main__":
    sys.exit(main())
