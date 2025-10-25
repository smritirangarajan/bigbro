from __future__ import annotations

import json
from pathlib import Path
from typing import Mapping, MutableMapping


def save_event_to_jsonl(log_path: Path, event: Mapping[str, object]) -> None:
    """Append an attention event to the newline-delimited JSON log."""

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        json.dump(event, handle)
        handle.write("\n")
