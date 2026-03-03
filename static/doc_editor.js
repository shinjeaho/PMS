// 붙여넣기 후 정리 (폰트, 타이틀 복구 등)
function handlePasteCleanup(editor) {
    if (!editor) return;

    // 1. 표 내부 font 태그/속성 정리
    editor.querySelectorAll('table').forEach(table => {
        // <font> 태그 제거 (내용 보존)
        table.querySelectorAll('font').forEach(f => {
            const parent = f.parentNode;
            while (f.firstChild) parent.insertBefore(f.firstChild, f);
            parent.removeChild(f);
        });
        // font[size] 속성 제거
        table.querySelectorAll('[size]').forEach(el => el.removeAttribute('size'));
    });

    // 2. 제목(Title) 스타일 소실 복구 시도
    // 사용자가 전체 선택 후 붙여넣으면 .paper-title div가 사라질 수 있음.
    // 맨 첫 번째 블록 요소가 텍스트이고 제목처럼 보이면(혹은 무조건) .paper-title 클래스 부여 시도
    const titleEl = editor.querySelector('.paper-title');
    if (!titleEl) {
        const first = editor.firstElementChild;
        // 첫 요소가 블록 태그이고, 테이블이 아니며, 텍스트가 있는 경우
        if (first && ['DIV', 'P', 'H1', 'H2', 'H3'].includes(first.tagName) && first.textContent.trim().length > 0) {
            // 기존 클래스가 없으면 타이틀로 간주
            first.classList.add('paper-title');
        }
    }

    // 3. 비어있는 줄(<div><br></div>) 제거
    cleanupEmptyEditorLines(editor);
}

// 에디터 최상위의 빈 블록 제거 (빈 줄/엔터로 생긴 <div><br></div>)
function cleanupEmptyEditorLines(editor) {
    if (!editor) return;
    const children = Array.from(editor.children);
    children.forEach(child => {
        if (!(child instanceof HTMLElement)) return;
        if (child.classList.contains('paper-title')) return;
        const isBlock = ['DIV', 'P'].includes(child.tagName);
        if (!isBlock) return;
        const html = (child.innerHTML || '').replace(/&nbsp;/gi, '').trim();
        const text = (child.textContent || '').replace(/\s+/g, '').trim();
        const hasMedia = child.querySelector('img, table, video, audio');
        const isEmptyLine = !text && !hasMedia && (/^<br\s*\/?>$/i.test(html) || html === '');
        if (isEmptyLine) {
            child.remove();
        }
    });
}

