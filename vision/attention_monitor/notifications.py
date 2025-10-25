from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Optional

from .config import PipelineConfig

logger = logging.getLogger(__name__)


class NotificationClient:
    """Placeholder client that demonstrates where API calls would occur."""

    def __init__(self, api_key: Optional[str]) -> None:
        self._api_key = api_key

    def send_notification(self, state: str, **metadata: Any) -> None:
        if not self._api_key:
            # No API key provided; skip sending but show where the call would be.
            logger.debug("Notification skipped for state=%s; no API key configured.", state)
            return

        # In a production scenario this would POST to an external service.
        logger.info(
            "[notification] Would send '%s' update with payload=%s (api_key=***%s)",
            state,
            metadata,
            self._api_key[-4:],
        )

    def send_intervention(self, recent_states: Iterable[str], **metadata: Any) -> None:
        if not self._api_key:
            logger.debug("Intervention skipped; no API key configured.")
            return

        logger.warning(
            "[notification] Would trigger intervention for states=%s payload=%s (api_key=***%s)",
            list(recent_states),
            metadata,
            self._api_key[-4:],
        )


def send_notification(state: str, metadata: Dict[str, Any], config: PipelineConfig) -> None:
    """Helper wrapper for compatibility with functional call sites."""

    client = NotificationClient(config.notification_api_key)
    client.send_notification(state, **metadata)
