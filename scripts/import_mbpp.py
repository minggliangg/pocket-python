#!/usr/bin/env python3
"""Download sanitized MBPP and convert it to Pocket Python pack format."""

from __future__ import annotations

import ast
import json
import re
import urllib.request
from pathlib import Path

MBPP_URL = (
    "https://raw.githubusercontent.com/google-research/google-research/"
    "master/mbpp/sanitized-mbpp.json"
)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "packs" / "mbpp.json"


def extract_fn_name(code: str) -> str | None:
    match = re.search(r"^def\s+(\w+)\s*\(", code, re.M)
    return match.group(1) if match else None


def extract_signature(code: str, fn_name: str) -> str | None:
    match = re.search(
        rf"^def\s+{re.escape(fn_name)}\s*\((.*?)\)\s*:",
        code,
        re.M | re.S,
    )
    if not match:
        return None
    # Normalize whitespace inside the signature line
    inner = re.sub(r"\s+", " ", match.group(1).strip())
    return f"def {fn_name}({inner}):"


def make_title(prompt: str, fn_name: str) -> str:
    text = prompt.strip()
    text = re.sub(r"^Write a (python )?function to\s+", "", text, flags=re.I)
    text = re.sub(r"^Write a\s+", "", text, flags=re.I)
    text = text.split(".")[0].strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > 72:
        text = text[:69].rstrip() + "…"
    if not text:
        text = fn_name.replace("_", " ").title()
    return text[:1].upper() + text[1:] if text else fn_name


def literal_node_to_value(node: ast.AST):
    try:
        return ast.literal_eval(node)
    except Exception:
        return None


def parse_structured_tests(asserts: list[str], fn_name: str):
    """Return (tests, rejects). tests use args/expected when parseable."""
    tests = []
    rejects = []
    for i, stmt in enumerate(asserts, 1):
        label = f"Case {i}"
        try:
            tree = ast.parse(stmt)
        except SyntaxError:
            rejects.append(stmt)
            continue
        if (
            not tree.body
            or not isinstance(tree.body[0], ast.Assert)
        ):
            rejects.append(stmt)
            continue
        test = tree.body[0].test
        if (
            not isinstance(test, ast.Compare)
            or len(test.ops) != 1
            or not isinstance(test.ops[0], ast.Eq)
            or len(test.comparators) != 1
        ):
            rejects.append(stmt)
            continue

        left = test.left
        right = test.comparators[0]

        # allow set(fn(...)) == set(...)
        wrap = None
        call = left
        if (
            isinstance(left, ast.Call)
            and isinstance(left.func, ast.Name)
            and left.func.id in {"set", "list", "tuple", "sorted"}
            and len(left.args) == 1
        ):
            wrap = left.func.id
            call = left.args[0]

        if not (
            isinstance(call, ast.Call)
            and isinstance(call.func, ast.Name)
            and call.func.id == fn_name
        ):
            rejects.append(stmt)
            continue

        if call.keywords:
            rejects.append(stmt)
            continue

        args = []
        ok = True
        for arg in call.args:
            val = literal_node_to_value(arg)
            if val is None and not (
                isinstance(arg, ast.Constant) and arg.value is None
            ):
                ok = False
                break
            encoded = jsonable(val)
            if encoded is None and val is not None:
                ok = False
                break
            args.append(encoded)
        if not ok:
            rejects.append(stmt)
            continue

        # set(fn(...)) == set(...) → compare as unordered collections
        if (
            isinstance(right, ast.Call)
            and isinstance(right.func, ast.Name)
            and right.func.id == "set"
            and len(right.args) == 1
        ):
            wrap = wrap or "set"
            expected = literal_node_to_value(right.args[0])
            if expected is None and not (
                isinstance(right.args[0], ast.Constant) and right.args[0].value is None
            ):
                rejects.append(stmt)
                continue
            if isinstance(expected, (set, list, tuple)):
                expected = set(expected)
            else:
                rejects.append(stmt)
                continue
        else:
            expected = literal_node_to_value(right)
            if expected is None and not (
                isinstance(right, ast.Constant) and right.value is None
            ):
                rejects.append(stmt)
                continue

        encoded_expected = jsonable(expected)
        if encoded_expected is None and expected is not None:
            rejects.append(stmt)
            continue

        tests.append(
            {
                "label": label,
                "args": args,
                "expected": encoded_expected,
                "wrap": wrap,
            }
        )
    return tests, rejects


