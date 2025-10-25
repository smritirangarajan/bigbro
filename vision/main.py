"""First-time setup:
1. python3.12 -m venv venv
2. source venv/bin/activate
3. pip install -r requirements.txt
4. cp .env.example .env  # update with your secrets
5. python main.py
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from attention_monitor import PipelineConfig, AttentionMonitorPipeline
from attention_monitor.audio import SoundManager
from attention_monitor.notifications import NotificationClient


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def build_config() -> PipelineConfig:
    load_dotenv()

    base = PipelineConfig()
    event_log_path = Path(os.getenv("EVENT_LOG_PATH", str(base.event_log_path)))

    return base.with_overrides(
        frame_width=_get_int("FRAME_WIDTH", base.frame_width),
        frame_height=_get_int("FRAME_HEIGHT", base.frame_height),
        frame_process_interval=_get_float("FRAME_PROCESS_INTERVAL", base.frame_process_interval),
        max_consecutive_closed=_get_int("MAX_CONSECUTIVE_CLOSED", base.max_consecutive_closed),
        ear_threshold=_get_float("EAR_THRESHOLD", base.ear_threshold),
        yaw_threshold=_get_float("YAW_THRESHOLD", base.yaw_threshold),
        pitch_threshold=_get_float("PITCH_THRESHOLD", base.pitch_threshold),
        history_window=_get_int("HISTORY_WINDOW", base.history_window),
        distraction_threshold=_get_int("DISTRACTION_THRESHOLD", base.distraction_threshold),
        event_log_path=event_log_path,
        notification_api_key=os.getenv("NOTIFICATION_API_KEY", base.notification_api_key),
        enable_sounds=_get_bool("ENABLE_SOUNDS", base.enable_sounds),
    )


async def main() -> None:
    config = build_config()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    sound_manager = SoundManager(enabled=config.enable_sounds)
    notification_client = NotificationClient(config.notification_api_key)

    pipeline = AttentionMonitorPipeline(
        config,
        sound_manager=sound_manager,
        notification_client=notification_client,
    )

    try:
        await pipeline.run()
    except asyncio.CancelledError:  # pragma: no cover - defensive
        raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Interrupted by user.")
