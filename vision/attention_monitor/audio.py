from __future__ import annotations

import platform
from typing import Literal

import numpy as np

try:
    import simpleaudio as sa
except ImportError:  # pragma: no cover - runtime fallback if sound lib missing
    sa = None  # type: ignore[assignment]

SoundType = Literal["alert", "distraction"]


class SoundManager:
    """Plays short tones for immediate and prolonged distraction alerts."""

    def __init__(self, enabled: bool = True) -> None:
        self._enabled = enabled
        self._sample_rate = 44_100
        self._use_simpleaudio = sa is not None and platform.system() != "Darwin"

    def play_sound(self, sound_type: SoundType) -> None:
        if not self._enabled:
            return
        if not self._use_simpleaudio or sa is None:
            print("\a", end="", flush=True)
            return

        try:
            tone = self._build_tone(sound_type)
            play_obj = sa.play_buffer(tone, 1, 2, self._sample_rate)
            play_obj.wait_done()
        except Exception:
            self._use_simpleaudio = False
            print("\a", end="", flush=True)

    def play_state_alert(self, state: str) -> None:
        """Play a quick tone when the attention state changes to non-attentive."""

        if state == "sleeping":
            self.play_sound("distraction")
        elif state != "attentive":
            self.play_sound("alert")

    def play_prolonged_alert(self) -> None:
        """Play a more noticeable tone for prolonged distraction."""

        self.play_sound("distraction")

    def _build_tone(self, sound_type: SoundType) -> np.ndarray:
        duration = 0.35 if sound_type == "alert" else 0.6
        frequency = 880 if sound_type == "alert" else 523
        t = np.linspace(0, duration, int(self._sample_rate * duration), False)

        # Blend two harmonics for a more distinct tone without external audio files.
        primary = np.sin(frequency * 2 * np.pi * t)
        secondary = 0.4 * np.sin((frequency * 1.5) * 2 * np.pi * t)
        wave = primary + secondary
        peak = np.max(np.abs(wave))
        if peak == 0:
            return np.zeros(int(self._sample_rate * duration), dtype=np.int16)

        audio = np.int16(wave / peak * 32_000)
        return audio

    @property
    def enabled(self) -> bool:
        return self._enabled

    def set_enabled(self, value: bool) -> None:
        self._enabled = value