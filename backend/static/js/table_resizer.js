// File: backend/static/js/table_resizer.js
/**
 * Eaglestar ERP V3.1 Table Resizer
 * 目的: 为具有 'resizable-table' class 的表格实现列宽拖拽调整。
 */

document.addEventListener('DOMContentLoaded', () => {
    // 监听 HTMX 局部替换事件，以重新初始化新加载的表格
    document.body.addEventListener('htmx:afterSwap', (evt) => {
        if (evt.target.id === 'audit-content-area') {
            initializeResizableTables();
        }
    });

    // 首次加载时初始化
    initializeResizableTables();
});

function initializeResizableTables() {
    // 目标表格必须同时具备 table 和 resizable-table class
    const tables = document.querySelectorAll('table.resizable-table');

    tables.forEach(table => {
        if (table.classList.contains('resizer-initialized')) {
            return; // 避免重复初始化
        }

        // 查找表头单元格
        const headers = table.querySelectorAll('thead th');
        headers.forEach(header => {
            if (header.querySelector('.resizer')) return; // 避免重复添加

            const resizer = document.createElement('div');
            resizer.className = 'resizer';

            // 确保 resizer 在 th 内部的右侧
            header.appendChild(resizer);
            header.style.position = 'relative';

            // 绑定拖拽事件
            resizer.addEventListener('mousedown', initResize);
        });

        table.classList.add('resizer-initialized');
    });
}

function initResize(e) {
    // 阻止选择文本
    e.preventDefault();

    const originalX = e.clientX;
    const header = e.target.parentNode;
    const table = header.closest('table');
    const originalWidth = header.offsetWidth;

    table.style.userSelect = 'none'; // 禁用文本选择
    table.style.cursor = 'col-resize';

    function doResize(e) {
        const newWidth = originalWidth + (e.clientX - originalX);
        // 确保最小宽度
        if (newWidth > 50) {
            header.style.width = newWidth + 'px';
        }
    }

    function stopResize() {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        table.style.cursor = '';
        table.style.userSelect = '';
    }

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

// CSS for the resizer handle
const style = document.createElement('style');
style.innerHTML = `
    .resizer {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 10px;
        cursor: col-resize;
        z-index: 10;
        background: rgba(13, 202, 240, 0.0); /* 默认透明 */
    }
    .resizer:hover {
        background: rgba(13, 202, 240, 0.2); 
    }
`;
document.head.appendChild(style);