def convert_problem(raw: dict) -> dict | None:
    code = raw.get("code") or ""
    prompt = (raw.get("prompt") or raw.get("text") or "").strip()
    asserts = list(raw.get("test_list") or [])
    imports = list(raw.get("test_imports") or [])
    task_id = raw.get("task_id")

    if not code or not prompt or not asserts or task_id is None:
        return None

    # Skip problems that need extra imports at solution time (keep pack stdlib-simple)
    if imports:
        return None

    fn_name = extract_fn_name(code)
    if not fn_name:
        return None

    # Skip multi-function modules for v1 starter simplicity
    defs = re.findall(r"^def\s+(\w+)\s*\(", code, re.M)
    if len(defs) != 1 or defs[0] != fn_name:
        return None

    signature = extract_signature(code, fn_name)
    if not signature:
        return None

    # Normalize newlines / tabs
    code = code.replace("\r\n", "\n").replace("\r", "\n")
    code = code.replace("\t", "    ")

    structured, rejects = parse_structured_tests(asserts, fn_name)
    # Prefer structured cases; if any assert is unparseable, keep ALL as assert mode
    # so we never silently drop a required check.
    if rejects:
        tests = None
        assert_list = asserts
    else:
        tests = structured
        assert_list = None

    title = make_title(prompt, fn_name)
    starter_lines = [signature]
    # Preserve multi-line signatures already collapsed; body is pass
    if not signature.endswith("\n"):
        starter = signature + "\n    pass\n"
    else:
        starter = signature + "    pass\n"

    examples = []
    if tests:
        t0 = tests[0]
        examples.append(
            {
                "input": _fmt_args(t0["args"]),
                "output": _fmt_val(t0["expected"]),
            }
        )
    else:
        examples.append({"input": assert_list[0], "output": "assert holds"})

    problem = {
        "id": f"mbpp-{task_id}",
        "title": title,
        "difficulty": "Easy",
        "source": "MBPP",
        "fnName": fn_name,
        "prompt": prompt,
        "signature": signature,
        "starter": starter,
        "solution": code.rstrip() + "\n",
        "examples": examples,
    }
    if tests is not None:
        problem["tests"] = [
            {k: t[k] for k in ("label", "args", "expected", "wrap") if k in t}
            for t in tests
        ]
    else:
        problem["asserts"] = assert_list
    return problem


def jsonable(value):
    """Convert Python literals into JSON-safe structures. Return None if impossible."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        out = []
        for item in value:
            converted = jsonable(item)
            if converted is None and item is not None:
                return None
            out.append(converted)
        return out
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if not isinstance(k, (str, int, float, bool)):
                return None
            converted = jsonable(v)
            if converted is None and v is not None:
                return None
            out[k] = converted
        return out
    if isinstance(value, set):
        items = []
        for item in value:
            converted = jsonable(item)
            if converted is None and item is not None:
                return None
            items.append(converted)
        try:
            return sorted(items, key=lambda x: json.dumps(x, sort_keys=True))
        except TypeError:
            return None
    return None


def _fmt_val(v) -> str:
    return json.dumps(jsonable(v), ensure_ascii=False)


def _fmt_args(args) -> str:
    return ", ".join(json.dumps(jsonable(a), ensure_ascii=False) for a in args)


def main() -> None:
    print(f"Downloading {MBPP_URL}")
    with urllib.request.urlopen(MBPP_URL, timeout=60) as resp:
        raw = json.loads(resp.read().decode("utf-8"))

    problems = []
    skipped = 0
    for item in raw:
        converted = convert_problem(item)
        if converted:
            problems.append(converted)
        else:
            skipped += 1

    problems.sort(key=lambda p: int(p["id"].split("-")[1]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "id": "mbpp",
        "name": "MBPP Basics",
        "description": (
            "Hand-verified beginner problems from Google Research’s "
            "Mostly Basic Python Problems dataset."
        ),
        "attribution": (
            "MBPP — Austin et al., 2021. "
            "https://github.com/google-research/google-research/tree/master/mbpp"
        ),
        "problems": problems,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(problems)} problems → {OUT}")
    print(f"Skipped {skipped}")


if __name__ == "__main__":
    main()
