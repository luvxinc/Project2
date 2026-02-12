# core/components/algo/base.py
"""
文件说明: 算法模型基类 (Algorithm Base Class)
主要功能:
1. 定义时间序列预测模型的统一接口 (BaseForecaster)。
2. 提供通用的数据预处理方法 (缺失值填充、类型转换)。
"""

from abc import ABC, abstractmethod
import pandas as pd
import numpy as np

class BaseForecaster(ABC):
    """
    [算法基类] 时间序列预测模型接口
    """
    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def fit_predict(self, series: pd.Series, periods: int = 1) -> float:
        """
        [核心契约] 训练并预测未来 N 期
        Args:
            series: 历史数据序列 (pandas Series)
            periods: 预测步长 (默认为 1)
        Returns:
            float: 预测值 (必须非负)
        """
        pass

    def preprocess(self, series: pd.Series) -> pd.Series:
        """通用预处理"""
        return pd.to_numeric(series, errors='coerce').fillna(0)