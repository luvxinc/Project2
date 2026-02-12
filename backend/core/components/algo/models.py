# core/components/algo/models.py
"""
文件说明: 核心算法模型库 (Algorithm Models)
主要功能:
1. 实现多种时间序列预测算法 (XGBoost, SARIMA, ETS, Croston)。
2. 封装复杂的特征工程 (Feature Engineering)。
3. 提供优雅降级机制 (Try-Import)，确保缺库时不崩溃。
"""

import pandas as pd
import numpy as np
import warnings
from .base import BaseForecaster

warnings.filterwarnings("ignore")


# =========================================================
# 1. 机器学习模型 (XGBoost)
# =========================================================
class XGBoostForecaster(BaseForecaster):
    """
    XGBoost 回归预测
    特性: 自动构建滞后特征(Lags)和滚动特征(Rolling Window)。
    """

    def __init__(self):
        super().__init__("XGBoost")
        try:
            from xgboost import XGBRegressor
            self.model_cls = XGBRegressor
            self.available = True
        except ImportError:
            self.available = False

    def fit_predict(self, series: pd.Series, periods: int = 1) -> float:
        if not self.available or len(series) < 12: return -1.0

        # 特征工程
        df = pd.DataFrame({'y': series.values})

        # Lags
        for i in [1, 2, 3, 6, 12]:
            if len(df) > i: df[f'lag_{i}'] = df['y'].shift(i)

        # Rolling
        df['roll_mean_3'] = df['y'].shift(1).rolling(window=3).mean()

        # Calendar (Simple index based)
        months = np.arange(len(df)) % 12 + 1
        df['month'] = months

        df = df.dropna()
        if df.empty: return -1.0

        X = df.drop(columns=['y'])
        y = df['y']

        try:
            model = self.model_cls(n_estimators=100, max_depth=3, n_jobs=1, verbosity=0)
            model.fit(X, y)

            # 构造下一期特征 (简化逻辑: 取最后一行作为基础)
            last_row = X.iloc[-1].copy()

            # 更新 Lag 特征
            last_val = series.iloc[-1]
            if 'lag_1' in last_row: last_row['lag_1'] = last_val

            # 预测
            pred = model.predict(pd.DataFrame([last_row]))[0]
            return max(0.0, float(pred))
        except:
            return -1.0


# =========================================================
# 2. 统计学模型 (Statsmodels)
# =========================================================
class StatsModelForecaster(BaseForecaster):
    def __init__(self, name):
        super().__init__(name)
        try:
            import statsmodels.api as sm
            self.available = True
        except ImportError:
            self.available = False


class SarimaForecaster(StatsModelForecaster):
    def __init__(self):
        super().__init__("SARIMA")

    def fit_predict(self, series: pd.Series, periods: int = 1) -> float:
        if not self.available or len(series) < 6: return -1.0
        try:
            from statsmodels.tsa.statespace.sarimax import SARIMAX
            # 简单参数 (1,1,1)，生产环境应使用 auto_arima
            model = SARIMAX(series, order=(1, 1, 1), enforce_stationarity=False, enforce_invertibility=False)
            res = model.fit(disp=False)
            return max(0.0, float(res.forecast(periods).iloc[-1]))
        except:
            return -1.0


class ETSForecaster(StatsModelForecaster):
    def __init__(self):
        super().__init__("ETS")

    def fit_predict(self, series: pd.Series, periods: int = 1) -> float:
        if not self.available or len(series) < 6: return -1.0
        try:
            from statsmodels.tsa.exponential_smoothing.ets import ETSModel
            model = ETSModel(series, error="add", trend="add")
            res = model.fit(disp=False)
            return max(0.0, float(res.forecast(periods).iloc[-1]))
        except:
            return -1.0


class HoltWintersForecaster(StatsModelForecaster):
    def __init__(self):
        super().__init__("HoltWinters")

    def fit_predict(self, series: pd.Series, periods: int = 1) -> float:
        if not self.available or len(series) < 12: return -1.0
        try:
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            model = ExponentialSmoothing(series, trend="add", seasonal="add", seasonal_periods=12)
            res = model.fit()
            return max(0.0, float(res.forecast(periods).iloc[-1]))
        except:
            return -1.0


# =========================================================
# 3. 启发式模型 (Heuristic)
# =========================================================
class WeightedCycleForecaster(BaseForecaster):
    """加权移动平均 (兜底方案)"""

    def __init__(self):
        super().__init__("WeightedCycle")

    def fit_predict(self, series: pd.Series, periods: int = 1) -> float:
        if len(series) == 0: return 0.0
        if len(series) < 3: return float(series.mean())
        # 3个月加权: 50%, 30%, 20%
        val = (series.iloc[-1] * 0.5 + series.iloc[-2] * 0.3 + series.iloc[-3] * 0.2)
        return max(0.0, float(val))


class CrostonForecaster(BaseForecaster):
    """间歇性需求预测 (适合长尾/断续出单的 SKU)"""

    def __init__(self):
        super().__init__("Croston")

    def fit_predict(self, series: pd.Series, periods: int = 1) -> float:
        y = series.values
        if np.count_nonzero(y) < 2: return float(np.mean(y)) if len(y) > 0 else 0.0

        alpha = 0.3
        demand = y[np.argmax(y > 0)]
        interval = 1.0
        last_idx = np.argmax(y > 0)

        for i in range(last_idx + 1, len(y)):
            if y[i] > 0:
                current_int = i - last_idx
                demand = alpha * y[i] + (1 - alpha) * demand
                interval = alpha * current_int + (1 - alpha) * interval
                last_idx = i

        if interval == 0: return 0.0
        return max(0.0, float(demand / interval))