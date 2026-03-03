from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.py"
OUT = ROOT / "docs" / "_table_scan.json"

text = APP.read_text(encoding="utf-8", errors="ignore")

read_pat = re.compile(r"\b(?:FROM|JOIN)\s+`?([A-Za-z0-9_]+)`?", re.IGNORECASE)
write_pat = re.compile(
    r"\b(?:INTO|UPDATE|DELETE\s+FROM)\s+`?([A-Za-z0-9_]+)`?",
    re.IGNORECASE,
)

insert_cols_pat = re.compile(
    r"\bINSERT\s+INTO\s+`?(?P<table>[A-Za-z0-9_]+)`?\s*\((?P<cols>[^\)]{1,2000})\)",
    re.IGNORECASE | re.DOTALL,
)

bad = {
    "select",
    "where",
    "set",
    "values",
    "on",
    "and",
    "or",
    "left",
    "right",
    "inner",
    "outer",
    "cursor",
    "datetime",
    "decimal",
    "filesystem",
    "flask",
    "functools",
    "io",
    "mysql",
    "openpyxl",
    "subString".lower(),
    "waitress",
    "werkzeug",
    "successful",
}

read_tables = [t for t in read_pat.findall(text) if t.lower() not in bad]
write_tables = [t for t in write_pat.findall(text) if t.lower() not in bad]

unique = sorted(set(read_tables + write_tables), key=str.lower)
unique_write = sorted(set(write_tables), key=str.lower)

insert_columns: dict[str, set[str]] = {}
for m in insert_cols_pat.finditer(text):
    t = m.group("table")
    if t.lower() in bad:
        continue
    cols_raw = m.group("cols")
    cols = []
    for c in cols_raw.split(","):
        c = c.strip().strip("`").strip()
        if not c:
            continue
        # ignore placeholders or SQL fragments
        if any(ch.isspace() for ch in c):
            continue
        cols.append(c)
    if cols:
        insert_columns.setdefault(t, set()).update(cols)

key_candidates = [
    "contractCode",
    "contract_code",
    "project_id",
    "projectId",
    "id",
    "file_id",
    "department",
    "dept",
    "year",
    "week_start",
    "weekStart",
    "username",
    "user_id",
]

near_keys: dict[str, set[str]] = {t: set() for t in unique}

N = 40
for t in unique:
    it = re.finditer(rf"\b{re.escape(t)}\b", text, flags=re.IGNORECASE)
    for i, m in enumerate(it):
        if i >= N:
            break
        start = max(0, m.start() - 200)
        end = min(len(text), m.end() + 200)
        window = text[start:end]
        for k in key_candidates:
            if k in window:
                near_keys[t].add(k)

payload = {
    "tables": unique,
    "write_tables": unique_write,
    "near_keys": {t: sorted(list(keys)) for t, keys in near_keys.items() if keys},
    "insert_columns": {t: sorted(list(cols)) for t, cols in insert_columns.items()},
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote: {OUT}")
print(f"tables_total: {len(unique)}")
