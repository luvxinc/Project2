# core/services/prediction.py
"""
企业级销量预测引擎 (Enterprise Demand Forecasting)
针对电商 SKU 特点优化:
1. 分层预测策略 (新品/间歇性/低销量/高销量)
2. 智能算法选择 (不强制使用不适合的复杂模型)
3. 合理的兜底机制 (确保不返回不合理的 0)
4. 预测置信度评估
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import tqdm
from collections import defaultdict
from typing import Dict, Any, Tuple

from core.services.finance.base import ProfitAnalyzerBase
from core.repository.transaction_repo import TransactionRepository
from core.repository.sku_repo import SkuRepository
from backend.common.settings import settings


class PredictionService(ProfitAnalyzerBase):
    """
    电商销量预测服务
    分层策略:
    - 新品 (< 3月数据): 平均销量 × 成长因子
    - 间歇性 (覆盖率 < 50%): Croston 方法
    - 低销量稳定 (月均 ≤ 50): 加权移动平均
    - 高销量稳定 (月均 > 50): 趋势 + 季节性
    """

    # 预测方法权重配置
    RECENT_WEIGHT = 0.6  # 近期权重 (最近3个月)
    OLDER_WEIGHT = 0.4   # 远期权重 (4-6个月前)
    
    # 季节性月份权重 (基于电商一般规律，可根据实际调整)
    SEASONAL_FACTORS = {
        1: 0.85,   # 1月: 春节前后低
        2: 0.80,   # 2月: 春节
        3: 0.95,   # 3月: 恢复
        4: 1.00,   # 4月: 正常
        5: 1.00,   # 5月: 正常
        6: 0.95,   # 6月: 夏季开始
        7: 0.90,   # 7月: 夏季淡季
        8: 0.90,   # 8月: 夏季淡季
        9: 1.05,   # 9月: 返校季
        10: 1.10,  # 10月: Q4开始
        11: 1.20,  # 11月: 黑五/双11
        12: 1.15,  # 12月: 圣诞
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trans_repo = TransactionRepository()
        self.sku_repo = SkuRepository()

    def _get_loss_rate(self, action: str) -> float:
        """计算订单损耗率 (退货/取消等)"""
        action = str(action).strip().upper()
        R = settings.LOSS_RATES
        if action == 'CA': return 1.0
        if action == 'RE': return R.get('RETURN', 0.3)
        if action == 'CC': return R.get('CASE', 0.6)
        if action == 'CR': return R.get('REQUEST', 0.5)
        if action == 'PD': return R.get('DISPUTE', 1.0)
        return 0.0

    def _aggregate_monthly_sales(self) -> pd.DataFrame:
        """聚合历史月销量数据"""
        end_dt = datetime.now().replace(day=1) - timedelta(days=1)
        start_dt = end_dt - relativedelta(months=24)

        self.log(f"📥 正在加载训练数据: {start_dt.date()} -> {end_dt.date()}")
        df_raw = self.trans_repo.get_transactions_by_date(start_dt.date(), end_dt.date())

        if df_raw.empty:
            self.log("⚠️ 警告: 指定范围内无交易数据。")
            return pd.DataFrame()

        self.log(f"📊 原始记录加载完成: {len(df_raw)} 条，开始聚合处理...")
        monthly_data = defaultdict(lambda: defaultdict(int))
        records = df_raw.to_dict('records')

        # 特殊 SKU 映射 (组合品)
        SPECIAL_SOURCE_SKUS = {"NU1C8E51C", "NU1C8E51K"}
        SPECIAL_TARGET_SKU = "NU1C8SKT7"

        for row in tqdm.tqdm(records, desc="聚合销量数据"):
            date_val = row.get("order date")
            if pd.isna(date_val): continue
            month_key = date_val.strftime("%Y-%m")

            action = row.get("action", "")
            loss_rate = self._get_loss_rate(action)
            if loss_rate >= 1.0: continue
            effective_ratio = 1.0 - loss_rate

            try:
                base_qty = int(float(row.get("quantity", 0)))
            except:
                base_qty = 0
            if base_qty <= 0: continue

            for i in range(1, 21):
                s_key = f"sku{i}"
                q_key = f"qty{i}"
                if s_key not in row: break
                raw_sku = str(row.get(s_key))
                if not raw_sku or raw_sku.lower() in ['nan', 'none', '', '0']: continue

                sku = raw_sku.strip().upper()
                try:
                    per_qty = float(row.get(q_key, 0))
                except:
                    per_qty = 0
                if per_qty <= 0: continue

                net_qty = base_qty * per_qty * effective_ratio
                monthly_data[sku][month_key] += int(net_qty)

                if sku in SPECIAL_SOURCE_SKUS:
                    special_qty = base_qty * 2 * effective_ratio
                    monthly_data[SPECIAL_TARGET_SKU][month_key] += int(special_qty)

        if not monthly_data: return pd.DataFrame()
        df = pd.DataFrame.from_dict(monthly_data, orient='index').fillna(0)
        df = df[sorted(df.columns)]
        return df

    def _classify_sku(self, series: pd.Series, total_months: int) -> Tuple[str, Dict]:
        """
        SKU 分类
        Returns: (category, stats)
        - category: 'new' / 'intermittent' / 'low_stable' / 'high_stable'
        """
        values = series.values
        months_with_sales = np.count_nonzero(values)
        coverage = months_with_sales / total_months if total_months > 0 else 0
        avg_monthly = np.mean(values) if len(values) > 0 else 0
        std_monthly = np.std(values) if len(values) > 1 else 0
        
        stats = {
            'months_with_sales': months_with_sales,
            'coverage': round(coverage, 2),
            'avg_monthly': round(avg_monthly, 1),
            'std_monthly': round(std_monthly, 1),
            'cv': round(std_monthly / avg_monthly, 2) if avg_monthly > 0 else 0
        }
        
        if months_with_sales < 3:
            return 'new', stats
        elif coverage < 0.5:
            return 'intermittent', stats
        elif avg_monthly <= 50:
            return 'low_stable', stats
        else:
            return 'high_stable', stats

    def _forecast_new_product(self, series: pd.Series, stats: Dict) -> Tuple[float, str]:
        """
        新品预测: 保守策略
        - 使用有销售月份的平均值
        - 不假设增长（因为实际新品表现不稳定）
        """
        values = series[series > 0].values
        if len(values) == 0:
            return 0.0, "无销售记录"
        
        # 保守预测：直接使用有销量月份的平均值
        avg = np.mean(values)
        
        # 如果只有1-2个月数据，略微下调预期（新品波动大）
        if len(values) == 1:
            forecast = avg * 0.9
            method = "新品-单月×0.9"
        elif len(values) == 2:
            # 取两个月的加权平均，近期权重稍高
            forecast = values[-1] * 0.6 + values[0] * 0.4
            method = "新品-双月加权"
        else:
            forecast = avg
            method = "新品-均值"
        
        return round(forecast, 1), method

    def _forecast_intermittent(self, series: pd.Series, stats: Dict) -> Tuple[float, str]:
        """间歇性需求预测: Croston 方法"""
        y = series.values
        non_zero_count = np.count_nonzero(y)
        
        if non_zero_count < 2:
            return round(np.mean(y), 1), "间歇性-均值回退"
        
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

        if interval == 0:
            return round(np.mean(y[y > 0]), 1), "间歇性-非零均值"
        
        forecast = demand / interval
        return round(forecast, 1), "Croston方法"

    def _forecast_low_stable(self, series: pd.Series, stats: Dict) -> Tuple[float, str]:
        """低销量稳定预测: 加权移动平均"""
        values = series.values
        n = len(values)
        
        if n < 3:
            return round(np.mean(values), 1), "均值回退"
        
        # 最近3个月 vs 更早3个月
        recent = values[-3:] if n >= 3 else values
        older = values[-6:-3] if n >= 6 else values[:max(1, n-3)]
        
        recent_avg = np.mean(recent)
        older_avg = np.mean(older) if len(older) > 0 else recent_avg
        
        # 加权平均
        forecast = recent_avg * self.RECENT_WEIGHT + older_avg * self.OLDER_WEIGHT
        
        # 趋势修正: 如果近期明显上升/下降
        if recent_avg > older_avg * 1.2:
            forecast *= 1.05  # 上升趋势
            method = "加权均值+上升趋势"
        elif recent_avg < older_avg * 0.8:
            forecast *= 0.95  # 下降趋势
            method = "加权均值+下降趋势"
        else:
            method = "加权移动平均"
        
        return round(forecast, 1), method

    def _forecast_high_stable(self, series: pd.Series, stats: Dict) -> Tuple[float, str]:
        """高销量稳定预测: 趋势 + 季节性"""
        values = series.values
        n = len(values)
        
        if n < 6:
            return self._forecast_low_stable(series, stats)
        
        # 计算趋势 (简单线性)
        x = np.arange(n)
        slope, intercept = np.polyfit(x, values, 1)
        
        # 趋势预测
        trend_forecast = intercept + slope * n
        
        # 季节性调整 (下个月)
        next_month = (datetime.now().month % 12) + 1
        seasonal_factor = self.SEASONAL_FACTORS.get(next_month, 1.0)
        
        # 组合预测
        recent_avg = np.mean(values[-3:])
        
        # 混合: 50% 趋势 + 50% 近期均值，再调整季节性
        base_forecast = (trend_forecast * 0.5 + recent_avg * 0.5)
        forecast = base_forecast * seasonal_factor
        
        # 确保不为负
        forecast = max(forecast, recent_avg * 0.5)
        
        trend_dir = "↑" if slope > 0 else "↓" if slope < 0 else "→"
        method = f"趋势{trend_dir}+季节×{seasonal_factor}"
        
        return round(forecast, 1), method

    def _evaluate_accuracy(self, series: pd.Series, forecast_method: str) -> float:
        """评估预测准确度 (基于历史回测)"""
        values = series.values
        if len(values) < 4:
            return 50.0  # 数据不足，给中等评分
        
        # 使用最后3个月做验证
        train = values[:-3]
        test = values[-3:]
        
        if len(train) < 3:
            return 50.0
        
        # 简单回测: 用训练集的加权平均预测测试集
        pred = np.mean(train[-3:]) * self.RECENT_WEIGHT + np.mean(train[:-3]) * self.OLDER_WEIGHT if len(train) > 3 else np.mean(train)
        
        # 计算 WMAPE
        actual_sum = np.sum(np.abs(test))
        error_sum = np.sum(np.abs(test - pred))
        
        if actual_sum == 0:
            return 100.0 if error_sum < 1 else 0.0
        
        wmape = error_sum / actual_sum
        accuracy = max(0, min(100, (1 - wmape) * 100))
        
        return round(accuracy, 1)

    def run(self):
        self.log("🚀 启动企业级销量预测引擎...")

        # 1. 获取数据
        df_matrix = self._aggregate_monthly_sales()

        # 输出列定义
        output_cols = [
            "SKU", "预测值", "预测方法", "置信度",
            "SKU类型", "月均销量", "销售覆盖率", "波动系数",
            "近3月均值", "前3月均值", "趋势"
        ]

        results = []

        if not df_matrix.empty:
            total_months = len(df_matrix.columns)
            self.log(f"📊 数据范围: {total_months} 个月, {len(df_matrix)} 个 SKU")
            
            for sku, row in tqdm.tqdm(df_matrix.iterrows(), total=len(df_matrix), desc="智能预测中"):
                series = row
                
                # 分类
                category, stats = self._classify_sku(series, total_months)
                
                # 根据类型选择预测方法
                if category == 'new':
                    forecast, method = self._forecast_new_product(series, stats)
                elif category == 'intermittent':
                    forecast, method = self._forecast_intermittent(series, stats)
                elif category == 'low_stable':
                    forecast, method = self._forecast_low_stable(series, stats)
                else:  # high_stable
                    forecast, method = self._forecast_high_stable(series, stats)
                
                # 评估置信度
                confidence = self._evaluate_accuracy(series, method)
                
                # 计算趋势
                values = series.values
                recent_3 = np.mean(values[-3:]) if len(values) >= 3 else np.mean(values)
                older_3 = np.mean(values[-6:-3]) if len(values) >= 6 else np.mean(values[:max(1, len(values)-3)])
                
                if recent_3 > older_3 * 1.1:
                    trend = "📈 上升"
                elif recent_3 < older_3 * 0.9:
                    trend = "📉 下降"
                else:
                    trend = "➡️ 稳定"
                
                # 组装结果
                record = {
                    "SKU": sku,
                    "预测值": forecast,
                    "预测方法": method,
                    "置信度": confidence,
                    "SKU类型": category,
                    "月均销量": stats['avg_monthly'],
                    "销售覆盖率": f"{stats['coverage']*100:.0f}%",
                    "波动系数": stats['cv'],
                    "近3月均值": round(recent_3, 1),
                    "前3月均值": round(older_3, 1),
                    "趋势": trend
                }
                results.append(record)

        # 生成结果
        df_res = pd.DataFrame(results) if results else pd.DataFrame(columns=output_cols)
        
        # 按预测值排序
        if not df_res.empty:
            df_res = df_res.sort_values("预测值", ascending=False)
        
        # 统计
        zero_count = len(df_res[df_res["预测值"] == 0]) if not df_res.empty else 0
        avg_confidence = df_res["置信度"].mean() if not df_res.empty else 0

        footer = [
            "📘 企业级预测引擎说明:",
            "1. 分层策略: 新品/间歇性/低销量稳定/高销量稳定",
            "2. 算法选择: 根据SKU特性自动选择最适合的方法",
            "3. 季节性: 内置电商月度季节因子",
            f"4. 预测为0的SKU: {zero_count} 个",
            f"5. 平均置信度: {avg_confidence:.1f}%",
            f"6. 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        ]

        # 同时生成旧格式兼容文件 (供 OrderingService 使用)
        if not df_res.empty:
            df_compat = df_res[["SKU", "预测值"]].copy()
            df_compat.columns = ["SKU", "BestForecast"]
            df_compat["Best_Algo"] = df_res["预测方法"]
            self.save_csv(df_compat, "Estimated_Monthly_SKU.csv", footer)
        
        # 保存详细报告
        filename = f"Demand_Forecast_Detail_{self.file_suffix}.csv"
        self.save_csv(df_res, filename, footer)
        
        self.log(f"✅ 预测完成: {len(df_res)} 个 SKU, 平均置信度 {avg_confidence:.1f}%")