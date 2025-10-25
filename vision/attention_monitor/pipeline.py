from __future__ import annotations

import asyncio
import sys
from collections import deque
from datetime import datetime, timezone
from typing import Deque, Dict, Optional, Set

import cv2

from .analyzer import AttentionClassifier, FrameAnalyzer, FrameAnalysis, get_frame
from .audio import SoundManager
from .config import PipelineConfig
from .logging_utils import save_event_to_jsonl
from .notifications import NotificationClient

NEGATIVE_STATES = {"not_present", "looking_away", "sleeping"}


def check_and_handle_distraction_window(
    history: Deque[str],
    threshold: int,
    negative_states: Optional[Set[str]] = None,
) -> bool:
    """Return True when the rolling history exceeds the distraction threshold."""

    negative_states = negative_states or NEGATIVE_STATES
    if len(history) < history.maxlen:
        return False

    negative_count = sum(1 for state in history if state in negative_states)
    return negative_count >= threshold


class AttentionMonitorPipeline:
    """Coordinates frame capture, analysis, logging, and alerting."""

    def __init__(
        self,
        config: PipelineConfig,
        *,
        sound_manager: Optional[SoundManager] = None,
        notification_client: Optional[NotificationClient] = None,
    ) -> None:
        self._config = config
        self._frame_analyzer = FrameAnalyzer(config)
        self._classifier = AttentionClassifier(config)
        self._sound_manager = sound_manager or SoundManager(config.enable_sounds)
        self._notification_client = notification_client or NotificationClient(config.notification_api_key)

        self._history: Deque[str] = deque(maxlen=config.history_window)
        self._closed_frames = 0
        self._last_logged_state: Optional[str] = None
        self._intervention_active = False

    async def run(self) -> None:
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("Could not open webcam. Ensure the camera is connected.", file=sys.stderr)
            return

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._config.frame_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._config.frame_height)

        print("Starting attention monitor. Press 'q' in the video window to exit.")

        try:
            while True:
                frame = get_frame(cap, self._config.frame_width, self._config.frame_height)
                if frame is None:
                    print("Frame capture failed; retrying...", file=sys.stderr)
                    await asyncio.sleep(self._config.frame_process_interval)
                    continue

                analysis = self._frame_analyzer.analyze(frame)
                state, self._closed_frames = self._classifier.classify(analysis, self._closed_frames)
                event = self._build_event(state, analysis)

                save_event_to_jsonl(self._config.event_log_path, event)
                print(f"[{event['timestamp']}] state={state}")

                self._history.append(state)
                self._handle_notifications(state, event)
                self._handle_sounds(state)
                self._handle_intervention(event)

                cv2.imshow("Attention Monitor", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

                await asyncio.sleep(self._config.frame_process_interval)
        finally:
            cap.release()
            self._frame_analyzer.close()
            cv2.destroyAllWindows()

    def _handle_notifications(self, state: str, event: Dict[str, object]) -> None:
        if not event:
            return
        payload = dict(event)
        payload.pop("state", None)
        self._notification_client.send_notification(state, **payload)

    def _handle_sounds(self, state: str) -> None:
        if state != "attentive":
            self._sound_manager.play_state_alert(state)

    def _handle_intervention(self, event: Dict[str, object]) -> None:
        threshold_hit = check_and_handle_distraction_window(
            self._history,
            self._config.distraction_threshold,
            NEGATIVE_STATES,
        )

        if threshold_hit and not self._intervention_active:
            print("ALERT: Prolonged distraction detected!")
            self._sound_manager.play_prolonged_alert()
            self._notification_client.send_intervention(self._history, **event)
            self._intervention_active = True
        elif not threshold_hit:
            self._intervention_active = False

    def _build_event(self, state: str, analysis: FrameAnalysis) -> Dict[str, object]:
        timestamp = datetime.now(timezone.utc).isoformat()
        event: Dict[str, object] = {
            "timestamp": timestamp,
            "state": state,
            "face_present": analysis.face_present,
            "yaw": analysis.yaw,
            "pitch": analysis.pitch,
            "roll": analysis.roll,
            "ear_left": analysis.ear_left,
            "ear_right": analysis.ear_right,
            "ear_avg": analysis.ear_average,
            "frame_interval_seconds": self._config.frame_process_interval,
        }
        return event
