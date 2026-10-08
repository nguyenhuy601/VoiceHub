"""Che email / SĐT trước khi gửi mây; bỏ che trên chữ trả về."""

import re

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b")


def mask_prompt_privacy(text: str):
    raw = str(text or "")
    tokens = {}
    n = 0

    def replace_email(match):
        nonlocal n
        key = f"__VH_PII_{n}__"
        n += 1
        tokens[key] = match.group(0)
        return key

    def replace_phone(match):
        nonlocal n
        key = f"__VH_PII_{n}__"
        n += 1
        tokens[key] = match.group(0)
        return key

    out = EMAIL_RE.sub(replace_email, raw)
    out = PHONE_RE.sub(replace_phone, out)
    return out, tokens


def unmask_prompt_privacy(text: str, tokens: dict):
    out = str(text or "")
    for key in sorted(tokens.keys(), key=len, reverse=True):
        out = out.replace(key, tokens[key])
    return out
