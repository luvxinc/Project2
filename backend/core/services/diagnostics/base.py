# File: backend/core/services/diagnostics/base.py
"""
# ==============================================================================
# 模块名称: 诊断专家基类 (Diagnostic Interface)
# ==============================================================================
#
# [Purpose / 用途]
# 定义所有诊断服务必须遵守的接口规范 (Strategy Pattern)。
#
# [Architecture / 架构]
# - Layer: Domain Service (Diagnostics)
# - Pattern: Strategy (ABC)
#
# ==============================================================================
"""

from abc import ABC, abstractmethod
import pandas as pd
from typing import Dict, Any

class BaseDiagnostician(ABC):
    """
    [接口定义] 诊断专家基类
    """

    def __init__(self, metrics_cur: Dict[str, Any], metrics_prev: Dict[str, Any], **kwargs):
        """
        Args:
            metrics_cur: 本期财务指标字典 (Key -> Metrics Dict)
            metrics_prev: 上期财务指标字典 (用于环比分析)
            kwargs: 扩展参数 (如库存映射表)
        """
        self.m_cur = metrics_cur
        self.m_prev = metrics_prev
        self.kwargs = kwargs

    @abstractmethod
    def diagnose(self) -> pd.DataFrame:
        """
        [核心] 执行诊断计算
        Returns: 包含 [Key, 诊断标签, AI运营建议, ...] 的 DataFrame
        """
        pass

    @staticmethod
    @abstractmethod
    def get_tag_definitions() -> list:
        """
        [文档] 返回标签的详细业务定义说明
        用于在报表底部生成 "Explainable AI" 说明区。
        """
        pass