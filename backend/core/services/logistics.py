# core/services/logistics.py
import os
import pandas as pd
from collections import defaultdict
import tqdm
from core.services.finance.base import ProfitAnalyzerBase
from core.services.diagnostics.logistics import LogisticsDiagnostician
from core.repository.transaction_repo import TransactionRepository
from core.sys.context import get_current_user
from backend.common.settings import settings


class ShippingAnalyzer(ProfitAnalyzerBase):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trans_repo = TransactionRepository()
        self.df_curr = pd.DataFrame()
        self.df_prev = pd.DataFrame()

    def run(self):
        self.log(f"🚀 开始物流分析: {self.start_date} -> {self.end_date}")

        self.df_curr = self.trans_repo.get_transactions_by_date(self.start_date, self.end_date)

        delta = self.end_date - self.start_date
        prev_end = self.start_date - pd.Timedelta(days=1)
        prev_start = prev_end - delta
        self.df_prev = self.trans_repo.get_transactions_by_date(prev_start, prev_end)

        # [Fix] 即使无数据，也生成空表
        if self.df_curr.empty:
            self.log("⚠️ 本期无数据，生成空物流报表。")
            df3_curr = pd.DataFrame(columns=["Combo", "原始邮费", "超支邮费", "邮费罚款", "总订单数"])
            df3_prev = pd.DataFrame()
        else:
            df3_curr = self._compute_df3(self.df_curr)
            df3_prev = self._compute_df3(self.df_prev)

        t1 = self._table1(df3_curr, df3_prev)
        t2 = self._table2(self.df_curr, self.df_prev)
        t3 = df3_curr
        t4 = self._table4(df3_curr)
        t5 = self._table5(df3_curr)

        diag = LogisticsDiagnostician(metrics_cur=df3_curr, metrics_prev=None)
        df_diag = diag.diagnose()

        self._save_suite([t1, t2, t3, t4, t5, df_diag], diag.get_tag_definitions())
        self.log(f" 物流报表已生成: Analysis_Shipping_{self.file_suffix}.csv")

    def _compute_df3(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty: return pd.DataFrame()
        order_meta = df.groupby("order number")["full sku"].first()
        combo_map = order_meta.fillna("Unknown").to_dict()

        cols = ["Shipping label-Earning data", "Shipping label-underpay", "Shipping label-overpay",
                "Shipping label-Return"]
        for c in cols:
            if c not in df.columns: df[c] = 0.0

        df_grouped = df.groupby("order number")[cols].sum()
        money = {}
        orders_by_combo = defaultdict(set)

        for order_num, row in df_grouped.iterrows():
            combo = combo_map.get(order_num, "Unknown")
            if combo not in money:
                money[combo] = {"原始邮费": 0.0, "超支邮费": 0.0, "邮费罚款": 0.0, "包邮退货邮费": 0.0}
            rec = money[combo]
            current_total = row["Shipping label-Earning data"] + row["Shipping label-underpay"] + row[
                "Shipping label-overpay"]
            rec["原始邮费"] += current_total
            rec["超支邮费"] += row["Shipping label-overpay"]
            rec["邮费罚款"] += row["Shipping label-underpay"]
            rec["包邮退货邮费"] += row["Shipping label-Return"]
            orders_by_combo[combo].add(order_num)

        over_set = set(df_grouped[df_grouped["Shipping label-overpay"] > 0.001].index)
        penal_set = set(df_grouped[df_grouped["Shipping label-underpay"].abs() > 0.001].index)
        ret_set = set(df_grouped[df_grouped["Shipping label-Return"] > 0.001].index)

        rows = []
        for combo, vals in money.items():
            ords = orders_by_combo[combo]
            rows.append({
                "Combo": combo,
                "原始邮费": round(vals["原始邮费"], 5),
                "超支邮费": round(vals["超支邮费"], 5),
                "邮费罚款": round(vals["邮费罚款"], 5),
                "包邮退货邮费": round(vals["包邮退货邮费"], 5),
                "原始单数": len(ords),
                "超支单数": len(ords & over_set),
                "罚款单数": len(ords & penal_set),
                "包邮退货单数": len(ords & ret_set),
            })

        if not rows: return pd.DataFrame()
        df3 = pd.DataFrame(rows).sort_values("原始邮费", ascending=False)
        df3["罚款比例"] = (df3["邮费罚款"] / df3["原始邮费"]).fillna(0).apply(lambda x: f"{x:.2%}")
        df3["罚款单数比例"] = (df3["罚款单数"] / df3["原始单数"]).fillna(0).apply(lambda x: f"{x:.2%}")
        df3["总订单数"] = df3["原始单数"]

        cols_order = ["Combo", "原始邮费", "超支邮费", "邮费罚款", "包邮退货邮费", "原始单数", "超支单数", "罚款单数",
                      "包邮退货单数", "罚款比例", "罚款单数比例", "总订单数"]
        for c in cols_order:
            if c not in df3.columns: df3[c] = 0
        return df3[cols_order]

    def _table1(self, cur, prev):
        if cur.empty: return pd.DataFrame(columns=["项目", "费用", "比例", "环比"])
        c_vals = [cur["原始邮费"].sum(), cur["超支邮费"].sum(), cur["邮费罚款"].sum()]
        p_vals = [prev["原始邮费"].sum(), prev["超支邮费"].sum(), prev["邮费罚款"].sum()] if not prev.empty else [0, 0,
                                                                                                                  0]
        total_c = c_vals[0]
        rows = [
            ["总邮费(Total)", total_c, "100.00%", self._diff(total_c, p_vals[0])],
            ["超支邮费(Over)", c_vals[1], self._pct(c_vals[1], total_c), self._diff(c_vals[1], p_vals[1])],
            ["罚款邮费(Fine)", c_vals[2], self._pct(c_vals[2], total_c), self._diff(c_vals[2], p_vals[2])]
        ]
        return pd.DataFrame(rows, columns=["项目", "费用", "比例", "环比"])

    def _table2(self, df_c, df_p):
        if df_c.empty: return pd.DataFrame(columns=["项目", "单数", "比例", "环比"])
        c_cnt = df_c['order number'].nunique()
        p_cnt = df_p['order number'].nunique() if not df_p.empty else 0
        diff = (c_cnt - p_cnt) / p_cnt if p_cnt != 0 else 0
        return pd.DataFrame([["总订单数", c_cnt, "100%", f"{diff:.2%}"]], columns=["项目", "单数", "比例", "环比"])

    def _table4(self, df3):
        if df3.empty: return pd.DataFrame()
        t = df3[df3["总订单数"] > 5].copy()
        if t.empty: return pd.DataFrame()
        t["_sort_val"] = t["罚款比例"].astype(str).str.rstrip("%").astype(float)
        return t.nlargest(10, "_sort_val")[["Combo", "原始邮费", "邮费罚款", "罚款比例"]]

    def _table5(self, df3):
        if df3.empty: return pd.DataFrame()
        t = df3[df3["总订单数"] > 5].copy()
        if t.empty: return pd.DataFrame()
        t["_sort_val"] = t["罚款单数比例"].astype(str).str.rstrip("%").astype(float)
        return t.nlargest(10, "_sort_val")[["Combo", "原始单数", "罚款单数", "罚款单数比例"]]

    def _save_suite(self, tables, footer=None):
        filename = f"Analysis_Shipping_{self.file_suffix}.csv"
        user = get_current_user()
        safe_user = "".join([c for c in user if c.isalnum() or c in ('_', '-')])
        sub_dir = safe_user if safe_user else "default"
        user_output_dir = settings.OUTPUT_DIR / sub_dir
        if not user_output_dir.exists(): user_output_dir.mkdir(parents=True, exist_ok=True)
        save_path = user_output_dir / filename

        try:
            with open(save_path, "w", encoding="utf-8-sig") as f:
                names = ["表1_费用汇总", "表2_单数汇总", "表3_Combo详情", "表4_罚款金额Top10", "表5_罚款单数Top10",
                         "C1_智能诊断"]
                for i, df in enumerate(tables):
                    if i < len(names):
                        f.write(f"=== {names[i]} ===\n")
                    else:
                        f.write(f"=== Table {i + 1} ===\n")
                    df.to_csv(f, index=False)
                    f.write("\n\n")
                if footer:
                    f.write("\n")
                    for line in footer: f.write(f"{line}\n")
        except Exception as e:
            self.logger.error(f"保存失败: {e}")

    def _pct(self, v, total):
        return f"{v / total:.2%}" if total else "0.00%"

    def _diff(self, cur, prev):
        if not prev: return "0.00%"
        return f"{(cur - prev) / prev:.2%}"