// 붙여넣기 이벤트에 연결
document.addEventListener('DOMContentLoaded', function () {
    const editor = document.getElementById('editor');
    if (editor) {
        editor.addEventListener('paste', function () {
            // 붙여넣기 직후 DOM 렌더링 시간을 위해 지연 실행
            setTimeout(() => handlePasteCleanup(editor), 10);
        });

        // 입력 중에도 빈 줄 제거(엔터로 생기는 <div><br></div> 정리)
        editor.addEventListener('input', function () {
            cleanupEmptyEditorLines(editor);
        });
    }
});
(function () {
    // =========================
    // 테스트 버전 옵션
    // - UI만 보여주고, 실제 기능(편집/삽입/다운로드 등)은 막음
    // =========================
    // 테스트 모드 제거: 실제 기능 동작

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatDateTime(d) {
        const yyyy = d.getFullYear();
        const mm = pad2(d.getMonth() + 1);
        const dd = pad2(d.getDate());
        return `${yyyy}-${mm}-${dd}`;
    }

    function downloadHtml(filename, html) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function sanitizeFilename(name) {
        return (name || 'document')
            .trim()
            .replace(/[\\/:*?"<>|]/g, '_')
            .slice(0, 80);
    }

    function exec(command, value) {
        try {
            document.execCommand('styleWithCSS', false, true);
        } catch (e) { }
        document.execCommand(command, false, value ?? null);

        // 표/양식 삭제 후: legacy <font size> 속성만 제거
        if (command === 'delete' || command === 'removeFormat') {
            setTimeout(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                // remove legacy font[size] attributes but preserve inline styles
                editor.querySelectorAll('font[size]').forEach(f => f.removeAttribute('size'));
            }, 10);
        }
    }

    function applyFontSizePx(px) {
        if (!px) return;
        // 실제 기능 동작

        exec('fontSize', 7);

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        let el = range.startContainer;

        if (el.nodeType === Node.TEXT_NODE) {
            el = el.parentElement;
        }

        if (!el || !(el instanceof HTMLElement)) return;

        el.removeAttribute('size');
        el.style.fontSize = `${px}px`;
    }

    function insertTable(rows, cols) {
        // 실제 기능 동작
        const r = Math.max(1, Math.min(20, rows));
        const c = Math.max(1, Math.min(12, cols));

        let html = '<table class="paper-table" style="margin:10px 0"><tbody>';
        for (let i = 0; i < r; i++) {
            html += '<tr>';
            for (let j = 0; j < c; j++) {
                html += '<td>&nbsp;</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        exec('insertHTML', html);
    }

    function insertTableWithOptions(options) {
        // 실제 기능 동작
        const rows = Number(options.rows);
        const cols = Number(options.cols);
        const r = Math.max(1, Math.min(20, Number.isFinite(rows) ? rows : 3));
        const c = Math.max(1, Math.min(12, Number.isFinite(cols) ? cols : 3));

        const widthPx = Number(options.widthPx);
        const heightPx = Number(options.heightPx);
        const separate = Boolean(options.separate);
        const styles = ['margin:10px 0'];
        if (Number.isFinite(widthPx) && widthPx > 0) {
            styles.push(`width:${Math.round(widthPx)}px`);
        }
        if (!separate) {
            styles.push('border-collapse:collapse');
        }

        let html = `<table class="paper-table" style="${styles.join(';')}"><tbody>`;
        for (let i = 0; i < r; i++) {
            html += '<tr>';
            for (let j = 0; j < c; j++) {
                if (Number.isFinite(heightPx) && heightPx > 0) {
                    html += `<td style="height:${Math.round(heightPx)}px">&nbsp;</td>`;
                } else {
                    html += '<td>&nbsp;</td>';
                }
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        exec('insertHTML', html);
    }

    function keepSelectionOnToolbar(toolbarEl) {
        // 툴바 클릭 시 selection이 풀리는 걸 줄이기 위한 처리
        toolbarEl.addEventListener('mousedown', function (e) {
            const target = e.target;
            // 버튼 클릭은 기본 동작을 막아도 되지만, select 요소는
            // 드롭다운이 열리도록 기본 동작을 허용해야 함
            if (target && (target.closest('.tool-btn') || target.closest('.tool-color'))) {
                e.preventDefault();
            }
        });
    }

    // ===== 표 편집 유틸 =====
    function getSelectedCell() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        let node = sel.anchorNode;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        if (!node || !(node instanceof HTMLElement)) return null;
        return node.closest('td, th');
    }

    function getCellColIndex(cell) {
        if (!cell) return -1;
        const row = cell.parentElement;
        if (!row) return -1;
        let idx = 0;
        for (const c of Array.from(row.cells)) {
            const span = c.colSpan || 1;
            if (c === cell) return idx;
            idx += span;
        }
        return -1;
    }

    function insertRowLike(row, insertBefore) {
        if (!row || !row.parentElement) return;
        const newRow = row.cloneNode(false);
        Array.from(row.cells).forEach(cell => {
            const newCell = cell.cloneNode(false);
            newCell.innerHTML = '&nbsp;';
            newCell.rowSpan = 1;
            newCell.colSpan = cell.colSpan || 1;
            newRow.appendChild(newCell);
        });
        if (insertBefore) row.parentElement.insertBefore(newRow, row);
        else row.parentElement.insertBefore(newRow, row.nextSibling);
    }

    function deleteRow(row) {
        if (!row || !row.parentElement) return;
        row.parentElement.removeChild(row);
    }

    function splitCell(cell, insertAfter) {
        if (!cell) return;
        const row = cell.parentElement;
        if (!row) return;
        const span = cell.colSpan || 1;
        const newCell = cell.cloneNode(false);
        newCell.innerHTML = '&nbsp;';
        newCell.colSpan = 1;
        newCell.rowSpan = 1;

        if (span > 1) {
            cell.colSpan = span - 1;
        }

        if (insertAfter) row.insertBefore(newCell, cell.nextSibling);
        else row.insertBefore(newCell, cell);
    }

    function mergeCellWithNeighbor(cell) {
        if (!cell) return;
        const row = cell.parentElement;
        if (!row) return;
        const next = cell.nextElementSibling;
        const prev = cell.previousElementSibling;
        const target = next || prev;
        if (!target) return;
        const span = cell.colSpan || 1;
        const tSpan = target.colSpan || 1;
        target.colSpan = tSpan + span;
        row.removeChild(cell);
    }

    function setRowHeight(row, px) {
        if (!row) return;
        Array.from(row.cells).forEach(cell => {
            cell.style.height = `${px}px`;
        });
    }

    function setCellWidth(cell, px) {
        if (!cell) return;
        cell.style.width = `${px}px`;
    }

    function setColumnWidth(table, colIndex, px) {
        if (!table || colIndex < 0) return;

        // colgroup이 있으면 우선 적용
        const colgroup = table.querySelector('colgroup');
        if (colgroup) {
            const cols = Array.from(colgroup.querySelectorAll('col'));
            if (cols[colIndex]) {
                cols[colIndex].style.width = `${px}px`;
                return;
            }
        }

        // colgroup이 없거나 인덱스가 부족하면 셀 단위로 적용
        Array.from(table.rows || []).forEach(row => {
            let idx = 0;
            for (const c of Array.from(row.cells || [])) {
                const span = c.colSpan || 1;
                if (idx === colIndex) {
                    c.style.width = `${px}px`;
                    break;
                }
                idx += span;
            }
        });
    }

    function setCellBackground(cell, color) {
        if (!cell) return;
        cell.style.backgroundColor = color;
    }

    document.addEventListener('DOMContentLoaded', function () {
        const toolbar = document.getElementById('toolbar');
        const editor = document.getElementById('editor');

        const createdAt = document.getElementById('createdAt');
        const authorName = document.getElementById('authorName');
        const authorCell = document.getElementById('authorCell');

        const formatBlock = document.getElementById('formatBlock');
        const fontName = document.getElementById('fontName');
        const fontSize = document.getElementById('fontSize');
        const foreColor = document.getElementById('foreColor');

        const docTitle = document.getElementById('docTitle');
        const projectNumber = document.getElementById('projectNumber');

        if (projectNumber) {
            const params = new URLSearchParams(window.location.search);
            const presetProjectNumber = params.get('project_number');
            if (presetProjectNumber) {
                projectNumber.value = presetProjectNumber;
            } else {
                try {
                    const stored = sessionStorage.getItem('doc_editor_project_number');
                    if (stored) {
                        projectNumber.value = stored;
                        sessionStorage.removeItem('doc_editor_project_number');
                    }
                } catch (e) {
                    // storage optional
                }
            }
        }

        // Table modal
        const tableModal = document.getElementById('tableModal');
        const tableModalClose = document.getElementById('tableModalClose');
        const tableCancel = document.getElementById('tableCancel');
        const tableApply = document.getElementById('tableApply');
        const tableRows = document.getElementById('tableRows');
        const tableCols = document.getElementById('tableCols');
        const tableWidth = document.getElementById('tableWidth');
        const tableHeight = document.getElementById('tableHeight');
        const tableSeparate = document.getElementById('tableSeparate');
        const tableContextMenu = document.getElementById('tableContextMenu');
        const tableContextColBg = document.getElementById('tableContextColBg');
        let tableContextCell = null;

        if (!toolbar || !editor) return;


        keepSelectionOnToolbar(toolbar);

        // 기본 메타 표기
        if (createdAt) createdAt.textContent = formatDateTime(new Date());

        const bodyData = (document.body && document.body.dataset) ? document.body.dataset : {};
        const name = (bodyData.authorName || '').trim();
        if (authorName) authorName.textContent = name || '-';
        if (authorCell) authorCell.textContent = name || '';

        if (docTitle) {
            const meetingTitleCell = document.getElementById('meetingTitleCell');
            docTitle.addEventListener('input', function () {
                const v = docTitle.value.trim();
                if (meetingTitleCell) meetingTitleCell.textContent = v;
            });
        }

        // 버튼 명령 처리
        let savedRange = null;



        function saveSelectionRange() {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return null;
            return sel.getRangeAt(0).cloneRange();
        }

        function restoreSelectionRange(range) {
            if (!range) return;
            const sel = window.getSelection();
            if (!sel) return;
            sel.removeAllRanges();
            sel.addRange(range);
        }

        function openTableModal() {
            if (!tableModal) return;
            savedRange = saveSelectionRange();

            tableModal.classList.add('is-open');
            tableModal.setAttribute('aria-hidden', 'false');

            // 탭 초기화
            const tabs = tableModal.querySelectorAll('.modal-tab');
            const panes = tableModal.querySelectorAll('.tab-pane');
            tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === 'general'));
            panes.forEach(p => p.classList.toggle('is-active', p.dataset.pane === 'general'));
            tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.tab === 'general' ? 'true' : 'false'));

            // 기본값
            if (tableRows) tableRows.value = tableRows.value || '3';
            if (tableCols) tableCols.value = tableCols.value || '3';

            // 포커스
            setTimeout(() => {
                try {
                    (tableRows || tableApply || tableModalClose).focus();
                } catch (e) {
                    // ignore
                }
            }, 0);
        }

        function closeTableModal() {
            if (!tableModal) return;
            tableModal.classList.remove('is-open');
            tableModal.setAttribute('aria-hidden', 'true');
            // 에디터로 복귀
            editor.focus();
            restoreSelectionRange(savedRange);
        }

        function applyTableModal() {
            // 테스트 버전: 표 적용은 동작하지 않음(모달만 닫기)
            // 실제 표 삽입 동작

            // 에디터로 포커스/선택 복원 후 삽입
            editor.focus();
            restoreSelectionRange(savedRange);

            const rows = parseInt((tableRows && tableRows.value) || '3', 10);
            const cols = parseInt((tableCols && tableCols.value) || '3', 10);
            const widthPx = parseInt((tableWidth && tableWidth.value) || '0', 10);
            const heightPx = parseInt((tableHeight && tableHeight.value) || '0', 10);

            insertTableWithOptions({
                rows,
                cols,
                widthPx: Number.isFinite(widthPx) ? widthPx : 0,
                heightPx: Number.isFinite(heightPx) ? heightPx : 0,
                separate: Boolean(tableSeparate && tableSeparate.checked),
            });

            closeTableModal();
        }

        toolbar.addEventListener('click', function (e) {
            const btn = e.target && e.target.closest('.tool-btn');
            if (!btn) return;

            const cmd = btn.getAttribute('data-cmd');
            if (!cmd) return;

            editor.focus();

            // 실제 기능 동작

            if (cmd === 'print') {
                window.print();
                return;
            }

            if (cmd === 'download') {
                const title = docTitle ? docTitle.value : '';
                const file = sanitizeFilename(title) + '.html';
                const html = `<!doctype html><meta charset="utf-8">${editor.outerHTML}`;
                downloadHtml(file, html);
                return;
            }

            if (cmd === 'createLink') {
                const url = window.prompt('링크 URL을 입력하세요', 'https://');
                if (!url) return;
                exec('createLink', url);
                return;
            }

            if (cmd === 'insertImage') {
                const input = document.getElementById('docImageFile');
                if (!input) return;
                savedRange = saveSelectionRange();
                input.value = '';
                input.click();
                return;
            }

            if (cmd === 'insertTable') {
                openTableModal();
                return;
            }

            if (cmd.startsWith('table')) {
                const cell = getSelectedCell();
                if (!cell) return;
                const row = cell.parentElement;

                if (cmd === 'tableRowAddAbove') return insertRowLike(row, true);
                if (cmd === 'tableRowAddBelow') return insertRowLike(row, false);
                if (cmd === 'tableRowDelete') return deleteRow(row);
                if (cmd === 'tableColAddLeft') return insertColumnAt(table, colIndex);
                if (cmd === 'tableColAddRight') return insertColumnAt(table, colIndex + 1);
                if (cmd === 'tableColDelete') return deleteColumnAt(table, colIndex);
                if (cmd === 'tableRowHeight') {
                    const v = window.prompt('행 높이(px)를 입력하세요', '35');
                    const px = Number(v);
                    if (Number.isFinite(px) && px > 0) setRowHeight(row, px);
                    return;
                }
                if (cmd === 'tableColWidth') {
                    const v = window.prompt('열 너비(px)를 입력하세요', '120');
                    const px = Number(v);
                    if (Number.isFinite(px) && px > 0) setColumnWidth(table, colIndex, px);
                    return;
                }
            }

            exec(cmd);
        });

        // 드롭다운/색상
        if (formatBlock) {
            formatBlock.addEventListener('change', function () {
                editor.focus();
                // 실제 기능 동작
                const v = formatBlock.value;
                exec('formatBlock', v ? v : 'p');
                formatBlock.value = '';
            });
        }

        if (fontName) {
            fontName.addEventListener('change', function () {
                editor.focus();
                // 실제 기능 동작
                const v = fontName.value;
                exec('fontName', v || 'Malgun Gothic');
            });
        }

        function getCurrentFontSizePx() {
            try {
                const sel = window.getSelection();
                let el = null;
                if (sel && sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    el = range.startContainer;
                    if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
                }
                if (!el) el = editor;
                if (!el || !(el instanceof HTMLElement)) return '';
                const cs = window.getComputedStyle(el);
                if (!cs) return '';
                const fs = cs.fontSize || '';
                const m = fs.match(/([0-9]+)px/);
                return m ? m[1] : '';
            } catch (e) {
                return '';
            }
        }

        if (fontSize) {
            // 로딩 시 현재 요소의 픽셀 크기를 기본값으로 채움
            try {
                const curLoad = getCurrentFontSizePx();
                if (curLoad) fontSize.value = curLoad;
            } catch (e) { }
            // 사용자가 값 입력/선택 시 적용
            fontSize.addEventListener('change', function () {
                editor.focus();
                const v = fontSize.value && String(fontSize.value).trim();
                if (v) applyFontSizePx(v);
            });

            // Enter로도 적용 가능
            fontSize.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    editor.focus();
                    const v = fontSize.value && String(fontSize.value).trim();
                    if (v) applyFontSizePx(v);
                }
            });

            // 포커스 시 현재 선택된 요소의 픽셀 크기를 기본값으로 채움
            fontSize.addEventListener('focus', function () {
                const cur = getCurrentFontSizePx();
                if (cur) fontSize.value = cur;
            });

            // 숫자만 입력 허용
            fontSize.addEventListener('input', function () {
                const cleaned = String(fontSize.value || '').replace(/[^0-9]/g, '');
                if (cleaned !== fontSize.value) fontSize.value = cleaned;
            });

            // 커스텀 드롭다운 버튼 & 메뉴 동작
            const fontSizeBtn = document.getElementById('fontSizeBtn');
            const fontSizeMenu = document.getElementById('fontSizeMenu');
            const fontOptions = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48, 72, 96, 112, 127, 254, 500];

            function closeFontMenu() {
                if (fontSizeMenu) fontSizeMenu.setAttribute('aria-hidden', 'true');
            }
            function openFontMenu() {
                if (fontSizeMenu) fontSizeMenu.setAttribute('aria-hidden', 'false');
            }

            if (fontSizeMenu && fontSizeMenu.children.length === 0) {
                fontOptions.forEach(sz => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'font-item';
                    btn.textContent = String(sz) + 'px';
                    btn.dataset.size = String(sz);
                    btn.addEventListener('click', function () {
                        fontSize.value = btn.dataset.size;
                        applyFontSizePx(btn.dataset.size);
                        closeFontMenu();
                        fontSize.focus();
                    });
                    fontSizeMenu.appendChild(btn);
                });
            }

            if (fontSizeBtn) {
                fontSizeBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    if (!fontSizeMenu) return;
                    const isOpen = fontSizeMenu.getAttribute('aria-hidden') === 'false';
                    if (isOpen) closeFontMenu(); else openFontMenu();
                });
            }

            // 문서의 다른 곳 클릭 시 닫기
            document.addEventListener('click', function (e) {
                if (!fontSizeMenu) return;
                const inside = e.target && (e.target === fontSizeMenu || fontSizeMenu.contains(e.target) || e.target === fontSize || e.target === fontSizeBtn);
                if (!inside) closeFontMenu();
            });
        }

        if (foreColor) {
            foreColor.addEventListener('input', function () {
                editor.focus();
                // 실제 기능 동작
                exec('foreColor', foreColor.value);
            });
        }

        // ===== 표 우클릭 컨텍스트 메뉴 =====
        function hideTableContextMenu() {
            if (!tableContextMenu) return;
            tableContextMenu.setAttribute('aria-hidden', 'true');
        }

        function showTableContextMenu(x, y) {
            if (!tableContextMenu) return;
            tableContextMenu.style.left = `${x}px`;
            tableContextMenu.style.top = `${y}px`;
            tableContextMenu.setAttribute('aria-hidden', 'false');
        }

        editor.addEventListener('contextmenu', function (e) {
            const targetCell = e.target && e.target.closest ? e.target.closest('td, th') : null;
            if (!targetCell) return;
            e.preventDefault();
            tableContextCell = targetCell;
            showTableContextMenu(e.clientX, e.clientY);
        });

        document.addEventListener('click', function (e) {
            if (!tableContextMenu) return;
            if (e.target && tableContextMenu.contains(e.target)) return;
            hideTableContextMenu();
        });

        document.addEventListener('scroll', hideTableContextMenu, true);

        if (tableContextMenu) {
            tableContextMenu.addEventListener('click', function (e) {
                const btn = e.target && e.target.closest('button');
                if (!btn) return;
                const action = btn.getAttribute('data-action');
                if (!action) return;

                const cell = tableContextCell || getSelectedCell();
                if (!cell) return;
                const row = cell.parentElement;
                const table = cell.closest('table');
                const colIndex = getCellColIndex(cell);

                if (action === 'rowAddAbove') return insertRowLike(row, true);
                if (action === 'rowAddBelow') return insertRowLike(row, false);
                if (action === 'rowDelete') return deleteRow(row);
                if (action === 'colAddLeft') return splitCell(cell, false);
                if (action === 'colAddRight') return splitCell(cell, true);
                if (action === 'colDelete') return mergeCellWithNeighbor(cell);
                if (action === 'rowHeight') {
                    const v = window.prompt('행 높이(px)를 입력하세요', '35');
                    const px = Number(v);
                    if (Number.isFinite(px) && px > 0) setRowHeight(row, px);
                    return;
                }
                if (action === 'colWidth') {
                    const v = window.prompt('열 너비(px)를 입력하세요', '120');
                    const px = Number(v);
                    if (Number.isFinite(px) && px > 0) setColumnWidth(table, colIndex, px);
                    return;
                }
            });
        }

        if (tableContextColBg) {
            tableContextColBg.addEventListener('input', function () {
                const cell = tableContextCell || getSelectedCell();
                if (!cell) return;
                setCellBackground(cell, tableContextColBg.value);
            });
        }

        // 붙여넣기 도우미: HTML 정리(인라인 폰트/라인높이 제거)
        function escapeHtml(str) {
            return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function sanitizePastedHtml(html) {
            const container = document.createElement('div');
            container.innerHTML = html || '';

            // 제거: <font> 태그는 내용만 남기고 제거
            container.querySelectorAll('font').forEach(f => {
                const parent = f.parentNode;
                while (f.firstChild) parent.insertBefore(f.firstChild, f);
                parent.removeChild(f);
            });

            // 보존: 인라인 스타일은 가능한 한 유지하되, 글꼴 패밀리(font-family)와
            // font 숏핸드(font: ...)만 제거합니다. 이렇게 하면 정렬(text-align),
            // font-size, line-height 등 레이아웃 관련 스타일은 유지됩니다.
            container.querySelectorAll('[style]').forEach(el => {
                try {
                    const raw = el.getAttribute('style') || '';
                    // 제거: font-family 프로퍼티
                    let cleaned = raw.replace(/font-family\s*:[^;]+;?/gi, '');
                    // 제거: font 숏핸드 (예: font: 12px/14px "맑은 고딕", ...)
                    cleaned = cleaned.replace(/(^|;)\s*font\s*:\s*[^;]+;?/gi, '$1');
                    cleaned = cleaned.trim();
                    if (cleaned === '' || /^;+$/.test(cleaned)) {
                        el.removeAttribute('style');
                    } else {
                        // 정리된 스타일을 다시 설정
                        cleaned = cleaned.replace(/^;+|;+$|;{2,}/g, ';').trim();
                        el.setAttribute('style', cleaned);
                    }
                } catch (e) { }
            });

            // 제거: 직접 font-size 관련 커스텀 데이터 속성은 제거
            container.querySelectorAll('[data-font-size]').forEach(el => el.removeAttribute('data-font-size'));

            return container.innerHTML;
        }

        // 기본 설정: 붙여넣기 시 기존 내용 전부 초기화하고 붙여넣기 내용 삽입
        // editor.addEventListener('paste', function (e) {
        //   try {
        //     document.execCommand('styleWithCSS', false, true);
        //   } catch (err) {
        //     // ignore
        //   }

        //   const clipboard = (e.clipboardData || window.clipboardData);

        //   // 우선: 클립보드에 이미지가 있으면 데이터 URL로 바로 삽입 (서버 저장 전 임시 동작)
        //   if (clipboard && clipboard.items) {
        //     for (let i = 0; i < clipboard.items.length; i++) {
        //       const item = clipboard.items[i];
        //       try {
        //         if (item.kind === 'file' && item.type && item.type.indexOf('image/') === 0) {
        //           const f = item.getAsFile();
        //           if (f) {
        //             e.preventDefault();
        //             savedRange = saveSelectionRange();
        //             readFileAsDataURL(f).then(url => {
        //               restoreSelectionRange(savedRange);
        //               try {
        //                 exec('insertHTML', `<img src="${url}" style="max-width:100%;">`);
        //               } catch (err) {
        //                 const editorEl = document.getElementById('editor');
        //                 if (editorEl) editorEl.insertAdjacentHTML('beforeend', `<img src="${url}" style="max-width:100%;">`);
        //               }
        //             }).catch(err => console.error('이미지 읽기 실패', err));
        //             return;
        //           }
        //         }
        //       } catch (err) {
        //         // ignore and continue
        //       }
        //     }

        //     // 파일(예: HWP/DOCX) 붙여넣기 감지: 이미지가 아니면 기존 처리로 전달
        //     for (let i = 0; i < clipboard.items.length; i++) {
        //       const item = clipboard.items[i];
        //       if (item.kind === 'file') {
        //         const f = item.getAsFile();
        //         if (f) {
        //           e.preventDefault();
        //           savedRange = saveSelectionRange();
        //           handleFileUploadForPaste(f);
        //           return;
        //         }
        //       }
        //     }
        //   }

        //   // 일반 텍스트/HTML 붙여넣기: 기존 문서 내용 전체 초기화 후 삽입
        //   e.preventDefault();
        //   let pastedHtml = '';
        //   if (clipboard) pastedHtml = clipboard.getData('text/html') || clipboard.getData('text/plain') || '';

        //   // 플레인 텍스트일 경우 줄바꿈을 <p>로 변환
        //   if (pastedHtml && clipboard.getData && !clipboard.getData('text/html')) {
        //     const lines = pastedHtml.split(/\r?\n/).filter(l => l.trim() !== '');
        //     pastedHtml = lines.map(function (l) { return '<p>' + escapeHtml(l) + '</p>'; }).join('');
        //   }

        //   const sanitized = sanitizePastedHtml(pastedHtml || '');

        //   // 전체 초기화: 로딩 당시 생성된 표 등 모두 제거
        //   editor.innerHTML = '';
        //   // 삽입
        //   editor.insertAdjacentHTML('beforeend', sanitized);
        //   // 붙여넣은 표 내부의 폰트 태그/스타일 추가 정리
        //   cleanTableFont(editor);
        // });

        editor.addEventListener('paste', function (e) {
            const clipboard = e.clipboardData || window.clipboardData;
            if (!clipboard) return;

            // =========================
            // 1️⃣ 이미지: 항상 커서 위치 삽입
            // =========================
            if (clipboard.items) {
                for (let i = 0; i < clipboard.items.length; i++) {
                    const item = clipboard.items[i];
                    if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                        const f = item.getAsFile();
                        if (f) {
                            e.preventDefault();
                            savedRange = saveSelectionRange();
                            readFileAsDataURL(f).then(url => {
                                restoreSelectionRange(savedRange);
                                exec('insertHTML', `<img src="${url}" style="max-width:100%;">`);
                            });
                            return;
                        }
                    }
                }
            }

            const html = clipboard.getData('text/html');
            const text = clipboard.getData('text/plain');

            // =========================
            // 2️⃣ 일반 텍스트: A4 초기화 ❌, 삽입 ⭕
            // =========================
            if (!html && text) {
                e.preventDefault();
                const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
                const htmlText = lines
                    .map(l => `<p>${escapeHtml(l)}</p>`)
                    .join('');
                exec('insertHTML', htmlText);
                return;
            }

            if (!html) return;

            // =========================
            // 3️⃣ 한글(HWP) 복사본 판별
            // =========================
            const isHwp =
                /Hancom|Hwp|HStyle|class="?HStyle|mso-|Generator.*Hancom/i.test(html);

            // =========================
            // 4️⃣ HWP: A4 전체 초기화 후 삽입
            // =========================
            if (isHwp) {
                e.preventDefault();
                const sanitized = sanitizePastedHtml(html);
                exec('insertHTML', sanitized);
                cleanTableFont(editor);
                return;
            }


        const docImageFile = document.getElementById('docImageFile');
        if (docImageFile) {
            docImageFile.addEventListener('change', function () {
                const file = docImageFile.files && docImageFile.files[0];
                if (!file) return;
                if (!file.type || !file.type.startsWith('image/')) return;
                readFileAsDataURL(file).then((url) => {
                    restoreSelectionRange(savedRange);
                    exec('insertHTML', `<img src="${url}" style="max-width:100%;">`);
                });
            });
        }
            // =========================
            // 5️⃣ 일반 HTML: A4 초기화 ❌, 삽입 ⭕
            // =========================
            e.preventDefault();
            const sanitized = sanitizePastedHtml(html);
            exec('insertHTML', sanitized);
        });

        // 드래그 앤 드롭으로 파일을 내려놓아도 변환 적용
        editor.addEventListener('dragover', function (e) { e.preventDefault(); });
        editor.addEventListener('drop', function (e) {
            e.preventDefault();
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length) {
                const f = dt.files[0];
                savedRange = saveSelectionRange();
                // 이미지 파일이면 데이터 URL로 삽입
                try {
                    if (f.type && f.type.indexOf('image/') === 0) {
                        readFileAsDataURL(f).then(url => {
                            restoreSelectionRange(savedRange);
                            try {
                                exec('insertHTML', `<img src="${url}" style="max-width:100%;">`);
                            } catch (err) {
                                const editorEl = document.getElementById('editor');
                                if (editorEl) editorEl.insertAdjacentHTML('beforeend', `<img src="${url}" style="max-width:100%;">`);
                            }
                        }).catch(err => console.error('이미지 읽기 실패', err));
                        return;
                    }
                } catch (err) { }

                handleFileUploadForPaste(f);
            }
        });

        // 파일/Blob을 data URL로 읽어오는 헬퍼
        function readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                try {
                    const reader = new FileReader();
                    reader.onload = function (ev) { resolve(ev.target.result); };
                    reader.onerror = function (ev) { reject(ev); };
                    reader.readAsDataURL(file);
                } catch (err) { reject(err); }
            });
        }

        function handleFileUploadForPaste(file) {
            const name = (file.name || '').toLowerCase();
            let endpoint = null;
            if (name.endsWith('.hwp')) endpoint = '/convert_hwp';
            else if (name.endsWith('.docx')) endpoint = '/convert_docx';
            else {
                // 다른 파일은 업로드하지 않음
                return;
            }

            const statusEl = document.getElementById('docxUploadStatus') || null;
            if (statusEl) statusEl.textContent = '파일 변환 중...';

            const fd = new FormData();
            fd.append('file', file, file.name);

            fetch(endpoint, { method: 'POST', body: fd })
                .then(res => {
                    if (!res.ok) throw new Error('변환 실패');
                    return res.text();
                })
                .then(html => {
                    // 한글(.hwp) 변환 결과일 때만 전체 A4 용지를 초기화하고 붙여넣기합니다.
                    // DOCX는 기존처럼 선택 위치에 삽입하여 문서 일부에 추가되도록 둡니다.
                    try {
                        const editorEl = document.getElementById('editor');
                        if (endpoint === '/convert_hwp') {
                            if (editorEl) {
                                editorEl.innerHTML = '';
                                editorEl.insertAdjacentHTML('beforeend', html);
                                cleanTableFont(editorEl);
                            }
                        } else {
                            // DOCX 등은 선택 위치에 삽입 (원래 동작)
                            restoreSelectionRange(savedRange);
                            try { exec('insertHTML', html); } catch (e) {
                                if (editorEl) editorEl.insertAdjacentHTML('beforeend', html);
                            }
                        }
                    } catch (err) {
                        // 어떤 이유로든 실패하면 안전하게 선택 위치에 삽입
                        restoreSelectionRange(savedRange);
                        try { exec('insertHTML', html); } catch (e) {
                            const editorEl2 = document.getElementById('editor');
                            if (editorEl2) editorEl2.insertAdjacentHTML('beforeend', html);
                        }
                    }
                    if (statusEl) statusEl.textContent = '변환 완료';
                })
                .catch(err => {
                    if (statusEl) statusEl.textContent = '변환 실패: ' + err;
                });
        }

        // 모달 이벤트
        if (tableModal) {
            tableModal.addEventListener('click', function (e) {
                if (e.target === tableModal) {
                    closeTableModal();
                }
            });

            const tabButtons = tableModal.querySelectorAll('.modal-tab');
            tabButtons.forEach(btn => {
                btn.addEventListener('click', function () {
                    const key = btn.dataset.tab;
                    const panes = tableModal.querySelectorAll('.tab-pane');

                    tabButtons.forEach(t => {
                        const active = t.dataset.tab === key;
                        t.classList.toggle('is-active', active);
                        t.setAttribute('aria-selected', active ? 'true' : 'false');
                    });

                    panes.forEach(p => {
                        p.classList.toggle('is-active', p.dataset.pane === key);
                    });
                });
            });
        }

        if (tableModalClose) tableModalClose.addEventListener('click', closeTableModal);
        if (tableCancel) tableCancel.addEventListener('click', closeTableModal);
        if (tableApply) tableApply.addEventListener('click', applyTableModal);

        // ===== 사업번호 자동완성 =====
        if (projectNumber) {
            const suggestBox = document.createElement('div');
            suggestBox.className = 'doc-suggest';
            suggestBox.setAttribute('aria-hidden', 'true');
            document.body.appendChild(suggestBox);

            let debounceTimer = null;
            let abortController = null;

            function hideSuggest() {
                suggestBox.setAttribute('aria-hidden', 'true');
                suggestBox.innerHTML = '';
            }

            function positionSuggest() {
                const rect = projectNumber.getBoundingClientRect();
                suggestBox.style.left = `${rect.left}px`;
                suggestBox.style.top = `${rect.bottom + 4}px`;
                suggestBox.style.width = `${rect.width}px`;
            }

            function renderSuggest(items) {
                if (!items || items.length === 0) {
                    hideSuggest();
                    return;
                }
                positionSuggest();
                suggestBox.innerHTML = items.map(item => {
                    const code = item.contractCode || '';
                    const name = item.projectName || '';
                    const label = code && name ? `${code} | ${name}` : (code || name);
                    return `<button type="button" class="doc-suggest-item" data-code="${code}" data-name="${name}" data-id="${item.projectId || ''}">${label}</button>`;
                }).join('');
                suggestBox.setAttribute('aria-hidden', 'false');
            }

            function fetchSuggest(query) {
                if (abortController) abortController.abort();
                abortController = new AbortController();
                fetch(`/doc_editor_api/projects/suggest?q=${encodeURIComponent(query)}`, {
                    signal: abortController.signal
                })
                    .then(res => res.ok ? res.json() : [])
                    .then(data => renderSuggest(Array.isArray(data) ? data : []))
                    .catch(err => {
                        if (err && err.name === 'AbortError') return;
                        hideSuggest();
                    });
            }

            projectNumber.addEventListener('input', function () {
                const q = projectNumber.value.trim();
                if (!q || q === '-') {
                    hideSuggest();
                    return;
                }
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => fetchSuggest(q), 200);
            });

            suggestBox.addEventListener('click', function (e) {
                const btn = e.target && e.target.closest('.doc-suggest-item');
                if (!btn) return;
                const code = btn.getAttribute('data-code') || '';
                const name = btn.getAttribute('data-name') || '';
                const pid = btn.getAttribute('data-id') || '';
                if (code) projectNumber.value = code;
                projectNumber.dataset.projectName = name;
                projectNumber.dataset.projectId = pid;
                hideSuggest();
            });

            document.addEventListener('click', function (e) {
                if (e.target === projectNumber || suggestBox.contains(e.target)) return;
                hideSuggest();
            });

            window.addEventListener('scroll', function () {
                if (suggestBox.getAttribute('aria-hidden') === 'false') {
                    positionSuggest();
                }
            }, true);

            window.addEventListener('resize', function () {
                if (suggestBox.getAttribute('aria-hidden') === 'false') {
                    positionSuggest();
                }
            });
        }

        document.addEventListener('keydown', function (e) {
            if (!tableModal || !tableModal.classList.contains('is-open')) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closeTableModal();
            }
            if (e.key === 'Enter') {
                const el = document.activeElement;
                if (el && el.tagName === 'INPUT' && el.type === 'number') {
                    // 숫자 입력 중 Enter는 적용
                    e.preventDefault();
                    applyTableModal();
                }
            }
        });
    });
})();
