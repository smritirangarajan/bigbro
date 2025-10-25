"""
Prototype attention monitor using MediaPipe FaceMesh and a Logitech webcam.

This script samples a low-resolution frame every few seconds, estimates head pose,
computes an eye-closure metric, and classifies a coarse attention state.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from dataclasses import dataclass
from typing import Iterable, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np


# Hint MediaPipe to use Metal Performance Shaders when running on Apple Silicon.
os.environ.setdefault("MEDIAPIPE_USE_MPS", "1")


FRAME_WIDTH = 640
FRAME_HEIGHT = 360
FRAME_PROCESS_INTERVAL = 3.0  # seconds between processed frames
MAX_CONSECUTIVE_CLOSED = 3
EAR_THRESHOLD = 0.2
YAW_THRESHOLD = 25.0
PITCH_THRESHOLD = 25.0


# Landmarks selected for pose estimation and eye aspect ratio (FaceMesh topology).
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


@dataclass
class FrameAnalysis:
	face_present: bool
	yaw: float = 0.0
	pitch: float = 0.0
	roll: float = 0.0
	ear_left: float = 0.0
	ear_right: float = 0.0


def get_frame(cap: cv2.VideoCapture) -> Optional[np.ndarray]:
	"""Capture and resize a frame; returns None if capture fails."""

	ret, frame = cap.read()
	if not ret or frame is None:
		return None

	resized = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT), interpolation=cv2.INTER_AREA)
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
	# EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
	vertical = np.linalg.norm(pts[1] - pts[5]) + np.linalg.norm(pts[2] - pts[4])
	horizontal = np.linalg.norm(pts[0] - pts[3]) * 2.0
	if horizontal == 0:
		return 0.0
	return vertical / horizontal


def analyze_frame(frame: np.ndarray, face_mesh: mp.solutions.face_mesh.FaceMesh) -> FrameAnalysis:
	"""Run FaceMesh on the frame and return pose and EAR metrics."""

	rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
	results = face_mesh.process(rgb)
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


def classify_attention_state(
	analysis: FrameAnalysis,
	closed_frames: int,
) -> Tuple[str, int]:
	"""Apply heuristic thresholds to derive an attention label."""

	if not analysis.face_present:
		return "not present", 0

	if abs(analysis.yaw) > YAW_THRESHOLD or abs(analysis.pitch) > PITCH_THRESHOLD:
		return "looking away", 0

	avg_ear = (analysis.ear_left + analysis.ear_right) / 2.0
	if avg_ear < EAR_THRESHOLD:
		closed_frames += 1
	else:
		closed_frames = 0

	if closed_frames > MAX_CONSECUTIVE_CLOSED:
		return "sleeping", closed_frames

	return "attentive", closed_frames


async def main_loop() -> None:
	"""Main async loop that throttles processing to limit compute load."""

	# Import voice alert modules
	from fish_audio_config import generate_voice_alert, play_audio, SLEEP_ALERT_MESSAGES
	import random

	cap = cv2.VideoCapture(0)
	if not cap.isOpened():
		print("Could not open webcam. Ensure the Logitech camera is connected.", file=sys.stderr)
		return

	cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
	cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

	face_mesh = mp.solutions.face_mesh.FaceMesh(
		static_image_mode=False,
		max_num_faces=1,
		refine_landmarks=True,
		min_detection_confidence=0.5,
		min_tracking_confidence=0.5,
	)

	print("Starting attention monitor. Press 'q' in the video window to exit.")

	closed_frames = 0
	last_logged_state: Optional[str] = None
	sleep_alert_cooldown = 0  # Track when last alert was played

	try:
		while True:
			frame = get_frame(cap)
			if frame is None:
				print("Frame capture failed; retrying...", file=sys.stderr)
				await asyncio.sleep(FRAME_PROCESS_INTERVAL)
				continue

			analysis = analyze_frame(frame, face_mesh)
			state, closed_frames = classify_attention_state(analysis, closed_frames)

			if state != last_logged_state:
				timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
				print(f"[{timestamp}] attention_state={state} yaw={analysis.yaw:.1f} pitch={analysis.pitch:.1f}")
				
				# Play voice alert when user is detected as sleeping
				if state == "sleeping" and sleep_alert_cooldown == 0:
					message = random.choice(SLEEP_ALERT_MESSAGES)
					print(f"🔊 Playing voice alert: {message}")
					
					# Generate and play audio in background task
					audio_data = await generate_voice_alert(message)
					if audio_data:
						# Play audio in a separate task to not block
						asyncio.create_task(asyncio.to_thread(play_audio, audio_data))
					
					# Set cooldown to avoid spam (30 seconds)
					sleep_alert_cooldown = 10  # 10 checks * 3 seconds = 30 seconds
				
				last_logged_state = state
			
			# Decrement cooldown
			if sleep_alert_cooldown > 0:
				sleep_alert_cooldown -= 1

			cv2.imshow("Attention Monitor", frame)
			if cv2.waitKey(1) & 0xFF == ord("q"):
				break

			await asyncio.sleep(FRAME_PROCESS_INTERVAL)
	finally:
		cap.release()
		face_mesh.close()
		cv2.destroyAllWindows()


def example_log_hook(state: str, timestamp: float) -> None:
	"""Illustrative logging hook; integrate with a productivity app here."""

	# Replace print with structured logging or database writes as needed.
	print(f"LOG {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(timestamp))}: {state}")


if __name__ == "__main__":
	try:
		asyncio.run(main_loop())
	except KeyboardInterrupt:
		print("Interrupted by user.")
