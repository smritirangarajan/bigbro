"""Compatibility shim for legacy imports.

The project now exposes its functionality via the ``attention_monitor`` package.
Import the pipeline or configuration classes from this module to maintain
backwards compatibility with earlier prototypes.
"""

from attention_monitor.config import PipelineConfig
from attention_monitor.pipeline import AttentionMonitorPipeline

__all__ = ["PipelineConfig", "AttentionMonitorPipeline"]