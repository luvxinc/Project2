# core/services/crm.py
"""
文件说明: 客户关系管理业务服务 (CRM Service)
主要功能:
1. 加载过去 365 天的历史交易数据。
2. 计算 RFM 模型 (Recency, Frequency, Monetary)。
3. 调用 CustomerDiagnostician 进行分层诊断。
4. **关键修复**: 强制数值类型转换，防止 'float'+'str' 报错。
"""

import pandas as pd
import numpy as np
from datetime import timedelta
from core.services.finance.base import ProfitAnalyzerBase
from core.repository.transaction_repo import TransactionRepository
from core.services.diagnostics.crm import CustomerDiagnostician


class CustomerAnalyzer(ProfitAnalyzerBase):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trans_repo = TransactionRepository()

    def _calculate_rfm_1y(self, df_full: pd.DataFrame) -> pd.DataFrame:
        """
        [核心逻辑] 基于过去 1 年的数据计算 RFM
        """
        if df_full.empty: return pd.DataFrame()

        # 1. 时间窗口
        # end_date 在基类中已经是 date 对象，需转为 timestamp 以便计算
        analysis_end_dt = pd.to_datetime(self.end_date)
        one_year_ago = analysis_end_dt - timedelta(days=365)

        # 2. 筛选
        # 确保 order date 也是 timestamp
        df_full["order date"] = pd.to_datetime(df_full["order date"])
        df_1y = df_full[df_full["order date"] >= one_year_ago].copy()

        if df_1y.empty:
            return pd.DataFrame()

        # 3. 数据清洗与预计算
        bad_actions = ['CA', 'RE', 'CR', 'CC', 'PD']
        dispute_actions = ['CC', 'PD']

        # [关键修复] 强制数值转换，防止字符串拼接错误
        for col in ['revenue', 'Refund']:
            # 将非数值转为 NaN，然后填 0
            df_1y[col] = pd.to_numeric(df_1y[col], errors='coerce').fillna(0.0)

        df_1y['is_bad'] = df_1y['action'].isin(bad_actions).astype(int)
        df_1y['is_dispute'] = df_1y['action'].isin(dispute_actions).astype(int)

        # 4. 聚合计算 RFM
        # 注意: 这里的 sum 是数值加法，因为上面已经强制转换了
        rfm = df_1y.groupby("buyer username").agg({
            "order number": "nunique",  # Frequency
            "revenue": "sum",  # Gross Monetary
            "Refund": "sum",  # Refund Amount (注意：数据库里通常是负数或正数，需确认)
            "order date": "max",  # LastDate
            "is_bad": "sum",
            "is_dispute": "sum"
        }).rename(columns={
            "order number": "Frequency",
            "revenue": "Gross_Monetary",
            "order date": "LastDate",
            "is_bad": "BadCount",
            "is_dispute": "DisputeCount"
        })

        # 5. 计算高阶指标
        # 假设 Refund 在数据库里是负数 (Clean Log 的标准)。
        # 如果是正数代表退款额，则应该减去。
        # 稳妥起见，我们假设 Net = Gross + Refund (如果Refund是负的)
        # 根据 V1.5.3 逻辑，Refund 是负值。
        rfm["Net_Monetary"] = rfm["Gross_Monetary"] + rfm["Refund"]

        rfm["Recency"] = (analysis_end_dt - rfm["LastDate"]).dt.days

        # 避免除以0
        rfm["AOV"] = rfm.apply(lambda x: x["Net_Monetary"] / x["Frequency"] if x["Frequency"] > 0 else 0, axis=1)

        total_lines = df_1y.groupby("buyer username").size()
        rfm["Total_Lines"] = total_lines
        rfm["ReturnRate"] = (rfm["BadCount"] / rfm["Total_Lines"]).fillna(0)

        return rfm.reset_index()

    def run(self):
        self.log(f"🚀 启动 R-F-P-L-D 客户聚类分析...")

        # 1. 加载全量数据 (为了计算 RFM，需要更长的时间窗口，比如1年)
        self.log("加载过去一年 (365天) 交易数据...")

        end_dt = pd.to_datetime(self.end_date)
        start_dt = end_dt - timedelta(days=365)

        # 调用 repo 获取
        df_raw = self.trans_repo.get_transactions_by_date(start_dt.date(), end_dt.date())

        if df_raw.empty:
            self.log("⚠️ 过去一年无交易数据")
            return

        # 2. 计算 RFM
        self.log("正在计算动态净值 RFM 模型...")
        df_rfm = self._calculate_rfm_1y(df_raw)

        if df_rfm.empty:
            self.log("⚠️ 计算后无有效客户数据")
            return

        # 3. 诊断
        self.log("正在执行客户分层 (基于净值与风险)...")
        # 传入 DataFrame
        diagnostician = CustomerDiagnostician(metrics_cur=df_rfm, metrics_prev=None)
        df_final = diagnostician.diagnose()

        if df_final.empty:
            self.log("⚠️ 未发现特征显著的客户")
            return

        df_final = df_final.sort_values("净消费额(Net LTV)", ascending=False)

        # 4. 保存
        filename = f"Analysis_Customer_RFM_{self.file_suffix}.csv"
        footer = diagnostician.get_tag_definitions()

        self.save_csv(df_final, filename, footer)