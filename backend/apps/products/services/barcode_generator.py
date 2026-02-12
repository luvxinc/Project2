from django.utils.translation import gettext as _
# File: backend/apps/products/services/barcode_generator.py
"""
外包装条形码 PDF 生成服务
职责:
1. 根据 SKU、每盒个数、每箱盒数生成 4"x6" 标签 PDF
2. 使用 Code128 条形码格式
3. 集成审计日志

依赖:
- reportlab: PDF 生成
- python-barcode: 条形码生成
"""

import os
import io
import tempfile
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple, Optional

from reportlab.lib.pagesizes import inch
from reportlab.lib.units import inch as INCH
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import barcode
from barcode.writer import ImageWriter

from backend.common.settings import settings
from backend.core.sys.logger import get_logger
from backend.apps.audit.core.dto import LogStatus, LogType

logger = get_logger("BarcodeGenerator")

# PDF 尺寸: 4" x 6"
PAGE_WIDTH = 4 * INCH
PAGE_HEIGHT = 6 * INCH

# 输出目录 (用户级别隔离)
def get_barcode_output_dir(username: str) -> Path:
    """获取用户的条形码输出目录"""
    output_dir = settings.DATA_DIR / "barcodes" / username
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


class BarcodeGeneratorService:
    """
    条形码 PDF 生成服务
    
    PDF 布局 (4"x6"):
    ─────────────────────────
    │      [SKU 文本]        │  Y = 5.3"
    │                        │
    │   ═══════════════════  │  Y = 4.5" (条形码 SK+SKU)
    │                        │
    │      QTY/BOX           │  Y = 3.5"
    │   ═══════════════════  │  Y = 2.8" (条形码 QT+数量)
    │                        │
    │      BOX/CTN           │  Y = 1.8"
    │   ═══════════════════  │  Y = 1.1" (条形码 CT+数量)
    │                        │
    ─────────────────────────
    """
    
    @classmethod
    def generate_single_pdf(
        cls,
        sku: str,
        qty_per_box: int,
        box_per_ctn: int,
        output_dir: Path
    ) -> Tuple[bool, str, Optional[Dict]]:
        """
        生成单个条形码 PDF
        
        Args:
            sku: 产品 SKU (可能含 "/")
            qty_per_box: 每盒个数
            box_per_ctn: 每箱盒数
            output_dir: 输出目录 (用户级别)
            
        Returns:
            (success, message, file_info)
            file_info = {
                "real_path": Path,        # 真实文件路径 (用于读取/下载)
                "display_name": str,      # 展示名 (SKU.qty->ctn.pdf，用于 UI/下载标头)
                "sku": str,               # 原始 SKU
                "qty_per_box": int,
                "box_per_ctn": int
            }
        """
        try:
            # [关键] 将 SKU 作为目录结构，不放进文件名
            # 这样 SKU 中的 "/" 会自然变成多级目录
            sku_dir = output_dir / sku
            sku_dir.mkdir(parents=True, exist_ok=True)
            
            # 真实文件名: 只包含 qty->ctn.pdf
            real_filename = f"{qty_per_box}->{box_per_ctn}.pdf"
            real_path = sku_dir / real_filename
            
            # 展示名: SKU.qty->ctn.pdf (用于 UI 展示和下载标头)
            display_name = f"{sku}.{qty_per_box}->{box_per_ctn}.pdf"
            
            # 创建 PDF
            c = canvas.Canvas(str(real_path), pagesize=(PAGE_WIDTH, PAGE_HEIGHT))
            
            # ============================================================
            # 新布局规范 (单位: 英寸)
            # ============================================================
            # 画布: 4" x 6"
            # 外边距: 0.25"
            # 
            # 第一行 (约 y: 5.75" - 4.05"): SKU 条码（全宽）
            # 第二行 (约 y: 3.85" - 2.15"): Qty/Box + Box/Ctn 并排各占一半
            # 底部区域 (约 y: 1.95" - 0.25"): 左侧 L 定位符 + 右侧二维码
            # ============================================================
            
            MARGIN = 0.25 * INCH
            CONTENT_WIDTH = 3.5 * INCH   # 4" - 2*0.25"
            HALF_WIDTH = CONTENT_WIDTH / 2
            
            # 区块参数
            ROW1_HEIGHT = 1.70 * INCH    # 第一行
            ROW2_HEIGHT = 1.50 * INCH    # 第二行 (两个并排条码)
            ROW_GAP = 0.20 * INCH
            
            # 条码标签参数
            LABEL_TO_BARCODE = 0.05 * INCH
            BARCODE_TOP_OFFSET = 0.12 * INCH
            
            # 字体设置
            FONT_NAME = "Helvetica-Bold"
            FONT_SIZE = 15
            FONT_SIZE_SMALL = 12  # 并排条码用小字
            
            # 计算行位置
            row1_top = PAGE_HEIGHT - MARGIN                      # 5.75"
            row1_bottom = row1_top - ROW1_HEIGHT                 # 4.05"
            
            row2_top = row1_bottom - ROW_GAP                     # 3.85"
            row2_bottom = row2_top - ROW2_HEIGHT                 # 2.35"
            
            # 底部区域
            bottom_area_top = row2_bottom - ROW_GAP              # 2.15"
            bottom_area_bottom = MARGIN                          # 0.25"
            
            from PIL import Image as PILImage
            
            def draw_barcode_centered(barcode_img_path, label_text, block_top, center_x_pos, max_w, font_size):
                """绘制条码（居中于指定区域）"""
                with PILImage.open(barcode_img_path) as img:
                    img_w_px, img_h_px = img.size
                    dpi = 300
                    img_w_inch = img_w_px / dpi
                    img_h_inch = img_h_px / dpi
                
                # 缩放以适应最大宽度
                if img_w_inch * INCH > max_w:
                    scale = max_w / (img_w_inch * INCH)
                    draw_w = max_w
                    draw_h = img_h_inch * INCH * scale
                else:
                    draw_w = img_w_inch * INCH
                    draw_h = img_h_inch * INCH
                
                # 标签位置
                label_y = block_top - BARCODE_TOP_OFFSET - font_size * 0.4
                
                # 条码位置
                barcode_top = label_y - LABEL_TO_BARCODE
                barcode_bottom = barcode_top - draw_h
                barcode_left = center_x_pos - draw_w / 2
                
                # 绘制标签
                c.setFont(FONT_NAME, font_size)
                c.drawCentredString(center_x_pos, label_y, label_text)
                
                # 绘制条码
                c.drawImage(barcode_img_path, barcode_left, barcode_bottom,
                           width=draw_w, height=draw_h, preserveAspectRatio=True)
            
            # ===== 第一行: SKU 条码 (全宽居中) =====
            center_x = PAGE_WIDTH / 2
            barcode_data_sku = f"S{sku}"
            barcode_img_sku = cls._generate_barcode_image(barcode_data_sku)
            if barcode_img_sku:
                draw_barcode_centered(barcode_img_sku, f"SKU: {sku.upper()}", 
                                     row1_top, center_x, CONTENT_WIDTH, FONT_SIZE)
            
            # ===== 第二行: Qty/Box + Box/Ctn 并排 =====
            left_center = MARGIN + HALF_WIDTH / 2          # 左半边中心
            right_center = MARGIN + HALF_WIDTH + HALF_WIDTH / 2  # 右半边中心
            
            # Qty/Box (左侧)
            barcode_data_qty = f"Q{qty_per_box}"
            barcode_img_qty = cls._generate_barcode_image(barcode_data_qty)
            if barcode_img_qty:
                draw_barcode_centered(barcode_img_qty, f"Qty/Box: {qty_per_box}",
                                     row2_top, left_center, HALF_WIDTH - 0.1 * INCH, FONT_SIZE_SMALL)
            
            # Box/Ctn (右侧)
            barcode_data_ctn = f"C{box_per_ctn}"
            barcode_img_ctn = cls._generate_barcode_image(barcode_data_ctn)
            if barcode_img_ctn:
                draw_barcode_centered(barcode_img_ctn, f"Box/Ctn: {box_per_ctn}",
                                     row2_top, right_center, HALF_WIDTH - 0.1 * INCH, FONT_SIZE_SMALL)
            
            # ===== 底部区域 =====
            
            # --- L 型定位符 (左下角) ---
            L_MARGIN_POS = 0.10 * INCH
            L_SIZE = 0.25 * INCH
            L_LINE_WIDTH = 2
            
            c.setStrokeColorRGB(0, 0, 0)
            c.setLineWidth(L_LINE_WIDTH)
            
            l_x = L_MARGIN_POS
            l_y = L_MARGIN_POS
            c.line(l_x, l_y, l_x + L_SIZE, l_y)
            c.line(l_x, l_y, l_x, l_y + L_SIZE)
            
            # --- DataMatrix 二维码 (右下角) ---
            # 内容: SKU|数量|盒数 (原始数据，无修饰)
            dm_data = f"{sku}|{qty_per_box}|{box_per_ctn}"
            
            # 尺寸
            DM_SIZE = 1.2 * INCH
            
            # 位置: 右下角，保持边距
            dm_right = PAGE_WIDTH - MARGIN
            dm_left = dm_right - DM_SIZE
            dm_bottom = MARGIN
            
            try:
                from reportlab.graphics.barcode import createBarcodeDrawing
                dm_barcode = createBarcodeDrawing(
                    'ECC200DataMatrix', 
                    value=dm_data, 
                    width=DM_SIZE, 
                    height=DM_SIZE
                )
                dm_barcode.drawOn(c, dm_left, dm_bottom)
            except Exception as e:
                logger.error(f"生成 DataMatrix 失败: {e}")
                # 失败时绘制占位符
                c.setFont("Helvetica-Bold", 10)
                c.drawString(dm_left, dm_bottom + DM_SIZE/2, "DM ERR")
            
            # 保存 PDF
            c.save()
            
            logger.info(
                f"条形码 PDF 生成成功: {display_name}",
                extra={
                    "action": "生成条形码",
                    "target": sku,  # 原始 SKU (含 "/" 原样记录)
                    "status": LogStatus.SUCCESS,
                    "details": f"QTY/BOX={qty_per_box}, BOX/CTN={box_per_ctn}",
                    "log_type": LogType.REGULAR
                }
            )
            
            file_info = {
                "real_path": real_path,
                "display_name": display_name,
                "sku": sku,
                "qty_per_box": qty_per_box,
                "box_per_ctn": box_per_ctn
            }
            
            return True, f"生成成功: {display_name}", file_info
            
        except Exception as e:
            error_msg = f"生成条形码失败 [{sku}]: {str(e)}"
            logger.error(
                error_msg,
                extra={
                    "action": "生成条形码",
                    "target": sku,
                    "status": LogStatus.FAIL_SYS,
                    "root_cause": str(e),
                    "log_type": LogType.REGULAR
                }
            )
            return False, error_msg, None
    
    @classmethod
    def _generate_barcode_image(cls, data: str) -> Optional[str]:
        """
        生成 Code128 条形码图片并返回临时文件路径
        
        技术规范：
        - 条码制式：Code 128
        - X-dimension（最细条宽）：0.33 mm
        - 条码高度（黑白条部分）：18 mm
        - 静区（左右）：≥ 3 mm
        - 人类可读文本：OCR-B, 8pt, 居中
        
        Args:
            data: 条形码数据
            
        Returns:
            临时图片文件路径
        """
        try:
            # 创建临时文件
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
            temp_path = temp_file.name
            temp_file.close()
            
            # 生成 Code128 条形码
            Code128 = barcode.get_barcode_class('code128')
            
            # 自定义 Writer 选项
            writer = ImageWriter()
            
            # 生成条形码
            code = Code128(data, writer=writer)
            
            # ============================================================
            # 条码技术参数（严格按规范）
            # ============================================================
            # X-dimension: 0.33 mm (最细条宽度)
            # module_height: 18 mm (条码黑白条部分高度)
            # quiet_zone: 3 mm (静区，左右两侧纯空白)
            # write_text: True (显示人类可读文本)
            # font_size: 8 pt
            # text_distance: 2 mm (条码底部到文字顶部的距离)
            # ============================================================
            saved_path = code.save(temp_path[:-4], options={
                'module_width': 0.33,       # X-dimension: 0.33 mm
                'module_height': 18,        # 条码高度: 18 mm
                'quiet_zone': 3,            # 静区: 3 mm
                'write_text': False,        # 不显示人类可读文本（只要条码）
            })
            
            return saved_path
            
        except Exception as e:
            logger.error(f"生成条形码图片失败: {e}")
            return None
    
    @classmethod
    def generate_batch(
        cls,
        items: List[Dict],
        username: str
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        批量生成条形码 PDF
        
        Args:
            items: [{"sku": "ABC", "qty_per_box": 10, "box_per_ctn": 5}, ...]
            username: 用户名 (用于隔离输出目录)
            
        Returns:
            (success_list, fail_list)
        """
        output_dir = get_barcode_output_dir(username)
        
        success_list = []
        fail_list = []
        
        for item in items:
            sku = item.get("sku", "").strip().upper()
            qty_per_box = item.get("qty_per_box", 0)
            box_per_ctn = item.get("box_per_ctn", 0)
            
            # 数据验证
            if not sku:
                fail_list.append({"sku": _("(空)"), "error": _("SKU 不能为空")})
                continue
            
            if not isinstance(qty_per_box, int) or qty_per_box < 1:
                fail_list.append({"sku": sku, "error": _("每盒个数必须是大于0的正整数")})
                continue
            
            if not isinstance(box_per_ctn, int) or box_per_ctn < 1:
                fail_list.append({"sku": sku, "error": _("每箱盒数必须是大于0的正整数")})
                continue
            
            # 生成 PDF
            success, msg, file_info = cls.generate_single_pdf(
                sku, qty_per_box, box_per_ctn, output_dir
            )
            
            if success and file_info:
                success_list.append({
                    "sku": sku,
                    "display_name": file_info["display_name"],  # 展示名
                    "real_path": str(file_info["real_path"]),   # 真实路径 (序列化为字符串)
                    "qty_per_box": qty_per_box,
                    "box_per_ctn": box_per_ctn
                })
            else:
                fail_list.append({"sku": sku, "error": msg})
        
        # 记录批量操作日志
        logger.info(
            f"批量生成条形码完成: 成功 {len(success_list)}, 失败 {len(fail_list)}",
            extra={
                "action": "批量生成条形码",
                "target": f"{len(items)} 个 SKU",
                "status": LogStatus.SUCCESS if not fail_list else LogStatus.FAIL_DATA,
                "details": f"成功: {len(success_list)}, 失败: {len(fail_list)}",
                "log_type": LogType.REGULAR
            }
        )
        
        return success_list, fail_list
    
    @classmethod
    def list_user_barcodes(cls, username: str) -> List[Dict]:
        """
        列出用户已生成的条形码 PDF 文件
        
        Returns:
            [{
                "display_name": "SKU.10->5.pdf",   # 展示名
                "real_path": "/path/to/.../sku/10->5.pdf",  # 真实路径
                "size": 12345,
                "created": "2024-01-01 12:00:00"
            }, ...]
        """
        output_dir = get_barcode_output_dir(username)
        files = []
        
        # [关键] 递归查找所有 PDF (因为 SKU 作为目录结构)
        for f in output_dir.rglob("*.pdf"):
            stat = f.stat()
            
            # 计算 display_name: SKU.qty->ctn.pdf
            # real_path = {output_dir}/{sku}/{qty->{ctn}.pdf
            # 需要从路径中提取 SKU
            relative_path = f.relative_to(output_dir)
            sku_parts = list(relative_path.parts[:-1])  # 去掉最后的文件名，剩下的是 SKU 路径
            sku = "/".join(sku_parts) if sku_parts else "UNKNOWN"
            
            # 从文件名中提取 qty->ctn
            qty_ctn = f.stem  # 如 "10->5"
            display_name = f"{sku}.{qty_ctn}.pdf"
            
            files.append({
                "display_name": display_name,
                "relative_path": str(relative_path),  # 相对路径，用于构建 URL
                "real_path": str(f),
                "size": stat.st_size,
                "created": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            })
        
        # 按创建时间倒序
        files.sort(key=lambda x: x["created"], reverse=True)
        return files
    
    @classmethod
    def clear_user_barcodes(cls, username: str) -> int:
        """
        清空用户的所有条形码文件 (包括子目录中的)
        
        Returns:
            删除的文件数量
        """
        output_dir = get_barcode_output_dir(username)
        count = 0
        
        # [关键] 递归删除所有 PDF
        for f in output_dir.rglob("*.pdf"):
            try:
                f.unlink()
                count += 1
            except:
                pass
        
        # 清理空目录 (从深到浅)
        try:
            for dirpath in sorted(output_dir.rglob("*"), key=lambda p: len(p.parts), reverse=True):
                if dirpath.is_dir() and not any(dirpath.iterdir()):
                    dirpath.rmdir()
        except:
            pass
        
        logger.info(
            f"清空条形码文件: 删除 {count} 个文件",
            extra={
                "action": "清空条形码",
                "target": username,
                "status": LogStatus.SUCCESS,
                "details": f"删除 {count} 个文件",
                "log_type": LogType.REGULAR
            }
        )
        
        return count
