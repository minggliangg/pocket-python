import json
import traceback


def _jsonable(v):
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _jsonable(val) for k, val in v.items()}
    if isinstance(v, set):
        items = [_jsonable(x) for x in v]
        return sorted(items, key=lambda x: json.dumps(x, sort_keys=True, default=repr))
    return repr(v)


def _eq(a, b, wrap=None):
    if wrap == "set":
        try:
            return set(a) == set(b)
        except TypeError:
            return sorted(_jsonable(a), key=repr) == sorted(_jsonable(b), key=repr)

    if isinstance(a, tuple):
        a = list(a)
    if isinstance(b, tuple):
        b = list(b)
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return False
        return all(_eq(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        if set(a.keys()) != set(b.keys()):
            return False
        return all(_eq(a[k], b[k]) for k in a)
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b or a == b
    if isinstance(a, float) or isinstance(b, float):
        try:
            return abs(float(a) - float(b)) < 1e-9
        except (TypeError, ValueError):
            return False
    return a == b


def _run_cases(code, fn_name, tests):
    namespace = {"__name__": "__main__"}
    try:
        exec(code, namespace)
    except Exception as e:
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "traceback": traceback.format_exc(),
            "results": [],
            "passed": 0,
            "total": len(tests),
        }

    fn = namespace.get(fn_name)
    if fn is None:
        return {
            "ok": False,
            "error": f"Function `{fn_name}` was not defined.",
            "results": [],
            "passed": 0,
            "total": len(tests),
        }
    if not callable(fn):
        return {
            "ok": False,
            "error": f"`{fn_name}` is not callable.",
            "results": [],
            "passed": 0,
            "total": len(tests),
        }

    results = []
    for i, test in enumerate(tests):
        args = test.get("args", [])
        expected = test.get("expected")
        wrap = test.get("wrap")
        label = test.get("label") or f"Case {i + 1}"
        try:
            actual = fn(*args)
            passed = _eq(actual, expected, wrap=wrap)
            results.append(
                {
                    "label": label,
                    "passed": passed,
                    "args": _jsonable(args),
                    "expected": _jsonable(expected),
                    "actual": _jsonable(actual),
                    "error": None,
                }
            )
        except Exception as e:
            results.append(
                {
                    "label": label,
                    "passed": False,
                    "args": _jsonable(args),
                    "expected": _jsonable(expected),
                    "actual": None,
                    "error": f"{type(e).__name__}: {e}",
                }
            )

    passed = sum(1 for r in results if r["passed"])
    return {
        "ok": True,
        "error": None,
        "results": results,
        "passed": passed,
        "total": len(results),
    }


def _run_asserts(code, asserts):
    namespace = {"__name__": "__main__"}
    try:
        exec(code, namespace)
    except Exception as e:
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "traceback": traceback.format_exc(),
            "results": [],
            "passed": 0,
            "total": len(asserts),
        }

    results = []
    for i, stmt in enumerate(asserts):
        label = f"Assert {i + 1}"
        try:
            exec(stmt, namespace)
            results.append(
                {
                    "label": label,
                    "passed": True,
                    "args": None,
                    "expected": None,
                    "actual": None,
                    "error": None,
                    "assert": stmt,
                }
            )
        except Exception as e:
            results.append(
                {
                    "label": label,
                    "passed": False,
                    "args": None,
                    "expected": None,
                    "actual": None,
                    "error": f"{type(e).__name__}: {e}",
                    "assert": stmt,
                }
            )

    passed = sum(1 for r in results if r["passed"])
    return {
        "ok": True,
        "error": None,
        "results": results,
        "passed": passed,
        "total": len(results),
    }


def run_suite(code, fn_name, payload_json):
    payload = json.loads(payload_json)
    mode = payload.get("mode") or "cases"
    if mode == "asserts":
        result = _run_asserts(code, payload.get("asserts") or [])
    else:
        result = _run_cases(code, fn_name, payload.get("tests") or [])
    return json.dumps(result)
