# File: backend/web_ui/views/etl.py
from django.shortcuts import render
from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST

from core.services.etl.ingest import IngestService
from core.services.etl.parser import TransactionParser


from core.sys.logger import get_audit_logger

audit_logger = get_audit_logger()


@login_required(login_url='web_ui:login')
def etl_transaction(request):
    return render(request, "pages/etl_transaction.html")


@login_required(login_url='web_ui:login')
@require_POST
def etl_upload(request):
    files = request.FILES.getlist('files')
    if not files:
        return HttpResponse('<div class="alert alert-danger">⚠️ 未检测到文件，请重新选择。</div>')

    # AUDIT LOG
    filenames = [f.name for f in files]
    audit_logger.info(
        f"ETL文件上传: {len(files)} 个文件",
        extra={
            "user": request.user.username,
            "func": "ETL:Upload",
            "action": "UPLOAD_FILE",
            "details": f"Files: {', '.join(filenames)}"
        }
    )

    service = IngestService()
    trans_files = []
    earn_files = []

    for f in files:
        try:
            head = f.read(2048).decode('utf-8', errors='ignore').lower()
            f.seek(0)
            if "transaction report" in head:
                trans_files.append(f)
            elif "order earnings report" in head:
                earn_files.append(f)
        except Exception:
            continue

    if not trans_files and not earn_files:
        return HttpResponse(
            '<div class="alert alert-warning">⚠️ 未能识别有效报表。请确保上传的是 Transaction 或 Earning CSV 文件。</div>')

    try:
        result_msg = service.run_ingest_pipeline(trans_files, earn_files)
        return HttpResponse(f"""
            <div class="alert alert-success border-success">
                <h5 class="alert-heading"><i class="fa-solid fa-check-circle me-2"></i>上传成功</h5>
                <p class="mb-0">{result_msg}</p>
            </div>
            <div class="text-center mt-4">
                <button class="btn btn-primary btn-lg px-5 shadow"
                        hx-post="{request.build_absolute_uri('/dashboard/etl/parse/')}"
                        hx-target="#etl-process-area"
                        hx-indicator="#parsing-spinner">
                    <i class="fa-solid fa-microchip me-2"></i>立即开始解析
                </button>
                <div id="parsing-spinner" class="htmx-indicator mt-3 text-info">
                    <div class="spinner-border spinner-border-sm" role="status"></div>
                    <span class="ms-2">正在启动解析引擎...</span>
                </div>
            </div>
        """)
    except Exception as e:
        return HttpResponse(f'<div class="alert alert-danger">❌ 处理失败: {str(e)}</div>')


@login_required(login_url='web_ui:login')
@require_POST
def etl_parse(request):
    parser = TransactionParser()
    try:
        result = parser.run()
        status = result.get("status")
        fixed = len(result.get("auto_fixed", []))
        pending = result.get("pending_count", 0)
        
        # AUDIT LOG
        audit_logger.info(
            f"ETL数据解析完成: {status}",
            extra={
                "user": request.user.username,
                "func": "ETL:Parse",
                "action": "PARSE_DATA",
                "details": f"Status: {status}, Fixed: {fixed}, Pending: {pending}"
            }
        )

        if status == "success":
            icon = "fa-check-double"
            color = "success"
            msg = f"解析完成！自动修复了 {fixed} 条数据。"

            if pending > 0:
                color = "warning"
                msg += f" <br><strong>注意：仍有 {pending} 条异常数据需要人工介入。</strong>"
                action_btn = """<button class="btn btn-warning mt-3" onclick="alert('即将跳转修正页面')">前往修正中心</button>"""
            else:
                action_btn = """<button class="btn btn-success mt-3" disabled>数据完美，流程结束</button>"""

            return HttpResponse(f"""
                <div class="card glass-card border-{color} mb-3">
                    <div class="card-body text-center p-5">
                        <div class="display-4 text-{color} mb-3"><i class="fa-solid {icon}"></i></div>
                        <h4 class="text-white">{msg}</h4>
                        {action_btn}
                    </div>
                </div>
            """)
        else:
            return HttpResponse(f'<div class="alert alert-danger">解析器未执行: {result.get("message")}</div>')

    except Exception as e:
        audit_logger.error(f"ETL解析失败: {str(e)}", extra={"user": request.user.username, "func": "ETL:Parse"})
        return HttpResponse(f'<div class="alert alert-danger">🔥 引擎错误: {str(e)}</div>')