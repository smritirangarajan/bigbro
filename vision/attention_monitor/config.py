from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass(slots=True)
class PipelineConfig:
    """Runtime configuration options for the attention monitoring pipeline."""

    frame_width: int = 640
    frame_height: int = 360
    frame_process_interval: float = 3.0
    max_consecutive_closed: int = 3
    ear_threshold: float = 0.2
    yaw_threshold: float = 25.0
    pitch_threshold: float = 25.0
    history_window: int = 10
    distraction_threshold: int = 8
    event_log_path: Path = field(default_factory=lambda: Path("events.jsonl"))
    notification_api_key: Optional[str] = None
    enable_sounds: bool = True

    def with_overrides(
        self,
        *,
        frame_width: Optional[int] = None,
        frame_height: Optional[int] = None,
        frame_process_interval: Optional[float] = None,
        max_consecutive_closed: Optional[int] = None,
        ear_threshold: Optional[float] = None,
        yaw_threshold: Optional[float] = None,
        pitch_threshold: Optional[float] = None,
        history_window: Optional[int] = None,
        distraction_threshold: Optional[int] = None,
        event_log_path: Optional[Path] = None,
        notification_api_key: Optional[str] = None,
        enable_sounds: Optional[bool] = None,
    ) -> "PipelineConfig":
        """Return a copy of the config with supplied overrides."""

        return PipelineConfig(
            frame_width=frame_width if frame_width is not None else self.frame_width,
            frame_height=frame_height if frame_height is not None else self.frame_height,
            frame_process_interval=frame_process_interval if frame_process_interval is not None else self.frame_process_interval,
            max_consecutive_closed=max_consecutive_closed if max_consecutive_closed is not None else self.max_consecutive_closed,
            ear_threshold=ear_threshold if ear_threshold is not None else self.ear_threshold,
            yaw_threshold=yaw_threshold if yaw_threshold is not None else self.yaw_threshold,
            pitch_threshold=pitch_threshold if pitch_threshold is not None else self.pitch_threshold,
            history_window=history_window if history_window is not None else self.history_window,
            distraction_threshold=distraction_threshold if distraction_threshold is not None else self.distraction_threshold,
            event_log_path=event_log_path if event_log_path is not None else self.event_log_path,
            notification_api_key=notification_api_key if notification_api_key is not None else self.notification_api_key,
            enable_sounds=enable_sounds if enable_sounds is not None else self.enable_sounds,
        )
