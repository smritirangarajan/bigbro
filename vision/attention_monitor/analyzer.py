from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np

from .configuration import PipelineConfig

# Hint MediaPipe to use Metal Performance Shaders when running on Apple Silicon.
os.environ.setdefault("MEDIAPIPE_USE_MPS", "1")

POSE_LANDMARK_INDEXES = {
    "nose_tip": 1,
    "left_eye_outer": 33,
    "right_eye_outer": 263,
    "mouth_left": 61,
    "mouth_right": 291,
    "chin": 199,
}

LEFT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380]


@dataclass(slots=True)
class FrameAnalysis:
    face_present: bool
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    ear_left: float = 0.0
    ear_right: float = 0.0

    @property
    def ear_average(self) -> float:
        return (self.ear_left + self.ear_right) / 2.0


class FrameAnalyzer:
    """Runs MediaPipe FaceMesh on frames and extracts pose metrics."""

    def __init__(self, config: PipelineConfig):
        self._config = config
        self._face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def analyze(self, frame: np.ndarray) -> FrameAnalysis:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self._face_mesh.process(rgb)
        if not results.multi_face_landmarks:
            return FrameAnalysis(face_present=False)

        mesh = results.multi_face_landmarks[0].landmark
        landmarks = _landmarks_to_array(mesh, frame.shape[:2])

        yaw, pitch, roll = _estimate_pose(landmarks, frame.shape[:2])
        ear_left = _eye_aspect_ratio(landmarks, LEFT_EYE_LANDMARKS)
        ear_right = _eye_aspect_ratio(landmarks, RIGHT_EYE_LANDMARKS)

        return FrameAnalysis(
            face_present=True,
            yaw=yaw,
            pitch=pitch,
            roll=roll,
            ear_left=ear_left,
            ear_right=ear_right,
        )

    def close(self) -> None:
        self._face_mesh.close()


class AttentionClassifier:
    """Applies simple heuristics over pose and blink metrics."""

    def __init__(self, config: PipelineConfig):
        self._config = config

    def classify(self, analysis: FrameAnalysis, closed_frames: int) -> Tuple[str, int]:
        if not analysis.face_present:
            return "not_present", 0

        if abs(analysis.yaw) > self._config.yaw_threshold or abs(analysis.pitch) > self._config.pitch_threshold:
            return "looking_away", 0

        if analysis.ear_average < self._config.ear_threshold:
            closed_frames += 1
        else:
            closed_frames = 0

        if closed_frames > self._config.max_consecutive_closed:
            return "sleeping", closed_frames

        return "attentive", closed_frames


def get_frame(cap: cv2.VideoCapture, width: int, height: int) -> Optional[np.ndarray]:
    """Capture and resize a frame; returns None if capture fails."""

    ret, frame = cap.read()
    if not ret or frame is None:
        return None
    resized = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
    return resized


def _landmarks_to_array(landmarks, image_shape: Tuple[int, int]) -> np.ndarray:
    height, width = image_shape
    coords = np.array([(lm.x * width, lm.y * height, lm.z * width) for lm in landmarks], dtype=np.float64)
    return coords


def _estimate_pose(landmarks: np.ndarray, image_shape: Tuple[int, int]) -> Tuple[float, float, float]:
    """Estimate head pose (yaw, pitch, roll) using solvePnP."""

    try:
        points_2d = np.array(
            [
                landmarks[POSE_LANDMARK_INDEXES["nose_tip"]][:2],
                landmarks[POSE_LANDMARK_INDEXES["chin"]][:2],
                landmarks[POSE_LANDMARK_INDEXES["left_eye_outer"]][:2],
                landmarks[POSE_LANDMARK_INDEXES["right_eye_outer"]][:2],
                landmarks[POSE_LANDMARK_INDEXES["mouth_left"]][:2],
                landmarks[POSE_LANDMARK_INDEXES["mouth_right"]][:2],
            ],
            dtype=np.float64,
        )

        points_3d = np.array(
            [
                (0.0, 0.0, 0.0),
                (0.0, -63.6, -12.5),
                (-43.3, 32.7, -26.0),
                (43.3, 32.7, -26.0),
                (-28.9, -28.9, -24.1),
                (28.9, -28.9, -24.1),
            ],
            dtype=np.float64,
        )

        focal_length = image_shape[1]
        center = (image_shape[1] / 2, image_shape[0] / 2)
        camera_matrix = np.array(
            [[focal_length, 0, center[0]], [0, focal_length, center[1]], [0, 0, 1]],
            dtype=np.float64,
        )
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        success, rotation_vector, _ = cv2.solvePnP(points_3d, points_2d, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE)
        if not success:
            return 0.0, 0.0, 0.0

        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
        sy = np.sqrt(rotation_matrix[0, 0] ** 2 + rotation_matrix[1, 0] ** 2)

        pitch = np.degrees(np.arctan2(-rotation_matrix[2, 0], sy))
        yaw = np.degrees(np.arctan2(rotation_matrix[1, 0], rotation_matrix[0, 0]))
        roll = np.degrees(np.arctan2(rotation_matrix[2, 1], rotation_matrix[2, 2]))
        return yaw, pitch, roll
    except Exception:
        return 0.0, 0.0, 0.0


def _eye_aspect_ratio(landmarks: np.ndarray, indices: Iterable[int]) -> float:
    pts = np.array([landmarks[i][:2] for i in indices], dtype=np.float64)
    vertical = np.linalg.norm(pts[1] - pts[5]) + np.linalg.norm(pts[2] - pts[4])
    horizontal = np.linalg.norm(pts[0] - pts[3]) * 2.0
    if horizontal == 0:
        return 0.0
    return vertical / horizontal