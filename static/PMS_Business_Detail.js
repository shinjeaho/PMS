//검토 예상 진행비
let activeLayouts;
let first;
let second;
let contextTargetRow = null;
// clone 기능 제거됨

//페이지 로드시 작동 함수
document.addEventListener('DOMContentLoaded', async function () {
    try {
        // 저장 버튼에 의한 새로고침인지 확인
        const isButtonReload = sessionStorage.getItem('isButtonReload');
        if (isButtonReload === 'true') {
            const savedTab = sessionStorage.getItem('activeTab');
            if (savedTab) {
                // 복원 시 onclick 기반 탭 클릭 → 이벤트 포함 복원
                const tabButton = document.querySelector(`[onclick*="${savedTab}"]`);
                if (tabButton) tabButton.click();
                else {
                    // 버튼이 없을 경우 직접 표시
                    document.querySelectorAll('.tabcontent').forEach(tab => tab.style.display = 'none');
                    const tabEl = document.getElementById(savedTab);
                    if (tabEl) tabEl.style.display = 'block';
                }
                (`[INFO] 탭 복원 완료 → ${savedTab}`);
            }
            sessionStorage.removeItem('isButtonReload');
        }

        // 1. 기본 이벤트 리스너 설정
        setupEventListeners();

        // 2. 모든 주요 데이터 로딩
        await loadInitialData();

        // 3. UI 업데이트 및 계산
        await updateUIComponents();

        // 4. 차트 및 테이블 초기화
        initializeChartsAndTables();
        updateSum();
        updateRecordsSum();
        // updateFeetable();
        // updateActualFeetable();
        generateComparisonTable();

        const tbody = document.getElementById('quantityModal_A_tbody');

        tbody.addEventListener('contextmenu', function (e) {
            e.preventDefault();

            const targetRow = e.target.closest('tr');
            if (!targetRow) return;

            contextTargetRow = targetRow;

            const menu = document.getElementById('contextMenu');
            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
        });

        // 바깥 클릭 시 메뉴 숨기기
        document.addEventListener('click', () => {
            document.getElementById('contextMenu').style.display = 'none';
        });

        const statusRadios = document.getElementsByName('project_status');
        const yearSelect = document.getElementById('year_select');

        statusRadios.forEach(radio => {
            radio.addEventListener('change', function () {
                if (this.value === '준공' && this.checked) {
                    yearSelect.style.display = 'block';
                } else if (this.checked) {
                    yearSelect.style.display = 'none';
                }
            });
        });
        // 참여 기술자 명단 로드
        await loadParticipantEngineers();
    } catch (error) {
        console.error('[ERROR] Error during initialization:', error);
    }

    const sessionDep = document.getElementById('sessionDep').value;
    const sessionName = document.getElementById('sessionName').value;

    // 권한 부여 성함
    const allowName = ['최태혁', '한형섭', '최범식', '김정욱', '나준영', '최도현', '개발', '관리자'];
    // if (!allowName.includes(sessionName)) {
    //     document.getElementById('EV_printModal').style.display = 'none';
    //     document.getElementById('Dep_printModal').style.display = 'none';

    // }

    if (sessionDep === '공공사업부' || sessionName === '개발' || sessionName === '관리자') {
        document.getElementById('project_delete-button').style.display = 'block';
    }
});

// 1. 이벤트 리스너 설정 함수
function setupEventListeners() {
    //사업명
    const projectName = document.getElementById('headerName').value;
    document.getElementById('projectName').textContent = truncateText(projectName, 30)

    //==========검토
    // 첫 번째 부서 버튼들
    document.getElementById('addBudgetRow').addEventListener('click', () => addRows('Dep_fir_Budget_tbody', 1, true));
    document.getElementById('addRecordRow').addEventListener('click', () => addRows('Dep_fir_Record_tbody', 1, true));
    document.getElementById('removeBudgetRow').addEventListener('click', () => removeRow('Dep_fir_Budget_tbody'));
    document.getElementById('removeRecordRow').addEventListener('click', () => removeRow('Dep_fir_Record_tbody'));
    // 경비 +, - 수정
    if (firstRecords.length === 0) {
        document.getElementById('EXrecordsModal_fir').style.display = 'none';
        document.getElementById('addRecordRow').style.visibility = 'visible';
        document.getElementById('removeRecordRow').style.visibility = 'visible';
    } else {
        document.getElementById('addRecordRow').style.visibility = 'hidden';
        document.getElementById('removeRecordRow').style.visibility = 'hidden';
        document.getElementById('EXrecordsModal_fir').style.display = 'block';
    }

    // 두 번째 부서 버튼들
    document.getElementById('sec_addBudgetRow').addEventListener('click', () => addRows('Dep_sec_Budget_tbody', 1, true));
    document.getElementById('sec_addRecordRow').addEventListener('click', () => addRows('Dep_sec_Record_tbody', 1, true));
    document.getElementById('sec_removeBudgetRow').addEventListener('click', () => removeRow('Dep_sec_Budget_tbody'));
    document.getElementById('sec_removeRecordRow').addEventListener('click', () => removeRow('Dep_sec_Record_tbody'));
    // 경비 +, - 수정
    if (secondRecords.length === 0) {
        document.getElementById('EXrecordsModal_sec').style.display = 'none';
        document.getElementById('sec_addRecordRow').style.visibility = 'visible';
        document.getElementById('sec_removeRecordRow').style.visibility = 'visible';
    } else {
        document.getElementById('sec_addRecordRow').style.visibility = 'hidden';
        document.getElementById('sec_removeRecordRow').style.visibility = 'hidden';
        document.getElementById('EXrecordsModal_sec').style.display = 'block';
    }
    //============


    //경비 수정 모달창
    document.getElementById('modify_addRecordRow').addEventListener('click', () => addRows('Dep_Modify_Record_tbody', 1, true));
    document.getElementById('modify_removeRecordRow').addEventListener('click', () => removeRow('Dep_Modify_Record_tbody'));

    const qtyTbody = document.getElementById('quantityModal_A_tbody');
    if (qtyTbody) {
        qtyTbody.addEventListener('click', (e) => {
            const tr = e.target.closest('tr');
            if (tr) window.__lastPasteRow = tr;
        });

        qtyTbody.addEventListener('paste', (e) => handlePasteAndAddRows(e, 'quantityModal_A_tbody'));
    }


    // 금액 포맷팅
    document.getElementById('outsource_amount').addEventListener('input', function () {
        formatCurrency(this);
    });

    // 하위 탭 전환 스크립트
    document.querySelectorAll('#modal_outsourceModal .sub-tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // 모든 하위 탭 버튼 및 컨텐츠에서 active 제거
            document.querySelectorAll('#modal_outsourceModal .sub-tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('#modal_outsourceModal .sub-tab-pane').forEach(pane => pane.classList.remove('active'));

            // 선택된 하위 탭 버튼 및 컨텐츠에 active 추가
            button.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });

    // 편집 가능한 셀
    const editCells = document.querySelectorAll('.custom-table .edit_cell');
    editCells.forEach(cell => {
        if (!cell.classList.contains('amount-cell')) {
            cell.addEventListener('click', () => makeEditable(cell));
        }
    });

    // 파일 업로드
    setupFileUploadListener();

    // =========================
    // 회의록 탭
    // =========================
    initMeetingUploadModal();
    loadMeetingMinutesList();

    const minutesWriteBtn = document.getElementById('minutesWriteBtn');
    if (minutesWriteBtn) {
        minutesWriteBtn.addEventListener('click', () => {
            openMeetingUploadModal();
        });
    }
}

function updateParticipantEngineersHeader(engineers) {
    const table = document.getElementById('participant_engineers_table');
    if (!table) return;
    const headerContainer = table.previousElementSibling?.previousElementSibling;
    const headerEl = headerContainer?.querySelector('.header-text');
    if (!headerEl) return;

    const counts = { '사책': 0, '분책': 0, '분참': 0 };
    (engineers || []).forEach(eng => {
        const key = eng?.work_position;
        if (key && Object.prototype.hasOwnProperty.call(counts, key)) {
            counts[key] += 1;
        }
    });

    const total = counts['사책'] + counts['분책'] + counts['분참'];
    headerEl.textContent = `참여기술자(사책 : ${counts['사책']} 분책 : ${counts['분책']} 분참 : ${counts['분참']} / 총원 : ${total})`;
}

function exportParticipantEngineersToExcel() {
    const contractCode = document.getElementById('project-contractCode')?.value || '';
    const projectName = document.getElementById('headerName')?.value || '';
    const tbody = document.getElementById('participant_engineers_tbody');
    if (!tbody || typeof XLSX === 'undefined') return;

    const groups = { '사책': [], '분책': [], '분참': [] };
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach(row => {
        const cells = row.cells;
        if (!cells || cells.length < 3) return;
        const role = cells[1]?.querySelector('select')?.value || '';
        const name = (cells[2]?.textContent || '').trim();
        if (!role || role === '선택하세요.') return;
        if (!name) return;
        if (Object.prototype.hasOwnProperty.call(groups, role)) {
            groups[role].push(name);
        }
    });

    const headers = ['사업번호', '사업명', '사책', '분책'];
    const row = [
        contractCode,
        projectName,
        groups['사책'].join(', '),
        groups['분책'].join(', ')
    ];

    const partNames = groups['분참'];
    if (partNames.length === 0) {
        headers.push('분참');
        row.push('');
    } else {
        partNames.forEach((name, idx) => {
            headers.push(`분참${idx + 1}`);
            row.push(name);
        });
    }

    const data = [headers, row];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '참여기술자');

    const safeCode = contractCode || 'project';
    XLSX.writeFile(wb, `${safeCode}_참여기술자.xlsx`);
}

function escapeHtmlSafe(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =========================
// 회의록 업로드/조회
// =========================
let meetingSelectedFile = null;
let meetingSelectedAttachments = [];

function loadMeetingMinutesList() {
    const tbody = document.getElementById('meetingList_tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const currentContract = (document.getElementById('project-contractCode')?.value || '').trim();

    fetch('/doc_editor_api/meeting/list')
        .then(res => res.json())
        .then(data => {
            const items = Array.isArray(data.items) ? data.items : [];
            const filtered = currentContract
                ? items.filter(it => String(it.contractcode || '').trim() === currentContract)
                : items;

            if (filtered.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="6" style="padding: 15px; font-size: 16px; text-align:center;">데이터가 없습니다</td>';
                tbody.appendChild(row);
                return;
            }

            filtered.forEach(m => {
                const row = document.createElement('tr');
                if (m.id) row.dataset.meetingId = String(m.id);
                row.innerHTML = `
                    <td style="text-align:center; vertical-align:middle;">${escapeHtmlSafe(m.doc_number || '-')}</td>
                    <td style="text-align:center; vertical-align:middle;">${escapeHtmlSafe(m.contractcode || currentContract || '-')}</td>
                    <td style="padding: 12px 12px; cursor: pointer;" class="meeting-title-cell">${escapeHtmlSafe(m.title || m.original_name || '-') }</td>
                    <td style="text-align:center; vertical-align:middle;">${escapeHtmlSafe(m.author || '-') }</td>
                    <td style="text-align:center; vertical-align:middle;" class="meeting-date-cell">${escapeHtmlSafe(m.created_at || '-') }</td>
                    <td style="text-align:center; vertical-align:middle;" class="meeting-view-count-cell">${escapeHtmlSafe(String(m.view_count ?? 0))}</td>
                `;
                const titleCell = row.querySelector('.meeting-title-cell');
                if (titleCell && m.file_path) {
                    titleCell.addEventListener('click', () => openMeetingViewModal(m));
                    titleCell.addEventListener('mouseenter', () => { titleCell.style.backgroundColor = '#f1f5f9'; });
                    titleCell.addEventListener('mouseleave', () => { titleCell.style.backgroundColor = ''; });
                }
                tbody.appendChild(row);
            });
        })
        .catch(err => {
            console.error('meeting list error:', err);
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" style="padding: 15px; font-size: 16px; text-align:center; color:#b00020;">데이터가 존재하지 않습니다</td>';
            tbody.appendChild(row);
        });
}

function initMeetingUploadModal() {
    const modal = document.getElementById('meetingUploadModal');
    if (!modal) return;

    const dropzone = document.getElementById('meetingDropzone');
    const fileInput = document.getElementById('meetingPdfInput');
    const pickBtn = document.getElementById('meetingPickFileBtn');
    const attachmentDropzone = document.getElementById('meetingAttachmentDropzone');
    const attachmentInput = document.getElementById('meetingAttachmentInput');
    const pickAttachmentBtn = document.getElementById('meetingPickAttachmentBtn');
    const projectInput = document.getElementById('meetingProjectNumber');
    const projectNameInput = document.getElementById('meetingProjectName');
    const suggestCell = modal.querySelector('.meeting-suggest-cell');

    let suggestBox = document.getElementById('meetingProjectSuggest');
    if (!suggestBox && suggestCell) {
        suggestBox = document.createElement('div');
        suggestBox.id = 'meetingProjectSuggest';
        suggestBox.className = 'meeting-suggest';
        suggestBox.setAttribute('aria-hidden', 'true');
        suggestCell.appendChild(suggestBox);
    }

    let suggestTimer = null;
    let suggestAbort = null;

    const hideProjectSuggest = () => {
        if (!suggestBox) return;
        suggestBox.innerHTML = '';
        suggestBox.setAttribute('aria-hidden', 'true');
    };

    const renderProjectSuggest = (items) => {
        if (!suggestBox) return;
        if (!Array.isArray(items) || items.length === 0) {
            hideProjectSuggest();
            return;
        }

        suggestBox.innerHTML = '';
        items.forEach(item => {
            const code = String(item.contractCode || '').trim();
            const name = String(item.projectName || '').trim();
            if (!code && !name) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = code && name ? `${code} | ${name}` : (code || name);
            btn.addEventListener('click', () => {
                if (projectInput) projectInput.value = code;
                if (projectNameInput) projectNameInput.value = name;
                hideProjectSuggest();
            });
            suggestBox.appendChild(btn);
        });

        if (!suggestBox.children.length) {
            hideProjectSuggest();
            return;
        }

        suggestBox.setAttribute('aria-hidden', 'false');
    };

    const requestProjectSuggest = (query) => {
        if (!query || !query.trim()) {
            hideProjectSuggest();
            return;
        }

        if (suggestAbort) suggestAbort.abort();
        suggestAbort = new AbortController();

        fetch(`/doc_editor_api/projects/suggest?q=${encodeURIComponent(query.trim())}`, {
            signal: suggestAbort.signal
        })
            .then(res => res.ok ? res.json() : [])
            .then(data => renderProjectSuggest(Array.isArray(data) ? data : []))
            .catch(err => {
                if (err && err.name === 'AbortError') return;
                hideProjectSuggest();
            });
    };

    if (pickBtn && fileInput) {
        pickBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const files = Array.from(fileInput.files || []);
            fileInput.value = '';
            if (files.length === 0) return;
            handleMeetingPdfFiles(files);
        });
    }

    if (pickAttachmentBtn && attachmentInput) {
        pickAttachmentBtn.addEventListener('click', () => attachmentInput.click());
    }

    if (attachmentInput) {
        attachmentInput.addEventListener('change', () => {
            const files = Array.from(attachmentInput.files || []);
            attachmentInput.value = '';
            if (files.length === 0) return;
            handleMeetingAttachmentFiles(files);
        });
    }

    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('is-dragover');
        });
        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropzone.classList.remove('is-dragover');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('is-dragover');
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length === 0) return;
            handleMeetingPdfFiles(files);
        });
    }

    if (attachmentDropzone) {
        attachmentDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            attachmentDropzone.classList.add('is-dragover');
        });
        attachmentDropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            attachmentDropzone.classList.remove('is-dragover');
        });
        attachmentDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            attachmentDropzone.classList.remove('is-dragover');
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length === 0) return;
            handleMeetingAttachmentFiles(files);
        });
    }

    if (projectInput) {
        projectInput.setAttribute('autocomplete', 'off');
        projectInput.addEventListener('input', () => {
            if (projectNameInput) projectNameInput.value = '';
            const q = projectInput.value || '';
            if (suggestTimer) clearTimeout(suggestTimer);
            suggestTimer = setTimeout(() => requestProjectSuggest(q), 180);
        });
        projectInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideProjectSuggest();
        });
    }

    document.addEventListener('click', (e) => {
        if (!suggestBox || !projectInput) return;
        const target = e.target;
        if (target === projectInput) return;
        if (suggestBox.contains(target)) return;
        hideProjectSuggest();
    });
}

function openMeetingUploadModal() {
    const modal = document.getElementById('meetingUploadModal');
    if (!modal) return;
    modal.classList.add('show');
    document.body.classList.add('modal-open');

    const authorName = document.getElementById('sessionName')?.value || '';
    const authorInput = document.getElementById('meetingAuthor');
    if (authorInput) authorInput.value = authorName;

    const createdAtInput = document.getElementById('meetingCreatedAt');
    if (createdAtInput) createdAtInput.value = formatDateYMD(new Date());

    const currentContract = document.getElementById('project-contractCode')?.value || '';
    const currentProjectName = document.getElementById('headerName')?.value || '';

    const projectNumberInput = document.getElementById('meetingProjectNumber');
    if (projectNumberInput) projectNumberInput.value = currentContract;

    const projectNameInput = document.getElementById('meetingProjectName');
    if (projectNameInput) projectNameInput.value = currentProjectName;

    const meetingTitleInput = document.getElementById('meetingTitle');
    if (meetingTitleInput) meetingTitleInput.value = '';

    const agendaTitleInput = document.getElementById('meetingAgendaTitle');
    if (agendaTitleInput) agendaTitleInput.value = '';
    const meetingDateStartInput = document.getElementById('meetingDateStart');
    if (meetingDateStartInput) meetingDateStartInput.value = '';
    const meetingTimeStartHourInput = document.getElementById('meetingTimeStartHour');
    if (meetingTimeStartHourInput) meetingTimeStartHourInput.value = '';
    const meetingTimeStartMinuteInput = document.getElementById('meetingTimeStartMinute');
    if (meetingTimeStartMinuteInput) meetingTimeStartMinuteInput.value = '';
    const meetingTimeEndHourInput = document.getElementById('meetingTimeEndHour');
    if (meetingTimeEndHourInput) meetingTimeEndHourInput.value = '';
    const meetingTimeEndMinuteInput = document.getElementById('meetingTimeEndMinute');
    if (meetingTimeEndMinuteInput) meetingTimeEndMinuteInput.value = '';
    const meetingPlaceInput = document.getElementById('meetingPlace');
    if (meetingPlaceInput) meetingPlaceInput.value = '';
    const meetingOrganizerInput = document.getElementById('meetingOrganizer');
    if (meetingOrganizerInput) meetingOrganizerInput.value = '';
    const meetingAttendeesInput = document.getElementById('meetingAttendees');
    if (meetingAttendeesInput) meetingAttendeesInput.value = '';

    meetingSelectedFile = null;
    meetingSelectedAttachments = [];
    renderMeetingPendingFile(meetingSelectedFile);
    renderMeetingAttachmentPendingFiles();

    fetch('/doc_editor_api/meeting/next_number')
        .then(res => res.json())
        .then(data => {
            const docInput = document.getElementById('meetingDocNumber');
            if (docInput) docInput.value = data.docNumber || '';
        })
        .catch(err => {
            console.error('[meeting] doc number fetch failed:', err);
        });
}

function closeMeetingUploadModal() {
    const modal = document.getElementById('meetingUploadModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
}

function formatDateYMD(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function normalizeTime24(value) {
    const hhRaw = (value?.hour || '').trim();
    const mmRaw = (value?.minute || '').trim();
    if (!hhRaw && !mmRaw) return '';
    if (!/^\d{1,2}$/.test(hhRaw) || !/^\d{1,2}$/.test(mmRaw)) return null;
    const hh = Number(hhRaw);
    const mm = Number(mmRaw);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function handleMeetingPdfFiles(files) {
    const pdfFiles = files.filter(f => isPdfFile(f));
    if (pdfFiles.length === 0) {
        alert('PDF 파일만 업로드할 수 있습니다.');
        return;
    }
    meetingSelectedFile = pdfFiles[0];
    renderMeetingPendingFile(meetingSelectedFile);
}

function isMeetingAttachmentFile(file) {
    if (!file) return false;
    const name = (file.name || '').toLowerCase();
    return (
        name.endsWith('.hwp') ||
        name.endsWith('.hwpx') ||
        name.endsWith('.xls') ||
        name.endsWith('.xlsx') ||
        name.endsWith('.pdf')
    );
}

function handleMeetingAttachmentFiles(files) {
    const validFiles = files.filter(f => isMeetingAttachmentFile(f));
    if (validFiles.length === 0) {
        alert('첨부파일은 한글(HWP/HWPX), 엑셀(XLS/XLSX), PDF만 업로드할 수 있습니다.');
        return;
    }

    const dedupMap = new Map();
    meetingSelectedAttachments.forEach((f) => {
        const key = `${f.name}__${f.size}__${f.lastModified}`;
        dedupMap.set(key, f);
    });
    validFiles.forEach((f) => {
        const key = `${f.name}__${f.size}__${f.lastModified}`;
        dedupMap.set(key, f);
    });

    meetingSelectedAttachments = Array.from(dedupMap.values());
    renderMeetingAttachmentPendingFiles();
}

function isPdfFile(file) {
    if (!file) return false;
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return true;
    return (file.type || '') === 'application/pdf';
}

function summarizeMeetingUploadError(message) {
    const raw = String(message || '').trim();
    if (!raw) return '원인을 확인할 수 없는 오류가 발생했습니다.';

    const lower = raw.toLowerCase();
    if (raw.includes('파일이 선택되지 않았습니다')) {
        return '회의록 PDF 파일이 선택되지 않았습니다.';
    }
    if (raw.includes('첨부파일은 한글/엑셀/PDF')) {
        return '첨부파일 형식이 올바르지 않습니다. 한글/엑셀/PDF만 가능합니다.';
    }
    if (raw.includes('db connection failed') || raw.includes('DB connection failed')) {
        return 'DB 연결 문제로 저장에 실패했습니다.';
    }
    if (lower.includes('doesn\'t exist') || lower.includes('unknown column') || lower.includes('unknown table')) {
        return 'DB 스키마가 맞지 않아 저장에 실패했습니다. 테이블/컬럼 구성을 확인해 주세요.';
    }
    if (lower.includes('foreign key') || lower.includes('cannot add or update a child row')) {
        return '첨부파일 참조키(FK) 제약 오류로 저장에 실패했습니다.';
    }
    if (lower.includes('cannot be null') || lower.includes('not null')) {
        return '필수 입력값이 비어 있어 저장에 실패했습니다.';
    }
    if (lower.includes('data too long')) {
        return '입력값 길이가 허용 범위를 초과했습니다.';
    }
    return `저장에 실패했습니다. (${raw})`;
}

function uploadMeetingPdf(file) {
    const docNumber = document.getElementById('meetingDocNumber')?.value || '';
    const contractcode = document.getElementById('meetingProjectNumber')?.value || '';
    const projectName = document.getElementById('meetingProjectName')?.value || '';
    const agendaTitle = document.getElementById('meetingAgendaTitle')?.value || document.getElementById('meetingTitle')?.value || '';
    const meetingDateStart = document.getElementById('meetingDateStart')?.value || '';
    const meetingTimeStartHour = document.getElementById('meetingTimeStartHour')?.value || '';
    const meetingTimeStartMinute = document.getElementById('meetingTimeStartMinute')?.value || '';
    const meetingTimeEndHour = document.getElementById('meetingTimeEndHour')?.value || '';
    const meetingTimeEndMinute = document.getElementById('meetingTimeEndMinute')?.value || '';
    const meetingTimeStart = normalizeTime24({ hour: meetingTimeStartHour, minute: meetingTimeStartMinute });
    const meetingTimeEnd = normalizeTime24({ hour: meetingTimeEndHour, minute: meetingTimeEndMinute });
    if ((meetingTimeStartHour || meetingTimeStartMinute) && meetingTimeStart === null) {
        alert('시작 시간은 HH/MM 칸에 24시제 숫자로 입력해 주세요. 예: 15 / 30');
        return;
    }
    if ((meetingTimeEndHour || meetingTimeEndMinute) && meetingTimeEnd === null) {
        alert('종료 시간은 HH/MM 칸에 24시제 숫자로 입력해 주세요. 예: 17 / 00');
        return;
    }
    const meetingDateTimeStart = meetingDateStart && meetingTimeStart ? `${meetingDateStart} ${meetingTimeStart}:00` : '';
    const meetingDateTimeEnd = meetingTimeEnd || '';
    const meetingDateTime = meetingDateTimeStart || '';
    const meetingPlace = document.getElementById('meetingPlace')?.value || '';
    const organizer = document.getElementById('meetingOrganizer')?.value || '';
    const attendees = document.getElementById('meetingAttendees')?.value || '';
    const userName = document.getElementById('sessionName')?.value || '';
    const createdAt = document.getElementById('meetingCreatedAt')?.value || formatDateYMD(new Date());
    const author = document.getElementById('meetingAuthor')?.value || userName;
    const pdfUploadList = document.getElementById('meetingPdfUploadList');
    const attachmentUploadList = document.getElementById('meetingAttachmentUploadList');
    if (pdfUploadList) {
        pdfUploadList.innerHTML = '<div class="meeting-upload-item"><span>회의록 PDF 업로드 중...</span></div>';
    }
    if (attachmentUploadList) {
        attachmentUploadList.innerHTML = '<div class="meeting-upload-item"><span>첨부파일 업로드 중...</span></div>';
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('docNumber', docNumber);
    fd.append('contractcode', contractcode);
    fd.append('projectName', projectName);
    fd.append('agendaTitle', agendaTitle);
    fd.append('meetingDateStart', meetingDateStart);
    fd.append('meetingTimeStart', meetingTimeStart);
    fd.append('meetingTimeEnd', meetingTimeEnd);
    fd.append('meetingDateTime', meetingDateTime);
    fd.append('meetingDateTimeStart', meetingDateTimeStart);
    fd.append('meetingDateTimeEnd', meetingDateTimeEnd);
    fd.append('meetingPlace', meetingPlace);
    fd.append('organizer', organizer);
    fd.append('attendees', attendees);
    fd.append('createdAt', createdAt);
    fd.append('author', author);
    fd.append('userName', userName);
    meetingSelectedAttachments.forEach((attachment) => {
        fd.append('attachments', attachment);
    });

    fetch('/doc_editor_api/meeting/upload_pdf', {
        method: 'POST',
        body: fd
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || '업로드 실패');
            }
            meetingSelectedFile = null;
            meetingSelectedAttachments = [];
            if (pdfUploadList) {
                pdfUploadList.innerHTML = '';
                const item = document.createElement('div');
                item.className = 'meeting-upload-item';
                const nameEl = document.createElement('span');
                nameEl.textContent = data.originalName || file.name;
                const actions = document.createElement('div');
                actions.className = 'meeting-upload-actions';

                const link = document.createElement('a');
                link.href = data.fileUrl || '#';
                link.textContent = '보기';
                link.target = '_blank';

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.textContent = '삭제';
                delBtn.addEventListener('click', () => {
                    deleteMeetingFile(data.recordId);
                });

                actions.appendChild(link);
                actions.appendChild(delBtn);
                item.appendChild(nameEl);
                item.appendChild(actions);
                pdfUploadList.appendChild(item);
            }

            if (attachmentUploadList) {
                attachmentUploadList.innerHTML = '';
                const attachments = Array.isArray(data.attachments) ? data.attachments : [];
                if (attachments.length === 0) {
                    attachmentUploadList.innerHTML = '<div class="meeting-upload-empty">첨부파일 없음</div>';
                } else {
                    attachments.forEach((att) => {
                        const item = document.createElement('div');
                        item.className = 'meeting-upload-item';
                        const nameEl = document.createElement('span');
                        nameEl.textContent = att.originalName || '첨부파일';
                        const actions = document.createElement('div');
                        actions.className = 'meeting-upload-actions';

                        const link = document.createElement('a');
                        link.href = att.fileUrl || '#';
                        link.textContent = '보기';
                        link.target = '_blank';

                        actions.appendChild(link);
                        item.appendChild(nameEl);
                        item.appendChild(actions);
                        attachmentUploadList.appendChild(item);
                    });
                }
            }

            alert('회의록이 성공적으로 저장되었습니다.');
            closeMeetingUploadModal();
            loadMeetingMinutesList();
        })
        .catch(err => {
            console.error('[meeting] upload failed:', err);
            renderMeetingPendingFile(meetingSelectedFile);
            renderMeetingAttachmentPendingFiles();
            alert(`회의록 저장 실패\n- ${summarizeMeetingUploadError(err?.message)}`);
        });
}

function renderMeetingPendingFile(file) {
    const uploadList = document.getElementById('meetingPdfUploadList');
    if (!uploadList) return;
    uploadList.innerHTML = '';

    if (!file) {
        uploadList.innerHTML = '<div class="meeting-upload-empty">선택된 회의록 PDF 파일 없음</div>';
        return;
    }

    const item = document.createElement('div');
    item.className = 'meeting-upload-item';
    const nameEl = document.createElement('span');
    nameEl.textContent = file.name;
    const actions = document.createElement('div');
    actions.className = 'meeting-upload-actions';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '삭제';
    removeBtn.addEventListener('click', () => {
        meetingSelectedFile = null;
        renderMeetingPendingFile(meetingSelectedFile);
    });

    actions.appendChild(removeBtn);
    item.appendChild(nameEl);
    item.appendChild(actions);
    uploadList.appendChild(item);
}

function renderMeetingAttachmentPendingFiles() {
    const uploadList = document.getElementById('meetingAttachmentUploadList');
    if (!uploadList) return;
    uploadList.innerHTML = '';

    if (!Array.isArray(meetingSelectedAttachments) || meetingSelectedAttachments.length === 0) {
        uploadList.innerHTML = '<div class="meeting-upload-empty">선택된 첨부파일 없음</div>';
        return;
    }

    meetingSelectedAttachments.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'meeting-upload-item';
        const nameEl = document.createElement('span');
        nameEl.textContent = file.name;
        const actions = document.createElement('div');
        actions.className = 'meeting-upload-actions';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '삭제';
        removeBtn.addEventListener('click', () => {
            meetingSelectedAttachments = meetingSelectedAttachments.filter((_, i) => i !== index);
            renderMeetingAttachmentPendingFiles();
        });

        actions.appendChild(removeBtn);
        item.appendChild(nameEl);
        item.appendChild(actions);
        uploadList.appendChild(item);
    });
}

function submitMeetingUpload() {
    if (!meetingSelectedFile) {
        alert('업로드할 PDF 파일을 선택해 주세요.');
        return;
    }
    uploadMeetingPdf(meetingSelectedFile);
}

function buildMeetingFileUrl(meeting) {
    const meetingId = meeting?.id;
    if (meetingId) {
        const displayName = 'PDF';
        return `/doc_editor_api/meeting/file/${encodeURIComponent(meetingId)}/${encodeURIComponent(displayName)}`;
    }
    return meeting?.file_path || '';
}

function buildMeetingDisplaySlug(originalName, meetingId) {
    const fallbackBase = `meeting_${meetingId || 'file'}`;
    const source = (originalName || '').trim();
    const dotIndex = source.lastIndexOf('.');
    const ext = dotIndex > 0 ? source.substring(dotIndex + 1) : 'pdf';
    const base = dotIndex > 0 ? source.substring(0, dotIndex) : source;

    const asciiBase = (base || '')
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_\.\-]+|[_\.\-]+$/g, '');

    const safeBase = asciiBase || fallbackBase;
    const safeExt = (ext || 'pdf').replace(/[^A-Za-z0-9]/g, '') || 'pdf';
    return `${safeBase}.${safeExt}`;
}

function buildMeetingPdfFrameSrc(meeting) {
    const filePath = buildMeetingFileUrl(meeting);
    if (!filePath) return '';
    const separator = filePath.includes('#') ? '&' : '#';
    return `${filePath}${separator}toolbar=0&navpanes=0&scrollbar=0`;
}

function formatMeetingDateTimeForView(value) {
    const raw = (value || '').toString().trim();
    if (!raw) return '';
    const normalized = raw.replace('T', ' ');
    const m = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
    if (m) return `${m[1]} ${m[2]}`;
    return normalized;
}

function formatMeetingEndTimeForView(value) {
    const raw = (value || '').toString().trim();
    if (!raw) return '';
    const normalized = raw.replace('T', ' ');
    const m = normalized.match(/(\d{2}:\d{2})(?::\d{2})?$/);
    if (m) return m[1];
    return normalized;
}

function buildMeetingDateRangeForView(meeting) {
    const start = formatMeetingDateTimeForView(meeting?.meeting_datetime);
    const end = formatMeetingEndTimeForView(meeting?.meeting_end_datetime);
    if (start && end) return `${start} ~ ${end}`;
    if (start) return start;
    if (end) return end;
    return '-';
}

function renderMeetingViewAttachments(items) {
    const host = document.getElementById('meetingViewAttachments');
    if (!host) return;
    host.innerHTML = '';

    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
        host.innerHTML = '<div class="meeting-view-attachments-empty">첨부파일 없음</div>';
        return;
    }

    list.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'meeting-view-attachment-item';

        const nameEl = document.createElement('div');
        nameEl.textContent = item?.original_name || '첨부파일';

        const link = document.createElement('a');
        link.className = 'meeting-view-attachment-link';
        link.href = item?.file_path || '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '다운로드';

        row.appendChild(nameEl);
        row.appendChild(link);
        host.appendChild(row);
    });
}

function loadMeetingAttachments(meetingId) {
    renderMeetingViewAttachments([]);
    const host = document.getElementById('meetingViewAttachments');
    if (host) {
        host.innerHTML = '<div class="meeting-view-attachments-empty">불러오는 중...</div>';
    }

    fetch(`/doc_editor_api/meeting/attachments?meeting_id=${encodeURIComponent(meetingId)}`)
        .then(res => res.json())
        .then(data => {
            if (!data?.success) {
                renderMeetingViewAttachments([]);
                return;
            }
            renderMeetingViewAttachments(Array.isArray(data.items) ? data.items : []);
        })
        .catch(() => {
            renderMeetingViewAttachments([]);
        });
}

function deleteMeetingFile(recordId) {
    if (!recordId) return;
    if (!confirm('삭제하시겠습니까?')) return;

    fetch('/doc_editor_api/meeting/delete_file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId })
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || '삭제 실패');
            }
            const pdfUploadList = document.getElementById('meetingPdfUploadList');
            const attachmentUploadList = document.getElementById('meetingAttachmentUploadList');
            if (pdfUploadList) pdfUploadList.innerHTML = '<div class="meeting-upload-empty">선택된 회의록 PDF 파일 없음</div>';
            if (attachmentUploadList) attachmentUploadList.innerHTML = '<div class="meeting-upload-empty">선택된 첨부파일 없음</div>';
            loadMeetingMinutesList();
        })
        .catch(err => {
            console.error('[meeting] delete failed:', err);
            alert(err.message || '삭제에 실패했습니다.');
        });
}

function openMeetingViewModal(meeting) {
    const modal = document.getElementById('meetingViewModal');
    const frame = document.getElementById('meetingViewFrame');
    if (!modal || !frame) return;
    const body = modal.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
    const base = buildMeetingFileUrl(meeting);
    window.meetingViewCurrentId = meeting?.id || null;
    window.meetingViewCurrentFile = base;
    frame.src = '';
    frame.src = buildMeetingPdfFrameSrc(meeting);
    if (meeting?.id) {
        loadMeetingAttachments(meeting.id);
    } else {
        renderMeetingViewAttachments([]);
    }

    // 회의록 조회자 로그 저장 요청 추가
    if (meeting?.id) {
        fetch('/doc_editor_api/meeting/view', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: meeting.id })
        })
            .then(res => res.json())
            .then(data => {
                if (!data?.success) return;
                if (typeof data.view_count !== 'number') return;
                meeting.view_count = data.view_count;
                const row = document.querySelector(`tr[data-meeting-id="${meeting.id}"]`);
                const countCell = row?.querySelector('.meeting-view-count-cell');
                if (countCell) countCell.textContent = String(data.view_count);
            })
            .catch(err => {
                console.warn('[meeting] view count update failed:', err);
            });
    }

    const currentContract = document.getElementById('project-contractCode')?.value || '-';
    const currentProjectName = document.getElementById('headerName')?.value || '-';

    const docEl = document.getElementById('meetingViewDocNumber');
    if (docEl) docEl.textContent = meeting?.doc_number || '-';
    const createdEl = document.getElementById('meetingViewCreatedAt');
    if (createdEl) createdEl.textContent = meeting?.created_at || '-';
    const authorEl = document.getElementById('meetingViewAuthor');
    if (authorEl) authorEl.textContent = meeting?.author || '-';
    const meetingDateEl = document.getElementById('meetingViewMeetingDate');
    if (meetingDateEl) meetingDateEl.textContent = buildMeetingDateRangeForView(meeting);
    const meetingPlaceEl = document.getElementById('meetingViewMeetingPlace');
    if (meetingPlaceEl) meetingPlaceEl.textContent = meeting?.meeting_place || '-';
    const contractEl = document.getElementById('meetingViewContract');
    if (contractEl) contractEl.textContent = meeting?.contractcode || currentContract || '-';
    const projectNameEl = document.getElementById('meetingViewProjectName');
    if (projectNameEl) projectNameEl.textContent = meeting?.project_name || currentProjectName || '-';
    const titleEl = document.getElementById('meetingViewTitle');
    if (titleEl) titleEl.textContent = meeting?.title || meeting?.original_name || '-';

    modal.classList.add('show');
    document.body.classList.add('modal-open');

    modal.addEventListener('click', meetingViewBackdropHandler);
}

function openMeetingViewerModal() {
    const viewerModal = document.getElementById('meetingViewerModal');
    if (!viewerModal) return;
    const meetingId = window.meetingViewCurrentId;
    if (!meetingId) return;

    loadMeetingViewerList(meetingId);
    viewerModal.classList.add('show');
    document.body.classList.add('modal-open');
    viewerModal.addEventListener('click', meetingViewerBackdropHandler);
}

function closeMeetingViewerModal() {
    const viewerModal = document.getElementById('meetingViewerModal');
    if (!viewerModal) return;
    viewerModal.classList.remove('show');
    document.body.classList.remove('modal-open');
    viewerModal.removeEventListener('click', meetingViewerBackdropHandler);
}

function meetingViewerBackdropHandler(event) {
    const viewerModal = document.getElementById('meetingViewerModal');
    if (!viewerModal) return;
    if (event.target === viewerModal) {
        closeMeetingViewerModal();
    }
}

function loadMeetingViewerList(meetingId) {
    const tbody = document.getElementById('meetingViewerTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="padding: 12px; text-align:center;">불러오는 중...</td></tr>';

    fetch(`/doc_editor_api/meeting/viewers?meeting_id=${encodeURIComponent(meetingId)}`)
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding: 12px; text-align:center;">데이터가 없습니다</td></tr>';
                return;
            }
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding: 12px; text-align:center;">데이터가 없습니다</td></tr>';
                return;
            }
            tbody.innerHTML = '';
            items.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtmlSafe(item.viewed_at || '-')}</td>
                    <td>${escapeHtmlSafe(item.user_name || '-')}</td>
                    <td>${escapeHtmlSafe(item.department || '-')}</td>
                    <td>${escapeHtmlSafe(item.position || '-')}</td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(() => {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 12px; text-align:center;">데이터가 없습니다</td></tr>';
        });
}

function closeMeetingViewModal() {
    const modal = document.getElementById('meetingViewModal');
    const frame = document.getElementById('meetingViewFrame');
    if (!modal || !frame) return;
    frame.src = '';
    const body = modal.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
    window.meetingViewCurrentFile = '';
    renderMeetingViewAttachments([]);
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');

    modal.removeEventListener('click', meetingViewBackdropHandler);
}

function meetingViewDownload() {
    const filePath = window.meetingViewCurrentFile || '';
    if (!filePath) return;
    const link = document.createElement('a');
    link.href = filePath;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function meetingViewPrint() {
    const frame = document.getElementById('meetingViewFrame');
    if (!frame) return;
    try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
    } catch (e) {
        const filePath = window.meetingViewCurrentFile || '';
        if (!filePath) return;
        const win = window.open(filePath, '_blank');
        if (!win) return;
        win.addEventListener('load', () => {
            win.focus();
            win.print();
        });
    }
}

function meetingViewBackdropHandler(event) {
    const modal = document.getElementById('meetingViewModal');
    if (!modal) return;
    if (event.target === modal) {
        closeMeetingViewModal();
    }
}

// 참여 기술자 명단 로드 함수
async function loadParticipantEngineers() {
    const contractCode = document.getElementById('project-contractCode')?.value;
    if (!contractCode) return;
    try {
        const res = await fetch(`/api/get_project_engineers?contract_code=${encodeURIComponent(contractCode)}`);
        const data = await res.json();
        if (!data.success) return;
        const tbody = document.getElementById('participant_engineers_tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const engineers = data.engineers || [];
        updateParticipantEngineersHeader(engineers);
        if (engineers.length === 0) {
            // 기본 한 줄 생성 (빈 입력을 위해)
            addRows('participant_engineers_tbody', 1, true);
            return;
        }
        engineers.forEach(eng => {
            const tr = document.createElement('tr');
            // 0 체크박스
            const tdCb = document.createElement('td');
            tdCb.style.textAlign = 'center';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'row-check';
            tdCb.appendChild(cb);
            tr.appendChild(tdCb);
            // 1 담당업무 select
            const tdWork = document.createElement('td');
            const sel = document.createElement('select');
            ['선택하세요.', '사책', '분책', '분참'].forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v;
                if (v === (eng.work_position || '')) opt.selected = true;
                sel.appendChild(opt);
            });
            tdWork.appendChild(sel);
            tr.appendChild(tdWork);
            // 2 성명
            const tdName = document.createElement('td');
            tdName.className = 'edit_cell';
            tdName.textContent = eng.name || '';
            tdName.onclick = function () { TextChange(this, true); };
            tr.appendChild(tdName);
            // 3 비고
            const tdRemark = document.createElement('td');
            tdRemark.className = 'edit_cell';
            tdRemark.textContent = eng.remark || '';
            tdRemark.onclick = function () { TextChange(this, true); };
            tr.appendChild(tdRemark);
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn('[WARN] 참여 기술자 로드 실패:', e);
    }
}

// 2. 초기 데이터 로딩 함수
async function loadInitialData() {
    await Promise.all([
        fetchLayoutState(),
        updateRealLaborCost(),
        updateRealRecordResult(),
        updateFileList(),
        loadEditableOutsourcingTable(),
        updateOutsourcingTable(),// 수정 필
        updateOutsourcingMoneyPaymentTable(),
        updateOutsourcingMoneyPaymentView(),
        // updateOutsourcingExamine()
    ]);

    // 진행률 개요 테이블 동적 로딩
    try {
        await loadProgressOverview();
    } catch (e) {
        console.warn('[WARN] 진행률 개요 로드 실패:', e);
    }

    await Promise.all([
        loadLatestChange(),
        loadLatestReview(),
        loadLatestReceipt()
    ]);
}

// 3. UI 업데이트 함수
async function updateUIComponents() {
    await Promise.all([
        updateBudgetResult(),
        updateRecordResult(),
        // updateRealResults(),
        // updateProgressBar(),
    ]);




    initializeModalSections();
    processTableCells(document.querySelectorAll('.Budget_table td'));
    processTableCells(document.querySelectorAll('.specific-table td'));
    makeYear();
}

// 4. 차트 및 테이블 초기화 함수
async function initializeChartsAndTables() {
    // 부서 버튼 초기화
    initializeDepartmentButtons();

    await Promise.all([
        createMonthButtons(),
        createProjectChangeTable(),
        fetchDepartmentData()
    ]);
}



//외부인력 단가 일급 및 시급 계산 식
function updateRatesForRow(row) {
    const monthlyRate = parseFloat(row.cells[1].innerText.replace(/,/g, '')) || 0;
    const workingDays = 22; // 기준 근무일수
    const workingHours = 8; // 기준 하루 근무시간

    const dailyRate = calculateDailyRate(monthlyRate, workingDays);
    const hourlyRate = calculateHourlyRate(monthlyRate, workingDays, workingHours);

    // 결과 업데이트
    row.cells[2].innerText = formatWithCommas(dailyRate); // 일급
    row.cells[3].innerText = formatWithCommas(hourlyRate); // 시급
}



// 부서 버튼 초기화 함수
function initializeDepartmentButtons() {
    const departmentButtons = document.querySelectorAll('.sub-tab button');
    if (departmentButtons.length > 0) {
        departmentButtons[0].classList.add('active');
        departmentButtons[0].click();
    }

    departmentButtons.forEach(button => {
        button.addEventListener('click', function () {
            departmentButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            const selectedDepartment = this.textContent.trim();
            const headerText = document.getElementById('Dep_fir_Bud_header_text');
            headerText.textContent = selectedDepartment;
            fetchQuantityLogs();
            createMonthButtons();
        });
    });
}




// 셀 기본값 변경 함수
function processTableCells(cells) {
    cells.forEach((cell) => {
        if (cell.id === "position") return;

        const value = (cell.innerText || '').trim();

        // '-' 는 화면 표시용으로 유지 (연구소 인건비 등). 0.00 은 0으로 정규화.
        if (value === '0.00') {
            cell.innerText = '0';
            return;
        }

        // 숫자면 정수 포맷으로 표시. '-' 등 비숫자는 유지
        const numericValue = parseFloat(value.replace(/,/g, ''));
        if (!isNaN(numericValue) && value !== '-') {
            cell.innerText = Math.round(numericValue).toLocaleString();
        }
    });
}


// 메인 탭 관리 함수
function openTab(evt, tabName) {
    var i, tabcontent, tablinks;

    // 모든 tabcontent를 숨김
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // 모든 tablinks에서 active 클래스를 제거
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // 현재 tabcontent를 표시하고, 해당 버튼에 active 클래 추가
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";

}

function EX_openTab(evt, tabName) {
    // 모든 탭 콘텐츠 숨기기
    let tabContents = document.getElementsByClassName("ex_tabcontent");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }

    // 모든 버튼의 active 클래스 제거
    let tabLinks = document.getElementsByClassName("ex_tablinks");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }

    // 선택한 탭 내용 보이기
    document.getElementById(tabName).style.display = "block";

    // 선택한 버튼에 active 클래스 추가
    evt.currentTarget.classList.add("active");
}

// 사업개요 수정 페이지 전환 함수
function toggleEdit(tabId) {
    year = getCurrentYear();
    const projectId = document.getElementById('project_num').value;
    if (!projectId) {
        alert("수정할 프로젝트 ID를 찾을 수 없습니다.");
        return;
    }

    window.location.replace(`/addproject?projectId=${projectId}&year=${year}&mode=detail`);
}

// 텍스트 박스 자릿수 표현
function formatCurrency(input) {
    var value = input.value.replace(/[^0-9]/g, ''); // 숫자 이외 제거
    value = parseInt(value, 10); // 정수로 변환 (앞의 불필요한 0 제거)
    if (!isNaN(value)) { // 숫자인 경우에만 행
        input.value = value.toLocaleString(); // 로에 맞는 숫자 포매팅
    }
}

//레이아웃 수정 내 취소 버튼 함수
function cancelEdit(id) {
    // window.location.reload();
    reloadWithCurrentState();
    clickMainTab('project_change');
    goToBudgetTab(id);
    hideEditButtons();
}

//작업 후 탭 이동 함수
function goToBudgetTab(id) {
    if (id === 'Details') {
        clickMainTab('Details');
    }
    else if (id === 'Budget') {
        clickMainTab('Budget');
    }
}

// 메인 탭 버튼을 인덱스가 아닌 tabName으로 클릭(탭 추가/순서 변경에 안전)
function clickMainTab(tabName) {
    const btns = Array.from(document.getElementsByClassName('tablinks'));
    const btn = btns.find(b => (b.getAttribute('onclick') || '').includes(`'${tabName}'`));
    if (btn) btn.click();
}

//수정 모드 아닐 시 버튼 감춤 함수
function hideEditButtons() {
    document.getElementById("edit-buttons").style.display = "none";
    var deleteBtns = document.getElementsByClassName("delete-btn");
    var ChangeBtns = document.getElementsByClassName("Change_Text");
    var classBtn = document.getElementById("class_edit");
    var saveBtn = document.getElementById("class_save");
    for (let btn of deleteBtns) {
        btn.style.display = "none";
    }

    for (let btn of ChangeBtns) {
        btn.style.display = "none";
    }
    classBtn.style.display = "block";
    saveBtn.style.display = "block";
}

// 테이블 내 td 클릭 시 textbox로 변경하는 함수
function makeEditable(td, isText = false) {
    if (td.querySelector('input')) return;  // 이미 input이 있는 경우 return

    const input = document.createElement('input');
    input.type = 'text';  // 항상 text로 설정 (숫자 포맷을 위해)
    input.value = td.innerText.replace(/,/g, '');  // 기존 값을 가져와 콤마 제거 후 input에 설정
    input.classList.add('editable-input');

    // 셀 크기와 동일하게 input 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const savetd = td.innerText;  // 기존 값을 저장
    td.innerHTML = '';  // td 내용을 비우고
    td.appendChild(input);  // input 추가
    input.style.width = tdWidth + 'px';
    input.style.height = tdHeight + 'px';
    input.style.border = 'none';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.focus();

    // 자리수(콤마) 추가를 위한 input 이벤트
    input.addEventListener('input', () => {
        if (!isText) {  // 숫자 처리일 경우에만 콤마 추가
            let value = input.value.replace(/,/g, '');  // 기존 콤마를 제거하고 처리
            if (value && isNumeric(value)) {  // 숫자 유효성 검사
                input.value = formatWithCommas(value);  // 자리수(콤마) 추가
            }
        }
    });

    // 입력 완료 후 blur 이벤트 발생 시 처리
    input.addEventListener('blur', () => {
        const value = input.value.replace(/,/g, '').trim();  // 콤마 제거 후 값 가져오기

        if (!isText && (!isNumeric(value) && value.trim() !== "")) {
            alert('숫자만 입력할 수 있습니다.');
            td.innerText = '0';  // 유효하지 않은 숫자는 기본값 0 설정
        } else {
            if (value.trim() === "") {
                td.innerText = savetd;  // 값이 없는 경우 기존 값으로 원래 값 유지
            } else {
                td.innerText = isText ? value : formatWithCommas(Number(value));  // 콤마 추가 후 값 설정
            }

            if (!isText) {
                updateAmount(td.parentElement);
            }
        }
    });

    // Enter 키를 눌렀을 때 blur 발생
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            input.blur();  // Enter 누르면 blur 이벤트 발생
        }
    });
}

// 소수 유효성 검 함수
function isDecimal(value) {
    return /^\d+(\.\d+)?$/.test(value);
}

//인건비 인원 및 M/D 입력시 금액 데이터 조회 후 계산 함수
function updateAmount(row) {
    const year = getCurrentYear();
    const contractCode = document.getElementById('project-contractCode').value;

    let position = '';
    const selectElement = row.cells[0].querySelector('select');
    if (selectElement) {
        position = selectElement.value;
    } else {
        position = row.cells[0].innerText.trim();
    }

    position = position.replace(/\s+/g, '');  // 모든 공백 제거
    const person = parseFloat(row.cells[1].innerText.replace(/,/g, '')) || 0;
    const md = parseFloat(row.cells[2].innerText.replace(/,/g, '')) || 0;

    // 부서명이 '연구소'인 경우 인건비(금액)를 0원으로 고정하고 계산/요청을 건너뜀
    // 부서명은 헤더(h2) 또는 선택(select) 요소에 의해 표시/저장될 수 있으므로 다각도로 탐색
    let departmentName = '';
    try {
        // 1) 상위 섹션 탐색 (원본)
        const parentFirst = row.closest('#Department_first');
        const parentSecond = row.closest('#Department_second');

        // 2) 헤더 텍스트 우선 조회
        if (parentFirst) {
            const headerEl = parentFirst.querySelector('#Dep_fir_header_text');
            if (headerEl) departmentName = headerEl.textContent.trim();
        } else if (parentSecond) {
            const headerEl = parentSecond.querySelector('#Dep_sec_header_text');
            if (headerEl) departmentName = headerEl.textContent.trim();
        }

        // 3) select 값 (편집 모드 등) 보조 조회
        if (!departmentName) {
            const depSelect = parentFirst ? document.getElementById('Dep_fir_select') : parentSecond ? document.getElementById('Dep_sec_select') : null;
            if (depSelect && depSelect.value) departmentName = depSelect.value.trim();
        }
        departmentName = departmentName.replace(/\s+/g, '');
    } catch (e) {
        console.warn('부서명 추출 중 오류:', e);
    }

    if (departmentName === '연구소') {
        // 연구소 부서는 금액을 0으로 고정
        row.cells[3].innerText = '-';
        updateSum();
        return; // 이후 로직(직급 체크, fetch 등) 수행하지 않음
    }

    // 직급이 선택되지 않은 경우 처리
    if (position === '선택하세요') {
        alert('직급을 먼저 선택해 주세요.');
        row.cells[2].innerText = '';
        row.cells[3].innerText = '0';
        return;
    }

    // M/D 값이 있을 경우만 fetch 요청
    if (md > 0) {
        fetch(`/get_expenses?position=${position}&year=${year}&contractcode=${contractCode}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.Days !== undefined) {
                    const dailyWage = data.Days;
                    const amount = dailyWage * md * person;
                    row.cells[3].innerText = amount.toLocaleString(); // 금액 출력
                } else {
                    console.warn('서버에서 유효한 데이터를 받지 못했습니다.', data);
                    row.cells[3].innerText = '0';
                }
                updateSum(); // 총계 업데이트
            })
            .catch(error => {
                console.error('데이터 가져오기 실패:', error);
                row.cells[3].innerText = '0';
                updateSum(); // 에러 발생 시에도 총계 업데이트 유지
            });
    } else {
        //M/D 값이 없는 경우 금액을 0으로 설정
        row.cells[3].innerText = '0';
        updateSum(); // 총계 업데이트
    }
}

// 인원 M/D 금액 총계 합산 함수
function updateSum() {
    const departments = ['fir', 'sec'];  // 기존 부서 데이터

    departments.forEach(dep => {
        let sumPerson = 0, sumMD = 0, sumAmount = 0;

        const rows = document.querySelectorAll(`#Dep_${dep}_Budget_tbody tr:not(:first-child)`);
        rows.forEach(row => {
            const cells = row.children;
            // '선택하세요' 체크 추가
            if (cells.length > 0 && cells[0].innerText.trim() !== '선택하세요') {
                sumPerson += parseFloat(cells[1].innerText.replace(/,/g, '')) || 0;
                sumMD += parseFloat(cells[2].innerText.replace(/,/g, '')) || 0;
                sumAmount += parseFloat(cells[3].innerText.replace(/,/g, '')) || 0;
            }
        });

        const personSumEl = document.getElementById(`${dep}_PersonSum`);
        const mdSumEl = document.getElementById(`${dep}_MDsum`);
        const budgetSumEl = document.getElementById(`${dep}_budgetSum`);
        if (personSumEl) personSumEl.innerText = sumPerson.toLocaleString();
        if (mdSumEl) mdSumEl.innerText = sumMD.toLocaleString();
        if (budgetSumEl) budgetSumEl.innerText = sumAmount.toLocaleString();
    });
}

//예상진행비 경비 총계
function updateRecordsSum() {
    const department = ['fir', 'sec'];

    department.forEach(dep => {
        let totalAmount = 0;

        // 총계 행을 제외한 나머지 행들만 선택
        const rows = document.querySelectorAll(`#Dep_${dep}_Record_tbody tr:not(:first-child)`);
        rows.forEach(row => {
            const cells = row.children;

            // '선택하세요' 체크 추가 및 비어있는 경우 예외 처리
            if (cells.length > 1 && cells[0].innerText.trim() !== '선택하세요.') {
                const amountText = cells[1].innerText.replace(/[^0-9.-]/g, '');  // 숫자만 추출
                const amount = Number(amountText) || 0;  // 변환 후 NaN 방지
                totalAmount += amount;
            }
        });

        // 결과를 반영
        const recordSumEl = document.getElementById(`${dep}_recordSum`);
        if (recordSumEl) {
            recordSumEl.textContent = totalAmount.toLocaleString() + '원';
        }
    });
}




// 예상진행비 경비 금액 계산
function recordCal(targetRow = null) {
    const departments = ['fir', 'sec']; // 기존 부서 데이터
    //  특정 행(targetRow)이 지정되었다면 해당 행만 계산
    if (targetRow) {
        const cells = targetRow.children;
        if (cells.length > 0) {
            // ModifyRecords_table은 0번째에 체크박스가 존재 → 오프셋 1
            const table = targetRow.closest('table');
            const isModify = table && table.id === 'ModifyRecords_table';
            const offset = (isModify && targetRow.querySelector('input.row-check')) ? 1 : 0;
            // 선택하세요 체크(Modify에는 해당 없음) 고려
            if (!isModify && cells[0].innerText === '선택하세요.') return;

            const personnel = parseFloat((cells[offset + 1]?.innerText || '').replace(/,/g, '')) || 0;
            const times = parseFloat((cells[offset + 2]?.innerText || '').replace(/,/g, '')) || 0;
            const days = parseFloat((cells[offset + 3]?.innerText || '').replace(/,/g, '')) || 0;
            const unitPrice = parseFloat((cells[offset + 4]?.innerText || '').replace(/,/g, '')) || 0;

            const totalCost = unitPrice * personnel * times * days;
            if (cells[offset + 5]) cells[offset + 5].innerText = isNaN(totalCost) ? '' : totalCost.toLocaleString();
        }
        return; //  특정 행만 업데이트했으므로, 나머지 전체 업데이트는 건너뜀
    }

    //  기존 fir, sec 부서의 전체 행 업데이트 (modify 제외)
    departments.forEach(dep => {
        let LeftSumRecords = 0;

        //  특정 조건을 만족하면 해당 부서 업데이트를 건너뜀
        if (dep === 'fir' && firstRecords.length !== 0) return;
        if (dep === 'sec' && secondRecords.length !== 0) return;

        //  해당 부서의 tbody에서 첫 번째 행을 제외한 모든 행을 가져옴
        const rows = document.querySelectorAll(`#Dep_${dep}_Record_tbody tr:not(:first-child)`);

        rows.forEach(row => {
            const cells = row.children;
            if (cells.length > 0 && cells[0].innerText !== '선택하세요.') {
                const personnel = parseFloat(cells[1].innerText.replace(/,/g, '')) || 0;
                const times = parseFloat(cells[2].innerText.replace(/,/g, '')) || 0;
                const days = parseFloat(cells[3].innerText.replace(/,/g, '')) || 0;
                const unitPrice = parseFloat(cells[4].innerText.replace(/,/g, '')) || 0;

                const totalCost = unitPrice * personnel * times * days;
                cells[5].innerText = isNaN(totalCost) ? '' : totalCost.toLocaleString();
                LeftSumRecords += totalCost;
            }
        });

        //  총계 업데이트 (if-else 중복 제거)
        const recordSumEl = document.getElementById(`${dep}_recordSum`);
        if (recordSumEl) recordSumEl.innerText = LeftSumRecords.toLocaleString();
    });
}


//예상 진행비 인건비 저장
let check = false; // 경비 저장 성공 여부 확인

function savePersonnelBudget() {
    const contractCode = document.getElementById('project-contractCode').value;
    const projectID = document.getElementById('project-id').value;
    const departments = ['fir', 'sec'];
    const BudgetData = [];
    const missingExpenseDepartments = [];

    departments.forEach(dep => {
        // 부서명 가져오기
        const departmentName = document.getElementById(`Dep_${dep}_header_text`).textContent;
        if (departmentName == '사업부를 수정하세요.') {
            return;
        }

        // 인건비 데이터 수집
        const BudgetRows = document.querySelectorAll(`#Dep_${dep}_Budget_tbody tr`);

        BudgetRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let position = row.cells[0].querySelector('select') ?
                row.cells[0].querySelector('select').value :
                row.cells[0].innerText.trim();

            position = position.replace(/\s+/g, '');

            // '총 계' 행 및 '선택하세요' 제외
            if (cells.length > 0 && position !== '총계' && position !== '선택하세요' && position !== '') {
                const mdRaw = (cells[2].innerText || '').replace(/,/g, '').trim();
                const personRaw = (cells[1].innerText || '').replace(/,/g, '').trim();
                const amountRaw = (cells[3].innerText || '').replace(/,/g, '').trim();

                const isNumeric = (v) => /^-?\d*(?:\.\d+)?$/.test(v) && v !== '' && v !== '-';

                const budgetRow = {
                    ContractCode: contractCode,
                    Position: position,
                    department: departmentName,
                    M_D: isNumeric(mdRaw) ? mdRaw : '0',
                    person: isNumeric(personRaw) ? personRaw : '0',
                    amount: isNumeric(amountRaw) ? amountRaw : '0'
                };
                BudgetData.push(budgetRow);
            }
        });

        // 경비 데이터가 없는 부서 체크
        if (dep === 'fir' && firstRecords.length === 0) {
            missingExpenseDepartments.push(departmentName);
        }
        if (dep === 'sec' && secondRecords.length === 0) {
            missingExpenseDepartments.push(departmentName);
        }
    });

    // 저장할 데이터가 없으면 종료
    if (BudgetData.length === 0 && missingExpenseDepartments.length === 0) {
        console.warn('No personnel budget and no expenses to save.');
        alert('저장할 인건비 및 경비 데이터가 없습니다.');
        return;
    }

    // 인건비 데이터가 없고, 경비만 저장할 경우
    if (BudgetData.length === 0 && missingExpenseDepartments.length > 0) {
        Promise.all(missingExpenseDepartments.map(department => saveExpenseRecords(department, true)))
            .then(() => {
                alert('경비 저장이 완료되었습니다.');
                check = true; // 경비 저장 완료 표시
                reloadWithCurrentState();
            })
            .catch(error => {
                console.error('경비 저장 중 오류 발생:', error);
                alert('경비 저장 중 오류가 발생했습니다. 다시 시도하세요.');
            });
        return;
    }

    // 인건비 저장 요청
    fetch('/api/save_personnel_budget', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ProjectID: projectID,
            BudgetData: BudgetData
        })
    })
        .then(response => response.json())
        .then(async (data) => {
            if (data.message === 'Personnel budget saved successfully') {
                alert('인건비 저장이 완료되었습니다.');
                check = true; // 인건비 저장 완료 표시

                // 경비 저장 요청이 있는 경우 실행
                if (missingExpenseDepartments.length > 0) {
                    try {
                        await Promise.all(missingExpenseDepartments.map(department => saveExpenseRecords(department, true)));
                        check = true; // 경비 저장 성공 시 check 설정
                    } catch (error) {
                        console.error('경비 저장 중 오류 발생:', error);
                        alert('경비 저장 중 오류가 발생했습니다. 다시 시도하세요.');
                    }
                }

                // 최종적으로 `check` 값이 true이면 새로고침 실행
                if (check) {
                    setTimeout(() => {
                        reloadWithCurrentState();
                    }, 1000);
                }
            } else {
                alert('인건비 저장 실패. 다시 시도하세요.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('인건비 저장 실패. 다시 시도하세요.');
        });
}


// 예상 경비 저장 함수
function saveExpenseRecords(departmentName, ModeCheck = true) {
    const contractCode = document.getElementById('project-contractCode').value;
    const projectID = document.getElementById('project-id').value;

    let depKey = '';
    if (ModeCheck === true) {
        const firText = document.getElementById('Dep_fir_header_text').textContent;
        const secText = document.getElementById('Dep_sec_header_text').textContent;

        if (firText.includes(departmentName)) {
            depKey = (firstRecords.length !== 0) ? 'skip' : 'fir';
        } else if (secText.includes(departmentName)) {
            depKey = (secondRecords.length !== 0) ? 'skip' : 'sec';
        }

    } else {
        depKey = 'Modify';

        if (departmentName === 'fir') {
            departmentName = document.getElementById('Dep_fir_header_text').textContent;
        } else if (departmentName === 'sec') {
            departmentName = document.getElementById('Dep_sec_header_text').textContent;
        }
    }

    if (depKey === 'skip') {
        const secText = document.getElementById('Dep_sec_header_text').textContent;
        if (secText.includes(departmentName)) {
            depKey = (secondRecords.length === 0) ? 'sec' : 'skip';
        }
    }

    if (depKey === 'skip' || !depKey) {
        return;
    }

    let RecordsRows;
    if (depKey === 'Modify') {
        RecordsRows = document.querySelectorAll(`#Dep_${depKey}_Record_tbody tr`);
    } else {
        RecordsRows = document.querySelectorAll(`#Dep_${depKey}_Record_tbody tr`);
    }

    const RecordsData = [];

    RecordsRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const isModify = row.closest('table') && row.closest('table').id === 'ModifyRecords_table';

        // Modify 테이블: [0]체크박스 [1]계정(select) [2]인원 [3]횟수 [4]일수 [5]단가 [6]금액 [7]비고
        // 일반/clone 테이블: [0]계정(select/텍스트) [1]인원 [2]횟수 [3]일수 [4]단가 [5]금액 [6]비고 (가정)
        let accountCellIndex = isModify ? 1 : 0;
        const accountCell = cells[accountCellIndex];
        let account = accountCell && accountCell.querySelector('select')
            ? accountCell.querySelector('select').value
            : (accountCell ? accountCell.innerText.trim() : '');

        if (cells.length === 0) return;
        if (['총계', '총 계', '선택하세요.', '', '삭제'].includes(account)) return;

        // 금액 최신화를 위해 해당 행 재계산(Modify 전용)
        if (isModify) {
            recordCal(row);
        }

        const recordRow = isModify ? {
            ContractCode: contractCode,
            account,
            department: departmentName,
            person_count: cells[2]?.innerText.replace(/,/g, '') || '0',
            frequency: cells[3]?.innerText.replace(/,/g, '') || '0',
            days: cells[4]?.innerText.replace(/,/g, '') || '0',
            unit_price: cells[5]?.innerText.replace(/,/g, '') || '0',
            amount: cells[6]?.innerText.replace(/,/g, '') || '0',
            note: cells[7]?.innerText.trim() || ''
        } : {
            ContractCode: contractCode,
            account,
            department: departmentName,
            person_count: cells[1]?.innerText.replace(/,/g, '') || '0',
            frequency: cells[2]?.innerText.replace(/,/g, '') || '0',
            days: cells[3]?.innerText.replace(/,/g, '') || '0',
            unit_price: cells[4]?.innerText.replace(/,/g, '') || '0',
            amount: cells[5]?.innerText.replace(/,/g, '') || '0',
            note: cells[6]?.innerText.trim() || ''
        };

        RecordsData.push(recordRow);
    });

    if (RecordsData.length === 0) {
        return;
    }

    fetch('/api/save_expense_records', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ProjectID: projectID,
            RecordsData: RecordsData
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.message === 'Expense records saved successfully') {
                if (depKey === 'Modify') {
                    reloadWithCurrentState();
                }
                alert(`경비 저장이 완료되었습니다. (${departmentName})`);
            } else {
                alert(`경비 저장 실패. (${departmentName}) 다시 시도하세요.`);
            }
        })
        .catch(error => {
            console.error('[saveExpenseRecords] 서버 요청 중 오류 발생:', error);
            alert(`경비 저장 실패. (${departmentName}) 다시 시도하세요.`);
        });
}

//연도 추출 함수
function getCurrentYear() {
    const year = document.getElementById('project-year').value;
    return year;
}

// 테이블 내 td 클릭 시 textbox로 변경하는 함수
function TextChange(td, isText = false) {
    // 이미 input이 있는 경우 return
    if (td.querySelector('input, textarea')) return;

    let allowNewline = false;

    // input 생성 및 설정
    const input = isText ? document.createElement('textarea') : document.createElement('input');
    if (!isText) {
        input.type = 'text';  // 콤마 및 큰 숫자 처리를 위해 input을 text로 변경
    }
    // const currentValue = td.innerText.trim();  // 현재 td의 값 저장
    const currentValue = (td.getAttribute('data-blank-on-edit') === 'true') ? '' : td.innerText;
    //
    if (!isText) {
        currentValue.trim().replace(/,/g, '');
        input.value = currentValue;  // 현재 값을 input의 초기값으로 설정
    }
    else {
        input.value = currentValue;  // 현재 값을 input의 초기값으로 설정
    }
    input.classList.add('editable-input');

    // td 크기와 동일하게 input 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const savetd = currentValue;  // 기존 값을 저장
    td.innerHTML = '';  // td 내용을 비우고
    td.appendChild(input);  // input 추가
    // 스타일 설정
    input.style.width = (tdWidth - 2) + 'px';  // 테두리 고려하여 2px 감소
    input.style.height = (tdHeight - 2) + 'px';  // 테두리 고려하여 2px 감소
    input.style.border = '1px solid #cbd5e0';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';  // 좌우 패딩 추가
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.style.fontSize = '14px';
    input.style.backgroundColor = '#ffffff';
    if (isText) {
        input.style.resize = 'vertical';
        input.style.overflow = 'auto';
    }
    input.focus();

    // 자리수 표현을 위한 input 이벤트
    input.addEventListener('input', () => {
        let value = input.value;

        if (!isText) { // 숫자 모드일 때만 포맷 적용
            value = value.replace(/,/g, ''); // 콤마 제거
            if (isNumeric(value)) {
                input.value = formatWithCommas(value);
            }
        }
    });

    //  blur 이벤트 (isText = true일 때 쉼표 유지)
    input.addEventListener('blur', () => {
        const value = input.value.trim();

        if (!isText) {
            const numericValue = value.replace(/,/g, ''); // 숫자 변환
            if (numericValue !== '' && !isNumeric(numericValue)) {
                alert('숫자만 입력할 수 있습니다.');
                td.innerText = savetd;
            } else {
                td.innerText = formatWithCommas(numericValue);
            }
            //  ModifyRecords_table이면 해당 행만 업데이트, 아니라면 기존 부서 전체 업데이트
            const table = td.closest("table");
            if (!table) return; // 테이블이 없으면 종료

            const tableId = table.id;
            if (tableId === 'ModifyRecords_table') {
                recordCal(td.parentElement);  // 특정 행만 업데이트
            }
            else if (tableId === "LeftRecords_table" || tableId === "SecondRecords_table") {
                recordCal(null, false);
            }
            else {
                recordCal(null, true)
            }

            // else {
            //     recordCal();  // 기존 방식 유지 (fir, sec 전체 업데이트)
            // }
        } else {
            const normalized = allowNewline ? value : value.replace(/\r?\n/g, ' ');
            td.innerText = normalized; // `isText = true`일 때는 입력한 그대로 저장
            td.classList.add('multiline-cell');
        }
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            if (isText && event.shiftKey) {
                allowNewline = true;
                return; // Shift+Enter는 줄바꿈 유지
            }
            event.preventDefault();
            input.blur();
        }
    });
}

// 외부 인력용
function externalWithCalculation(td) {
    // 이미 input이 있는 경우 return
    if (td.querySelector('input')) return;

    // input 생성 및 설정
    const input = document.createElement('input');
    input.type = 'text';
    const currentValue = td.innerText.trim().replace(/,/g, ''); // 현재 값에서 쉼표 제거
    input.value = currentValue;
    input.classList.add('editable-input');

    // td 크기와 동일하게 input 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const savetd = currentValue; // 기존 값 저장
    td.innerHTML = ''; // td 내용을 비우고
    td.appendChild(input); // input 추가

    // 스타일 설정
    input.style.width = (tdWidth - 2) + 'px';
    input.style.height = (tdHeight - 2) + 'px';
    input.style.border = '1px solid #cbd5e0';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.style.fontSize = '14px';
    input.style.backgroundColor = '#ffffff';
    input.focus();

    // input 이벤트로 자리수 포맷팅
    input.addEventListener('input', () => {
        const value = input.value.replace(/,/g, ''); // 콤마 제거
        if (value && isNumeric(value)) {
            input.value = formatWithCommas(value); // 콤마 추가
        }
    });

    // blur 이벤트에서 계산 수행
    input.addEventListener('blur', () => {
        const value = parseFloat(input.value.replace(/,/g, '').trim());

        // 숫자 유효성 검사
        if (value && isNumeric(value)) {
            td.innerText = formatWithCommas(value); // 입력된 값 업데이트

            // 계산 수행 (월급 기준으로 일급/시급 계산)
            const row = td.parentElement; // 현재 td의 부모 tr 가져오기
            const workingDays = 22; // 기준 근무일수
            const dailyRate = Math.round(value / workingDays); // 일급 계산

            // 해당 행의 일급 및 시급 업데이트
            row.cells[2].innerText = formatWithCommas(dailyRate); // 일급 칸
        } else {
            td.innerText = savetd; // 유효하지 않은 경우 기존 값으로 복원
        }
    });

    // Enter 키를 눌렀을 때 blur 발생
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            input.blur();
        }
    });
}

// 콤마 추가 함수
function formatWithCommas(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


function isNumeric(value) {
    return !isNaN(value) && !isNaN(parseFloat(value));
}

function updateSumAmount(row) {

    const person = parseInt(row.cells[1].innerText.replace(/,/g, '')) || 0;
    const frequency = parseInt(row.cells[2].innerText.replace(/,/g, '')) || 0;
    const unit = parseFloat(row.cells[3].innerText.replace(/,/g, '')) || 0;

    const amount = person * frequency * unit;
    row.cells[4].innerText = amount.toLocaleString();
}

// 실제 인건비 합계 
function RealBudgetSum(td, tdParent) {
    const MD = document.getElementsByClassName('MD');
    const MT = document.getElementsByClassName('MT');
    let Num = 0;
    let Sum = 0;


    if (tdParent && tdParent.id === 'Dep_fir_Budget_table') {
        const cells = td.cells; // td의 부모 tr에서 모든 셀을 가져옴
        Sum = 0;
        for (let i = 5; i < cells.length; i++) {
            Num = parseFloat(cells[i].innerText) || 0;
            Sum += Num;
        }
        cells[3].innerText = Sum.toLocaleString();
        cells[4].innerText = (Sum * 8).toLocaleString(); // M/D 값 * 8로 M/T 계산
    }

    if (tdParent && tdParent.id === 'Dep_sec_Budget_table') {
        Sum = 0;
        const cells = td.cells; // td의 부모 tr에서 모든 셀을 가져옴
        for (let i = 5; i < cells.length; i++) {
            Num = parseFloat(cells[i].innerText) || 0;
            Sum += Num;

        }
        cells[3].innerText = Sum.toLocaleString();
        cells[4].innerText = (Sum * 8).toLocaleString();
    }
}

let selectValueSave = '';

// 붙여넣기 이벤트와 행 가 및 데이터 입력 기능을 수행하는 함수
function handlePasteAndAddRows(event, tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    const e = event || window.event;
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const pastedData = clipboardData.getData('text') || '';

    // 🔹 탭/줄바꿈 없는 일반 텍스트면 기본 붙여넣기 허용
    if (!/[\t\r\n]/.test(pastedData)) return;

    // 🔹 표 형태(탭 포함)면 기본 붙여넣기 차단하고 커스텀 처리
    e.preventDefault();

    const lines = pastedData
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter(line => line.trim().length > 0);

    let clickedRow = (window.__lastPasteRow && tableBody.contains(window.__lastPasteRow))
        ? window.__lastPasteRow
        : null;

    const startIndex = Math.max(0, clickedRow ? Array.from(tableBody.rows).indexOf(clickedRow) : 0);

    const needRows = startIndex + lines.length - tableBody.rows.length;
    if (needRows > 0 && typeof addRows === 'function') addRows(tableBodyId, needRows);

    lines.forEach((line, i) => {
        const row = tableBody.rows[startIndex + i];
        if (!row) return;
        const cols = line.split('\t');

        if (row.cells[1]) row.cells[1].textContent = (cols[0] || '').trim();
        if (row.cells[2]) row.cells[2].textContent = (cols[1] || '').trim();
        if (row.cells[3]) row.cells[3].textContent = (cols[2] || '').trim();
        // 가중치(%) 붙여넣기 지원 (4번째 컬럼)
        if (row.cells[4]) row.cells[4].textContent = (cols[3] || '').trim();
    });
}


// 실제 인건비 행 추가 함수
function applyDesignReviewStatusLock(row) {
    if (!row) return;
    const divisionSelect = row.querySelector('select.division-select');
    const statusSelect = row.querySelector('select.status-select');
    if (!divisionSelect || !statusSelect) return;

    const divisionVal = (divisionSelect.value || '').trim();
    const ensureNoneOption = () => {
        let noneOpt = statusSelect.querySelector('option[value="없음"]');
        if (!noneOpt) {
            noneOpt = document.createElement('option');
            noneOpt.value = '없음';
            noneOpt.textContent = '없음';
            const insertBefore = statusSelect.querySelector('option[value="접수"]') || null;
            statusSelect.insertBefore(noneOpt, insertBefore);
        }
        noneOpt.hidden = false;
        noneOpt.disabled = false;
        return noneOpt;
    };

    if (divisionVal === '성과심사 없음') {
        ensureNoneOption();
        statusSelect.value = '없음';
        statusSelect.disabled = true;
        return;
    }

    // 일반 구분일 때는 현황 선택 가능
    statusSelect.disabled = false;

    // '없음'이 선택된 상태에서 구분이 바뀌면 기본값으로 되돌림
    if ((statusSelect.value || '').trim() === '없음') {
        statusSelect.value = '-';
    }

    // '없음' 옵션은 선택된 경우만 드롭다운에 노출
    const noneOpt = statusSelect.querySelector('option[value="없음"]');
    if (noneOpt) {
        noneOpt.hidden = (statusSelect.value || '').trim() !== '없음';
    }
}

function bindDesignReviewTableBehavior(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
        const divisionSelect = tr.querySelector('select.division-select');
        if (divisionSelect) {
            divisionSelect.addEventListener('change', () => applyDesignReviewStatusLock(tr));
        }
        applyDesignReviewStatusLock(tr);
    });
}

function addRows(tableID, rowCount, BTN = false) {
    const tableBodies = document.getElementById(tableID);
    // 페이지 로드시 데이터 없는 경우 예상 인건비 행 추가
    if (tableID === 'Dep_fir_Budget_tbody' || tableID === 'Dep_sec_Budget_tbody') {
        const tableBody = tableBodies
        const hasExternalLaborData = document.getElementById('hasExternalLaborData')?.value === 'true'; // 외부인력 상태 확인

        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');

            for (let k = 0; k < 4; k++) { // 4개의 셀이 필요하다고 가정
                const td = document.createElement('td');


                // 첫 번째 셀: 직위 콤보박스
                if (k === 0) {
                    const select = document.createElement('select');
                    const options = hasExternalLaborData
                        ? ['선택하세요', '이 사', '부 장', '차 장', '과 장', '대 리', '주 임', '사 원', '계약직', '외부인력']
                        : ['선택하세요', '이 사', '부 장', '차 장', '과 장', '대 리', '주 임', '사 원', '계약직'];

                    options.forEach(optionText => {
                        const option = document.createElement('option');
                        option.value = optionText;
                        option.textContent = optionText;
                        select.appendChild(option);
                    });

                    td.appendChild(select);
                }
                // 세 번째, 네 번째 셀: 편집 가능 셀 (이름과 M/D)
                else if (k === 1 || k === 2) {
                    td.className = 'edit_cell';
                    td.onclick = function () {
                        makeEditable(this);
                    };
                }
                // 다섯 번째 셀: 금액
                else if (k === 4) {
                    td.className = 'amount-cell';
                    td.innerText = '0';
                }

                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    }
    // 페이지 로드시 데이터 없는 경우 예상 경비 행 추가
    if (tableID === 'Dep_fir_Record_tbody' || tableID === 'Dep_sec_Record_tbody' || tableID === 'Dep_Modify_Record_tbody') {
        const tableBody = tableBodies
        const selection = document.getElementById('Dep_fir_record_select')

        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            const isModify = tableID === 'Dep_Modify_Record_tbody';
            // modify 테이블은 체크박스 포함 8칸, 일반/clone 경비 테이블은 7칸
            const cellCount = isModify ? 8 : 7;

            for (let k = 0; k < cellCount; k++) {
                const td = document.createElement('td');

                if (isModify) {
                    // 0: 체크박스
                    if (k === 0) {
                        td.style.textAlign = 'center';
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.className = 'row-check';
                        td.appendChild(cb);
                    }
                    // 1: select
                    else if (k === 1) {
                        const select = document.createElement('select');
                        const options = selection.options;
                        for (let j = 0; j < options.length; j++) {
                            const option = document.createElement('option');
                            option.value = options[j].value;
                            option.textContent = options[j].textContent;
                            select.appendChild(option);
                        }
                        select.onchange = function () { getPrice(this); };
                        td.appendChild(select);
                    }
                    // 2,3,4: 인원,횟수,일수 editable
                    else if (k === 2 || k === 3 || k === 4) {
                        td.className = 'edit_cell';
                        td.onclick = function () { TextChange(this); };
                    }
                    // 5: 단가
                    else if (k === 5) {
                        td.className = 'Price-cell';
                        td.onclick = function () { TextChange(this); };
                    }
                    // 6: 금액
                    else if (k === 6) {
                        td.className = 'amount-cell';
                    }
                    // 7: 비고
                    else if (k === 7) {
                        td.className = 'text-cell';
                        td.onclick = function () { TextChange(this, true); };
                    }
                } else {
                    // 기존 테이블 로직 유지 (0~6)
                    if (k === 0) {
                        const select = document.createElement('select');
                        const options = selection.options;
                        for (let j = 0; j < options.length; j++) {
                            const option = document.createElement('option');
                            option.value = options[j].value;
                            option.textContent = options[j].textContent;
                            select.appendChild(option);
                        }
                        select.onchange = function () { getPrice(this); };
                        td.appendChild(select);
                    }
                    else if (k === 1 || k === 2 || k === 3) {
                        td.className = 'edit_cell';
                        td.onclick = function () { TextChange(this); };
                    }
                    else if (k === 4) {
                        td.className = 'Price-cell';
                        td.onclick = function () { TextChange(this); };
                    }
                    else if (k === 5) {
                        td.className = 'amount-cell';
                    }
                    else if (k === 6) {
                        td.className = 'text-cell';
                        td.onclick = function () { TextChange(this, true); };
                    }
                }
                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    }

    // 모달창 사업수행 물량 행 추가
    if (tableID === 'quantityModal_A_tbody' || tableID === 'quantityModal_B_tbody') {
        const tableBody = tableBodies;

        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');

            // 0번째 열: 체크박스
            const tdCheckbox = document.createElement('td');
            tdCheckbox.style.textAlign = 'center';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            tdCheckbox.appendChild(checkbox);
            tr.appendChild(tdCheckbox);

            // 1~4열: 항목, 수량, 단위, 가중치(%)
            for (let j = 0; j < 4; j++) {
                const td = document.createElement('td');
                td.className = 'edit_cell';
                td.style.height = '13px';
                td.onclick = function () {
                    // 수량(j=1), 가중치(j=3)는 숫자 입력; 항목(j=0), 단위(j=2)는 텍스트 입력
                    TextChange(this, !(j === 1 || j === 3));
                };
                tr.appendChild(td);
            }
            tableBody.appendChild(tr);
        }
    }

    //모달창 수행물량 행 추가 
    if (tableID === 'itemModal_A_tbody' || tableID === 'moneyModal_tbody') {
        const tableBody = tableBodies;
        const contractCode = document.getElementById('project-contractCode').value;
        const hasExternalLaborData = document.getElementById('hasExternalLaborData')?.value === 'true'; // 외부인력 상태 확인

        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            const maxColumns = tableID === 'moneyModal_tbody' ? 4 : 4; // 모두 4열로 변경

            for (let j = 0; j < maxColumns; j++) {
                const td = document.createElement('td');

                if (j === 0) {
                    const select = document.createElement('select');

                    if (tableID === 'moneyModal_tbody') {
                        // moneyModal_tbody에 대한 처리 (첫 번째 열)
                        select.id = 'modal_account';
                        select.name = 'accountSelect';
                        const options = document.getElementById('Dep_fir_record_select').options;

                        for (let k = 0; k < options.length; k++) {
                            const option = document.createElement('option');
                            option.value = options[k].value;
                            option.textContent = options[k].textContent;
                            select.appendChild(option);
                        }
                        select.onchange = function () {
                            const row = this.closest('tr');
                            const cells = row.cells;

                            switch (this.value) {
                                case '복리후생비/식대':
                                    cells[2].innerText = '식대';
                                    break;
                                case '복리후생비/음료 외':
                                    cells[2].innerText = '음료 외';
                                    break;
                                case '여비교통비/(출장)숙박':
                                    cells[2].innerText = '(출장)숙박';
                                    break;
                                case '여비교통비/주차료':
                                    cells[2].innerText = '주차료';
                                    break;
                                case '여비교통비/대중교통':
                                    cells[2].innerText = '대중교통';
                                    break;
                                case '소모품비/현장물품':
                                    cells[2].innerText = '현장물품';
                                    break;
                                case '소모품비/기타소모품':
                                    cells[2].innerText = '기타소모품';
                                    break;
                                case '차량유지비/주유':
                                    cells[2].innerText = '주유';
                                    break;
                                case '차량유지비/차량수리 외':
                                    cells[2].innerText = '차량수리 외';
                                    break;
                                case '도서인쇄비/출력 및 제본':
                                    cells[2].innerText = '출력 및 제본';
                                    break;
                                case '운반비/등기우편 외':
                                    cells[2].innerText = '등기우편 외';
                                    break;
                                case '지급수수료/증명서발급':
                                    cells[2].innerText = '증명서발급';
                                    break;
                                case '기타/그 외 기타':
                                    cells[2].innerText = '그 외 기타';
                                    break;
                                default:
                                    cells[2].innerText = '';
                            }
                        };
                    } else {
                        // itemModal_A_tbody에 대한 처리 (첫 번째 열)
                        select.id = 'modal_item';
                        select.name = 'itemSelect';
                        const selectValue = document.getElementById('modal_department').value;

                        if (selectValue != selectValueSave) {
                            tableBodies.innerHTML = '';
                            selectValueSave = selectValue;
                        }

                        if (!selectValue || selectValue === '') {
                            return;
                        }

                        const fetchUrl = `/get_department_Set_data/${selectValue}?contract_code=${contractCode}`;

                        fetch(fetchUrl)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(`HTTP error! status: ${response.status}`);
                                }
                                return response.json();
                            })
                            .then(data => {
                                const selectedOption = select.value;
                                select.innerHTML = '<option value="">항목을 선택하세요</option>';

                                data.forEach(item => {
                                    const option = document.createElement('option');
                                    option.value = item.item;
                                    option.textContent = item.item;
                                    select.appendChild(option);
                                });

                                const otherOption = document.createElement('option');


                                otherOption.value = '기타';
                                otherOption.textContent = '기타';
                                select.appendChild(otherOption);

                                if (selectedOption) {
                                    select.value = selectedOption;
                                }

                                select.setAttribute('data-previous-value', selectValue);
                            })
                            .catch((error) => {
                                console.error('Error: ', error);
                            });
                    }

                    td.appendChild(select);
                } else if (j == 1 && tableID === 'moneyModal_tbody') {
                    const select = document.createElement('select');
                    const options = ['카 드', '현 금'];
                    options.forEach(optionText => {
                        const option = document.createElement('option');
                        option.value = optionText;
                        option.textContent = optionText;
                        select.appendChild(option);
                    });
                    td.appendChild(select);
                }
                else if (j === 3 && tableID === 'itemModal_A_tbody') {
                    // 4번째 열에 직급 선택 select 추가
                    const positionSelect = document.createElement('select');
                    positionSelect.id = 'modal_name';
                    positionSelect.name = 'modal_name';
                    positionSelect.className = 'modal_custom-select';
                    positionSelect.required = true;
                    positionSelect.style.width = '100%';           // 셀 너비에 맞춤
                    positionSelect.style.height = '100%';          // 셀 높이에 맞춤
                    positionSelect.style.border = 'none';          // 테두리 제거
                    positionSelect.style.backgroundColor = 'transparent'; // 배경색 투명
                    positionSelect.style.padding = '0';            // 패딩 제거
                    positionSelect.style.margin = '0';             // 마진 제거
                    positionSelect.style.appearance = 'none';      // 기본 select 스타일 제거
                    positionSelect.style.outline = 'none';         // 포커스 테두리 제거
                    positionSelect.style.fontSize = 'inherit';     // 부모 요소의 폰트 크기 상속

                    const positions = hasExternalLaborData
                        ? ['', '이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직', '외부인력']
                        : ['', '이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직'];
                    positions.forEach(position => {
                        const option = document.createElement('option');
                        option.value = position;
                        option.textContent = position || '선택하세요';
                        positionSelect.appendChild(option);
                    });

                    td.appendChild(positionSelect);
                } else {
                    td.className = 'edit_cell';
                    td.style.height = '13px';
                    td.onclick = function () {
                        const isStringInput = (tableID === 'moneyModal_tbody' && (j === 1 || j === 2)) ||
                            (tableID === 'itemModal_A_tbody' && j === 1);
                        TextChange(this, isStringInput);
                    };
                }

                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    }
    // 참여 기술자 명단 행 추가 (성과심사 테이블과 동일한 방식: 선행 체크박스 컬럼 포함)
    if (tableID === 'participant_engineers_tbody') {
        const tableBody = tableBodies;
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            // 0 체크박스
            const tdCb = document.createElement('td');
            tdCb.style.textAlign = 'center';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'row-check';
            tdCb.appendChild(cb); tr.appendChild(tdCb);

            // 2 담당업무 select
            const tdWork = document.createElement('td');
            const workSel = document.createElement('select');
            ['선택하세요.', '사책', '분책', '분참'].forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v; workSel.appendChild(opt);
            });
            tdWork.appendChild(workSel); tr.appendChild(tdWork);
            // 5 성명
            const tdName = document.createElement('td');
            tdName.className = 'edit_cell';
            tdName.onclick = function () { TextChange(this, true); };
            tr.appendChild(tdName);
            // 6 비고
            const tdRemark = document.createElement('td');
            tdRemark.className = 'edit_cell';
            tdRemark.onclick = function () { TextChange(this, true); };
            tr.appendChild(tdRemark);
            tableBody.appendChild(tr);
        }
        // 행 추가 시에는 병합하지 않음 (로드 후 적용)
        // applyWorkFieldRowspan();
    }
    // 문제예상 테이블 행 추가
     // 문제예상 테이블 행 추가
    if (tableID === 'issue_prediction_tbody') {
        const tableBody = tableBodies;
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            for (let k = 0; k < 6; k++) {
                const td = document.createElement('td');
                td.style.height = '25px';
                if (k === 0) {
                    td.style.textAlign = 'center';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'row-check';
                    td.appendChild(cb);
                } else if (k === 1) {
                    const sel = document.createElement('select');
                    const optDefault = document.createElement('option');
                    optDefault.value = '선택';
                    optDefault.textContent = '선택하세요';
                    optDefault.selected = true;
                    const optInProgress = document.createElement('option');
                    optInProgress.value = '진행중';
                    optInProgress.textContent = '진행중';
                    const optDone = document.createElement('option');
                    optDone.value = '완료';
                    optDone.textContent = '완료';
                    sel.appendChild(optDefault);
                    sel.appendChild(optInProgress);
                    sel.appendChild(optDone);
                    td.appendChild(sel);
                } else {
                    if (k === 4) { // 작성일시 컬럼 → 날짜 입력 전용
                        td.className = 'date-cell';
                        td.onclick = function () { DateChange(this); };
                    } else {
                        td.className = 'edit_cell';
                        td.onclick = function () { TextChange(this, true); };
                    }
                }
                tr.appendChild(td);
            }
            tableBody.appendChild(tr);
        }
    }
    //통계 탭 코멘트 행 추가 
    if (tableID === 'comment_tbody') {
        const tableBody = tableBodies;

        for (let i = 0; i < 6; i++) {
            const tr = document.createElement('tr');
            for (let j = 0; j < 2; j++) {
                const td = document.createElement('td');
                if (j === 0) {
                    td.style.width = '150px';
                    td.style.height = '19px';
                    td.style.textAlign = 'center';
                    td.style.fontWeight = 'bold';
                }
                else {
                    td.style.height = '19px';
                    td.style.textAlign = 'left';
                    td.onclick = function () {
                        TextChange(this, true);
                    };
                }
                tr.appendChild(td);
                tableBody.appendChild(tr);
            }
        }
    }

    //실제 진행비 경비
    if (tableID === 'Dep_fir_Specific_data') {
        const table = document.getElementById('Dep_fir_Specific');
        if (!table || window.getComputedStyle(table).display === 'none') return;

        const tableBody = document.getElementById('Dep_fir_Specific_data');

        // 합계행 찾기 (맨 마지막 tr이라고 가정)
        const allRows = tableBody.querySelectorAll('tr');
        const summaryRow = allRows[allRows.length - 1];

        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            const cells = [];

            // 1열: 경비항목 select
            const td1 = document.createElement('td');
            const select1 = document.createElement('select');
            const options1 = ['선택하세요.',
                '복리후생비/식대', '복리후생비/음료 외',
                '여비교통비/(출장)숙박', '여비교통비/주차료', '여비교통비/대중교통',
                '소모품비/현장물품', '소모품비/기타소모품',
                '차량유지비/주유', '차량유지비/차량수리 외',
                '도서인쇄비/출력 및 제본',
                '운반비/등기우편 외', '지급수수료/증명서발급',
                '기타/그 외 기타'
            ];
            options1.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select1.appendChild(option);
            });

            select1.onchange = function () {
                switch (this.value) {
                    case '복리후생비/식대': cells[2].innerText = '식대'; break;
                    case '복리후생비/음료 외': cells[2].innerText = '음료 외'; break;
                    case '여비교통비/(출장)숙박': cells[2].innerText = '(출장)숙박'; break;
                    case '여비교통비/주차료': cells[2].innerText = '주차료'; break;
                    case '여비교통비/대중교통': cells[2].innerText = '대중교통'; break;
                    case '소모품비/현장물품': cells[2].innerText = '현장물품'; break;
                    case '소모품비/기타소모품': cells[2].innerText = '기타소모품'; break;
                    case '차량유지비/주유': cells[2].innerText = '주유'; break;
                    case '차량유지비/차량수리 외': cells[2].innerText = '차량수리 외'; break;
                    case '도서인쇄비/출력 및 제본': cells[2].innerText = '출력 및 제본'; break;
                    case '운반비/등기우편 외': cells[2].innerText = '등기우편 외'; break;
                    case '지급수수료/증명서발급': cells[2].innerText = '증명서발급'; break;
                    case '기타/그 외 기타': cells[2].innerText = '그 외 기타'; break;
                    default: cells[2].innerText = '';
                }
            };

            td1.appendChild(select1);
            tr.appendChild(td1);
            cells.push(td1);

            // 2열: 카드/현금 select
            const td2 = document.createElement('td');
            const select2 = document.createElement('select');
            ['카드', '현금'].forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select2.appendChild(option);
            });
            td2.appendChild(select2);
            tr.appendChild(td2);
            cells.push(td2);

            // 3열: 내역 (자동 채움 셀)
            const td3 = document.createElement('td');
            tr.appendChild(td3);
            td3.onclick = function () {
                TextChange(this, true);
            }
            cells.push(td3);

            // 4열: 세액 (inputMoney)
            const td4 = document.createElement('td');
            td4.id = 'duty'
            tr.appendChild(td4);
            cells.push(td4);

            // 5열: 공급가액 (inputMoney)
            const td5 = document.createElement('td');
            td5.id = 'NoVAT'
            tr.appendChild(td5);
            cells.push(td5);

            // 6열: 금액 (inputMoney)
            const td6 = document.createElement('td');
            td6.onclick = function () {
                inputMoney(this);
            };
            tr.appendChild(td6);
            cells.push(td6);

            // 합계행 위에 삽입
            tableBody.insertBefore(tr, summaryRow);
        }
    }


    // 사업비 변경내역 행 추가 
    if (tableID === 'project_change_table') {
        // 명시적으로 tbody ID를 사용
        const tableBody = document.getElementById('project_change_tbody');
        if (!tableBody) {
            console.error("Could not find project_change_tbody");
            return;
        }

        // 현재 테이블의 모든 행을 확인
        const rows = tableBody.getElementsByTagName('tr');
        let lastChangeNumber = 0;

        // 마지막 변경 번호 찾기
        for (let row of rows) {
            const text = row.cells[0]?.textContent.trim();

            if (text && text !== '당초') {
                const match = text.match(/(\d+)차 변경/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > lastChangeNumber) {
                        lastChangeNumber = num;
                    }
                }
            }
        }

        // 새로운 행 추가
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            const newChangeNumber = lastChangeNumber + i + 1;

            for (let j = 0; j < 8; j++) { // 체크박스 열 포함 순서대로 생성
                const td = document.createElement('td');
                switch (j) {
                    case 0: // 체크박스
                        td.innerHTML = '<input type="checkbox" class="row-check" />';
                        td.style.textAlign = 'center';
                        break;
                    case 1:  // 구분
                        td.textContent = `${newChangeNumber}차 변경`;
                        break;
                    case 2:  // 계약일자
                        td.className = 'date-cell';
                        td.onclick = function () { DateChange(this); };
                        break;
                    case 3:  // VAT 포함
                        td.className = 'edit_cell';
                        td.onclick = function () {
                            TextChangeWithCalculation(this, false);
                            calculateProjectIncrease(this.closest('tr'));
                        };
                        break;
                    case 4:  // VAT 제외
                    case 5:  // 당사(지분율)
                        td.className = 'read_only_cell';
                        break;
                    case 6:  // 증감
                        td.className = 'read_only_cell';
                        break;
                    case 7:  // 변경내용
                        td.className = 'edit_cell';
                        td.onclick = function () { TextChange(this, true); };
                        break;
                }
                tr.appendChild(td);
            }
            tableBody.appendChild(tr);
        }
    }

    // 성과심사 테이블
    if (tableID === 'design_review_tbody') {
        const tableBody = document.getElementById('design_review_tbody');
        if (!tableBody) {
            console.error('Could not find design_review_tbody');
            return;
        }
        // 새 행 추가: 체크박스 / 구분(select) / 금액(edit) / 날짜(date-cell) / 현황(select) / 비고(edit)
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            // 체크박스
            const chkTd = document.createElement('td');
            chkTd.innerHTML = '<input type="checkbox" class="row-check" />';
            chkTd.style.textAlign = 'center';
            tr.appendChild(chkTd);
            // 구분 select
            const divTd = document.createElement('td');
            divTd.innerHTML = `
                <select class="division-select">
                    <option value="" selected>선택</option>
                    <option value="당초 내역서">당초 내역서</option>
                    <option value="변경 내역서">변경 내역서</option>
                    <option value="실납부액">실납부액</option>
                    <option value="발주처 납부">발주처 납부</option>
                    <option value="성과심사 없음">성과심사 없음</option>
                </select>`;
            tr.appendChild(divTd);
            // 금액
            const amtTd = document.createElement('td');
            amtTd.className = 'edit_cell';
            amtTd.onclick = function () { TextChange(this, false); };
            tr.appendChild(amtTd);
            // 날짜
            const dateTd = document.createElement('td');
            dateTd.className = 'date-cell';
            dateTd.onclick = function () { DateChange(this); };
            tr.appendChild(dateTd);
            // 현황
            const statusTd = document.createElement('td');
            statusTd.innerHTML = `
                <select class="status-select">
                    <option value="-" selected>-</option>
                    <option value="접수">접수</option>
                    <option value="완료">완료</option>
                </select>`;
            tr.appendChild(statusTd);
            // 비고
            const noteTd = document.createElement('td');
            noteTd.className = 'edit_cell';
            noteTd.onclick = function () { TextChange(this, true); };
            tr.appendChild(noteTd);
            tableBody.appendChild(tr);

            // 구분이 '성과심사 없음'일 때 현황 강제/비활성화
            const divSelectEl = tr.querySelector('select.division-select');
            if (divSelectEl) {
                divSelectEl.addEventListener('change', () => applyDesignReviewStatusLock(tr));
            }
            applyDesignReviewStatusLock(tr);
        }
    }

    // 사업비 수령내역 테이블
    if (tableID === 'project_receipt_tbody') {
        const tableBody = document.getElementById('project_receipt_tbody');
        if (!tableBody) {
            console.error("Could not find project_receipt_tbody");
            return;
        }

        // 새로운 행 추가
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            for (let j = 0; j < 7; j++) { // 체크박스 + 6열
                const td = document.createElement('td');
                switch (j) {
                    case 0: // 체크박스
                        td.innerHTML = '<input type="checkbox" class="row-check" />';
                        td.style.textAlign = 'center';
                        break;
                    case 1: // 구분
                        td.className = 'edit_cell';
                        td.onclick = function () { TextChange(this, true); };
                        break;
                    case 2: // 금액
                    case 3: // VAT 제외
                    case 4: // 잔액
                        td.className = 'edit_cell';
                        td.onclick = function () { TextChangeWithreceipts(this, false); };
                        break;
                    case 5: // 수령일자
                        td.className = 'date-cell';
                        td.onclick = function () { DateChange(this); };
                        break;
                    case 6: // 내용
                        td.className = 'edit_cell';
                        td.onclick = function () { TextChange(this, true); };
                        break;
                }
                tr.appendChild(td);
            }
            tableBody.appendChild(tr);
        }
    }

    //외부인력 코멘트 행 추가 
    if (tableID === 'externalTable_tbody') {
        const tableBody = tableBodies;

        // 새로운 행 추가
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');

            for (let j = 0; j < 4; j++) {
                const td = document.createElement('td');
                td.textContent = ''; // 초기값을 빈 문자열로 설정
                td.style.height = '25px';
                switch (j) {
                    case 0: // 직급
                        td.onclick = function () {
                            TextChange(this, true);
                        };
                        break;

                    case 1: // 월급
                        td.onclick = function () {
                            externalWithCalculation(this);
                        };
                        break;

                    case 2: // 일급
                        td.className = 'read_only_cell';
                        td.textContent = ''; // 계산된 일급 값
                        break;

                    case 3: // 계약일자자
                        td.onclick = function () {
                            DateChange(this);
                        };
                        break;
                }

                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    }

}

function removeRow(tableID) {
    const el = document.getElementById(tableID);
    if (!el) return;
    // table인지 tbody인지 구분하여 삭제 컨테이너 설정
    const tableBody = el.tagName === 'TABLE' ? (el.querySelector('tbody') || el) : el;

    // 체크박스가 있는 경우: 체크된 것들 삭제, 없으면 기존 동작(마지막 행 삭제)
    const checked = Array.from(el.querySelectorAll('input.row-check:checked'));
    if (checked.length > 0) {
        checked.forEach(chk => {
            const tr = chk.closest('tr');
            if (tr && tr.parentElement) tr.parentElement.removeChild(tr);
        });
        // 참여 기술자 테이블인 경우 rowspan 재계산
        if (tableID.includes('participant_engineers')) {
            applyWorkFieldRowspan();
        }
        return;
    }

    // ModifyRecords_table은 0행까지 허용(placeholder 금지) → 마지막 행도 삭제 허용
    if (tableID === 'Dep_Modify_Record_tbody') {
        if (tableBody.rows.length > 0) {
            tableBody.deleteRow(tableBody.rows.length - 1);
        }
        if (tableID.includes('participant_engineers')) {
            applyWorkFieldRowspan();
        }
        return;
    }

    // 기타 테이블: 최소 1행 유지
    if (tableBody.rows.length > 2) {
        tableBody.deleteRow(tableBody.rows.length - 1); // 마지막 행 삭제
    } else {
        alert('최소 한개의 행은 남겨있어야 합니다.');
    }
    if (tableID.includes('participant_engineers')) {
        // 로드 후 표시 단계에서만 병합 적용
        applyWorkFieldRowspan();
    }
}

// 천 단위 콤마 추가
function formatWithCommas(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 숫자인지 확인
function isNumeric(value) {
    return !isNaN(value) && !isNaN(parseFloat(value));
}

// 경비 텍스트 박스 처리
function inputMoney(td, isFlag = true) {
    const originalText = td.textContent.trim().replace(/,/g, ''); // 기존 콤마 제거
    td.style.position = "relative";

    const input = document.createElement("input");
    input.type = "text";
    input.value = formatWithCommas(originalText); // 콤마 붙여서 초기값 넣기

    // td 크기 기반 위치 및 스타일
    input.style.position = "absolute";
    input.style.top = "0";
    input.style.left = "0";
    input.style.width = td.clientWidth + "px";
    input.style.height = td.clientHeight + "px";
    input.style.boxSizing = "border-box";
    input.style.border = "none";
    input.style.margin = "0";
    input.style.padding = "0";
    input.style.fontSize = "inherit";
    input.style.background = "transparent";
    input.style.textAlign = "center";

    //실시간 콤마 적용
    input.addEventListener("input", () => {
        const raw = input.value.replace(/,/g, '');
        if (!isNumeric(raw)) {
            input.value = '';
            return;
        }
        input.value = formatWithCommas(raw);
    });

    //포커스 빠졌을 때
    input.addEventListener("blur", () => {
        const raw = input.value.replace(/,/g, '');
        const newValue = parseFloat(raw);

        if (isNaN(newValue)) {
            td.textContent = '';
            return;
        }

        td.textContent = formatWithCommas(newValue);

        if (isFlag === true) {
            const isNoVAT = Math.round(newValue / 1.1);
            const isduty = newValue - isNoVAT;

            // td 업데이트
            const parentRow = td.closest('tr');
            parentRow.querySelectorAll("td")[3].textContent = formatWithCommas(isduty);   // 세액
            parentRow.querySelectorAll("td")[4].textContent = formatWithCommas(isNoVAT);  // 공급가액
            parentRow.querySelectorAll("td")[5].textContent = formatWithCommas(newValue); // 금액
        }

        updateExpenseTotals();
    });

    // 엔터 입력 시 blur 처리
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") input.blur();
    });

    td.textContent = ''; // 기존 텍스트 제거 후 input 삽입
    td.appendChild(input);
    input.focus();
}

function updateExpenseTotals() {
    const tbody = document.getElementById("Dep_fir_Specific_data");
    const rows = tbody.querySelectorAll("tr");

    const use_totalDuty = document.getElementById('use_totalduty');
    const use_totalNoVAT = document.getElementById('use_totalNoVAT');
    const use_totalMoney = document.getElementById('use_totalMoney');
    let totalDuty = 0;
    let totalNoVAT = 0;
    let totalAmount = 0;

    // 합계행은 마지막 줄이므로 제외 (맨 마지막 tr)
    for (let i = 0; i < rows.length - 1; i++) {
        const cells = rows[i].querySelectorAll("td");

        const duty = parseFloat(cells[3]?.textContent.replace(/,/g, '')) || 0;
        const noVAT = parseFloat(cells[4]?.textContent.replace(/,/g, '')) || 0;
        const amount = parseFloat(cells[5]?.textContent.replace(/,/g, '')) || 0;

        totalDuty += duty;
        totalNoVAT += noVAT;
        totalAmount += amount;
    }
    // 마지막 tr이 합계행이라고 가정
    const totalRow = rows[rows.length - 1];
    const totalCells = totalRow.querySelectorAll("td");
    use_totalDuty.textContent = totalDuty.toLocaleString();
    use_totalNoVAT.textContent = totalNoVAT.toLocaleString();
    use_totalMoney.textContent = totalAmount.toLocaleString();
}


// Select 옵션 변경시 단가 데이터 습득 함수
function getPrice(selectElement) {
    const selectedItem = selectElement.value;
    const row = selectElement.closest('tr');
    const priceTd = row.querySelector('.Price-cell');
    var year = getCurrentYear();

    if (selectedItem) {
        fetch(`/get_price?item=${selectedItem}&year=${year}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.price !== undefined) {
                    priceTd.textContent = data.price;

                    // 단가 수정 가능하도록 이벤트 항상 유지
                    priceTd.onclick = function () {
                        TextChange(this);
                    };
                    priceTd.classList.add('edit_cell');

                } else {
                    priceTd.textContent = '0.00';
                    priceTd.onclick = function () {
                        TextChange(this);
                    };
                    priceTd.classList.add('edit_cell');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                priceTd.textContent = '오류 발생';
            });
    } else {
        priceTd.textContent = '0.00';
        priceTd.onclick = function () {
            TextChange(this);
        };
        priceTd.classList.add('edit_cell');
    }
}
// 모달 열기
function openModal(button) {
    document.body.classList.add('modal-open');  // body 스크롤 막기
    btnID = button.id;
    dataType = button.getAttribute("data-type");

    if (btnID == 'quantityModal') {
        document.getElementById('modal_quantityModal').style.display = 'block';
    }
    else if (btnID == 'itemModal') {
        document.getElementById('modal_itemModal').style.display = 'block';
    }
    else if (btnID == 'outsourceModal') {
        document.getElementById('modal_outsourceModal').style.display = 'block';
    }
    else if (btnID == 'externalModal') {
        document.getElementById('externalLaborModal').style.display = 'block';
    }
    else if (btnID == 'statusModalBTN') {
        document.getElementById('modal_statusModal').style.display = 'block';
    }
    else if (btnID == 'EXrecordsModal_fir' || btnID == 'EXrecordsModal_sec') {
        const department = button.getAttribute("data-department");
        //  id가 modifySave_BTN인 버튼에 data-department 설정
        const modifySaveButton = document.getElementById("modifySave_BTN");
        if (modifySaveButton) {
            modifySaveButton.setAttribute("data-department", department);
        }

        let data;
        if (department === 'fir') {
            data = firstRecords;
        }
        else if (department === 'sec') {
            data = secondRecords;
        }

        updateRecordTable(data);

        document.getElementById('modal_EXrecordsModal').style.display = 'block';
    }
    else if (btnID == 'printModal') {
        document.getElementById('modal_copyData').style.display = 'block';
    }
}

// 모달 닫기
function closeQuantityModal() {
    document.body.classList.remove('modal-open');  // body 스크롤 다시 활성화
    document.getElementById('modal_quantityModal').style.display = 'none';
    document.getElementById('modal_itemModal').style.display = 'none';
    document.getElementById('modal_outsourceModal').style.display = 'none';
    document.getElementById('externalLaborModal').style.display = 'none';
    document.getElementById('modal_statusModal').style.display = 'none';
    document.getElementById('modal_EXrecordsModal').style.display = 'none';
    document.getElementById('modal_copyData').style.display = 'none';
}

function updateRecordTable(data) {
    const tbody = document.getElementById('Dep_Modify_Record_tbody');

    // 테이블 내용 초기화
    tbody.innerHTML = '';

    // `data`가 배열이 아니라면 빈 배열로 설정
    if (!Array.isArray(data) || data.length === 0) {
        // 요청 사항: 전체 삭제 등으로 비었을 때 placeholder 행 추가하지 않음 (완전 비움)
        return;
    }

    // 데이터 순회하며 테이블 행 추가
    data.forEach(record => {
        // 단가 표시에서 .00 제거(소수부가 00일 때만), 천단위 콤마 적용
        let unitRaw = record[8];
        let unitDisplay = '';
        if (unitRaw !== null && unitRaw !== undefined && unitRaw !== '') {
            let s = String(unitRaw);
            if (/^\d+(\.\d+)?$/.test(s)) {
                if (s.endsWith('.00')) s = s.slice(0, -3);
                // 쉼표 적용 (정수/소수 모두 허용, 소수는 그대로 유지)
                if (s.includes('.')) {
                    const [intPart, decPart] = s.split('.');
                    unitDisplay = `${formatWithCommas(intPart)}.${decPart}`;
                } else {
                    unitDisplay = formatWithCommas(s);
                }
            } else {
                unitDisplay = s;
            }
        }
        let row = `
            <tr>
                <td style="text-align:center;"><input type="checkbox" class="row-check"></td>
                <td>
                    <select class="account-select" onchange="updateRecordsSum(this.parentElement.parentElement)">
                        <option value="복리후생비/식대" ${record[1] === "복리후생비/식대" ? "selected" : ""}>복리후생비/식대</option>
                        <option value="복리후생비/음료 외" ${record[1] === "복리후생비/음료 외" ? "selected" : ""}>복리후생비/음료 외</option>
                        <option value="여비교통비/(출장)숙박" ${record[1] === "여비교통비/(출장)숙박" ? "selected" : ""}>여비교통비/(출장)숙박</option>
                        <option value="여비교통비/주차료" ${record[1] === "여비교통비/주차료" ? "selected" : ""}>여비교통비/주차료</option>
                        <option value="여비교통비/대중교통" ${record[1] === "여비교통비/대중교통" ? "selected" : ""}>여비교통비/대중교통</option>
                        <option value="소모품비/현장물품" ${record[1] === "소모품비/현장물품" ? "selected" : ""}>소모품비/현장물품</option>
                        <option value="소모품비/기타소모품" ${record[1] === "소모품비/기타소모품" ? "selected" : ""}>소모품비/기타소모품</option>
                        <option value="차량유지비/주유" ${record[1] === "차량유지비/주유" ? "selected" : ""}>차량유지비/주유</option>
                        <option value="차량유지비/차량수리 외" ${record[1] === "차량유지비/차량수리 외" ? "selected" : ""}>차량유지비/차량수리 외</option>
                        <option value="도서인쇄비/출력 및 제본" ${record[1] === "도서인쇄비/출력 및 제본" ? "selected" : ""}>도서인쇄비/출력 및 제본</option>
                        <option value="운반비/등기우편 외" ${record[1] === "운반비/등기우편 외" ? "selected" : ""}>운반비/등기우편 외</option>
                        <option value="지급수수료/증명서발급" ${record[1] === "지급수수료/증명서발급" ? "selected" : ""}>지급수수료/증명서발급</option>
                        <option value="기타/그 외 기타" ${record[1] === "기타/그 외 기타" ? "selected" : ""}>기타/그 외 기타</option>
                        <option value="삭제" ${record[1] === "삭제" ? "selected" : ""}>삭제</option>
                    </select>
                </td>
                <td class="edit_cell" onclick="TextChange(this)">${record[3] ?? ''}</td>
                <td class="edit_cell" onclick="TextChange(this)">${record[4] ?? ''}</td>
                <td class="edit_cell" onclick="TextChange(this)">${record[7] ?? ''}</td>
                <td class="edit_cell" onclick="TextChange(this)">${unitDisplay}</td>
                <td class="amount-cell">${record[5] ? parseInt(record[5]).toLocaleString() : ''}</td>
                <td class="edit_cell" onclick="TextChange(this, true)">${record[9] || ''}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}



// 모달 섹션 초기화 함수
function initializeModalSections() {
    // A 섹션을 처음에는 숨기기
    document.getElementById('modal_ASection').style.display = 'none';
    // 사업보할 섹션도 숨기기
    const bohalSection = document.getElementById('modal_projectBohal_section');
    if (bohalSection) bohalSection.style.display = 'none';

    // select 박스 이벤트 리스너 추가
    document.getElementById('modal_item1').addEventListener('change', function () {
        handleSectionDisplay('modal_item1', 'modal_ALabel', 'modal_ASection', 'quantityModal_A_tbody', 3);
    });
}

// 섹션을 표시하고 라벨을 업데이트하는 함수
function handleSectionDisplay(selectId, labelId, sectionId, tableId) {
    const selectedValue = document.getElementById(selectId).value;
    const contractCode = document.getElementById('project-contractCode').value;

    if (selectedValue !== "") {
        document.getElementById(sectionId).style.display = 'block';
        document.getElementById(labelId).innerText = selectedValue;
        const bohalSection = document.getElementById('modal_projectBohal_section');
        if (bohalSection) bohalSection.style.display = 'block';

        // 부서 보할 값 불러오기
        fetch(`/get_department_bohal?contract_code=${encodeURIComponent(contractCode)}&department=${encodeURIComponent(selectedValue)}`)
            .then(res => res.json())
            .then(json => {
                const input = document.getElementById('modal_projectBohal');
                if (input) input.value = (json && typeof json.bohal !== 'undefined') ? json.bohal : '';
            })
            .catch(err => console.warn('Failed to fetch department bohal', err));

        // DB에서 데이터 조회
        fetchQuantityData(selectedValue, contractCode, tableId);
    } else {
        document.getElementById(sectionId).style.display = 'none';
        const bohalSection = document.getElementById('modal_projectBohal_section');
        if (bohalSection) bohalSection.style.display = 'none';
        const input = document.getElementById('modal_projectBohal');
        if (input) input.value = '';
    }
}

// DB 데이터 조회 및 테이블 업데이트 함수
function fetchQuantityData(department, contractCode, tableId) {
    fetch(`/get_task_quantity?department=${department}&contract_code=${contractCode}`)
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById(tableId);
            tbody.innerHTML = ''; // 기존 테이블 내용 초기화

            if (data && data.length > 0) {
                // DB 데이터가 있는 경우
                data.forEach(row => {
                    const tr = document.createElement('tr');
                    const bo = (row[3] !== null && row[3] !== undefined && row[3] !== '') ? formatSmartNumber(row[3]) : '';

                    tr.innerHTML = `
                        <td style="text-align: center;"><input type="checkbox"></td>
                        <td class="edit_cell" onclick="TextChange(this, true)">${row[0] || ''}</td>
                        <td class="edit_cell" onclick="TextChange(this)">${row[1] || ''}</td>
                        <td class="edit_cell" onclick="TextChange(this, true)">${row[2] || ''}</td>
                        <td class="edit_cell" onclick="TextChange(this)">${bo}</td>
                    `;

                    tbody.appendChild(tr);
                });
            } else {
                // DB 데이터가 없는 경우 빈 행 하나 추가
                addRows('quantityModal_A_tbody', 1);
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            // 에러 발생 시 빈 행 하나 추가
            addRows('quantityModal_A_tbody', 1);
        });
}


// form 데이터 처리
document.getElementById('modal_quantityModal').addEventListener('submit', function (event) {
    event.preventDefault(); // 폼 제출 막기
    const item1 = document.getElementById('item1').value;
    const item2 = document.getElementById('item2').value;
    const quantity1 = document.getElementById('quantity1').value;
    const quantity2 = document.getElementById('quantity2').value;

    // 서버로 데이터 전송하거나 추가 작업 실행

    // 달 창 닫기
    closeQuantityModal();
})

function addTextbox(containerID, count) {
    const container = document.getElementById(containerID);

    for (let i = 0; i < count; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '텍스트 입력';
        input.className = 'dynamic-textbox'; // 텍스트박스에 사용할 클래스

        container.appendChild(input);
    }
}

function removeTextbox(containerID, count) {
    const container = document.getElementById(containerID);

    // 은 텍스트박스가 count보다 적으면 모두 삭제
    if (container.children.length <= count) {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    } else {
        for (let i = 0; i < count; i++) {
            if (container.children.length > 0) {
                container.removeChild(container.lastElementChild); // 마지막 텍스트박를 삭제
            }
        }
    }
}

function saveTaskQuantity() {
    const contractCode = document.getElementById('project-contractCode').value;
    const aLabel = document.getElementById('modal_ALabel').innerText.trim();
    // 부서 단위 사업보할(%) 기본값
    const deptBohalInput = document.getElementById('modal_projectBohal');
    let defaultBohal = deptBohalInput ? (parseFloat(deptBohalInput.value) || 0) : 0;
    defaultBohal = Math.min(100, Math.max(0, Math.round(defaultBohal * 10) / 10));
    const taskDataA = [];

    // 부서 사업물량 데이터 수집
    if (aLabel && aLabel !== '선택하세요') {
        const aRows = document.querySelectorAll('#quantityModal_A_tbody tr');
        aRows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');

            // 체크박스는 건너뛰고 나머지 셀에서 값 추출
            const item = cells[1]?.innerText.trim();
            let quantity = cells[2]?.innerText.trim().replace(/,/g, '');
            const unit = cells[3]?.innerText.trim();
            let bohal = (cells[4]?.innerText || '').trim().replace(/,/g, ''); // 가중치(%)
            // 빈 문자열이면 부서 기본값 적용, 그 외 숫자 파싱
            let bohalNum = bohal === '' ? defaultBohal : parseFloat(bohal);
            if (isNaN(bohalNum)) bohalNum = defaultBohal || 0;
            bohalNum = Math.min(100, Math.max(0, Math.round(bohalNum * 10) / 10));
            const cal_bohal = bohalNum ? (bohalNum / 100) : 0;

            if (item && quantity && unit) {
                taskDataA.push({
                    number: index + 1,
                    department: aLabel,
                    item: item,
                    quantity: quantity,
                    unit: unit,
                    bohal: bohalNum,           // 입력받은 %값 (예: 40)
                    cal_bohal: cal_bohal       // 진행률 계산용 (예: 0.4)
                });
            }
        });
    }

    // 데이터 검증 및 서버 전송
    if (taskDataA.length === 0) {
        alert('저장할 데이터가 없습니다. 부서 또는 항목을 입력해주세요.');
        return;
    }

    fetch('/api/save_task_quantity', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            taskA: taskDataA,
            contractCode: contractCode,
            departmentBohal: defaultBohal
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.message === 'Save successful') {
                alert('저장이 완료되었습니다.');
                reloadWithCurrentState();
            } else {
                alert('저장에 실패했습니다. 다시 시도하세요.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('저장에 실패했습니다. 다시 시도하세요.');
        });
}

// 작업물량 로그 저장 함수 추가
function saveQuantityLog(taskItemData, contractCode) {
    fetch('/api/save_quantity_log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            taskItemData: taskItemData,
            contractCode: contractCode
        })
    })
        .catch(error => {
            console.error('Error saving quantity log:', error);
        });
}

function saveBudgetData() {
    const contractCode = document.getElementById('project-contractCode').value;
    const fullHeaderText = document.getElementById('Dep_fir_Bud_header_text').textContent;
    let department = fullHeaderText.replace(/\s*인건비\s*/, '').trim();
    department = department.split(/\s|\t/)[0];

    if (!department || !contractCode) {
        alert('부서 또는 계약코드를 확인해주세요.');
        return;
    }

    const positions = getPositions(); // 직급 리스트
    const budgetTbody = document.getElementById('Dep_fir_Budget_data');
    const budgetRows = [...budgetTbody.querySelectorAll('tr')];

    const assignmentData = [];
    const summaryData = [];

    for (let i = 1; i < budgetRows.length; i++) {
        const cells = budgetRows[i].querySelectorAll('td');
        const work_item = cells[0]?.textContent.trim();
        const summaryQuantity = parseFloat(cells[3]?.textContent.replace(/,/g, '')) || 0;


        summaryData.push({
            item: work_item,
            department: department,
            contractCode: contractCode,
            SummaryQuantity: summaryQuantity
        });

        let colIndex = 8; // 직급 시작 인덱스 (보할 컬럼 추가로 +1)

        positions.forEach(position => {
            const day_time = parseFloat(cells[colIndex]?.textContent.replace(/,/g, '')) || 0;
            const night_time = parseFloat(cells[colIndex + 1]?.textContent.replace(/,/g, '')) || 0;
            const holiday = parseFloat(cells[colIndex + 2]?.textContent.replace(/,/g, '')) || 0;

            // 기존: 모두 0이면 return 해서 누락됨
            // 변경: 항상 push → 0으로도 저장 가능
            assignmentData.push({
                position,
                work_item,
                department,
                contractCode,
                day_time,
                night_time,
                holiday
            });

            colIndex += 3;
        });
    }
    //경비 테이블 수집
    const expenseData = [];
    const expenseTbody = document.getElementById('Dep_fir_Specific_data');
    const expenseRows = expenseTbody.querySelectorAll('tr');

    expenseRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const useAccountSelect = cells[0]?.querySelector('select');
        const historySelect = cells[1]?.querySelector('select');
        const typeText = cells[2]?.textContent.trim();
        const moneyText = cells[5]?.textContent.trim().replace(/,/g, '');
        const money = parseInt(moneyText, 10); // NaN이면 아래서 0 처리

        if (useAccountSelect && historySelect && typeText) { // 금액 0도 허용
            expenseData.push({
                use_account: useAccountSelect.value,
                history: historySelect.value,
                type: typeText,
                money: isNaN(money) ? 0 : money,
                department: department,
                ContractCode: contractCode
            });
        }
    });

    if (
        assignmentData.length === 0 &&
        summaryData.length === 0 &&
        expenseData.length === 0
    ) {
        alert('저장할 데이터가 없습니다.');
        return;
    }

    //서버로 전송
    fetch('/api/save_budget_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            assignmentData: assignmentData,
            summaryData: summaryData,
            expenseData: expenseData
        })
    })
        .then(res => {
            if (!res.ok) throw new Error('저장 실패');
            return res.json();
        })
        .then(data => {
            if (data.message === 'Save successful') {
                alert('저장 완료되었습니다.');
                reloadWithCurrentState();
            } else {
                throw new Error('저장 실패');
            }
        })
        .catch(err => {
            console.error('에러:', err);
            alert('저장 중 오류가 발생했습니다.');
        });
}



// 부서 버튼에 따른 인건비 데이터 수집
function fetchDepartmentData(department, modalID) {
    const contractCode = document.getElementById('project-contractCode').value;
    const headerText = document.getElementById('Dep_fir_Bud_header_text');
    const monthButtons = document.getElementById('month_button_div');
    const budgetTable = document.getElementById('Dep_fir_RealBudget');
    const logTable = document.getElementById('Dep_fir_LogTable');
    const paginationContainer = document.getElementById('pagination-container');
    const outsourcingDiv = document.getElementById('Outsourcing_process_div'); // '외주' 전용 div
    const Budget_Tab = document.getElementById('Dep_fir_Budget_Tab'); // 인건비 div
    const specific_Tab = document.getElementById('Dep_fir_specific_Tab'); // 경비 div

    // department 값이 유효하지 않으면 함수를 종료
    if (!department || department === '') {
        console.error('부서가 선택되지 않았습니다.');
        return;
    }

    // '외주'일 경우 처리
    if (department === '외주') {
        if (monthButtons) monthButtons.style.display = 'none';
        if (budgetTable) budgetTable.style.display = 'none';
        if (logTable) logTable.style.display = 'none';
        if (paginationContainer) paginationContainer.style.display = 'none';
        if (specific_Tab) specific_Tab.style.display = 'none';
        if (Budget_Tab) Budget_Tab.style.display = 'none';
        if (outsourcingDiv) outsourcingDiv.style.display = 'block'; // '외주' 전용 div 보이기
        return;
    } else {
        // '외주'가 아닐 경우 기존 동작 수행
        if (monthButtons) monthButtons.style.display = isQuantityLogView ? 'block' : 'none';
        if (budgetTable) budgetTable.style.display = isQuantityLogView ? 'none' : 'table';
        if (logTable) logTable.style.display = isQuantityLogView ? 'table' : 'none';
        if (paginationContainer) paginationContainer.style.display = isQuantityLogView ? 'block' : 'none';
        if (specific_Tab) specific_Tab.style.display = 'block';
        if (Budget_Tab) Budget_Tab.style.display = 'block';
        if (outsourcingDiv) outsourcingDiv.style.display = 'none'; // '외주' 전용 div 숨기기
    }

    // 비용 계산 호출
    fetchExpenseDepartmentData(department, modalID);

    // 서버에서 부서별 데이터 요청
    fetch(`/get_department_data/${department}?contract_code=${contractCode}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (modalID === 'Dep_fir_Money') {
                headerText.textContent = department + '\t' + '인건비';
                updateTable(data, department);
            } else if (modalID === 'itemModal') {
                updateItemSelect(data);
            }
        })
        .catch((error) => {
            console.error('Error: ', error);
        });
}

// 부서 버튼에 따른 경비 데이터 수집
function fetchExpenseDepartmentData(department, modalID) {

    const contractCode = document.getElementById('project-contractCode').value;
    const headerSecText = document.getElementById('Dep_sec_spec_header_text');


    if (!department || department === '') {
        console.error('부서가 선택되지 않았습니다.');
        return;
    }

    fetch(`/get_expense_department_data/${department}?contract_code=${contractCode}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {

            if (modalID === 'Dep_fir_Money') {
                headerSecText.textContent = department + '\t' + '경비';
                updateSpecificTable(data, department);
            } else if (modalID === 'itemModal') {
                updateExpenseItemSelect(data);
            }
        })
        .catch((error) => {
            console.error('Error: ', error);
        });
}

function getPositions() {
    const base = ['이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직'];
    if (document.getElementById('hasExternalLaborData')?.value === 'true') {
        base.push('외부인력');
    }
    return base;
}

function updateTable(data, department) {
    // 외부인력 상태 확인
    const hasExternalLaborData = document.getElementById('hasExternalLaborData')?.value === 'true';

    // data.quantity_data와 data.time_data로 분리
    const quantityData = data.quantity_data;
    const timeData = data.time_data;

    const tableBody = document.getElementById('Dep_fir_Budget_data');
    const tableHead = document.querySelector('#Dep_fir_RealBudget thead');
    tableBody.innerHTML = '';

    // 외부인력을 조건에 따라 추가
    const positions = getPositions();

    // thead 구성 - 3개의 행으로 구성
    let headHTML = `
        <tr>
            <th colspan="3" style="width: 200px;">구분</th>
            <th colspan="5" style="width: 300px; border-left: 2px solid #cccccc;">합     계</th>
    `;

    positions.forEach(position => {
        headHTML += `<th colspan="3" style="width: 180px; border-left: 2px solid #cccccc;">${position}</th>`;
    });
    headHTML += '</tr>';

    headHTML += `
         <tr>
            <th style="width: 100px;">구분</th>
            <th style="width: 50px;">물량</th>
            <th style="width: 50px;">단위</th>
            <th style="width: 60px; border-left: 2px solid #cccccc;">누계물량</th>
        <th style="width: 60px;">보할(%)</th>
            <th style="width: 60px;">진행률(%)</th>
            <th style="width: 60px;">M/D</th>
            <th style="width: 60px;">M/T</th>
    `;
    positions.forEach(() => {
        headHTML += `
            <th style="width: 60px; border-left: 2px solid #cccccc;">주</th>
            <th style="width: 60px;">야</th>
            <th style="width: 60px;">휴</th>
        `;
    });
    headHTML += '</tr>';

    tableHead.innerHTML = headHTML;

    // 데이터가 없는 경우 처리
    if (!quantityData || quantityData.length === 0) {
        const noDataRow = document.createElement('tr');
        noDataRow.innerHTML = `
            <td colspan="${3 + positions.length * 3}" style="text-align: center; padding: 20px; color: #666; background-color: #f9f9f9;">
                데이터가 없습니다
            </td>
        `;
        tableBody.appendChild(noDataRow);
        return;
    }

    // 직급별 합계 계산
    const positionTotals = {};
    positions.forEach(position => {
        positionTotals[position] = { day: 0, night: 0, holiday: 0 };
    });


    let totalProgressSum = 0;
    let totalBohalSum = 0;
    let itemCount = 0;

    // 각 직급의 주간, 야간, 휴일 데이터 합산
    timeData.forEach(timeItem => {
        const position = timeItem.position;
        if (positionTotals[position]) {
            positionTotals[position].day += parseFloat(timeItem.day_time) || 0;
            positionTotals[position].night += parseFloat(timeItem.night_time) || 0;
            positionTotals[position].holiday += parseFloat(timeItem.holiday) || 0;
        }
    });

    // 전체 진행률 계산: (누계/전체) * 보할(%)/100 * 100
    // 단, 공종별 진행률은 100%를 초과하더라도 부서 합산 시에는 해당 공종의 보할만큼만 기여하도록 per-item을 100%로 클램프
    quantityData.forEach(row => {
        const totalQty = parseFloat(row.total_quantity) || 0;
        const assignedQty = parseFloat(row.assigned_quantity) || 0;
        const bohalPct = parseFloat(row.bohal) || 0; // 예: 10
        const bohalFrac = bohalPct / 100;            // 예: 0.1
        // per-item raw progress in percent
        const rawPercent = totalQty > 0 ? (assignedQty / totalQty) * 100 : 0;
        // clamp to at most 100% before weighting
        const clampedPercent = Math.min(100, rawPercent);
        const progress = (bohalFrac > 0) ? clampedPercent * bohalFrac : 0;

        if (row.item !== '기타') {
            totalProgressSum += progress;
            itemCount++;
            totalBohalSum += bohalPct;
        }
    });

    // 합계 진행률은 보할 가중 합계(평균 아님)
    const totalProgress = totalProgressSum;
    const clampedTotalProgress = Math.min(100, totalProgress);
    const displayTotalProgress = clampedTotalProgress === 100 ? '100' : clampedTotalProgress.toFixed(1);

    const totalMT = Object.values(positionTotals).reduce((acc, { day, night, holiday }) => {
        return acc + day + night + holiday;
    }, 0);

    const totalMD = (totalMT / 8).toFixed(2);
    // 합계 행 생성
    const summaryRow = document.createElement('tr');
    const bgColor = totalProgress >= 100 ? '#ebf7d3' : '';

    const formattedTotalBohal = formatSmartNumber(totalBohalSum);
    const formattedTotalBohalWithUnit = formattedTotalBohal === '' ? '' : `${formattedTotalBohal}%`;
    const isBohalExactly100 = (itemCount > 0) && Math.abs(totalBohalSum - 100) < 0.0001;
    const bohalSummaryBg = isBohalExactly100 ? '#ebf7d3' : '#ffe6e6';
    summaryRow.innerHTML = `
    <th colspan="4" style="text-align: center; background-color: #ebf7d3;">합계</th>
    <td id="total_bohal" style="background-color: ${bohalSummaryBg};">${formattedTotalBohalWithUnit}</td>
    <td id = "total_progress" style="background: linear-gradient(to right, #B1FA9C ${displayTotalProgress}%, transparent ${displayTotalProgress}%)">${displayTotalProgress}</td>
    <td id = "total_MD">${formatValue(totalMD)}</td>
    <td id = "total_MT">${formatValue(totalMT)}</td>
`;

    // 각 직급의 합계를 8로 나누어 합계 행에 추가
    positions.forEach(position => {
        const totals = positionTotals[position];

        // 각 직급의 주간, 야간, 휴일 합산
        const dayMD = (totals.day / 8).toFixed(2);
        const nightMD = (totals.night / 8).toFixed(2);
        const holidayMD = (totals.holiday / 8).toFixed(2);

        summaryRow.innerHTML += `
        <td style="background-color: ${bgColor}; border-left: 2px solid #cccccc;">${dayMD === "0.00" ? "" : dayMD}</td>
        <td style="background-color: ${bgColor}">${nightMD === "0.00" ? "" : nightMD}</td>
        <td style="background-color: ${bgColor}">${holidayMD === "0.00" ? "" : holidayMD}</td>
    `;
    });

    tableBody.insertBefore(summaryRow, tableBody.firstChild);

    // 각 항목의 데이터 행 생성
    quantityData.forEach(qRow => {
        const tr = document.createElement('tr');
        const itemTimeData = timeData.filter(t => t.item === qRow.item);

        let rowMT = 0;
        itemTimeData.forEach(timeItem => {
            rowMT += (parseFloat(timeItem.day_time) || 0) +
                (parseFloat(timeItem.night_time) || 0) +
                (parseFloat(timeItem.holiday) || 0);
        });

        const rowMD = rowMT / 8;

        // 행 표시용 진행률: (누계/전체) * 100 (보할과 무관하게 공종 완료 시 100% 표시, 초과 가능)
        const totalQty = parseFloat(qRow.total_quantity) || 0;
        const assignedQty = parseFloat(qRow.assigned_quantity) || 0;
        const rawProgress = totalQty > 0 ? (assignedQty / totalQty) * 100 : 0;
        const displayProgress = Math.round(rawProgress * 10) / 10;
        const bgColor = displayProgress >= 100 ? '#FFFFC1' : '';

        const formattedBohal = (qRow.item === '기타' || qRow.bohal == null) ? '' : formatSmartNumber(qRow.bohal);
        const bohalDisplay = formattedBohal === '' ? '' : `${formattedBohal}%`;
        let rowHTML = `
            <td>${qRow.item || ''}</td>
            <td>${Number(qRow.total_quantity).toFixed(3).toLocaleString()}</td>
            <td>${qRow.unit || ''}</td>
            <td style="border-left: 2px solid #cccccc; background-color: ${bgColor}">${Number(qRow.assigned_quantity).toFixed(3)}</td>
            <td>${bohalDisplay}</td>
            <td style="background: ${getProgressBackground(displayProgress)}">${displayProgress.toFixed(1)}</td>
            <td style="background-color: ${bgColor}">${formatValue(rowMD)}</td>
            <td style="background-color: ${bgColor}">${formatValue(rowMT)}</td>
        `;

        positions.forEach(position => {
            const positionData = itemTimeData.find(t => t.position === position);
            if (positionData) {
                rowHTML += `
                    <td style="background-color: ${bgColor}; border-left: 2px solid #cccccc;">${formatValue(positionData.day_time)}</td>
                    <td style="background-color: ${bgColor}">${formatValue(positionData.night_time)}</td>
                    <td style="background-color: ${bgColor}">${formatValue(positionData.holiday)}</td>
                `;
            } else {
                rowHTML += `
                    <td style="background-color: ${bgColor}; border-left: 2px solid #cccccc;"></td>
                    <td style="background-color: ${bgColor}"></td>
                    <td style="background-color: ${bgColor}"></td>
                `;
            }
        });

        tr.innerHTML = rowHTML;
        tableBody.appendChild(tr);

        // 행 표시용 진행률을 DOM 값 기준으로 재계산하여 확실히 반영 (완료 시 100% 이상도 표시)
        try {
            const tds = tr.querySelectorAll('td');
            const domTotal = parseFloat((tds[1]?.textContent || '').replace(/,/g, '')) || 0;
            const domAssigned = parseFloat((tds[3]?.textContent || '').replace(/,/g, '')) || 0;
            const rawPct = domTotal > 0 ? (domAssigned / domTotal) * 100 : 0;
            if (tds[5]) {
                const disp = Math.round(rawPct * 10) / 10;
                tds[5].textContent = disp.toFixed(1);
                tds[5].style.background = getProgressBackground(disp);
            }
            // 100% 이상일 때 누계/MD/MT 강조색 재적용
            const rawBg = rawPct >= 100 ? '#FFFFC1' : '';
            if (tds[3]) tds[3].style.backgroundColor = rawBg;
            if (tds[6]) tds[6].style.backgroundColor = rawBg;
            if (tds[7]) tds[7].style.backgroundColor = rawBg;
        } catch (e) {
            console.warn('Row progress recompute failed:', e);
        }
    });

    // 전체 테이블 생성 후 한 번 더 모든 행의 진행률을 DOM 기준으로 보정
    try {
        const rows = tableBody.querySelectorAll('tr');
        for (let i = 1; i < rows.length; i++) {
            const tds = rows[i].querySelectorAll('td');
            if (!tds || tds.length < 8) continue;
            const domTotal = parseFloat((tds[1]?.textContent || '').replace(/,/g, '')) || 0;
            const domAssigned = parseFloat((tds[3]?.textContent || '').replace(/,/g, '')) || 0;
            const rawPct = domTotal > 0 ? (domAssigned / domTotal) * 100 : 0;
            const disp = Math.round(rawPct * 10) / 10;
            tds[5].textContent = disp.toFixed(1);
            tds[5].style.background = getProgressBackground(disp);
            const rawBg = rawPct >= 100 ? '#FFFFC1' : '';
            tds[3].style.backgroundColor = rawBg;
            tds[6].style.backgroundColor = rawBg;
            tds[7].style.backgroundColor = rawBg;
        }
    } catch (e) {
        console.warn('Post-build row progress normalize failed:', e);
    }


}


function getCellByVisualIndex(row, visualIndex) {
    let index = 0;
    const cells = row.querySelectorAll("td, th");
    for (const cell of cells) {
        const colspan = parseInt(cell.getAttribute("colspan") || 1);
        if (index <= visualIndex && visualIndex < index + colspan) {
            return cell;
        }
        index += colspan;
    }
    return null;
}

//셀 인덱스로부터 직급과 시간대 추출
function getPositionAndTimeTypeFromIndex(cellIndex, baseStart = 8, positions = []) {
    const relativeIndex = cellIndex - baseStart;
    const group = Math.floor(relativeIndex / 3);
    const typeIndex = relativeIndex % 3;

    const position = positions[group];
    const type = ['day', 'night', 'holiday'][typeIndex];

    return { position, type };
}

//입력된 셀 기준으로 행 M/T, M/D 갱신
function updateRowMTandMD(tr) {
    const cells = tr.querySelectorAll("td");
    let mt = 0;
    for (let i = 8; i < cells.length; i++) {
        mt += parseFloat(cells[i].textContent) || 0;
    }
    const md = (mt / 8).toFixed(2);
    cells[6].textContent = md;
    cells[7].textContent = mt;
}

//평균 진행률, 총 M/D, 총 M/T 계산
function updateSummaryMeta(tableBody) {
    const rows = [...tableBody.querySelectorAll("tr")];
    const summaryRow = rows[0];
    const summaryCells = summaryRow.querySelectorAll("td, th");
    const sumaaryMD = document.getElementById('total_MD');
    const sumaaryMT = document.getElementById('total_MT');
    const sumaaryProgress = document.getElementById('total_progress');
    const summaryBohal = document.getElementById('total_bohal');
    let totalMT = 0;
    let totalProgress = 0;
    let itemCount = 0;
    let totalBohal = 0;

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll("td");
        const itemName = cells[0]?.textContent.trim();
        const mt = parseFloat(cells[7]?.textContent) || 0;
        // 가중 진행률 = min(누계/전체, 100%) * 보할(%)
        const totalQtyCell = (cells[1]?.textContent || '').replace(/,/g, '');
        const assignedQtyCell = (cells[3]?.textContent || '').replace(/,/g, '');
        const totalQtyVal = parseFloat(totalQtyCell) || 0;
        const assignedQtyVal = parseFloat(assignedQtyCell) || 0;
        const bohal = parseFloat(cells[4]?.textContent) || 0;
        const rawPct = totalQtyVal > 0 ? (assignedQtyVal / totalQtyVal) * 100 : 0;
        const clampedPct = Math.min(100, rawPct);
        const progress = (bohal > 0) ? clampedPct * (bohal / 100) : 0;

        totalMT += mt;
        if (itemName !== "기타") {
            totalProgress += progress;
            itemCount++;
            totalBohal += bohal;
        }
    }

    // 합계 진행률: 보할 가중 합, 각 항목 100% 클램프 후 가중 / 표시는 최대 100%
    const clamped = Math.min(100, totalProgress);
    sumaaryProgress.textContent = clamped === 100 ? '100' : clamped.toFixed(1);
    if (sumaaryProgress) {
        sumaaryProgress.style.background = `linear-gradient(to right, #B1FA9C ${clamped}%, transparent ${clamped}%)`;
    }
    sumaaryMD.textContent = (totalMT / 8).toFixed(2);
    sumaaryMT.textContent = totalMT;
    if (summaryBohal) {
        const s = formatSmartNumber(totalBohal);
        summaryBohal.textContent = s === '' ? '' : `${s}%`;
        const isBohalExactly100 = (itemCount > 0) && Math.abs(totalBohal - 100) < 0.0001;
        summaryBohal.style.backgroundColor = isBohalExactly100 ? '#ebf7d3' : '#ffe6e6';
    }
}


//셀 클릭 시 텍스트박스 + 계산 연결
function enableTdEditing(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    const positions = getPositions();

    const rows = tableBody.querySelectorAll("tr");

    rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return; // 합계행 제외

        const cells = row.querySelectorAll("td");

        cells.forEach(td => {
            td.addEventListener("click", function () {
                if (td.querySelector("input") || (td.cellIndex < 8 && td.cellIndex !== 3)) return;

                const originalText = td.textContent.trim();
                td.textContent = "";

                const input = document.createElement("input");
                input.type = "text";
                input.value = originalText;

                // 스타일 설정
                input.style.width = td.clientWidth + "px";
                input.style.height = td.clientHeight + "px";
                input.style.boxSizing = "border-box";
                input.style.border = "none";
                input.style.fontSize = "inherit";
                input.style.background = "transparent";
                input.style.textAlign = "center";

                input.addEventListener("blur", () => {
                    const newValue = parseFloat(input.value) || '';
                    td.textContent = newValue;
                    // if (newValue === '') return;

                    const tr = td.closest("tr");
                    const tds = tr.querySelectorAll("td");

                    //진행률 계산 로직 (행 표시용): 누계/전체 * 100
                    if (td.cellIndex === 3) {
                        const totalQty = parseFloat(tds[1]?.textContent.replace(/,/g, '')) || 0;
                        const currentQty = parseFloat(tds[3]?.textContent.replace(/,/g, '')) || 0;
                        const percentRaw = totalQty > 0 ? ((currentQty / totalQty) * 100) : 0;
                        // 진행률을 소수 둘째 자리까지 반올림
                        const percent = Math.round(percentRaw * 100) / 100; // 소수 둘째 반올림

                        if (tds[5]) {
                            tds[5].textContent = percent.toFixed(2);
                            tds[5].style.background = getProgressBackground(percent);
                        }

                        const isDone = percent >= 100;
                        const bgColor = isDone ? '#FFFFC1' : '';

                        for (let i = 3; i < tds.length; i++) {
                            if (i === 4) continue; // 보할(%) 칸 배경색은 변경하지 않음
                            tds[i].style.backgroundColor = bgColor;
                        }

                        //전체 평균 진행률 계산 (보할 가중 진행률)
                        const tbody = document.getElementById('Dep_fir_Budget_data');
                        const rows = [...tbody.querySelectorAll('tr')];

                        let sum = 0; // 보할 가중 합계 (각 공종 기여는 보할 한도 이내)

                        for (let i = 1; i < rows.length; i++) {
                            const rowCells = rows[i].querySelectorAll('td');
                            const item = rowCells[0]?.textContent.trim();
                            // 가중 진행률 = (누계/전체) * 보할(%)
                            const totalQty = parseFloat(rowCells[1]?.textContent.replace(/,/g, '')) || 0;
                            const assignedQty = parseFloat(rowCells[3]?.textContent.replace(/,/g, '')) || 0;
                            const bohalPct = parseFloat(rowCells[4]?.textContent) || 0;
                            const ratio = totalQty > 0 ? Math.min(1, assignedQty / totalQty) : 0; // 공종별 진행률 100% 클램프
                            const wProgress = ratio * bohalPct; // 각 공종 기여는 보할(%)을 초과하지 않음

                            if (!isNaN(wProgress) && item !== '기타') sum += wProgress;
                        }

                        const clampedSum = Math.min(100, sum);
                        const displayAvg = clampedSum === 100 ? '100' : clampedSum.toFixed(2);

                        const summaryTd = document.getElementById('total_progress');
                        if (summaryTd) {
                            summaryTd.textContent = displayAvg;
                            summaryTd.style.background = `linear-gradient(to right, #B1FA9C ${displayAvg}%, transparent ${displayAvg}%)`;
                        }

                        return;
                    }

                    //MD/MT 계산 로직
                    if (td.cellIndex >= 7) {
                        updateRowMTandMD(tr);

                        const visualIndex = getVisualCellIndex(td);
                        const rows = [...tableBody.querySelectorAll("tr")];

                        let sum = 0;
                        for (let i = 1; i < rows.length; i++) {
                            const c = getCellByVisualIndex(rows[i], visualIndex);
                            sum += parseFloat(c?.textContent) || 0;
                        }

                        const summaryRow = rows[0];
                        const summaryCell = getCellByVisualIndex(summaryRow, visualIndex);
                        const md = (sum / 8).toFixed(2);
                        if (summaryCell) summaryCell.textContent = md === "0.00" ? "" : md;

                        updateSummaryMeta(tableBody);
                    }
                });

                input.addEventListener("keydown", e => {
                    if (e.key === "Enter") input.blur();
                });

                td.appendChild(input);
                input.focus();
            });
        });
    });

}

function getVisualCellIndex(cell) {
    let index = 0;
    let currentCell = cell;
    while ((currentCell = currentCell.previousElementSibling) !== null) {
        index += parseInt(currentCell.getAttribute("colspan") || 1);
    }
    return index;
}



// 값 포맷팅 헬퍼 함수
function formatValue(value) {
    if (!value || value === 0 || value === '0' || value === '0.00') return '';
    const num = parseFloat(value);
    if (Number.isInteger(num)) {
        return num.toString();
    }
    return num.toFixed(2);
}

// 퍼센트 값 스마트 포맷터: 정수면 정수로, 소수면 원래 소수 유지(최대 4자리), 말미 0 제거
function formatSmartNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (!isFinite(num)) return '';
    if (Number.isInteger(num)) return String(num);
    // 부동소수 오차 방지로 4자리까지만 고정 후 불필요한 0 제거
    let s = num.toFixed(4);
    s = s.replace(/\.0+$/, ''); // .0000 제거
    s = s.replace(/(\.\d*?)0+$/, '$1'); // 소수 끝 0 제거
    return s;
}

// 경비 테이블을 동적으로 구성하는 함수
function updateSpecificTable(data, department) {
    const tableBody = document.getElementById('Dep_fir_Specific_data');
    const tableHead = document.querySelector('#Dep_fir_Specific thead');
    tableBody.innerHTML = ''; // 기존 테이블 내용을 지우고

    // thead 구성
    let headHTML = `
        <tr>
            <th>경비항목</th>
            <th>내역</th>
            <th>유형</th>
            <th>세액</th>
            <th>공급가액</th>
            <th>금액</th>
        </tr>
    `;
    tableHead.innerHTML = headHTML;

    let totalTax = 0;
    let totalSupplyPrice = 0;
    let totalAmount = 0;

    // tbody 구성
    data.forEach(row => {
        const tr = document.createElement('tr');

        // 금액이 있는 경우에만 공급가액과 세액을 계산
        let amount = parseFloat(row.money) || 0;
        let supplyPrice = Math.round(amount / 1.1);
        let tax = amount - supplyPrice;

        totalTax += tax;
        totalSupplyPrice += supplyPrice;
        totalAmount += amount;

        tr.innerHTML = `
            <td>${row.use_account || ''}</td>
            <td>${row.history || ''}</td>
            <td>${row.type || ''}</td>
            <td>${tax.toLocaleString()}</td>
            <td>${supplyPrice.toLocaleString()}</td>
            <td>${amount.toLocaleString()}</td>
        `;

        tableBody.appendChild(tr);
    });

    // 합계 행 추가
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
         <th colspan="3" style="text-align: center; font-weight: bold; background-color: #e9ecea;">합계</th>
         <th id = "use_totalduty" style="font-weight: bold;">${totalTax.toLocaleString()}</th>
         <th id = "use_totalNoVAT" style="font-weight: bold;">${totalSupplyPrice.toLocaleString()}</th>
         <th id = "use_totalMoney" style="font-weight: bold;">${totalAmount.toLocaleString()}</th>
     `;
    tableBody.appendChild(totalRow);
}


//================현금 카드 공급가액 구분 계산(추후 수정)
// function updateSpecificTable(data, department) {
//     const tableBody = document.getElementById('Dep_fir_Specific_data');
//     const tableHead = document.querySelector('#Dep_fir_Specific thead');
//     tableBody.innerHTML = '';

//     let headHTML = `
//         <tr>
//             <th>경비항목</th>
//             <th>내역</th>
//             <th>유형</th>
//             <th>세액</th>
//             <th>공급가액</th>
//             <th>금액</th>
//         </tr>
//     `;
//     tableHead.innerHTML = headHTML;

//     let totalTax = 0;
//     let totalSupplyPrice = 0;
//     let totalAmount = 0;

//     // tbody 구성
//     data.forEach(row => {
//         const tr = document.createElement('tr');
//         let amount = parseFloat(row.money) || 0;
//         let supplyPrice = 0;
//         let tax = 0;

//         // 카드일 경우에만 부가세 계산
//         if (row.history === '카 드') {
//             supplyPrice = Math.round(amount / 1.1);
//             tax = amount - supplyPrice;
//         } else {
//             // 현금일 경우 공급가액은 총액과 같고, 세액은 0
//             supplyPrice = amount;
//             tax = 0;
//         }

//         totalTax += tax;
//         totalSupplyPrice += supplyPrice;
//         totalAmount += amount;

//         tr.innerHTML = `
//             <td>${row.use_account || ''}</td>
//             <td>${row.history || ''}</td>
//             <td>${row.type || ''}</td>
//             <td>${tax.toLocaleString()}</td>
//             <td>${supplyPrice.toLocaleString()}</td>
//             <td>${amount.toLocaleString()}</td>
//         `;

//         tableBody.appendChild(tr);
//     });

//     // 합계 행 추가
//     const totalRow = document.createElement('tr');
//     totalRow.innerHTML = `
//          <th colspan="3" style="text-align: center; font-weight: bold; background-color: #e9ecea;">합계</th>
//          <th style="font-weight: bold;">${totalTax.toLocaleString()}</th>
//          <th style="font-weight: bold;">${totalSupplyPrice.toLocaleString()}</th>
//          <th style="font-weight: bold;">${totalAmount.toLocaleString()}</th>
//      `;
//     tableBody.appendChild(totalRow);
// }




let pieChart1, pieChart2, barChart;

function createCharts() {
    //  예상 데이터 가져오기
    const expectedtable = document.getElementById('EX_fee_table')
    const actualtable = document.getElementById('actual_fee_table')

    if (!expectedtable || !actualtable) {
        console.error('❌ 예상 또는 실제 데이터 테이블을 찾을 수 없습니다.');
        return;
    }

    const exOutsourceEl = document.getElementById('outsourceTotalCost');
    const exOutsource = exOutsourceEl ? Number(exOutsourceEl.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;

    const realOutsourceEl = document.getElementById('Real_outsourceTotalCost');
    const resultOutsource = realOutsourceEl ? Number(realOutsourceEl.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;

    const expectedData = {
        exCompanyMoney: Number(expectedtable.querySelector('tbody tr:nth-child(5) td:nth-child(3)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        exBudget: Number(expectedtable.querySelector('tbody tr:nth-child(6) td:nth-child(4)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        exSpecific: Number(expectedtable.querySelector('tbody tr:nth-child(7) td:nth-child(3)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        exOutsource: exOutsource,
        exPerformance: Number(expectedtable.querySelector('tbody tr:nth-child(10) td:nth-child(4)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        performance: 0
    };
    const actualData = {
        resultCompanyMoney: Number(actualtable.querySelector('tbody tr:nth-child(5) td:nth-child(3)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        resultBudgetSum: Number(actualtable.querySelector('tbody tr:nth-child(6) td:nth-child(4)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        resultSpecific: Number(actualtable.querySelector('tbody tr:nth-child(7) td:nth-child(3)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        resultOutsource: resultOutsource,
        resultPerformance: Number(actualtable.querySelector('tbody tr:nth-child(10) td:nth-child(4)')?.textContent.replace(/[^0-9.-]/g, '')) || 0,
        performance: 0
    };
    const performanceData = Array.isArray(performance_result?.filtered_data)
        ? performance_result.filtered_data
        : [];

    performanceData.forEach(item => {
        switch (item.description) {
            case "당초 내역서":
                expectedData.performance = item.amount;
                break;
            case "변경 내역서":
            case "실납부액":
                actualData.performance = item.amount;
                break;
            case "발주처 납부":
            case "성과심사 없음":
                expectedData.performance = item.amount;
                actualData.performance = item.amount;
                break;
        }
    });

    //  도넛 차트 옵션 (라벨 중앙 정렬 추가)
    const pieOptions = {
        chart: { type: 'donut', height: 340 },
        colors: ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#FF9F40'],
        labels: ['제경비', '인건비', '경비', '외주경비', '성과심사비'],
        title: { align: 'center', style: { fontSize: '16px', fontWeight: 'bold' } },
        legend: { position: 'bottom', horizontalAlign: 'center', fontSize: '14px' },
        dataLabels: {
            enabled: true,
            formatter: (val) => Math.round(val) + '%',
            textAnchor: 'middle',  //중앙 정렬 추가
            dropShadow: { enabled: false }, //그림자 제거하여 선명하게
            style: { fontSize: '16px', fontWeight: 'bold', colors: ['#fff'] }
        },
        tooltip: {
            custom: function ({ series, seriesIndex, w }) {
                const value = series[seriesIndex];
                const label = w.config.labels[seriesIndex];
                const color = w.config.colors[seriesIndex];

                const total = series.reduce((sum, val) => sum + val, 0);
                const percentage = ((value / total) * 100).toFixed(1);

                return `<div style="
                    padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; border-left: 10px solid ${color}; 
                    color: white; font-size: 13px;">
                    <div><span>항목 :</span> <span style="color: ${color};">${label}</span></div>
                    <div><span>금액 :</span> <span>${value.toLocaleString()} 원</span></div>
                    <div><span>비율 :</span> <span>${percentage}%</span></div>
                </div>`;
            }
        },
        plotOptions: {
            pie: {
                customScale: 1,  //중심 위치 보정
                dataLabels: {
                    offset: 0  //중앙 배치
                }
            }
        }
    };

    //  바 차트 옵션 (막대 끝에 값 표시)
    const barOptions = {
        chart: { type: 'bar', height: 320, stacked: false },
        colors: ['#36A2EB', '#FF6384'],
        dataLabels: {
            enabled: false,
            // formatter: (val) => (val === 0 ? '' : val.toLocaleString() + '원'),
            // style: { fontSize: '13px', fontWeight: 'bold', colors: ['#000000'] },
            // offsetY: -5,  //값이 막대의 끝에 표시됨
            // position: 'top'  //데이터 라벨을 막대 위쪽 바깥으로 이동
        },
        plotOptions: {
            bar: { columnWidth: '60%', borderRadius: 5, groupPadding: 0 }
        },
        stroke: { show: true, width: 2, colors: ['transparent'] },
        xaxis: {
            categories: ['제경비', '인건비', '경비', '외주경비', '성과심사비'],
            max: () => parseFloat(document.getElementById('ProjectCost_NoVAT')?.textContent.replace(/[^\d.-]/g, '')) || 0
        },
        yaxis: {
            labels: { formatter: (val) => val.toLocaleString() }
        }
    };

    //  기존 차트 제거
    if (pieChart1) pieChart1.destroy();
    if (pieChart2) pieChart2.destroy();
    if (barChart) barChart.destroy();

    try {
        //  차트 생성
        pieChart1 = new ApexCharts(document.querySelector("#pieChart1"), {
            ...pieOptions,
            title: { text: '실행예산 비율' },
            series: [
                expectedData.exCompanyMoney,
                expectedData.exBudget,
                expectedData.exSpecific,
                expectedData.exOutsource,
                expectedData.performance
            ]
        });

        pieChart2 = new ApexCharts(document.querySelector("#pieChart2"), {
            ...pieOptions,
            title: { text: '사업수행 비율' },
            series: [
                actualData.resultCompanyMoney,
                actualData.resultBudgetSum,
                actualData.resultSpecific,
                actualData.resultOutsource,
                actualData.performance
            ]
        });

        barChart = new ApexCharts(document.querySelector("#barChart"), {
            ...barOptions,
            series: [{
                name: '실행예산',
                data: [
                    expectedData.exCompanyMoney,
                    expectedData.exBudget,
                    expectedData.exSpecific,
                    expectedData.exOutsource,
                    expectedData.performance
                ]
            }, {
                name: '사업수행',
                data: [
                    actualData.resultCompanyMoney,
                    actualData.resultBudgetSum,
                    actualData.resultSpecific,
                    actualData.resultOutsource,
                    actualData.performance
                ]
            }]
        });

        //  차트 렌더링
        pieChart1.render();
        pieChart2.render();
        barChart.render();

    } catch (error) {
        console.error('차트 생성 중 오류 발생:', error);
    }
}

//======================================================================================================
//======================================================================================================
//======================================================================================================
//======================================================================================================



// 그라데이션 배경색을 생성하는 함수
function getProgressBackground(progress) {
    const percentage = parseFloat(progress);
    return `linear-gradient(to right, #FFFFC1 ${percentage}%, transparent ${percentage}%)`;
}




// 부서 버튼 클릭 이벤트에도 console 추가
document.querySelectorAll('.department-button').forEach(button => {
    button.addEventListener('click', function () {
        const paginationContainer = document.getElementById('pagination-container');
        if (paginationContainer) {
            paginationContainer.style.display = 'none';
        }

        const pagination = document.querySelector('.pagination');
        if (pagination) {
            pagination.remove();
        }

        // 상태 변수 설정
        isQuantityLogView = false;

        // 모든 페이지네이션 관련 요소 제거
        const expensePagination = document.querySelector('#expense-pagination');
        if (expensePagination) {
            expensePagination.remove();
        }
    });
});

/**
 * 프로젝트 진행률 개요 로딩 및 테이블 렌더링
 * 구성 행:
 *  1) 사업 / 보할(%): 부서별 물량 가중치(항목 bo할 합계, '기타' 제외)
 *  2) 사업 / 진행율(%): Σ( (누계/전체) * (bo할%/100) * 100 ) 부서별, 마지막 열은 전체 가중합
 *  3) 부서: 부서의 평균(가중치 적용 없이) 진행률 (단순 평균), 전체는 '-' 표시
 *  D-Day: 종료일까지 남은 일수 (종료일 hidden input 추가 가정). 종료일이 없으면 '-' 표시.
 * 가정:
 *  - /get_task_quantity?department=...&contract_code=... 엔드포인트는 item,total_quantity,assigned_quantity,unit,bohal(%) 순서의 배열을 반환.
 *  - 부서 목록은 GIS사업부, GIS사업지원부, 공간정보사업부, 연구소. (외주는 별도 데이터 없으면 '-' 처리)
 */
async function loadProgressOverview() {
    const contractCode = document.getElementById('project-contractCode')?.value;
    if (!contractCode) return;
    const endDateText = getProjectEndDate();
    const bohalMap = (typeof DEPARTMENT_BOHAL === 'object' && DEPARTMENT_BOHAL) ? DEPARTMENT_BOHAL : {};

    // 전체(보할>0) 부서 목록
    const allDepartments = Object.keys(bohalMap).filter(dep => {
        const v = parseFloat(bohalMap[dep]);
        return !isNaN(v) && v > 0;
    });

    // 내부 고정 부서 분류 집합
    const internalSet = new Set(['GIS사업부', 'GIS사업지원부', '연구소', '공간정보사업부']);
    const internalDepartments = allDepartments.filter(d => internalSet.has(d));
    const outsourcingDepartments = allDepartments.filter(d => !internalSet.has(d));


    // 헤더는 내부 부서들 + 외주 단일 컬럼
    renderProgressOverviewHeader(internalDepartments);

    if (allDepartments.length === 0) {
        const overviewTbody = document.getElementById('progress_overview_tbody');
        if (overviewTbody) {
            const colCount = 2 + 0 + 1 + 1 + 2; // 진행률(2) + 부서(0) + 외주 + 계 + D-Day/전체진행률(2)
            overviewTbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:6px;">등록된 보할이 없습니다.</td></tr>`;
        }
        return;
    }

    const overviewTbody = document.getElementById('progress_overview_tbody');
    if (!overviewTbody) return;

    // 모든 부서(내부+외주) 데이터 병렬 조회
    const allResults = await Promise.all(allDepartments.map(dep => fetchDeptData(dep, contractCode)));
    const summaries = {};
    allDepartments.forEach((dep, i) => {
        summaries[dep] = summarizeDepartmentFromData(allResults[i]);
    });

    // 외주 부서에 대해 TaskQuantity 데이터가 없으면 외주 테이블의 진행률 평균으로 대체
    const outsourceAvg = await fetchOutsourcingAvgByCompany(contractCode); // {byComposite, byCompany}
    outsourcingDepartments.forEach(dep => {
        const s = summaries[dep];
        let avg = outsourceAvg.byComposite ? outsourceAvg.byComposite[dep] : undefined;
        if ((avg === undefined || isNaN(avg))) {
            // 복합키가 없으면 업체명만으로 재조회
            let compOnly = dep;
            if (dep.includes(' - ')) {
                const parts = dep.split(' - ');
                compOnly = parts.slice(1).join(' - ').trim();
            }
            avg = outsourceAvg.byCompany ? outsourceAvg.byCompany[compOnly] : undefined;
        }
        if ((!s || s.simpleProgress === null) && typeof avg === 'number' && !isNaN(avg)) {
            summaries[dep] = s || { bohalSum: null, weightedProgress: null, simpleProgress: null };
            summaries[dep].simpleProgress = avg;
        }
    });

    const bohalRow = { labelCells: ['사업', '보할'], values: [], total: 0 };
    const progressWeightedRow = { labelCells: ['사업', '진행율'], values: [], total: 0 };
    const progressSimpleRow = { labelCells: ['부서 진행율'], values: [], total: 0 };

    // 내부 부서 개별 표시
    internalDepartments.forEach((dep, idx) => {
        const w = parseFloat(bohalMap[dep]);
        if (!isNaN(w) && w > 0) {
            bohalRow.values[idx] = withPercent(formatInteger(w));
            bohalRow.total += w;
        } else {
            bohalRow.values[idx] = '-';
        }
    });

    // 진행률 누적(가중합) 전체(내부+외주)
    let weightedAccumulator = 0; // Σ min(진행율*보할, 100*보할)
    let weightSum = 0;
    let simpleAccumulator = 0; // 내부 부서 평균용
    let simpleCount = 0;
    let outsourcingWeightedAccumulator = 0; // 외주 평균 진행율 계산용(클램프 적용 안 함)
    let outsourcingWeightSum = 0;
    let outsourcingClampedAccumulator = 0; // 외주 기여도 표시(보할 한도로 클램프) 합
    let outsourcingContributionCount = 0;

    allDepartments.forEach(dep => {
        const summary = summaries[dep];
        const w = parseFloat(bohalMap[dep]);
        const deptWeightedItems = summary.weightedProgress; // 공종(항목) 보할 가중 합
        const deptSimple = summary.simpleProgress;          // 단순 평균
        const deptEffective = (deptWeightedItems != null) ? deptWeightedItems : deptSimple; // 부서 진행율로 사용
        // 전체 가중 진행률 누적: 부서 진행율 × 보할
        if (deptEffective != null && !isNaN(w) && w > 0) {
            const contribRaw = deptEffective * w;          // (진행율% * 보할%)
            const contribClamped = Math.min(contribRaw, 100 * w); // 보할 한도 내로 제한
            weightedAccumulator += contribClamped; // 뒤에서 /100 처리
            weightSum += w;
            if (outsourcingDepartments.includes(dep)) {
                // 외주 평균 진행율 계산용 누적(클램프 없이)
                outsourcingWeightedAccumulator += (deptEffective * w);
                outsourcingWeightSum += w;
                // 외주 표시용 기여도(클램프 적용)는 별도로 누적
                outsourcingClampedAccumulator += contribClamped;
                outsourcingContributionCount++;
            }
        }
        if (deptEffective !== null && internalDepartments.includes(dep)) {
            simpleAccumulator += deptEffective; // '부서 진행율' 행의 평균용
            simpleCount++;
        }
    });

    // 내부 부서 진행률 값 채우기
    internalDepartments.forEach((dep, idx) => {
        const summary = summaries[dep];
        const deptWeightedItems = summary.weightedProgress;
        const deptSimple = summary.simpleProgress;
        const deptEffective = (deptWeightedItems != null) ? deptWeightedItems : deptSimple; // 부서 진행율
        const w = parseFloat(bohalMap[dep]);
        const deptContribution = (!isNaN(w) && w > 0 && deptEffective != null) ? (deptEffective * w / 100) : null; // 보할 반영 진척도
        const deptContributionClamped = (deptContribution != null) ? Math.min(deptContribution, w) : null; // 보할 한도 내로 제한

        // '사업 / 진행율' 행: 보할 반영치(기여) 표시(보할을 넘지 않도록 클램프)
        progressWeightedRow.values[idx] = (deptContributionClamped != null) ? withPercent(formatRawNumber(deptContributionClamped)) : '-';
        // '부서 진행율' 행: 부서 자체 진행율 표시
        progressSimpleRow.values[idx] = (deptEffective != null) ? withPercent(formatRawNumber(deptEffective)) : '-';
    });

    // 외주 보할 및 진행률 집계(정규화된 가중 평균)
    // 외주 진행율(기여도): 외주 부서 진행율 * 외주 보할 합 /100
    let outsourcingProgress = null; // 외주 부서 평균 진행율
    if (outsourcingWeightSum > 0) {
        // 평균 진행율 = Σ(진행율*보할)/Σ보할 → 여기서는 단순히 진행율 평균이 아니라 기여도 위해 평균 필요
        const avgProgress = outsourcingWeightedAccumulator / outsourcingWeightSum; // 진행율 평균
        outsourcingProgress = avgProgress; // 부서 진행율 값
    } else if (outsourcingDepartments.length > 0) {
        // Fallback: 단순 평균
        let eqSum = 0, eqCount = 0;
        outsourcingDepartments.forEach(dep => {
            const s = summaries[dep];
            if (s.simpleProgress != null) { eqSum += s.simpleProgress; eqCount++; }
        });
        if (eqCount > 0) outsourcingProgress = eqSum / eqCount;
    }

    // 외주 보할 합계(표시용) 및 총합: 진행률 유무와 무관하게 보할 합계를 사용
    const outsourcingBohalSum = outsourcingDepartments.reduce((s, dep) => {
        const w = parseFloat(bohalMap[dep]);
        return s + (isNaN(w) ? 0 : w);
    }, 0);
    bohalRow.total += outsourcingBohalSum;
    const outsourcingBohalDisplay = outsourcingBohalSum > 0 ? withPercent(formatInteger(outsourcingBohalSum)) : '-';
    bohalRow.values.push(outsourcingBohalDisplay);
    // 외주 진행율(보할 반영 기여) = outsourcingProgress * 외주보할합 /100
    // 외주 기여도: 가능한 경우 개별 클램프 합을 사용하여 총계와 일치시키고, 없으면 평균*보할 방식으로 계산하되 보할 한도로 클램프
    let outsourcingContribution = null;
    if (outsourcingContributionCount > 0) {
        outsourcingContribution = outsourcingClampedAccumulator / 100;
    } else if (outsourcingProgress != null && outsourcingBohalSum > 0) {
        outsourcingContribution = Math.min(outsourcingProgress * outsourcingBohalSum / 100, outsourcingBohalSum);
    }
    progressWeightedRow.values.push(outsourcingContribution != null ? withPercent(formatRawNumber(outsourcingContribution)) : '-');
    // '부서 진행율' 행의 외주 칸: 외주 부서 평균 진행율 표시
    progressSimpleRow.values.push(outsourcingProgress != null ? withPercent(formatRawNumber(outsourcingProgress)) : '-');


    // 가중 진행률 '계' = Σ(부서 진행율 × 보할)/100 (전체 사업 진행율 대비 기여)
    if (weightSum > 0) {
        progressWeightedRow.total = weightedAccumulator / 100;
    }
    // 내부 부서 평균 '계'는 표시에 '-' 처리 (요구사항)
    // 과거: progressSimpleRow.total = simpleAccumulator / simpleCount;
    // 현재: total 컬럼은 의미 없는 집계로 혼동을 주므로 비활성화
    progressSimpleRow.total = null; // buildProgressRow에서 '-'로 표시됨

    // 보할 합계(계)는 표시 상한 100%로 클램프
    const bohalTotalCell = (bohalRow.total || bohalRow.total === 0)
        ? withPercent(formatInteger(Math.min(100, bohalRow.total)))
        : '-';
    // 가중 진행률 총계(계)도 보할 가중 합 특성상 100%를 넘지 않도록 표시만 클램프
    // 현재 weightedAccumulator는 Σ(진행율*보할) (외주 포함) → total은 weightedAccumulator/100
    const weightedTotalRaw = (weightSum > 0)
        ? ((weightedAccumulator + ((outsourcingContribution != null) ? 0 : 0)) / 100)
        : null;
    let weightedTotalCell = (weightedTotalRaw != null)
        ? withPercent(formatRawNumber(Math.min(100, weightedTotalRaw)))
        : '-';
    const ddayCell = computeDDayCell(endDateText);

    // 전체 진행률(백엔드 단일 공식) 동기화: /api/project_progress/<contract_code>
    let overallProgress = '-';
    try {
        const apiRes = await fetch(`/api/project_progress/${encodeURIComponent(contractCode)}`);
        if (apiRes.ok) {
            const data = await apiRes.json();
            if (data && typeof data.progress === 'number') {
                const unified = data.progress; // 이미 2자리 반올림됨
                overallProgress = withPercent(formatRawNumber(unified));
                // '계'(가중 진행률 총계)도 동일 값으로 강제 덮어쓰기 → 모든 화면 일치
                weightedTotalCell = withPercent(formatRawNumber(unified));
            }
        }
    } catch (e) {
        console.warn('backend progress fetch failed', e);
    }

    overviewTbody.innerHTML = '';
    overviewTbody.appendChild(buildProgressRow('bohal', bohalRow.values, bohalTotalCell, ddayCell, overallProgress));
    overviewTbody.appendChild(buildProgressRow('progress', progressWeightedRow.values, weightedTotalCell));
    overviewTbody.appendChild(buildProgressRow('dept', progressSimpleRow.values, progressSimpleRow.total ? withPercent(formatRawNumber(progressSimpleRow.total)) : '-'));
}

function getProjectEndDate() {
    // 종료일 셀 탐색 ("종료일" 라벨 인접 td) 또는 hidden input (향후 추가 시 사용)
    const rows = document.querySelectorAll('table.custom-table tbody tr');
    for (const r of rows) {
        const first = r.cells[0]?.textContent?.trim();
        if (first === '종료일') {
            return r.cells[1]?.textContent?.trim();
        }
    }
    return null;
}

function computeDDayCell(endDateText) {
    if (!endDateText || endDateText === '-' || !/\d{4}-\d{2}-\d{2}/.test(endDateText)) return '-';
    try {
        const end = new Date(endDateText + 'T00:00:00');
        const today = new Date();
        const diffDays = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
        if (isNaN(diffDays)) return '-';
        return diffDays >= 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
    } catch { return '-'; }
}

async function fetchDeptData(department, contractCode) {
    try {
        const res = await fetch(`/get_department_data/${encodeURIComponent(department)}?contract_code=${encodeURIComponent(contractCode)}`);
        if (!res.ok) return [];
        return await res.json(); // 배열 row[0]=item,row[1]=total?, row[3]=bohal?
    } catch { return []; }
}

// 외주 평균 진행률 맵 반환
// - byComposite: { "외주형태 - 업체명": avg }
// - byCompany:   { "업체명": avg }
async function fetchOutsourcingAvgByCompany(contractCode) {
    try {
        const res = await fetch(`/get_outsourcing?contract_code=${encodeURIComponent(contractCode)}`);
        if (!res.ok) return { byComposite: {}, byCompany: {} };
        const list = await res.json();
        const accComp = {}; // company-only
        const cntComp = {};
        const accDept = {}; // composite key
        const cntDept = {};
        (list || []).forEach(it => {
            // 추가 제안은 제외하고, 회사명/processing만 사용
            if (it && it.outsourcing_type !== '추가 제안') {
                const comp = (it.outsourcing_company || '').trim();
                const otype = (it.outsourcing_type || '').trim();
                const deptKey = `${otype} - ${comp}`.trim();
                const p = parseFloat(it.processing);
                if (!isNaN(p)) {
                    if (comp) {
                        accComp[comp] = (accComp[comp] || 0) + p;
                        cntComp[comp] = (cntComp[comp] || 0) + 1;
                    }
                    if (deptKey) {
                        accDept[deptKey] = (accDept[deptKey] || 0) + p;
                        cntDept[deptKey] = (cntDept[deptKey] || 0) + 1;
                    }
                }
            }
        });
        const byCompany = {};
        Object.keys(accComp).forEach(comp => { byCompany[comp] = cntComp[comp] > 0 ? accComp[comp] / cntComp[comp] : 0; });
        const byComposite = {};
        Object.keys(accDept).forEach(dk => { byComposite[dk] = cntDept[dk] > 0 ? accDept[dk] / cntDept[dk] : 0; });
        return { byComposite, byCompany };
    } catch (e) {
        console.warn('fetchOutsourcingAvgByCompany 실패', e);
        return { byComposite: {}, byCompany: {} };
    }
}

function summarizeDepartmentFromData(data) {
    if (!data || !data.quantity_data || data.quantity_data.length === 0) return { bohalSum: null, weightedProgress: null, simpleProgress: null };
    let bohalSum = 0;
    let weightedProgress = 0;
    let simpleProgressAccum = 0;
    let simpleCount = 0;
    data.quantity_data.forEach(r => {
        const item = r.item;
        const totalQty = parseFloat(cleanNumber(r.total_quantity)) || 0;
        const assignedQty = parseFloat(cleanNumber(r.assigned_quantity)) || 0;
        const bohalPct = parseFloat(cleanNumber(r.bohal)) || 0;
        const isExcluded = (item === '기타') || (item === '추가 제안');
        if (!isExcluded) bohalSum += bohalPct;
        if (!isExcluded && totalQty > 0 && bohalPct > 0) {
            weightedProgress += (assignedQty / totalQty) * (bohalPct / 100) * 100;
        }
        if (totalQty > 0) {
            simpleProgressAccum += (assignedQty / totalQty) * 100;
            simpleCount++;
        }
    });
    const simpleProgress = simpleCount > 0 ? (simpleProgressAccum / simpleCount) : null;
    return {
        bohalSum: bohalSum === 0 ? null : bohalSum,
        weightedProgress: weightedProgress === 0 ? null : weightedProgress,
        simpleProgress: simpleProgress
    };
}

function buildProgressRow(type, values, totalValue, ddayValue, overallValue) {
    const tr = document.createElement('tr');
    if (type === 'bohal') {
        const first = document.createElement('td');
        first.rowSpan = 2;
        first.textContent = '사업';
        styleCell(first);
        tr.appendChild(first);
        const second = document.createElement('td');
        second.textContent = '보할';
        styleCell(second);
        tr.appendChild(second);
    } else if (type === 'dept') {
        const first = document.createElement('td');
        first.colSpan = 2;
        first.textContent = '부서 진행율';
        styleCell(first);
        tr.appendChild(first);
    } else if (type === 'progress') {
        const second = document.createElement('td');
        second.textContent = '진행율';
        styleCell(second);
        tr.appendChild(second);
    }

    values.forEach(v => {
        const td = document.createElement('td');
        td.textContent = v;
        styleCell(td);
        tr.appendChild(td);
    });
    const totalTd = document.createElement('td');
    totalTd.textContent = totalValue;
    styleCell(totalTd);
    tr.appendChild(totalTd);

    // D-Day 셀: 첫 번째 행에만 rowspan 적용
    if (type === 'bohal') {
        const ddayTd = document.createElement('td');
        ddayTd.className = 'no_wrap';
        ddayTd.rowSpan = 3;
        ddayTd.style.width = '80px';
        ddayTd.textContent = ddayValue;
        styleCell(ddayTd);
        tr.appendChild(ddayTd);

        // 전체 진행률 셀 (D-Day 옆), 3행 rowspan
        const overallTd = document.createElement('td');
        overallTd.rowSpan = 3;
        overallTd.style.width = '110px';
        overallTd.textContent = overallValue ?? '-';
        styleCell(overallTd);
        tr.appendChild(overallTd);
    }
    return tr;
}

// 진행률 테이블 thead를 동적으로 생성 (보할 적용된 부서 기준)
function renderProgressOverviewHeader(departments) {
    const thead = document.getElementById('progress_overview_thead');
    if (!thead) return;
    thead.innerHTML = '';
    const tr = document.createElement('tr');
    const thSpan = document.createElement('th');
    thSpan.colSpan = 2;
    thSpan.textContent = '진행률(%)';
    styleCell(thSpan);
    tr.appendChild(thSpan);
    const shortName = (dep) => {
        switch (dep) {
            case 'GIS사업부': return 'GIS';
            case 'GIS사업지원부': return 'GIS지원부';
            case '공간정보사업부': return '공간정보';
            default: return dep.replace('사업부', '');
        }
    };
    departments.forEach(dep => {
        const th = document.createElement('th');
        th.textContent = shortName(dep);
        styleCell(th);
        tr.appendChild(th);
    });
    // 외주, 계, D-Day, 전체 진행률
    ['외주', '계', 'D-Day', '전체 진행률'].forEach(label => {
        const th = document.createElement('th');
        th.textContent = label;
        // 고정 폭: D-Day, 전체 진행률
        if (label === 'D-Day') th.style.width = '80px';
        if (label === '전체 진행률') th.style.width = '110px';
        styleCell(th);
        tr.appendChild(th);
    });
    thead.appendChild(tr);
}

function styleCell(td) {
    td.style.border = '1px solid #ccc';
    td.style.padding = '4px 8px';
    td.style.textAlign = 'center';
    td.style.whiteSpace = 'nowrap';
}

function cleanNumber(val) {
    if (val == null) return '';
    return String(val).replace(/,/g, '').trim();
}

// 진행률 표시에 사용하는 포맷 (소수 둘째 자리 반올림 후 불필요한 0 제거)
function formatRawNumber(num) {
    if (num == null || isNaN(num)) return '-';
    const s = (Math.round(num * 100) / 100).toFixed(2);
    return s.replace(/\.0+$/, '').replace(/\.(\d)0$/, '.$1');
}

// 보할 표시에 사용하는 정수 포맷
function formatInteger(num) {
    if (num == null || isNaN(num)) return '-';
    return String(Math.round(num));
}

// 숫자 문자열에 %를 붙여 표시 ("-"는 제외)
function withPercent(val) {
    if (val == null) return '-';
    const s = String(val).trim();
    if (s === '-' || s === '') return '-';
    return `${s}%`;
}

let currentPage = 1;
let currentLogs = [];
const ITEMS_PER_PAGE = 5;

let isQuantityLogView = false;

function toggleQuantityLog() {
    const budgetTable = document.getElementById('Dep_fir_RealBudget');
    const logTable = document.getElementById('Dep_fir_LogTable');
    const specificTable = document.getElementById('Dep_fir_Specific');  // 경비 테이블
    const specificLogTable = document.getElementById('Dep_Log_Specific');  // 경비 로그 테이블
    const viewLogBtn = document.getElementById('view_quantity_log');
    const headerText = document.getElementById('Dep_fir_Bud_header_text');
    const currentDepartment = headerText.textContent.split('\t')[0];
    const paginationContainer = document.getElementById('pagination-container');
    const excelDownloadBtn = document.getElementById('excel_download');
    if (budgetTable.style.display !== 'none') {
        // 물량 로그 보기로 전환
        budgetTable.style.display = 'none';
        specificTable.style.display = 'none';  // 경비 테이블 숨김
        logTable.style.display = 'table';
        specificLogTable.style.display = 'table';  // 경비 로그 테이블 표시
        paginationContainer.style.display = 'flex';
        viewLogBtn.textContent = '인건비 보기';
        headerText.textContent = currentDepartment + '\t물량 로그';
        excelDownloadBtn.style.display = 'block';
        isQuantityLogView = true;
        fetchQuantityLogs();
        fetchExpenseLogs();
        createMonthButtons();
    } else {
        // 인건비 보기로 전환
        budgetTable.style.display = 'table';
        specificTable.style.display = 'table';  // 경비 테이블 표시
        logTable.style.display = 'none';
        specificLogTable.style.display = 'none';  // 경비 로그 테이블 숨김
        paginationContainer.style.display = 'none';
        viewLogBtn.textContent = '물량 로그 보기';
        headerText.textContent = currentDepartment + '\t인건비';
        excelDownloadBtn.style.display = 'none';
        isQuantityLogView = false;

        // 월별 버튼 컨테이너 제거
        const monthButtonsContainer = document.querySelector('.month-buttons');
        if (monthButtonsContainer) {
            monthButtonsContainer.remove();
        }

        // 페이지네이션 제거
        const pagination = document.querySelector('.pagination');
        if (pagination) {
            pagination.remove();
        }

        // 경비 페이지네이션 제거
        const expensePagination = document.querySelector('#expense-pagination');
        if (expensePagination) {
            expensePagination.remove();
        }
    }
}

function fetchQuantityLogs(month = null) {
    const contractCode = document.getElementById('project-contractCode').value;
    const headerText = document.getElementById('Dep_fir_Bud_header_text');
    const currentDepartment = headerText.textContent.split('\t')[0].trim();

    fetch(`/api/get_quantity_logs?contract_code=${contractCode}&department=${encodeURIComponent(currentDepartment)}`)
        .then(response => response.json())
        .then(logs => {
            // 월별 필터링이 있는 경우
            if (month) {
                currentLogs = logs.filter(log => log.log_date.substring(0, 7) === month);
            } else {
                currentLogs = logs;
            }

            displayPage(1);  // 항상 첫 페이지부터 표시
        })
        .catch(error => {
            console.error('Error fetching logs:', error);
            alert('로그 데이터를 가져오는데 실패했습니다.');
        });
}

function displayPage(page) {
    if (!isQuantityLogView) {
        return;
    }
    const tbody = document.getElementById('Dep_fir_Log_data');
    tbody.innerHTML = '';

    const start = (page - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, currentLogs.length);
    const pageData = currentLogs.slice(start, end);

    if (pageData.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = '데이터가 없습니다.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    pageData.forEach(log => {
        const tr = document.createElement('tr');

        // 날짜 셀
        const dateCell = document.createElement('td');
        dateCell.textContent = log.log_date || '';
        dateCell.style.textAlign = 'center';

        // 공정 셀
        const processCell = document.createElement('td');
        processCell.textContent = log.process || '';
        processCell.style.textAlign = 'center';

        // 물량 셀
        const quantityCell = document.createElement('td');
        quantityCell.textContent = (log.quantity === 0 || log.quantity === 0.00 || log.quantity === '0' || log.quantity === '0.00') ? '-' : log.quantity;
        quantityCell.style.textAlign = 'center';

        // MT 유형 셀
        const mtTypeCell = document.createElement('td');
        let mtTypeText = '';
        switch (log.mt_type) {
            case 'day':
                mtTypeText = '주간';
                break;
            case 'night':
                mtTypeText = '야간';
                break;
            case 'holiday':
                mtTypeText = '휴일';
                break;
            default:
                mtTypeText = '';
        }
        mtTypeCell.textContent = mtTypeText;
        mtTypeCell.style.textAlign = 'center';

        // MT 값 셀
        const mtValueCell = document.createElement('td');
        mtValueCell.textContent = log.MT || '0';
        mtValueCell.style.textAlign = 'center';

        // 직급 셀
        const positionCell = document.createElement('td');
        positionCell.textContent = log.position || '';
        positionCell.style.textAlign = 'center';

        // 비고 셀
        const remarksCell = document.createElement('td');
        remarksCell.textContent = log.remarks || '';
        remarksCell.style.textAlign = 'center';

        // 수정 버튼 셀
        const buttonCell = document.createElement('td');
        buttonCell.style.textAlign = 'center';
        const editButton = document.createElement('button');
        editButton.textContent = '수정';
        editButton.className = 'view-log-btn';
        editButton.onclick = () => editLog(log);
        buttonCell.appendChild(editButton);

        // 셀 추가
        tr.appendChild(dateCell);
        tr.appendChild(processCell);
        tr.appendChild(quantityCell);
        tr.appendChild(mtTypeCell);
        tr.appendChild(mtValueCell);
        tr.appendChild(positionCell);
        tr.appendChild(remarksCell);
        tr.appendChild(buttonCell);

        tbody.appendChild(tr);
    });

    updatePagination(currentLogs.length, page);
}

function updatePagination(totalItems, currentPage) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // 새로운 페이지네이션 div 생성
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination';

    // 이전 버튼 추가
    if (currentPage > 1) {
        const prevButton = document.createElement('button');
        prevButton.className = 'pagination-btn pagination-prev';
        prevButton.textContent = '이전';
        prevButton.onclick = () => {
            displayPage(currentPage - 1);
        };
        paginationDiv.appendChild(prevButton);
    }

    // 페이지 번호 버튼 추가
    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.className = 'pagination-btn';
        if (i === currentPage) {
            pageButton.classList.add('active');  // 현재 페이지 강조
        }
        pageButton.textContent = i;
        pageButton.onclick = () => {
            // 모든 버튼에서 active 클래스 제거
            document.querySelectorAll('.pagination-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            // 클릭된 버튼에 active 클래스 추가
            pageButton.classList.add('active');
            displayPage(i);
        };
        paginationDiv.appendChild(pageButton);
    }

    // 다음 버튼 추가
    if (currentPage < totalPages) {
        const nextButton = document.createElement('button');
        nextButton.className = 'pagination-btn pagination-next';
        nextButton.textContent = '다음';
        nextButton.onclick = () => {
            displayPage(currentPage + 1);
        };
        paginationDiv.appendChild(nextButton);
    }

    // 기존 페이지네이션 제거 후 새로운 페이지네이션 추가
    const existingPagination = document.querySelector('.pagination');
    if (existingPagination) {
        existingPagination.remove();
    }

    const logTable = document.getElementById('Dep_fir_LogTable');
    logTable.parentElement.appendChild(paginationDiv);
}

function createMonthButtons() {
    if (!isQuantityLogView) return;

    const contractCode = document.getElementById('project-contractCode').value;
    const headerText = document.getElementById('Dep_fir_Bud_header_text');
    const currentDepartment = headerText.textContent.split('\t')[0];

    fetch(`/api/get_available_months?contract_code=${contractCode}&department=${currentDepartment}`)
        .then(response => response.json())
        .then(months => {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'month-buttons';

            const currentDate = new Date();
            const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            const hasCurrentMonth = months.includes(currentMonth);
            const mostRecentMonth = months[months.length - 1];
            const activeMonth = hasCurrentMonth ? currentMonth : mostRecentMonth;

            months.forEach(month => {
                const button = document.createElement('button');
                const monthNum = month.split('-')[1];
                button.textContent = `${parseInt(monthNum)}월`;
                button.className = 'month-btn';
                button.value = month;

                if (month === activeMonth) {
                    button.classList.add('active');
                    setTimeout(() => filterLogsByMonth(month, button), 100);
                }

                button.onclick = (e) => {
                    document.querySelectorAll('.month-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    button.classList.add('active');
                    filterLogsByMonth(month, e.target);
                };

                buttonContainer.appendChild(button);
            });

            const existingContainer = document.querySelector('.month-buttons');
            if (existingContainer) {
                existingContainer.remove();
            }

            const logTable = document.getElementById('Dep_fir_LogTable');
            logTable.parentElement.insertBefore(buttonContainer, logTable);
        })
        .catch(error => {
            console.error('월별 데이터 가져오기 실패:', error);
        });
}

function filterLogsByMonth(month, buttonElement) {
    // 인건비 로그 필터링 (기존 코드)
    currentPage = 1;
    fetchQuantityLogs(month);
    // 경비 로그 필터링 추가
    currentExpensePage = 1;  // 페이지 리셋
    const filteredExpenseLogs = currentExpenseLogs.filter(log => {
        const date = new Date(log.log_date);
        const logMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return logMonth === month;
    });
    displayExpenseLogs(filteredExpenseLogs);

    // 버튼 활성화 상태 변경
    document.querySelectorAll('.month-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (buttonElement) {
        buttonElement.classList.add('active');
    }
}

//=====================월별 경비 로그 테이블========================
// 경비 로그를 위한 전역 변수 추가
let currentExpenseLogs = [];
let currentExpensePage = 1;
const EXPENSE_ITEMS_PER_PAGE = 5;

// 경비 로그 데이터 가져오기
function fetchExpenseLogs() {
    const contractCode = document.getElementById('project-contractCode').value;
    const headerText = document.getElementById('Dep_fir_Bud_header_text');
    const currentDepartment = headerText.textContent.split('\t')[0].trim();

    fetch(`/api/get_expense_logs/${encodeURIComponent(currentDepartment)}?contract_code=${contractCode}`)
        .then(response => response.json())
        .then(logs => {
            currentExpenseLogs = logs;
            displayExpenseLogs(logs);
        })
        .catch(error => {
            console.error('Error fetching expense logs:', error);
            alert('경비 로그 데이터를 가져오는데 실패했습니다.');
        });
}

// 경비 로그 테이블 표시
function displayExpenseLogs(logs) {
    const tbody = document.getElementById('Dep_Log_Specific_data');
    if (!tbody) {
        console.error('Cannot find tbody element with id: Dep_Log_Specific_data');
        return;
    }

    tbody.innerHTML = '';

    const start = (currentExpensePage - 1) * EXPENSE_ITEMS_PER_PAGE;
    const end = Math.min(start + EXPENSE_ITEMS_PER_PAGE, logs.length);
    const pageData = logs.slice(start, end);

    // 데이터가 없는 경우
    if (pageData.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.textContent = '데이터가 없습니다.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    pageData.forEach(log => {
        const tr = document.createElement('tr');
        const date = new Date(log.log_date);

        tr.innerHTML = `
            <td style="text-align: center">${date.toLocaleDateString()}</td>
            <td style="text-align: center">${log.use_account || ''}</td>
            <td style="text-align: center">${log.history || ''}</td>
            <td style="text-align: center">${log.type || ''}</td>
            <td style="text-align: center">${(log.money || 0).toLocaleString()}</td>
            <td colspan="2" style="text-align: center">${log.remarks || ''}</td>
            <td style="text-align: center">
                <button class="view-log-btn">수정</button>
            </td>

            `;

        // 버튼에 이벤트 리스너 추가
        const editButton = tr.querySelector('.view-log-btn');
        editButton.addEventListener('click', () => editExpenseLog(log));

        tbody.appendChild(tr);
    });

    updateExpensePagination(logs.length);
}

function updateExpensePagination(totalItems) {
    if (isQuantityLogView == false) {
        return;
    }
    const totalPages = Math.ceil(totalItems / EXPENSE_ITEMS_PER_PAGE);
    // 기존 페이지네이션 제거
    const existingPagination = document.querySelector('#expense-pagination');
    if (existingPagination) {
        existingPagination.remove();
    }

    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination';
    paginationDiv.id = 'expense-pagination';

    // 이전 버튼
    if (currentExpensePage > 1) {
        const prevButton = document.createElement('button');
        prevButton.className = 'pagination-btn pagination-prev';
        prevButton.textContent = '이전';
        prevButton.onclick = () => {
            currentExpensePage--;
            // 현재 필터링된 로그를 사용
            displayExpenseLogs(currentExpenseLogs.filter(log => {
                const date = new Date(log.log_date);
                const logMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                return logMonth === document.querySelector('.month-btn.active').value;
            }));
        };
        paginationDiv.appendChild(prevButton);
    }

    // 페이지 번호 버튼
    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.className = 'pagination-btn';
        if (i === currentExpensePage) {
            pageButton.classList.add('active');
        }
        pageButton.textContent = i;
        pageButton.onclick = () => {
            currentExpensePage = i;
            document.querySelectorAll('.pagination-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            pageButton.classList.add('active');
            // 현재 필터링된 로그를 사용
            displayExpenseLogs(currentExpenseLogs.filter(log => {
                const date = new Date(log.log_date);
                const logMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                return logMonth === document.querySelector('.month-btn.active').value;
            }));
        };
        paginationDiv.appendChild(pageButton);
    }

    // 다음 버튼
    if (currentExpensePage < totalPages) {
        const nextButton = document.createElement('button');
        nextButton.className = 'pagination-btn pagination-next';
        nextButton.textContent = '다음';
        nextButton.onclick = () => {
            currentExpensePage++;
            // 현재 필터링된 로그를 사용
            displayExpenseLogs(currentExpenseLogs.filter(log => {
                const date = new Date(log.log_date);
                const logMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                return logMonth === document.querySelector('.month-btn.active').value;
            }));
        };
        paginationDiv.appendChild(nextButton);
    }

    const logTable = document.getElementById('Dep_Log_Specific');
    logTable.parentElement.appendChild(paginationDiv);
}




// 로그 수정 함수
function editLog(log) {
    const tr = event.target.closest('tr');
    const logId = log.id;

    // 원래 값들 저장
    tr.setAttribute('data-original-mt-type', tr.cells[3].textContent);
    tr.setAttribute('data-original-mt-value', tr.cells[4].textContent);
    tr.setAttribute('data-original-quantity', tr.cells[2].textContent);

    // 공정 셀 수정 (기존과 동일)
    const processCell = tr.cells[1];
    const currentProcess = processCell.textContent;
    const contractCode = document.getElementById('project-contractCode').value;
    const department = document.getElementById('Dep_fir_Bud_header_text').textContent.split('\t')[0].trim();

    // 서버에서 공정 목록 가져오기 (기존과 동일)
    fetch(`/get_department_Set_data/${department}?contract_code=${contractCode}`)
        .then(response => response.json())
        .then(items => {
            const select = document.createElement('select');
            select.className = 'process-select';

            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.item;
                option.textContent = item.item;
                if (item.item === currentProcess) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            const otherOption = document.createElement('option');
            otherOption.value = '기타';
            otherOption.textContent = '기타';
            if (currentProcess === '기타') {
                otherOption.selected = true;
            }
            select.appendChild(otherOption);

            processCell.innerHTML = '';
            processCell.appendChild(select);
        })
        .catch(error => {
            console.error('공정 데이터 가져오기 실패:', error);
        });

    // 물량 셀 수정 (기존과 동일)
    const quantityCell = tr.cells[2];
    quantityCell.style.cursor = 'pointer';
    quantityCell.addEventListener('click', function () {
        TextChange(this);
    });

    // 근로시간 유형 셀 수정 (select로 변경)
    const mtTypeCell = tr.cells[3];
    const currentMtType = mtTypeCell.textContent;
    const mtTypeSelect = document.createElement('select');
    mtTypeSelect.className = 'mt-type-select';

    const mtTypes = [
        { value: 'day', text: '주간' },
        { value: 'night', text: '야간' },
        { value: 'holiday', text: '휴일' }
    ];

    mtTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.value;
        option.textContent = type.text;
        if (type.text === currentMtType) {
            option.selected = true;
        }
        mtTypeSelect.appendChild(option);
    });

    mtTypeCell.innerHTML = '';
    mtTypeCell.appendChild(mtTypeSelect);

    // 작업시간 셀 수정
    const mtValueCell = tr.cells[4];
    mtValueCell.style.cursor = 'pointer';
    mtValueCell.addEventListener('click', function () {
        TextChange(this);
    });

    // 직급 셀 수정 (select로 변경)
    const positionCell = tr.cells[5];
    const currentPosition = positionCell.textContent;
    const positionSelect = document.createElement('select');
    positionSelect.className = 'position-select';

    const positions = [
        '이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직', '외부인력'
    ];

    positions.forEach(pos => {
        const option = document.createElement('option');
        option.value = pos;
        option.textContent = pos;
        if (pos === currentPosition) {
            option.selected = true;
        }
        positionSelect.appendChild(option);
    });

    positionCell.innerHTML = '';
    positionCell.appendChild(positionSelect);

    // 수정 버튼을 저장 버튼으로 변경
    const buttonCell = tr.cells[7];
    const saveButton = document.createElement('button');
    saveButton.textContent = '저장';
    saveButton.className = 'save-log-btn';
    saveButton.onclick = () => saveLogEdit(tr, logId);
    buttonCell.innerHTML = '';
    buttonCell.appendChild(saveButton);

    // 다른 행들의 이벤트 제거
    const tbody = tr.parentNode;
    tbody.querySelectorAll('tr').forEach(row => {
        if (row !== tr) {
            const qCell = row.cells[2];
            qCell.style.cursor = 'default';
            qCell.replaceWith(qCell.cloneNode(true));
        }
    });
}

function saveLogEdit(tr, logId) {
    const cells = tr.cells;
    const contractCode = document.getElementById('project-contractCode').value;
    const department = document.getElementById('Dep_fir_Bud_header_text').textContent.split('\t')[0].trim();

    // 원래 값들 저장
    const originalMtType = tr.getAttribute('data-original-mt-type');
    const originalMtValue = tr.getAttribute('data-original-mt-value');

    // 새로운 값들
    const logDate = cells[0].textContent;
    const newProcess = cells[1].querySelector('select').value;
    const newQuantity = Number(cells[2].textContent.replace(/,/g, ""));
    const newMtType = cells[3].querySelector('select').value;
    const newMtValue = cells[4].textContent.replace(/,/g, '');
    const newPosition = cells[5].querySelector('select').value;
    const originalQuantity = tr.getAttribute('data-original-quantity');


    // 데이터 변경 여부 확인
    const isMtChanged = (originalMtType !== newMtType) ||
        (originalMtValue !== newMtValue);

    // 현재 날짜와 시간
    const now = new Date();
    const updateTime = now.toLocaleString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(/\s/g, ' ');

    // 비고 텍스트 생성 (물량이 변경된 경우에만)
    let remarks = '';
    if (newQuantity !== originalQuantity) {
        remarks = `변경날짜: ${updateTime} 전: ${originalQuantity} 후: ${newQuantity}`;
    }

    const data = {
        id: logId,
        contract_code: contractCode,
        department: department,
        log_date: logDate,
        process: newProcess,
        quantity: newQuantity ? parseFloat(newQuantity) : null,
        mt_type: newMtType,
        mt: newMtValue ? parseFloat(newMtValue) : null,
        position: newPosition,
        remarks: remarks,
        original_mt_type: originalMtType,
        original_mt_value: originalMtValue,
        is_mt_changed: isMtChanged
    };

    fetch('/api/update_quantity_log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('수정이 완료되었습니다.');
                reloadWithCurrentState();
            } else {
                alert(result.message || '수정 중 오류가 발생했습니다.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('수정 중 오류가 발생했습니다.');
        });
}

// ===============경비 로그 수정=================
function editExpenseLog(log) {
    const tr = event.target.closest('tr');
    const logId = log.ID;

    // 원래 값들 저장
    tr.setAttribute('data-original-use-account', tr.cells[1].textContent);
    tr.setAttribute('data-original-history', tr.cells[2].textContent);
    tr.setAttribute('data-original-type', tr.cells[3].textContent);
    tr.setAttribute('data-original-money', tr.cells[6].textContent);

    // 항목 셀 수정 (select)
    const useAccountCell = tr.cells[1];
    const currentUseAccount = useAccountCell.textContent;
    const useAccountSelect = document.createElement('select');
    useAccountSelect.className = 'use-account-select';

    const options = document.getElementById('Dep_fir_record_select').options;
    for (let i = 0; i < options.length; i++) {
        const option = document.createElement('option');
        option.value = options[i].value;
        option.textContent = options[i].textContent;
        if (options[i].textContent === currentUseAccount) {
            option.selected = true;
        }
        useAccountSelect.appendChild(option);
    }
    useAccountCell.innerHTML = '';
    useAccountCell.appendChild(useAccountSelect);

    // 내역 셀 수정 (select)
    const historyCell = tr.cells[2];
    const currentHistory = historyCell.textContent;
    const historySelect = document.createElement('select');
    historySelect.className = 'history-select';

    const histories = ['카드', '현금'];
    histories.forEach(hist => {
        const option = document.createElement('option');
        option.value = hist;
        option.textContent = hist;
        if (hist === currentHistory) {
            option.selected = true;
        }
        historySelect.appendChild(option);
    });
    historyCell.innerHTML = '';
    historyCell.appendChild(historySelect);

    // 유형 셀 수정
    const typeCell = tr.cells[3];
    typeCell.style.cursor = 'pointer';
    typeCell.addEventListener('click', function () {
        TextChange(this, true);
    });

    // 금액 셀 수정
    const moneyCell = tr.cells[4];
    moneyCell.style.cursor = 'pointer';
    moneyCell.addEventListener('click', function () {
        const text = this.textContent.replace(/,/g, '');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = parseFloat(text).toLocaleString();
        this.textContent = '';
        this.appendChild(input);
        input.focus();

        // 입력값 포맷팅만 유지
        input.addEventListener('input', function () {
            const value = this.value.replace(/,/g, '');
            const money = parseFloat(value) || 0;
            this.value = money.toLocaleString();
        });

        input.addEventListener('blur', function () {
            const value = parseFloat(this.value.replace(/,/g, '')) || 0;
            this.parentElement.textContent = value.toLocaleString();
        });
    });

    // 수정 버튼을 저장 버튼으로 변경
    const buttonCell = tr.cells[6];
    const saveButton = document.createElement('button');
    saveButton.textContent = '저장';
    saveButton.className = 'save-log-btn';
    saveButton.onclick = () => saveExpenseLogEdit(tr, logId);
    buttonCell.innerHTML = '';
    buttonCell.appendChild(saveButton);
}

function saveExpenseLogEdit(tr, logId) {

    const cells = tr.cells;
    const contractCode = document.getElementById('project-contractCode').value;
    const department = document.getElementById('Dep_fir_Bud_header_text').textContent.split('\t')[0].trim();

    // 원래 값들 저장
    const originalUseAccount = tr.getAttribute('data-original-use-account');
    const originalHistory = tr.getAttribute('data-original-history');
    const originalType = tr.getAttribute('data-original-type');
    const originalMoney = tr.getAttribute('data-original-money');

    // 새로운 값들
    const logDate = cells[0].textContent;
    const newUseAccount = cells[1].querySelector('select').value;
    const newHistory = cells[2].querySelector('select').value;
    const newType = cells[3].textContent;
    const newMoney = parseFloat(cells[4].textContent.replace(/,/g, ''));

    // 현재 날짜와 시간
    const now = new Date();
    const updateTime = now.toLocaleString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(/\s/g, ' ');

    // 비고 텍스트 생성 (금액이 변경된 경우에만)
    let remarks = '';
    if (newMoney !== parseFloat(originalMoney)) {
        remarks = `금액: ${originalMoney} → ${newMoney} (${updateTime})`;
    }

    const data = {
        id: logId,  // id 추가 확인
        contract_code: contractCode,
        department: department,
        log_date: logDate,
        use_account: newUseAccount,
        history: newHistory,
        type: newType,
        money: newMoney,
        remarks: remarks
    };


    fetch('/api/update_expense_log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('수정이 완료되었습니다.');
                fetchExpenseLogs();
                reloadWithCurrentState();
            } else {
                alert(result.message || '수정 중 오류가 발생했습니다.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('수정 중 오류가 발생했습니다.');
        });
}


// 1. 레이아웃 편집 모드 전환 함수
function toggleLayout() {
    // 기본 버튼 토글
    document.getElementById("class_edit").style.display = "none";
    document.getElementById("layout_save").style.display = "none";
    // 외부인력 설정 버튼도 편집 모드에서는 숨김
    document.getElementById("externalModal").style.display = "none";


    // 편집 모드 버튼 토글
    document.getElementById("add_dept").style.display = "block";
    document.getElementById("save_dept").style.display = "block";

    // 각 부서별 요소 토글 (Dep만)
    ['fir', 'sec'].forEach(prefix => {
        let headerText = document.getElementById(`Dep_${prefix}_header_text`);
        let select = document.getElementById(`Dep_${prefix}_select`);
        let deleteBtn = document.querySelector(`#Dep_${prefix}_header .delete-btn`);
        let cancelBtn = document.getElementById('cancel_dept');

        if (headerText && select && deleteBtn && cancelBtn) {
            headerText.style.display = "none";
            select.style.display = "block";
            select.value = headerText.textContent.trim(); // 현재 부서명을 select에 설정
            deleteBtn.style.display = "block";
            cancelBtn.style.display = "block";
        }
    });
}

// 레이아웃 상태 전역변수 관리
let LayoutState_fir = 1;
let LayoutState_sec = 1;
let LayoutState_active = 2;
// 2. 부서 추가 함수
function addLayout() {
    if (LayoutState_active >= 2) {
        alert('부서는 최대 2개까지만 추가할 수 있습니다.');
        return;
    }

    const firstDept = document.getElementById('Department_first');
    const secondDept = document.getElementById('Department_second');

    if (!firstDept || !secondDept) {
        console.error('[addLayout] Department elements not found');
        return;
    }

    if (LayoutState_fir === 0) {
        firstDept.classList.add('div_active');
        LayoutState_fir = 1;
    } else if (LayoutState_sec === 0) {
        secondDept.classList.add('div_active');
        LayoutState_sec = 1;
    }

    // 전역 변수 갱신
    LayoutState_active = LayoutState_fir + LayoutState_sec;
}

// 3. 부서 삭제 함수
function removeLayout(button) {
    const parentDiv = button.closest('#Department_first') ||
        button.closest('#Department_second');

    if (!parentDiv) {
        console.error("[removeLayout] Parent div not found");
        return;
    }

    if (LayoutState_active > 1) {
        const confirmResult = confirm('해당 부서를 삭제하시겠습니까?');
        if (confirmResult) {
            parentDiv.classList.remove('div_active');

            if (parentDiv.id === 'Department_first') {
                LayoutState_fir = 0;
            } else {
                LayoutState_sec = 0;
            }

            LayoutState_active = LayoutState_fir + LayoutState_sec;
        }
    } else {
        alert("1개 이상의 Layout이 존재해야 합니다.");
    }
}
// 4. 편집 모드 종료 (취소)
function cancelEdit() {
    // 기본 버튼 복원
    document.getElementById("class_edit").style.display = "block";
    document.getElementById("layout_save").style.display = "block";
    document.querySelector(".class_save").style.display = "block";
    // 외부인력 설정 버튼 복원
    const externalBtn = document.getElementById("externalModal");
    if (externalBtn) externalBtn.style.display = "block";

    // 편집 모드 버튼 숨김
    document.getElementById("add_dept").style.display = "none";
    document.getElementById("save_dept").style.display = "none";
    document.getElementById("cancel_dept").style.display = "none";
    // 각 부서별 요소 복원
    ['fir', 'sec'].forEach(prefix => {
        const headerText = document.getElementById(`Dep_${prefix}_header_text`);
        const select = document.getElementById(`Dep_${prefix}_select`);
        const deleteBtn = document.querySelector(`#Dep_${prefix}_header .delete-btn`);

        headerText.style.display = "block";
        select.style.display = "none";
        deleteBtn.style.display = "none";
    });
}

// 5. 부서 저장 함수    
function saveDepartmentLayout() {
    const contractCode = document.getElementById('project-contractCode').value;

    const firstDept = document.getElementById('Dep_fir_select').value;
    const secondDept = document.getElementById('Dep_sec_select').value;

    // `display: block` 상태인 부서 개수로 활성화 상태 계산 (Dep만)
    const firstLayoutActive = document.querySelector('#Department_first.div_active') ? 1 : 0;
    const secondLayoutActive = document.querySelector('#Department_second.div_active') ? 1 : 0;
    const activeLayoutCount = firstLayoutActive + secondLayoutActive; // 활성화된 부서 개수

    // 저장할 데이터 객체 생성
    const layoutData = {
        contract_code: contractCode,
        first_dept: firstDept,
        second_dept: secondDept,
        first_layout_active: firstLayoutActive, // `display: block` 상태 기준으로 계산
        second_layout_active: secondLayoutActive, // `display: block` 상태 기준으로 계산
        active_Layout_count: activeLayoutCount // 활성화된 부서 개수
    };

    // 서버로 데이터 전송 (Dep/state만 저장)
    fetch('/api/save_layout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(layoutData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('레이아웃이 저장되었습니다.');
                reloadWithCurrentState(); // 기존 상태를 유지하면서 새로고침
            } else {
                alert('저장 중 오류가 발생했습니다: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('저장 중 오류가 발생했습니다.');
        });
}

function fetchLayoutState() {
    const contractCode = document.getElementById('project-contractCode').value;

    fetch(`/get_layout_state/${contractCode}`)
        .then(response => response.json())
        .then(data => {
            const state = data?.examine || data;
            const firstDepartment = document.getElementById('Department_first');
            const secondDepartment = document.getElementById('Department_second');
            const firstHeaderText = document.getElementById('Dep_fir_header_text');
            const secondHeaderText = document.getElementById('Dep_sec_header_text');

            // 첫 번째 부서 처리
            let first_active = state?.first_layout_active;
            if (first_active === undefined || first_active === null) first_active = 1;

            if (first_active > 0) {
                firstDepartment?.classList.add('div_active');
                if (firstHeaderText) firstHeaderText.textContent = state?.first_dept || '사업부를 수정하세요.';
                LayoutState_fir = 1;
            } else {
                firstDepartment?.classList.remove('div_active');
                LayoutState_fir = 0;
            }

            // 두 번째 부서 처리
            let second_active = state?.second_layout_active;
            if (second_active === undefined || second_active === null) second_active = 1;

            if (second_active > 0) {
                secondDepartment?.classList.add('div_active');
                if (secondHeaderText) secondHeaderText.textContent = state?.second_dept || '사업부를 수정하세요.';
                LayoutState_sec = 1;
            } else {
                secondDepartment?.classList.remove('div_active');
                LayoutState_sec = 0;
            }

            LayoutState_active = LayoutState_fir + LayoutState_sec;
        })
        .catch(error => {
            console.error('Error fetching layout state:', error);
        });
}

//사업관리 탭 구성
function createProjectChangeTable() {
    // thead 구성
    const changeTableHead = document.querySelector('#project_change_table thead');
    changeTableHead.innerHTML = `
        <tr>
            <th class = "table-checkbox-col" style="width: 36px;">\u2713</th>
            <th style="width: 80px;">구분</th>
            <th style="width: 100px;">계약일자</th>
            <th style="width: 150px;">전체(VAT 포함)</th>
            <th style="width: 150px;">전체(VAT 제외)</th>
            <th style="width: 150px;">당사(지분율)</th>
            <th style="width: 100px;">증감</th>
            <th style="width: 200px;">변경내용</th>
        </tr>
        <tr>
            <th colspan="8" style="text-align:left; font-weight: normal; color:#666; background:#fafafa;">* 체크박스 선택 후 '-' 버튼을 누르면 해당 행이 삭제됩니다.</th>
        </tr>
    `;

    const reviewTableHead = document.querySelector('#design_review_table thead');
    reviewTableHead.innerHTML = `
        <tr>
            <th class = "table-checkbox-col" style="width: 36px;">\u2713</th>
            <th style="width: 120px;">구분</th>
            <th style="width: 150px;">금액</th>
            <th style="width: 120px;">날짜</th>
            <th style="width: 100px;">현황</th>
            <th style="width: 200px;">비고</th>
        </tr>
        <tr>
            <th colspan="6" style="text-align:left; font-weight: normal; color:#666; background:#fafafa;">* 체크박스 선택 후 '-' 버튼을 누르면 해당 행이 삭제됩니다.</th>
        </tr>
    `; // 성과심사: 체크박스, 구분(select), 금액(수기), 날짜(date picker), 현황(select), 비고(text)

    const receiptTableHead = document.querySelector('#project_receipt_table thead');
    receiptTableHead.innerHTML = `
        <tr>
            <th class = "table-checkbox-col" style="width: 36px;">\u2713</th>
            <th style="width: 100px;">구분</th>
            <th style="width: 150px;">금액</th>
            <th style="width: 150px;">금액(VAT제외)</th>
            <th style="width: 150px;">잔액</th>
            <th style="width: 120px;">수령일자</th>
            <th style="width: 200px;">내용</th>
        </tr>
        <tr>
            <th colspan="7" style="text-align:left; font-weight: normal; color:#666; background:#fafafa;">* 체크박스 선택 후 '-' 버튼을 누르면 해당 행이 삭제됩니다.</th>
        </tr>
    `;

    // 참여 기술자 명단 thead 재구성: 문제예상 테이블과 동일하게 체크박스 열 포함
    const participantsHead = document.querySelector('#participant_engineers_table thead');
    if (participantsHead) {
        participantsHead.innerHTML = `
            <tr>
                <th class = "table-checkbox-col" style="width:36px;">\u2713</th>
                <th style="width:160px;">담당업무</th>
                <th style="width:160px;">성명</th>
                <th style="width:240px;">비고</th>
            </tr>
            <tr>
                <th colspan="4" style="text-align:left; font-weight: normal; color:#666; background:#fafafa;">* 체크박스 선택 후 '-' 버튼을 누르면 해당 행이 삭제됩니다.</th>
            </tr>
        `;
    }

     // 문제예상 테이블 thead 구성 (참여 기술자와 동일한 체크박스 열 포함)
    const issueHead = document.querySelector('#issue_prediction_table thead');
    if (issueHead) {
        issueHead.innerHTML = `
            <tr>
                <th class = "table-checkbox-col" style="width: 36px;">\u2713</th>
                <th style="width: 140px;">구분</th>
                <th style="width: 180px;">부서</th>
                <th style="width: 140px;">작성자</th>
                <th style="width: 160px;">작성일시</th>
                <th>내용</th>
            </tr>
            <tr>
                <th colspan="6" style="text-align:left; font-weight: normal; color:#666; background:#fafafa;">* 체크박스 선택 후 '-' 버튼을 누르면 해당 행이 삭제됩니다.</th>
            </tr>
        `;
    }

    const contractCode = document.getElementById('project-contractCode').value;

    // 응답 체크 함수
    const checkResponse = (response) => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new TypeError("Expected JSON response but received " + contentType);
        }
        return response.json();
    };

    // 1. 사업비 변경내역 (DB 값 활용 + 증감 계산 직접 수행)
    fetch(`/api/get_project_changes/${contractCode}`)
        .then(checkResponse)
        .then(changes => {
            // 데이터 정렬
            changes.sort((a, b) => {
                if (a.Division === '당초') return -1;
                if (b.Division === '당초') return 1;
                return parseInt(a.Division) - parseInt(b.Division);
            });

            const tbody = document.getElementById('project_change_tbody');
            let previousCompanyAmount = null; // 이전 값 저장용

            const changeRows = changes.map((change, index) => {
                // DB에서 오는 값 사용 (기본적으로 0 처리)
                const vatAmount = change.cost_vat || change.Cost_VAT || 0;
                const totalAmount = change.cost_novat || change.Cost_NoVAT || 0;
                const companyAmount = change.cost_sharerate || change.Cost_ShareRate || 0;

                //증감 계산 (이전 값과 비교하여 직접 계산)
                let increaseAmount = '';
                if (previousCompanyAmount !== null) {
                    const difference = companyAmount - previousCompanyAmount;
                    if (difference !== 0) {
                        increaseAmount = formatWithCommas(difference);
                        if (difference > 0) {
                            increaseAmount = '+' + increaseAmount;
                        }
                    }
                }

                // 다음 계산을 위해 현재 금액 저장
                previousCompanyAmount = companyAmount;

                return `
            <tr>
                <td><input type="checkbox" class="row-check table-checkbox-col" /></td>
                <td>${change.division || change.Division || ''}</td>
                <td class="date-cell" onclick="DateChange(this)">
                    ${change.contract_date ? new Date(change.contract_date).toLocaleDateString() : ''}
                </td>
                <td class="edit_cell" onclick="TextChangeWithCalculation(this, false)">
                    ${typeof vatAmount === 'number' ? vatAmount.toLocaleString() : '0'}
                </td>
                <td class="read_only_cell">
                    ${typeof totalAmount === 'number' ? totalAmount.toLocaleString() : '0'}
                </td>
                <td class="read_only_cell">
                    ${typeof companyAmount === 'number' ? companyAmount.toLocaleString() : '0'}
                </td>
                <td class="read_only_cell">
                    ${increaseAmount}
                </td>
                <td class="edit_cell" onclick="TextChange(this, true)">
                    ${change.description || change.Description || ''}
                </td>
            </tr>
            `;
            }).join('');

            const nextChangeNumber = changes.length;
            const nextChangeRow = `
        <tr>
            <td><input type="checkbox" class="row-check table-checkbox-col" /></td>
            <td>${nextChangeNumber}차 변경</td>
            <td class="date-cell" onclick="DateChange(this)"></td>
            <td class="edit_cell" onclick="TextChangeWithCalculation(this, false)"></td>
            <td class="read_only_cell"></td>
            <td class="read_only_cell"></td>
            <td class="read_only_cell"></td>
            <td class="edit_cell" onclick="TextChange(this, true)"></td>
        </tr>
        `;

            tbody.innerHTML = changeRows + nextChangeRow;
        })
        .catch(error => {
            console.error('Error fetching project changes:', error);
            document.getElementById('project_change_tbody').innerHTML = `
        <tr>
            <td>당초</td>
            <td class="date-cell" onclick="DateChange(this)"></td>
            <td class="edit_cell" onclick="TextChangeWithCalculation(this, false)"></td>
            <td class="read_only_cell"></td>
            <td class="read_only_cell"></td>
            <td class="read_only_cell"></td>
            <td class="edit_cell" onclick="TextChange(this, true)"></td>
        </tr>
        `;
        });


    // 2. 성과심사
    fetch(`/api/get_design_reviews/${contractCode}`)
        .then(checkResponse)
        .then(reviews => {
            const reviewTbody = document.querySelector('#design_review_table tbody');
            const divisionSelect = (val) => `
                <select class="division-select">
                    <option value="" ${val === '' ? 'selected' : ''}>선택</option>
                    <option value="당초 내역서" ${val === '당초 내역서' ? 'selected' : ''}>당초 내역서</option>
                    <option value="변경 내역서" ${val === '변경 내역서' ? 'selected' : ''}>변경 내역서</option>
                    <option value="실납부액" ${val === '실납부액' ? 'selected' : ''}>실납부액</option>
                    <option value="발주처 납부" ${val === '발주처 납부' ? 'selected' : ''}>발주처 납부</option>
                    <option value="성과심사 없음" ${val === '성과심사 없음' ? 'selected' : ''}>성과심사 없음</option>
                </select>`;
            const statusSelect = (val) => `
                <select class="status-select">
                    <option value="-" ${val === '-' ? 'selected' : ''}>-</option>
                    <option value="없음" ${val === '없음' ? 'selected' : ''} ${val === '없음' ? '' : 'hidden'}>없음</option>
                    <option value="접수" ${val === '접수' ? 'selected' : ''}>접수</option>
                    <option value="완료" ${val === '완료' ? 'selected' : ''}>완료</option>
                </select>`;
            const statusSelectBlank = (val) => {
                const v = (val === '접수' || val === '완료' || val === '-') ? val : '-';
                return `
                <select class="status-select">
                    <option value="-" ${v === '-' ? 'selected' : ''}>-</option>
                    <option value="접수" ${v === '접수' ? 'selected' : ''}>접수</option>
                    <option value="완료" ${v === '완료' ? 'selected' : ''}>완료</option>
                </select>`;
            };
            const reviewRows = reviews.map(r => {
                const amountVal = parseInt(r.amount || 0);
                const dateText = r.review_date ? new Date(r.review_date).toLocaleDateString() : '';
                const statusVal = r.performance_review || '-';
                const remarkVal = r.remark || '';
                return `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
                    <td>${divisionSelect(r.description || '')}</td>
                    <td class="edit_cell" onclick="TextChange(this, false)">${isNaN(amountVal) ? '' : amountVal.toLocaleString()}</td>
                    <td class="date-cell" onclick="DateChange(this)">${dateText}</td>
                    <td>${statusSelect(statusVal)}</td>
                    <td class="edit_cell" onclick="TextChange(this, true)">${remarkVal}</td>
                </tr>`;
            }).join('');

            const nextRow = `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
                    <td>${divisionSelect('')}</td>
                    <td class="edit_cell" onclick="TextChange(this, false)"></td>
                    <td class="date-cell" onclick="DateChange(this)"></td>
                    <td>${statusSelectBlank('-')}</td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                </tr>`;
            reviewTbody.innerHTML = reviewRows + nextRow;

            // '성과심사 없음' 선택 시 현황 강제/비활성화 적용
            bindDesignReviewTableBehavior(reviewTbody);
        })
        .catch(err => {
            console.error('Error fetching design reviews:', err);
            document.querySelector('#design_review_table tbody').innerHTML = `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
                    <td><select class="division-select"><option value="" selected>선택</option><option value="당초 내역서">당초 내역서</option><option value="변경 내역서">변경 내역서</option><option value="실납부액">실납부액</option><option value="발주처 납부">발주처 납부</option><option value="성과심사 없음">성과심사 없음</option></select></td>
                    <td class="edit_cell" onclick="TextChange(this, false)"></td>
                    <td class="date-cell" onclick="DateChange(this)"></td>
                    <td><select class="status-select"><option value="-" selected>-</option><option value="접수">접수</option><option value="완료">완료</option></select></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                </tr>`;

            const reviewTbody = document.querySelector('#design_review_table tbody');
            bindDesignReviewTableBehavior(reviewTbody);
        });

    // 3. 사업비 수령내역
    fetch(`/api/get_project_receipts/${contractCode}`)
        .then(checkResponse)
        .then(receipts => {
            const receiptTbody = document.querySelector('#project_receipt_table tbody');

            if (!receipts || receipts.length === 0) {  //데이터가 없는 경우 직접 처리
                receiptTbody.innerHTML = `
            <tr>
                <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
                <td onclick="TextChange(this, true)"></td>
                <td class="edit_cell" onclick="TextChangeWithreceipts(this, false)"></td>
                <td id="receipts_NoVAT"></td>
                <td id="receipts_balance"></td>
                <td class="date-cell" onclick="DateChange(this)"></td>
                <td class="edit_cell" onclick="TextChange(this, true)"></td>
            </tr>`;
                return;
            }

            //  정상 데이터가 있는 경우 테이블 구성
            const receiptRows = receipts.map(receipt => {
                let balance = parseInt(receipt.balance || 0);
                if (balance === 1) balance = 0; // 잔액이 1원이면 0으로 변경

                return `
        <tr class="receipt-row">
            <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
            <td onclick="TextChange(this, true)">${receipt.division || ''}</td>
            <td class="edit_cell" onclick="TextChangeWithreceipts(this, false)">${parseInt(receipt.amount || 0).toLocaleString()}</td>
            <td id="receipts_NoVAT">${parseInt(receipt.Amount_NoVAT || 0).toLocaleString()}</td>
            <td id="receipts_balance">${balance.toLocaleString()}</td>
            <td class="date-cell" onclick="DateChange(this)">${receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString() : ''}</td>
            <td class="edit_cell" onclick="TextChange(this, true)">${receipt.description || ''}</td>
        </tr>
        `;
            }).join('');

            receiptTbody.innerHTML = receiptRows;
            recalculateReceiptBalances();
        })
        .catch(error => {
            console.error('Error fetching project receipts:', error);

            const receiptTbody = document.querySelector('#project_receipt_table tbody');
            receiptTbody.innerHTML = `
    <tr>
        <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
        <td onclick="TextChange(this, true)"></td>
        <td class="edit_cell" onclick="TextChangeWithreceipts(this, false)"></td>
        <td id="receipts_NoVAT"></td>
        <td id="receipts_balance"></td>
        <td class="date-cell" onclick="DateChange(this)"></td>
        <td class="edit_cell" onclick="TextChange(this, true)"></td>
    </tr>`;
        });

    // 4. 참여 기술자 명단: 기존 저장 데이터가 없으면 기본 1행 생성 (새 양식: 체크박스 + 분야 + 담당업무 select 등)
    try {
        const pTbody = document.querySelector('#participant_engineers_table tbody');
        if (pTbody && pTbody.rows.length === 0) {
            const makeSelect = (opts) => '<select>' + ['선택하세요.', ...opts].map(v => `<option value="${v}">${v}</option>`).join('') + '</select>';
            const workSelect = () => makeSelect(['사책', '분책', '분참']);
            pTbody.innerHTML = `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
                    <td>${workSelect()}</td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                </tr>`;
        }
    } catch (e) {
        console.warn('participants table init skipped:', e);
    }

    // 5. 문제예상(project_risks) 데이터 로딩
    fetch(`/api/get_project_risks/${contractCode}`)
        .then(checkResponse)
        .then(result => {
            const risks = result.risks || [];
            const iTbody = document.querySelector('#issue_prediction_table tbody');
            if (!iTbody) return;
            if (risks.length === 0) {
                iTbody.innerHTML = `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check " /></td>
                    <td>
                        <select>
                            <option value="선택" selected>선택하세요</option>
                            <option value="진행중">진행중</option>
                            <option value="완료">완료</option>
                        </select>
                    </td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                    <td class="date-cell" onclick="DateChange(this)"></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                </tr>`;
                return;
            }
            const rowsHtml = risks.map(r => {
                const dateText = r.write_date ? new Date(r.write_date).toLocaleDateString() : '';
                const division = r.division || '';
                const selectedDivision = (division === '진행중' || division === '완료') ? division : '선택';
                return `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
                    <td>
                        <select>
                            <option value="선택" ${selectedDivision === '선택' ? 'selected' : ''}>선택하세요</option>
                            <option value="진행중" ${selectedDivision === '진행중' ? 'selected' : ''}>진행중</option>
                            <option value="완료" ${selectedDivision === '완료' ? 'selected' : ''}>완료</option>
                        </select>
                    </td>
                    <td class="edit_cell" onclick="TextChange(this, true)">${r.department || ''}</td>
                    <td class="edit_cell" onclick="TextChange(this, true)">${r.writer || ''}</td>
                    <td class="date-cell" onclick="DateChange(this)">${dateText}</td>
                    <td class="edit_cell" onclick="TextChange(this, true)">${r.content || ''}</td>
                </tr>`;
            }).join('');
            const emptyRow = `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check" /></td>
                    <td>
                        <select>
                            <option value="선택" selected>선택하세요</option>
                            <option value="진행중">진행중</option>
                            <option value="완료">완료</option>
                        </select>
                    </td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                    <td class="date-cell" onclick="DateChange(this)"></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                </tr>`;
            iTbody.innerHTML = rowsHtml + emptyRow;
        })
        .catch(err => {
            console.warn('issue prediction fetch failed:', err);
            const iTbody = document.querySelector('#issue_prediction_table tbody');
            if (iTbody) {
                iTbody.innerHTML = `
                <tr>
                    <td class="table-checkbox-col" style="text-align:center;"><input type="checkbox" class="row-check " /></td>
                    <td>
                        <select>
                            <option value="선택" selected>선택하세요</option>
                            <option value="진행중">진행중</option>
                            <option value="완료">완료</option>
                        </select>
                    </td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                    <td class="date-cell" onclick="DateChange(this)"></td>
                    <td class="edit_cell" onclick="TextChange(this, true)"></td>
                </tr>`;
            }
        });
}



// 잔액 자동 계산 함수 (모든 행을 순차적으로 업데이트)
function updateReceiptBalances(targetRow) {
    const projectCostElement = document.getElementById('ContributionCost');
    // 사업비 가져오기
    if (!projectCostElement) {
        console.error('❌ Project cost element not found!');
        return;
    }

    const projectCost = parseInt(projectCostElement.textContent.replace(/,/g, '').trim(), 10);

    if (isNaN(projectCost)) {
        console.error('❌ 유효하지 않은 사업비입니다.');
        return;
    }

    if (!targetRow) {
        console.error('❌ targetRow is missing!');
        return;
    }

    // 현재 행의 인덱스 가져오기
    const table = targetRow.closest('table'); // 해당 행이 속한 테이블 찾기
    const rows = Array.from(table.querySelectorAll('tbody tr')); // 모든 행 가져오기
    const rowIndex = rows.indexOf(targetRow); // 현재 행의 인덱스

    //특정 행의 셀만 가져와서 업데이트
    const divisionCell = targetRow.querySelector('td:nth-child(2)'); // 체크박스 추가로 +1
    const amountCell = targetRow.querySelector('td:nth-child(3)'); // 금액 셀
    const NoVATamountCell = targetRow.querySelector('td:nth-child(4)'); // 금액(VAT 제외) 셀
    const balanceCell = targetRow.querySelector('td:nth-child(5)'); // 잔액 셀

    if (!divisionCell || !amountCell || !NoVATamountCell || !balanceCell) {
        console.error(`❌ Missing cells in row:`, targetRow);
        return;
    }

    // 금액 값 가져오기
    let amount = parseFloat(amountCell.textContent.replace(/,/g, '').trim());
    if (isNaN(amount)) {
        amount = 0; // 숫자가 아니면 0으로 처리
    }

    // VAT 제외 계산
    const amountNoVAT = Math.round(amount / 1.1);

    //첫 번째 행이면 사업비(A)에서 잔액 계산
    let previousBalance = projectCost;
    if (rowIndex > 0) {
        // 이전 행에서 잔액 값 가져오기
        const previousRow = rows[rowIndex - 1];
        const prevBalanceCell = previousRow.querySelector('td:nth-child(4)');

        if (prevBalanceCell) {
            previousBalance = parseInt(prevBalanceCell.textContent.replace(/,/g, '').trim(), 10) || projectCost;
        }
    }

    //모든 비용을 잔액에서 차감
    let remainingBalance = previousBalance - amountNoVAT;
    // 🔹 잔액이 1원이면 0원으로 설정
    if (remainingBalance === 1) {
        remainingBalance = 0;
    }

    // 🔹 잔액이 음수가 되지 않도록 방지
    remainingBalance = Math.max(remainingBalance, 0);

    // 셀 업데이트
    NoVATamountCell.textContent = amountNoVAT.toLocaleString();
    balanceCell.textContent = remainingBalance.toLocaleString();
}



//사업비 변경에 맞춰 잔액을 재계산하는 함수
function recalculateReceiptBalances() {
    // 🔹 프로젝트 사업비 및 지분율 가져오기
    const ProjectCost_NoVAT = parseFloat(
        document.getElementById('ProjectCost_NoVAT')?.textContent.replace(/[^0-9.-]/g, '') || 0
    );
    const ContributionRate = parseFloat(
        document.getElementById('ContributionRate')?.textContent.replace(/[^0-9.-]/g, '') || 0
    ) / 100;

    // 🔹 변경된 사업비 계산
    let updatedProjectCost = Math.round(ProjectCost_NoVAT * ContributionRate);
    if (updatedProjectCost === 1) updatedProjectCost = 0; // 잔액이 1원이면 0으로 변경

    if (isNaN(updatedProjectCost) || updatedProjectCost <= 0) {
        console.error('❌ 유효하지 않은 사업비입니다.');
        return;
    }

    //테이블의 모든 행 가져오기
    const rows = document.querySelectorAll('#project_receipt_table tbody tr');
    if (rows.length === 0) {
        console.warn('⚠️ 수령 내역 테이블이 비어 있습니다.');
        return;
    }

    let remainingBalance = updatedProjectCost; // 초기 잔액 = 변경된 사업비

    //모든 행을 순회하며 잔액 계산
    rows.forEach((row, index) => {
        const amountCell = row.querySelector('td:nth-child(3)'); // 체크박스 추가로 +1
        const NoVATamountCell = row.querySelector('td:nth-child(4)');
        const balanceCell = row.querySelector('td:nth-child(5)');

        if (!amountCell || !NoVATamountCell || !balanceCell) {
            console.error(`❌ Row ${index + 1}: 셀을 찾을 수 없습니다.`);
            return;
        }

        // 🔹 금액 가져오기 (숫자로 변환)
        let amount = parseFloat(amountCell.textContent.replace(/,/g, '').trim()) || 0;

        // 🔹 VAT 제외 금액 계산
        let amountNoVAT = Math.round(amount / 1.1);
        if (amountNoVAT === 1) amountNoVAT = 0; // 잔액이 1원이면 0으로 변경

        //모든 비용이 잔액에서 차감
        remainingBalance -= amountNoVAT;
        if (remainingBalance === 1) remainingBalance = 0; // 잔액이 1원이면 0으로 변경

        // 🔹 계산된 값을 테이블에 반영
        NoVATamountCell.textContent = amountNoVAT.toLocaleString();
        balanceCell.textContent = Math.max(remainingBalance, 0).toLocaleString(); // 음수 방지
    });

}

// 텍스트박스로 전환 시 금액 처리 포함
function TextChangeWithreceipts(td) {
    // 이미 input이 있는 경우 return
    if (td.querySelector('input')) return;
    // input 생성 및 설정
    const input = document.createElement('input');
    const currentValue = td.textContent.replace(/[^\d]/g, '').trim(); // 금액만 추출
    input.value = currentValue; // 현재 값을 input의 초기값으로 설정
    input.classList.add('editable-input');

    // td 크기와 동일하게 input 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    td.innerHTML = ''; // td 내용을 비우고
    td.appendChild(input); // input 추가

    // 스타일 설정
    input.style.width = (tdWidth - 2) + 'px'; // 테두리 고려하여 2px 감소
    input.style.height = (tdHeight - 2) + 'px'; // 테두리 고려하여 2px 감소
    input.style.border = '1px solid #cbd5e0';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px'; // 좌우 패딩 추가
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.style.fontSize = '14px';
    input.style.backgroundColor = '#ffffff';
    input.focus();

    // blur 이벤트 발생 시 처리
    input.addEventListener('blur', () => {
        let value = input.value.replace(/[^\d]/g, '').trim(); // 숫자만 유지
        value = value ? Math.round(value) : 0; // 정수 변환
        td.textContent = value.toLocaleString(); // 포맷팅 후 표시

        // 현재 행만 업데이트
        const row = td.closest('tr');
        updateReceiptBalances(row);
    });

    // input 이벤트 발생 시 실시간 자릿수 표시
    input.addEventListener('input', () => {
        let value = input.value.replace(/[^\d]/g, '').trim(); // 숫자만 유지
        input.value = value ? parseInt(value, 10).toLocaleString() : ''; // 자릿수 추가
    });

    // Enter 키를 눌렀을 때 blur 발생
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
        }
    });
}

// 날짜 선택을 위한 함수
function DateChange(td) {
    if (td.querySelector('input')) return;

    const input = document.createElement('input');
    input.type = 'date';

    // 최소, 최대 날짜 설정
    input.min = '1900-01-01'; // 최소값
    input.max = '2100-12-31'; // 최대값

    // 기존 값 가져오기 (YYYY. MM. DD. → YYYY-MM-DD 변환)
    const currentValue = td.textContent.trim().replace(/\./g, '-').replace(/\s/g, '');
    input.value = /^\d{4}-\d{2}-\d{2}$/.test(currentValue) ? currentValue : '';

    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const originalValue = td.textContent.trim(); // 기존 값 저장
    td.innerHTML = ''; // td 초기화
    td.appendChild(input);

    // 스타일 설정
    input.style.width = tdWidth + 'px';
    input.style.height = tdHeight + 'px';
    input.style.border = 'none';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.focus();

    // 입력 시 연도 4글자로 제한
    input.addEventListener('input', () => {
        const value = input.value;
        const parts = value.split('-'); // YYYY-MM-DD로 분리
        if (parts[0] && parts[0].length > 4) {
            parts[0] = parts[0].slice(0, 4); // 연도 부분을 4글자로 제한
            input.value = parts.join('-'); // 수정된 값 다시 설정
        }
    });

    // Blur 이벤트 발생 시 처리
    input.addEventListener('blur', () => {
        if (input.value) {
            const dateParts = input.value.split('-'); // YYYY-MM-DD 형식 분리
            const formattedDate = `${dateParts[0]}. ${String(dateParts[1]).padStart(2, '0')}. ${String(dateParts[2]).padStart(2, '0')}.`;
            td.textContent = formattedDate; // YYYY. MM. DD. 형식으로 표시
        } else {
            td.textContent = originalValue; // 유효하지 않으면 원래 값 복원
        }
    });

    // Enter 키로 입력 완료 처리
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            input.blur();
        }
    });
}

function TextChangeWithCalculation(td, isText = false) {
    if (td.querySelector('input')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = td.textContent.replace(/,/g, '');
    input.classList.add('editable-input');

    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const savetd = td.textContent;
    td.innerHTML = '';
    td.appendChild(input);
    input.style.width = tdWidth + 'px';
    input.style.height = tdHeight + 'px';
    input.style.border = 'none';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.focus();

    input.addEventListener('input', () => {
        let value = input.value.replace(/,/g, '');
        if (!isText && value && isNumeric(value)) {
            input.value = formatWithCommas(value);
        }
    });

    input.addEventListener('blur', () => {
        const value = input.value.replace(/,/g, '').trim();

        if (!isText && (!isNumeric(value) && value.trim() !== "")) {
            alert('숫자만 입력할 수 있습니다.');
            td.textContent = savetd;
            return false;
        }

        if (value.trim() === "") {
            td.textContent = savetd;
        } else {
            td.textContent = !isText && value ? formatWithCommas(value) : value;

            // VAT 포함 금액이 입력되었을 때 다른 셀들 업데이트
            // 체크박스 열 유무에 따른 오프셋 계산
            const hasCheckbox = td.parentElement?.cells?.[0]?.querySelector && td.parentElement.cells[0].querySelector('input.row-check');
            const offset = hasCheckbox ? 1 : 0;
            if (td.cellIndex === 2 + offset) { // VAT 포함 금액 열
                const row = td.parentElement;
                const vatExcludedAmount = Math.round(parseFloat(value) / 1.1);
                const contributionRateElem = document.getElementById('project-contributionRate') || document.getElementById('ContributionRate');
                const contributionRate = contributionRateElem ? (parseFloat((contributionRateElem.value || contributionRateElem.textContent).replace('%', '')) / 100) : 0;
                const companyAmount = Math.round(vatExcludedAmount * contributionRate);
                // VAT 제외 금액 업데이트
                row.cells[3 + offset].textContent = formatWithCommas(parseInt(vatExcludedAmount));
                // 당사(지분율) 금액 업데이트
                row.cells[4 + offset].textContent = formatWithCommas(parseInt(companyAmount));
                // 증감 계산 및 업데이트
                calculateProjectIncrease(row);
            }
        }

        return true;
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            input.blur();
        }
    });
}

function getPreviousTr(row) {
    const rows = Array.from(row.parentElement.querySelectorAll('tr')); // 모든 <tr> 가져오기
    const index = rows.indexOf(row); // 현재 <tr>의 인덱스 찾기

    if (index > 0) {
        return rows[index - 1]; // 바로 직전 <tr> 반환
    }
    return null; // 첫 번째 행인 경우
}

function calculateProjectIncrease(row) {
    // 체크박스 열 유무에 따른 오프셋
    const hasCheckbox = row?.cells?.[0]?.querySelector && row.cells[0].querySelector('input.row-check');
    const offset = hasCheckbox ? 1 : 0;
    const increaseCell = row.cells[5 + offset]; // 증감 열 인덱스
    const prevRow = getPreviousTr(row); // 바로 직전 <tr> 가져오기
    if (!prevRow) {
        console.warn('유효한 이전 행이 없습니다:', row);
        increaseCell.textContent = '';
        return;
    }

    // 현재 행과 직전 행의 값 가져오기
    const currentAmount = parseFloat(row.cells[4 + offset]?.textContent.replace(/,/g, '')) || 0;
    const prevAmount = parseFloat(prevRow.cells[4 + offset]?.textContent.replace(/,/g, '')) || 0;
    // 차액 계산
    if (currentAmount != 0) {
        const difference = currentAmount - prevAmount;
        increaseCell.textContent = difference !== 0 ? formatWithCommas(Math.round(difference)) : '';
    }

}

// 사업 변경내역 계산을 위한 별도 함수
function calculateProjectChange(row, cellIndex, newValue) {
    // 지분율 가져오기
    const contributionRateElement = document.getElementById('ContributionRate');
    const contributionRate = parseFloat(contributionRateElement.textContent.replace('%', '')) || 0;
    // VAT제외(전체) 금액이 수정된 경우 (3번째 열)
    if (cellIndex === 2) {
        const totalAmount = parseFloat(newValue) || 0;
        const companyAmount = Math.round(totalAmount * (contributionRate / 100));

        // 당사(지분율) 셀 업데이트
        const shareRateCell = row.cells[3];
        shareRateCell.textContent = formatWithCommas(parseInt(companyAmount));

        // 증감 계산 및 업데이트
        updateProjectIncrease(row);
    }

    // 당사(지분율) 금액이 수정된 경우 (4번째 열)
    if (cellIndex === 3) {
        // 증감 계산 및 업데이트
        updateProjectIncrease(row);
    }
}

// 변경내역 저장
function saveProjectChange() {
    const contractCode = document.getElementById('project-contractCode').value;

    // setTimeout으로 DOM 업데이트 대기
    setTimeout(() => {
        // 1. 사업비 변경내역 데이터 수집
        const changeTable = document.getElementById('project_change_table');
        const changeRows = [];

        if (changeTable) {
            const tbody = document.getElementById('project_change_tbody');
            const rows = tbody.getElementsByTagName('tr');

            Array.from(rows).forEach((row, index) => {
                const cells = row.cells;

                if (!cells || cells.length < 7) {
                    console.warn(`Row ${index + 1} has insufficient cells.`);
                    return;
                }

                const rowData = {
                    division: cells[1]?.textContent.trim() || '',
                    contract_date: cells[2]?.textContent.trim() || '',
                    cost_vat: isNaN(parseFloat(cells[3]?.textContent.replace(/,/g, '').trim()))
                        ? -1
                        : parseFloat(cells[3]?.textContent.replace(/,/g, '').trim()),
                    cost_novat: isNaN(parseFloat(cells[4]?.textContent.replace(/,/g, '').trim()))
                        ? -1
                        : parseFloat(cells[4]?.textContent.replace(/,/g, '').trim()),
                    cost_sharerate: isNaN(parseFloat(cells[5]?.textContent.replace(/,/g, '').trim()))
                        ? -1
                        : parseFloat(cells[5]?.textContent.replace(/,/g, '').trim()),
                    description: cells[7]?.textContent.trim() || '',
                    contract_code: contractCode
                };

                if (
                    rowData.cost_vat !== -1 &&
                    rowData.cost_novat !== -1 &&
                    rowData.cost_sharerate !== -1
                ) {
                    changeRows.push(rowData);
                } else {
                    console.warn(`Row skipped: Invalid financial fields (cost_vat: ${rowData.cost_vat}, cost_novat: ${rowData.cost_novat}, cost_sharerate: ${rowData.cost_sharerate}).`);
                }
            });
        } else {
            console.error("Project Change Table not found.");
        }

        // 2. 성과심사 데이터 수집
        const reviewTable = document.getElementById('design_review_table');
        const reviewRows = [];

        if (reviewTable) {
            const rows = reviewTable.querySelectorAll('tbody tr');
            rows.forEach((row, idx) => {
                const cells = row.cells;
                // 체크박스 열 추가로 구분 select 인덱스 이동
                const divSelect = cells[1]?.querySelector('select');
                const description = divSelect ? divSelect.value : '';
                if (!description || description === '선택' || description === '삭제') {
                    return; // 저장 제외
                }
                // 금액 (인덱스 +1 이동)
                let amountText = cells[2]?.textContent.replace(/,/g, '').trim();
                let amount = parseFloat(amountText);
                if (amountText === '') amount = 0;
                if (isNaN(amount)) {
                    alert('⚠️ 성과심사 항목에 잘못된 금액이 있습니다.');
                    return;
                }

                // 날짜/현황/비고 (인덱스 +1 이동)
                const review_date = (cells[3]?.textContent || '').trim();
                const statusSelectEl = cells[4]?.querySelector('select');
                let performance_review = statusSelectEl ? statusSelectEl.value : '';
                // 저장 시에만 현황값 정규화: '-' / 공란 / (과거값) '성과심사 없음' -> '없음'
                const pr = (performance_review || '').trim();
                if (pr === '' || pr === '-' || pr.toLowerCase?.() === 'none' || pr === '성과심사 없음') {
                    performance_review = '없음';
                }
                const remark = (cells[5]?.textContent || '').trim();

                reviewRows.push({
                    amount,
                    description,
                    review_date,
                    performance_review,
                    remark,
                    contract_code: contractCode
                });
            });
        }

        // 3. 사업비 수령내역 데이터 수집
        const receiptTable = document.getElementById('project_receipt_table');
        const receiptRows = [];
        if (receiptTable) {
            const rows = receiptTable.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.cells;
                const rowData = {
                    division: cells[1]?.textContent || '',
                    amount: parseFloat(cells[2]?.textContent.replace(/,/g, '')) || 0,
                    Amount_NoVAT: parseFloat(cells[3]?.textContent.replace(/,/g, '')) || 0,
                    balance: parseFloat(cells[4]?.textContent.replace(/,/g, '')) || 0,
                    receipt_date: cells[5]?.textContent || '',
                    description: cells[6]?.textContent || '',
                    contract_code: contractCode
                };
                if (![0, '0', ' '].includes(rowData.amount)) {
                    receiptRows.push(rowData);
                }
            });
        }

        // 최종 데이터 확인 및 전송
        const saveData = {
            contract_code: contractCode,
            changes: changeRows,
            reviews: reviewRows,
            receipts: receiptRows,
            engineers: (() => {
                const list = [];
                const tbody = document.getElementById('participant_engineers_tbody');
                if (!tbody) return list;
                const rows = tbody.querySelectorAll('tr');
                rows.forEach(r => {
                    const cells = r.cells;
                    if (!cells || cells.length < 4) return;
                    const rawWorkPosition = cells[1]?.querySelector('select')?.value?.trim() || '';
                    const work_position = rawWorkPosition === '선택하세요.' ? '' : rawWorkPosition;
                    const nameCell = cells[2];
                    const remarkCell = cells[3];
                    const nameInput = nameCell ? nameCell.querySelector('input') : null;
                    const remarkInput = remarkCell ? remarkCell.querySelector('input') : null;
                    const name = (nameInput ? nameInput.value : nameCell?.textContent || '').trim();
                    const remark = (remarkInput ? remarkInput.value : remarkCell?.textContent || '').trim();
                    if ([work_position, name, remark].every(v => v === '')) return;
                    list.push({ WorkField: '', work_position, department: '', position: '', name, remark });
                });
                console.log('Engineer List:', list);
                return list;
            })(),
            risks: (() => {
                const list = [];
                const tbody = document.getElementById('issue_prediction_tbody');
                if (!tbody) return list;
                const rows = tbody.querySelectorAll('tr');
                const getCellValue = (cell) => {
                    if (!cell) return '';
                    const input = cell.querySelector('input, textarea');
                    return (input ? input.value : cell.textContent || '').trim();
                };
                rows.forEach(r => {
                    const cells = r.cells;
                    if (!cells || cells.length < 5) return;
                    const divisionSelect = cells[1]?.querySelector('select');
                    const division = (divisionSelect ? divisionSelect.value : '').trim();
                    if (division === '선택' || division === '선택하세요' || division === '선택하세요.') return;
                    const department = getCellValue(cells[2]);
                    const writer = getCellValue(cells[3]);
                    const write_date = getCellValue(cells[4]);
                    const content = getCellValue(cells[5]);
                    if ([department, writer, write_date, content].every(v => v === '')) return;
                    list.push({ division, department, writer, write_date, content });
                });
                return list;
            })()
        };


        // 데이터 전송
        fetch('/api/save_project_changes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(saveData)
        })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    alert('저장되었습니다.');
                    reloadWithCurrentState();
                } else {
                    alert('저장 중 오류가 발생했습니다: ' + result.message);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('저장 중 오류가 발생했습니다.');
            });
    }, 100); // 100ms 대기
}

async function loadParticipantEngineers() {
    const contractCode = document.getElementById('project-contractCode')?.value;
    if (!contractCode) return;
    try {
        const res = await fetch(`/api/get_project_engineers?contract_code=${encodeURIComponent(contractCode)}`);
        const data = await res.json();
        if (!data.success) return;
        const tbody = document.getElementById('participant_engineers_tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const engineers = data.engineers || [];
        updateParticipantEngineersHeader(engineers);
        const workOrder = { '사책': 1, '분책': 2, '분참': 3 };
        engineers.sort((a, b) => {
            const aKey = workOrder[a.work_position] || 99;
            const bKey = workOrder[b.work_position] || 99;
            if (aKey !== bKey) return aKey - bKey;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
        });
        if (engineers.length === 0) {
            addRows('participant_engineers_tbody', 1, true);
            return;
        }
        engineers.forEach(eng => {
            const tr = document.createElement('tr');
            // 0 체크박스
            const tdCb = document.createElement('td');
            tdCb.style.textAlign = 'center';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'row-check';
            tdCb.appendChild(cb);
            tr.appendChild(tdCb);
            // 1 담당업무 select
            const tdWork = document.createElement('td');
            const sel = document.createElement('select');
            ['선택하세요.', '사책', '분책', '분참'].forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v;
                if (v === (eng.work_position || '')) opt.selected = true;
                sel.appendChild(opt);
            });
            tdWork.appendChild(sel);
            tr.appendChild(tdWork);
            // 2 성명
            const tdName = document.createElement('td');
            tdName.className = 'edit_cell';
            tdName.textContent = eng.name || '';
            tdName.onclick = function () { TextChange(this, true); };
            tr.appendChild(tdName);
            // 3 비고
            const tdRemark = document.createElement('td');
            tdRemark.className = 'edit_cell';
            tdRemark.textContent = eng.remark || '';
            tdRemark.onclick = function () { TextChange(this, true); };
            tr.appendChild(tdRemark);
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn('[WARN] 참여 기술자 로드 실패:', e);
    }
}

// 분야 동일 항목 rowspan 적용 (분야 셀 인덱스 1 사용)
function applyWorkFieldRowspan() {
    const tbody = document.getElementById('participant_engineers_tbody');
    if (!tbody) return;
    const firstRow = tbody.querySelector('tr');
    if (firstRow && firstRow.cells[1] && firstRow.cells[1].querySelector('select')) return;
    // 편집 모드(수정 중)에서는 병합하지 않음
    const editToggle = document.getElementById('class_edit');
    if (editToggle && editToggle.dataset.mode === 'editing') return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach(r => {
        const c = r.cells[1];
        if (c) { c.style.display = ''; c.rowSpan = 1; }
    });
    let i = 0;
    while (i < rows.length) {
        const baseCell = rows[i].cells[1];
        if (!baseCell) { i++; continue; }
        const text = (baseCell.textContent || '').trim();
        if (text === '') { i++; continue; }
        let spanCount = 1;
        for (let j = i + 1; j < rows.length; j++) {
            const nextCell = rows[j].cells[1];
            if (!nextCell) break;
            const nextText = (nextCell.textContent || '').trim();
            if (nextText === text) {
                spanCount++;
            } else {
                break;
            }
        }
        if (spanCount > 1) {
            baseCell.rowSpan = spanCount;
            for (let k = i + 1; k < i + spanCount; k++) {
                const hideCell = rows[k].cells[1];
                if (hideCell) hideCell.style.display = 'none';
            }
        }
        i += spanCount;
    }
}

// 성과심사 최신 내역 로드 (재작성: 기존 코드 손상 복구)
// 사업 변경내역 최신 1개 요약 로드 (누락 복구)
async function loadLatestChange() {
    const contractCode = document.getElementById('project-contractCode')?.value;
    if (!contractCode) return;
    try {
        // latest 파라미터가 없다면 전체를 받아 마지막 요소 사용
        const res = await fetch(`/api/get_project_changes/${encodeURIComponent(contractCode)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return;
        const latest = data[data.length - 1];
        const tbody = document.getElementById('chage_result_tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const tr = document.createElement('tr');
        const division = latest.division || latest.Division || '';
        const contractDate = latest.contract_date || latest.ContractDate || '';
        const vatAmt = latest.cost_vat || latest.Cost_VAT || 0;
        const noVatAmt = latest.cost_novat || latest.Cost_NoVAT || 0;
        const shareAmt = latest.cost_sharerate || latest.Cost_ShareRate || 0;
        const desc = latest.description || latest.Description || '';
        tr.innerHTML = `
            <td>${division}</td>
            <td>${contractDate ? new Date(contractDate).toLocaleDateString() : ''}</td>
            <td>${typeof vatAmt === 'number' ? vatAmt.toLocaleString() : vatAmt}</td>
            <td>${typeof noVatAmt === 'number' ? noVatAmt.toLocaleString() : noVatAmt}</td>
            <td>${typeof shareAmt === 'number' ? shareAmt.toLocaleString() : shareAmt}</td>
            <td>${desc}</td>
        `;
        tbody.appendChild(tr);
    } catch (e) {
        console.warn('loadLatestChange error', e);
    }
}

function loadLatestReview() {
    const contractCode = document.getElementById('project-contractCode')?.value;
    if (!contractCode) return;
    fetch(`/api/get_design_reviews/${contractCode}`)
        .then(r => r.json())
        .then(data => {
            const tbody = document.getElementById('performance_result_tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            if (Array.isArray(data) && data.length > 0) {
                data.forEach(review => {
                    const tr = document.createElement('tr');
                    // API 필드: description(구분), remark(비고)
                    const division = review.description || review.Description || review.division || review.Division || '';
                    const amount = review.amount || review.Amount || 0;
                    const dateVal = review.review_date || review.date || '';
                    const status = review.performance_review || review.status || '';
                    const remarkText = review.remark || review.Remark || '';
                    tr.innerHTML = `
                        <td>${division}</td>
                        <td>${amount ? Number(amount).toLocaleString() : ''}</td>
                        <td>${dateVal ? new Date(dateVal).toLocaleDateString() : ''}</td>
                        <td>${status}</td>
                        <td>${remarkText}</td>`;
                    tbody.appendChild(tr);
                });
            } else {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="5" style="text-align:center;">-</td>';
                tbody.appendChild(tr);
            }
        })
        .catch(err => {
            console.error('loadLatestReview error', err);
            const tbody = document.getElementById('performance_result_tbody');
            if (!tbody) return;
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="5" style="text-align:center;">로드 오류</td>';
            tbody.appendChild(tr);
        });
}

// 사업비 수령내역 최신 내역 로드
function loadLatestReceipt() {
    const contractCode = document.getElementById('project-contractCode').value;

    fetch(`/api/get_project_receipts/${contractCode}`)
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('projectCost_result_tbody');
            tbody.innerHTML = ''; // 기존 내용 삭제

            // 데이터가 있는 경우 출력
            if (data && Array.isArray(data) && data.length > 0) {
                data.forEach(receipt => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${receipt.division || ''}</td>
                        <td>${receipt.amount ? parseFloat(receipt.amount).toLocaleString() : ''}</td>
                        <td>${receipt.Amount_NoVAT ? receipt.Amount_NoVAT.toLocaleString() : ''}</td>
                        <td>${receipt.balance !== undefined && receipt.balance !== null ? parseFloat(receipt.balance) === 0 ? '0' : parseFloat(receipt.balance).toLocaleString() : ''}</td>
                        <td>${receipt.receipt_date ? new Date(receipt.receipt_date).toLocaleDateString() : ''}</td>
                        <td>${receipt.description || ''}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                // 데이터가 없는 경우 선금만 표시
                const row = document.createElement('tr');
                row.innerHTML = `
                   <td colspan = "6"> - </td>
                `;
                tbody.appendChild(row);
            }
        })
        .catch(error => {
            console.error('Error fetching receipts:', error);

            // 에러 발생 시 선금만 표시
            const tbody = document.getElementById('projectCost_result_tbody');
            tbody.innerHTML = ''; // 기존 내용 삭제
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>선금</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
            `;
            tbody.appendChild(row);
        });
}

// 경비 테이블용 빈 행 추가 함수
function addEmptyRecordRows(tbody) {
    tbody.innerHTML = `
        <tr>
            <td></td>
            <td>0</td>
        </tr>
        <tr>
            <td style="background-color: #ebf7d3">총계</td>
            <td style="background-color: #ebf7d3">0</td>
        </tr>
    `;
}

// 인건비 테이블용 빈 행 추가 함수
function addEmptyBudgetRows(tbody) {
    tbody.innerHTML = `
        <tr>
            <td></td>
            <td>0</td>
            <td>0</td>
            <td>0</td>
        </tr>
        <tr>
            <td style="background-color: #ebf7d3">총계</td>
            <td style="background-color: #ebf7d3">0</td>
            <td style="background-color: #ebf7d3">0</td>
            <td style="background-color: #ebf7d3">0</td>
        </tr>
    `;
}

//예상 인건비 현황
function updateBudgetResult() {

    // //전량외주시 스킵
    // const outsourceCheck = document.getElementById('outsourceCheck').value;
    // if (outsourceCheck === 'True' || outsourceCheck === '1') {
    //     const budgetResultTbody = document.getElementById('budget_result_tbody');
    //     addEmptyBudgetRows(budgetResultTbody);
    //     return;
    // }

    const budgetResultTbody = document.getElementById('budget_result_tbody');
    const positionTotals = new Map(); // 직급별 합계를 저장할 Map

    // display:block인 부서 div들 찾기
    const visibleDepartments = Array.from(document.querySelectorAll('[id^="Department_"]')).filter(
        dep => window.getComputedStyle(dep).display === 'block'
    );

    // 각 부서별로 순회하며 데이터 수집
    visibleDepartments.forEach(department => {
        const budgetTbody = department.querySelector('[id$="Budget_tbody"]');
        if (!budgetTbody) return;

        // 총계 행을 제외한 모든 행 순회
        const rows = Array.from(budgetTbody.querySelectorAll('tr')).slice(1); // 첫 번째 행(총계) 제외

        rows.forEach(row => {
            const cells = row.cells;
            if (!cells || cells.length < 4) return;

            // 셀 내의 select 요소 찾기
            const selectElement = cells[0].querySelector('select');
            let position = '';
            if (selectElement) {
                position = selectElement.value.trim(); // 선택된 value 값 반환
            } else {
                console.error("Select element not found in the cell.");
                return; // select 요소가 없으면 처리 중단
            }

            // 직급이 '선택하세요' 또는 '총계'인 경우 스킵
            if (position === '선택하세요' || position === '총계' || position === '') return;

            const personnel = parseInt(cells[1].textContent.replace(/,/g, '')) || 0; // 인원
            const md = parseFloat(cells[2].textContent.replace(/,/g, '')) || 0; // MD
            const amount = parseInt(cells[3].textContent.replace(/,/g, '')) || 0; // 금액

            // 유효한 데이터가 있는 경우에만 합산
            if (personnel > 0 || md > 0 || amount > 0) {
                if (positionTotals.has(position)) {
                    const current = positionTotals.get(position);
                    positionTotals.set(position, {
                        personnel: current.personnel + personnel,
                        md: current.md + md,
                        amount: current.amount + amount,
                        inputMan: current.inputMan + (personnel * md)
                    });
                } else {
                    positionTotals.set(position, {
                        personnel,
                        md,
                        amount,
                        inputMan: personnel * md
                    });
                }
            }
        });
    });

    // 결과 테이블에 데이터 출력
    budgetResultTbody.innerHTML = ''; // 기존 내용 삭제

    if (positionTotals.size > 0) {
        // 합계 계산을 위한 변수들
        let totalPersonnel = 0;
        let totalMd = 0;
        let totalAmount = 0;
        let totalday = 0;
        // Map을 배열로 변환하고 직급 순서대로 정렬
        const sortedPositions = Array.from(positionTotals.entries()).sort((a, b) => {
            const positionOrder = {
                '이사': 1,
                '부장': 2,
                '차장': 3,
                '과장': 4,
                '대리': 5,
                '주임': 6,
                '사원': 7,
                '계약직': 8
            };
            // 전역 변수에 예상 인건비 저장
            window.expectedLaborCost = totalAmount;
            updateCostChart();
            return (positionOrder[a[0]] || 9) - (positionOrder[b[0]] || 9);
        });
        // 정렬된 데이터 출력
        sortedPositions.forEach(([position, value]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${position}</td>
                <td>${value.personnel.toLocaleString()}</td>
                <td>${value.md.toLocaleString()}</td>
                <td>${value.inputMan.toLocaleString()}</td>
                <td>${value.amount.toLocaleString()}</td>
            `;
            budgetResultTbody.appendChild(row);

            // 총계 계산
            totalPersonnel += value.personnel;
            totalMd += value.md;
            totalAmount += value.amount;
            totalday += value.inputMan;
        });

        // 전역 변수에 예상 인건비 저장
        window.expectedLaborCost = totalAmount;
        updateCostChart();
        // 총계 행 추가
        const totalRow = document.createElement('tr');
        totalRow.innerHTML = `
            <td style="background-color: #ebf7d3">총계</td>
            <td style="background-color: #ebf7d3">${totalPersonnel.toLocaleString()}</td>
            <td style="background-color: #ebf7d3">${totalMd.toLocaleString()}</td>
            <td style="background-color: #ebf7d3">${totalday.toLocaleString()}</td>
            <td style="background-color: #ebf7d3">${totalAmount.toLocaleString()}</td>
        `;
        budgetResultTbody.appendChild(totalRow);


    } else {
        // 데이터가 없는 경우 빈 행 추가
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td>-</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;
        budgetResultTbody.appendChild(emptyRow);

        // 데이터가 없어도 총계 행 추가
        const totalRow = document.createElement('tr');
        totalRow.innerHTML = `
            <td style="background-color: #ebf7d3">총계</td>
            <td style="background-color: #ebf7d3"></td>
            <td style="background-color: #ebf7d3"></td>
            <td style="background-color: #ebf7d3"></td>
            <td style="background-color: #ebf7d3"></td>
        `;
        budgetResultTbody.appendChild(totalRow);
    }
}

// 사업개요 탭 예상 현황 경비 테이블
function updateRecordResult() {
    let recordResultTbody = document.getElementById('record_result_tbody');

    // 경비 항목별 합계를 저장할 Map
    const recordTotals = new Map();

    // 모든 경비 테이블을 찾아서 데이터 수집
    const recordBodies = document.querySelectorAll('[id$="_Record_tbody"]');

    recordBodies.forEach(recordTbody => {
        // 총계 행을 제외한 나머지 행들만 선택
        const rows = Array.from(recordTbody.querySelectorAll('tr:not(:first-child)'));

        rows.forEach(row => {
            const cells = row.cells;
            if (!cells || cells.length < 2 || cells[0].querySelector('select')) { // 최소 두 개의 셀이 있어야 함 (account, amount)
                return;
            }

            const account = cells[0].textContent.trim(); //  직접 account 가져오기
            const rawAmount = cells[1].textContent.replace(/[^\d]/g, ''); // 숫자만 남김
            const amount = parseInt(rawAmount) || 0;

            if (account !== '총 계' && account !== '') {
                const mainCategory = account.split('/')[0]; //  "/" 기준으로 앞부분만 사용하여 그룹핑
                if (recordTotals.has(mainCategory)) {
                    recordTotals.set(mainCategory, recordTotals.get(mainCategory) + amount);
                } else {
                    recordTotals.set(mainCategory, amount);
                }
            }
        });
    });

    //테이블 내용 업데이트
    let tableHTML = '';

    recordTotals.forEach((amount, category) => {
        tableHTML += `
            <tr>
                <td>${category}</td>
                <td>${amount.toLocaleString()} 원</td>
            </tr>
        `;
    });

    recordResultTbody.innerHTML = tableHTML;

    if (recordTotals.size === 0) {
        recordResultTbody.innerHTML = `
            <tr>
                <td></td>
                <td>0</td>
            </tr>
            <tr>
                <td style="background-color: #ebf7d3">총계</td>
                <td style="background-color: #ebf7d3">0 원</td>
            </tr>
        `;
    } else {
        const totalAmount = Array.from(recordTotals.values()).reduce((sum, val) => sum + val, 0);

        recordResultTbody.innerHTML += `
            <tr>
                <td style="background-color: #ebf7d3">총계</td>
                <td style="background-color: #ebf7d3">${totalAmount.toLocaleString()} 원</td>
            </tr>
        `;
    }
}






//사업 개요 중 실제 진행비 현황 인건비 테이블
function updateRealLaborCost() {
    //전량 외주 시 스킵
    // const outsourceCheck = document.getElementById('outsourceCheck').value;
    // if (outsourceCheck === 'True' || outsourceCheck === '1') {
    //     const realBudgetResultTbody = document.getElementById('Real_budget_result_tbody');
    //     realBudgetResultTbody.innerHTML = `
    //         <tr>
    //             <td>-</td>
    //             <td>0.00</td>
    //             <td>0</td>
    //         </tr>
    //         <tr>
    //             <td style="background-color: #ebf7d3;">총계</td>
    //             <td style="background-color: #ebf7d3;">0.00</td>
    //             <td style="background-color: #ebf7d3;" id = "Real_budgetSum">0</td>
    //         </tr>
    //     `;
    //     return Promise.resolve(); // Promise 반환 추가
    // }

    const contractCode = document.getElementById('project-contractCode').value;
    const year = getCurrentYear();

    // Promise 반환 추가
    return fetch(`/get_real_labor_cost?contract_code=${contractCode}&year=${year}`)
        .then(response => response.json())
        .then(data => {
            const realBudgetResultTbody = document.getElementById('Real_budget_result_tbody');
            realBudgetResultTbody.innerHTML = '';

            if (Array.isArray(data) && data.length > 0) {
                // 연구소도 표시하되 금액은 0 처리되도록 백엔드에서 daily_rate=0 반환됨. 추가 방어로 amount 재계산 시 0 강제.
                const rows = data;
                let totalMT = 0;
                let totalAmount = 0;

                rows.forEach(info => {
                    // MT 계산
                    const dayMT = info.total_day_time / 8;
                    const nightMT = info.total_night_time / 8;
                    const holidayMT = info.total_holiday_time / 8;
                    const mt = dayMT + nightMT + holidayMT;

                    // 금액 계산
                    const isResearch = (info.department || '').replace(/\s+/g, '') === '연구소';
                    const dayAmount = (dayMT * info.daily_rate * 1);
                    const nightAmount = (nightMT * info.daily_rate * 2);
                    const holidayAmount = (holidayMT * info.daily_rate * 1.5);
                    const amount = isResearch ? 0 : Math.round(dayAmount + nightAmount + holidayAmount);

                    const row = document.createElement('tr');
                    const amountDisplay = isResearch ? '-' : amount.toLocaleString();
                    row.innerHTML = `
                        <td>${info.position}</td>
                        <td>${mt.toFixed(2)}</td>
                        <td>${amountDisplay}</td>
                    `;
                    realBudgetResultTbody.appendChild(row);

                    totalMT += mt;
                    totalAmount += amount;
                });

                window.actualLaborCost = totalAmount;

                const totalRow = document.createElement('tr');
                totalRow.innerHTML = `
                    <td style="background-color: #ebf7d3;">총계</td>
                    <td style="background-color: #ebf7d3;">${totalMT.toFixed(2)}</td>
                    <td style="background-color: #ebf7d3;" id = "Real_budgetSum">${totalAmount.toLocaleString()}</td>
                `;
                realBudgetResultTbody.appendChild(totalRow);

                return totalAmount; // 결과값 반환
            } else {
                realBudgetResultTbody.innerHTML = `
                    <tr>
                        <td>-</td>
                        <td>0.00</td>
                        <td>0</td>
                    </tr>
                    <tr>
                        <td style="background-color: #ebf7d3;">총계</td>
                        <td style="background-color: #ebf7d3;">0.00</td>
                        <td style="background-color: #ebf7d3;" id = "Real_budgetSum">0</td>
                    </tr>
                `;
                return 0;
            }
        })
        .catch(error => {
            console.error('Error fetching labor cost data:', error);
            throw error; // 에러 전파
        });
}

//실제 진행비 중 경비 테이블
function updateRealRecordResult() {

    //전량 외주시 스킵
    // const outsourceCheck = document.getElementById('outsourceCheck').value;
    const realExpensesTbody = document.getElementById('Real_record_result_tbody');

    // if (outsourceCheck === 'True' || outsourceCheck === '1') {
    //     // 두 tbody 모두 업데이트
    //     const emptyTable = `
    //         <tr>
    //             <td></td>
    //             <td>0</td>
    //         </tr>
    //         <tr>
    //             <td style="background-color: #ebf7d3">총계</td>
    //             <td style="background-color: #ebf7d3" id = "Real_recordSum">0</td>
    //         </tr>
    //     `;
    //     realExpensesTbody.innerHTML = emptyTable;
    //     return;
    // }
    const contractCode = document.getElementById('project-contractCode').value;

    return fetch(`/get_real_expenses?contract_code=${contractCode}`)
        .then(response => response.json())
        .then(data => {
            // 경비 항목별 합계 계산
            const expenseTotals = new Map();
            let totalAmount = 0;

            // 테이블 내용 초기화
            realExpensesTbody.innerHTML = '';

            if (data.length > 0) {
                data.forEach(item => {
                    const mainCategory = item.expense_item.split('/')[0];
                    const amount = parseInt(item.amount) || 0;

                    if (expenseTotals.has(mainCategory)) {
                        expenseTotals.set(mainCategory,
                            expenseTotals.get(mainCategory) + amount);
                    } else {
                        expenseTotals.set(mainCategory, amount);
                    }
                    totalAmount += amount;
                });

                // 각 항목별 행 추가
                expenseTotals.forEach((amount, category) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${category}</td>
                        <td>${amount.toLocaleString()}</td>
                    `;
                    realExpensesTbody.appendChild(row);
                });
            } else {
                // 데이터가 없는 경우 빈 행 추가
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `
                    <td>-</td>
                    <td>0</td>
                `;
                realExpensesTbody.appendChild(emptyRow);
            }

            // 총계 행 추가 (데이터 유무와 관계없이)
            const totalRow = document.createElement('tr');
            totalRow.innerHTML = `
                <td style="background-color: #ebf7d3">총계</td>
                <td style="background-color: #ebf7d3" id = "Real_recordSum">${totalAmount.toLocaleString()}</td>
            `;
            realExpensesTbody.appendChild(totalRow);

            // 전역 변수에 실제 경비 저장
            window.actualExpenseCost = totalAmount;

            return totalAmount; // 총액 반환
        })
        .catch(error => {
            console.error('Error fetching real expenses:', error);

            // 에러 발생 시 빈 행과 총계 행 추가
            realExpensesTbody.innerHTML = `
                <tr>
                    <td>-</td>
                    <td>0</td>
                </tr>
                <tr>
                    <td style="background-color: #ebf7d3">총계</td>
                    <td style="background-color: #ebf7d3" id = "Real_recordSum">0</td>
                </tr>
            `;

            return 0;
        });
}



let costChart = null; // 전역 변수로 차트 객체 선언

//사업개요 그래프
function createCostChart(expectedLabor, expectedExpense, actualLabor, actualExpense) {
    // expectedCostChart 사용 (인건비 차트)
    const expectedCtx = document.getElementById('expectedCostChart');
    if (!expectedCtx) {
        console.error('Expected cost chart canvas element not found');
        return;
    }

    // actualCostChart 사용 (경비 차트)
    const actualCtx = document.getElementById('actualCostChart');
    if (!actualCtx) {
        console.error('Actual cost chart canvas element not found');
        return;
    }

    // 사업비(지분율) 값 가져오기
    const projectCost = parseFloat(document.getElementById('ProjectCost_ContributionRate').textContent.replace(/[^\d.-]/g, ''));

    // 인건비 차트
    new Chart(expectedCtx, {
        type: 'bar',  // 세로 막대 그래프
        data: {
            labels: ['사업비(지분율)', '예상 인건비', '실제 인건비'],
            datasets: [{
                label: '인건비 비교',
                data: [projectCost, expectedLabor, actualLabor],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)',  // 사업비 색상
                    'rgba(54, 162, 235, 0.6)',  // 예상 인건비 색상
                    'rgba(255, 99, 132, 0.6)'   // 실제 인건비 색상
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1,
                maxBarThickness: 40,  // 막대 최대 두께 설정
                barThickness: 30      // 막대 기본 두께 설정
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value.toLocaleString() + '원';
                        }
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '인건비 현황'
                }
            }
        }
    });

    // 경비 차트
    new Chart(actualCtx, {
        type: 'bar',  // 세로 막대 그래프
        data: {
            labels: ['사업비(지분율)', '예상 경비', '실제 경비'],
            datasets: [{
                label: '경비 비교',
                data: [projectCost, expectedExpense, actualExpense],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)',  // 사업비 색상
                    'rgba(54, 162, 235, 0.6)',  // 예상 경비 색상
                    'rgba(255, 99, 132, 0.6)'   // 실제 경비 색상
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1,
                maxBarThickness: 40,  // 막대 최대 두께 설정
                barThickness: 30      // 막대 기본 두께 설정
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value.toLocaleString() + '원';
                        }
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '경비 현황'
                }
            }
        }
    });
}

// 모든 데이터가 준비되면 차트 업데이트
function updateCostChart() {
    if (typeof window.expectedLaborCost !== 'undefined' &&
        typeof window.expectedExpenseCost !== 'undefined' &&
        typeof window.actualLaborCost !== 'undefined' &&
        typeof window.actualExpenseCost !== 'undefined') {

        createCostChart(
            window.expectedLaborCost,
            window.expectedExpenseCost,
            window.actualLaborCost,
            window.actualExpenseCost
        );
    }
}

/////////////////////////////////////////파일관련 코드//////////////////////////////////

//파일 불러오기
async function updateFileList() {
    year = getCurrentYear();
    const contractCodeElement = document.getElementById('project-contractCode');
    if (!contractCodeElement) {
        console.error('[ERROR] ContractCode element not found');
        return;
    }

    const contractCode = contractCodeElement.value;
    const fileListContainer = document.getElementById('uploaded-files');
    if (!fileListContainer) {
        console.error('[ERROR] File list container not found');
        return;
    }

    try {

        const response = await fetch(`/get_files?contractCode=${contractCode}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const files = await response.json();

        fileListContainer.innerHTML = ''; // 기존 목록 초기화

        if (files.length > 0) {
            files.forEach(file => {
                const fileElement = document.createElement('div');
                const formattedFilePath = file.FilePath.replace(/\\/g, '/'); // 경로를 슬래시로 변환
                fileElement.className = 'file-item';
                fileElement.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; width: 100%;">
                    <div style="flex: 1; min-width: 0;">
                        <a href="/open_file/${file.FileID}" 
                           target="_blank" 
                           style="text-decoration: none; color: inherit;">
                            ${truncateFileName(file.OriginalFileName, 30)}
                        </a>
                    </div>
                    <button onclick="deleteFile(${file.FileID})" class="delete-file">삭제</button>
                </div>
            `;


                fileListContainer.appendChild(fileElement);
            });
        } else {
            fileListContainer.innerHTML = '<p style="text-align: center; color: #666;">업로드된 파일이 없습니다.</p>';
        }

    } catch (error) {
        console.error('[ERROR] Failed to update file list:', error);
    }
}

// 파일명 길이 제한 함수
function truncateFileName(fileName, maxLength) {
    if (fileName.length <= maxLength) return fileName;

    const extension = fileName.split('.').pop();
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));

    // 확장자를 제외한 길이 계산
    const truncatedLength = maxLength - extension.length - 4; // ... 과 . 을 위한 4자리 확보

    return `${nameWithoutExt.substring(0, truncatedLength)}...${extension}`;
}

// 파일 삭제 함수
async function deleteFile(fileId) {
    if (!confirm('파일을 삭제하시겠습니까?')) {
        return;
    }

    try {
        const response = await fetch(`/delete_file/${fileId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('파일 삭제에 실패했습니다.');
        }

        const result = await response.json();

        if (result.success) {
            alert('파일이 삭제되었습니다.');
            // 페이지 새로고침
            reloadWithCurrentState();
        }

    } catch (error) {
        console.error('Error:', error);
        alert('파일 삭제 중 오류가 발생했습니다.');
    }
}

//외주 저장
async function saveOutsourceModal() {
    try {
        // 필수 입력값 검증
        const outsourcingType = document.querySelector('input[name="work_time"]:checked')?.parentElement.textContent.trim();
        // 부서 선택 제거됨: 외주 업체명을 department로 매핑
        const department = ''; // placeholder (실제 사용은 outsourcingCompany)
        const outsourcingCompany = document.getElementById('outsource_company').value.trim();
        const outsourcingAmount = document.getElementById('outsource_amount').value.trim();
        let bohalRaw = document.getElementById('bohal') ? document.getElementById('bohal').value.trim() : '';
        const outsourcingQuantity = document.getElementById('projectDetails').value.trim();
        const outsourcingAmountVatExcluded = document.getElementById('outsource_amount_vat_excluded').value.trim(); // VAT 제외 금액
        const contractCode = document.getElementById('project-contractCode').value;

        // 입력값 검증
        if (!outsourcingType || !outsourcingCompany || !outsourcingAmount || !outsourcingQuantity) {
            alert('모든 필드를 입력해주세요.');
            return;
        }

        // 보할(0~100, 소수 허용) 유효성 검사
        const bohalClean = (bohalRaw || '').replace(/[,%\s]/g, ''); // %, 공백, 콤마 제거
        if (bohalClean === '') {
            alert('보할(%)을 입력해주세요.');
            return;
        }
        let bohalVal = parseFloat(bohalClean);
        if (isNaN(bohalVal)) {
            alert('유효한 보할(%) 값을 입력해주세요.');
            return;
        }
        // 1자리 반올림 + 범위 클램프
        if (bohalVal < 0) bohalVal = 0;
        if (bohalVal > 100) bohalVal = 100;
        bohalVal = Math.round(bohalVal * 10) / 10;

        // 금액에서 쉼표 제거하고 숫자로 변환
        const cleanAmount = parseFloat(outsourcingAmount.replace(/,/g, ''));
        const cleanVatExcludedAmount = parseFloat(outsourcingAmountVatExcluded.replace(/,/g, '')); // VAT 제외 금액도 쉼표 제거

        if (isNaN(cleanAmount) || isNaN(cleanVatExcludedAmount)) {
            alert('유효한 금액을 입력해주세요.');
            return;
        }

        // VAT 제외 금액을 반올림하여 정수로 변환
        const roundedVatExcludedAmount = Math.round(cleanVatExcludedAmount);

        // 서버로 보낼 데이터 생성
        const formData = {
            outsourcing_type: outsourcingType,
            // department는 외주 업체명으로 저장 (프로젝트 부서 보할 테이블 매핑용)
            department: outsourcingCompany,
            outsourcing_company: outsourcingCompany,
            outsourcing_cost: cleanAmount,
            outsourcing_cost_vat_excluded: roundedVatExcludedAmount, // 반올림된 정수값 추가
            outsourcing_quantity: outsourcingQuantity,
            contract_code: contractCode,
            bohal: bohalVal
        };

        // 데이터 전송
        const response = await fetch('/save_outsourcing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            alert('외주 정보가 저장되었습니다.');
            closeQuantityModal(); // 모달 닫기
            reloadWithCurrentState();
        } else {
            throw new Error(result.message || '저장 실패');
        }

    } catch (error) {
        console.error('Error saving outsourcing data:', error);
        alert('외주 정보 저장 중 오류가 발생했습니다.');
    }
}

//진행률 저장
function saveProcessOutsourcingTable() {
    const contractCode = document.getElementById('project-contractCode').value; // 계약 코드 가져오기
    const outsourcingTbody = document.getElementById('outsourcing_process_tbody'); // tbody 가져오기
    const rows = outsourcingTbody.querySelectorAll('tr'); // 모든 행 가져오기

    const data = []; // API로 보낼 데이터를 저장할 배열

    // 각 행에서 데이터 추출
    rows.forEach(row => {
        const cells = row.querySelectorAll('td'); // 행의 모든 셀 가져오기
        if (cells.length >= 4) {
            const outsourcingCompany = cells[1]?.textContent.trim();
            // 진행률 셀은 3번째 인덱스(0:타입,1:업체,2:보할,3:진행률)
            const raw = (cells[3]?.textContent || '').trim();
            const progressRate = parseFloat(raw.replace('%', '')) || 0;

            if (outsourcingCompany && !isNaN(progressRate)) {
                data.push({
                    outsourcingCompany,
                    progressRate: progressRate.toFixed(2)
                });
            }
        }
    });

    // API 호출
    fetch('/api/save_outsourcing_progress', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contractCode, // 계약 코드
            data // 테이블에서 추출한 데이터
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save outsourcing progress.');
            }
            return response.json();
        })
        .then(result => {
            alert('외주 진행률이 성공적으로 저장되었습니다.');
            reloadWithCurrentState();
        })
        .catch(error => {
            console.error('Error saving outsourcing progress:', error);
            alert('외주 진행률 저장 중 오류가 발생했습니다.');
        });
}

// 외주내역 조회
async function updateOutsourcingTable() {
    const contractCode = document.getElementById('project-contractCode').value;
    const tbody = document.getElementById('outsourcing_result_tbody');
    const Process_tbody = document.getElementById('outsourcing_process_tbody');
    const processingTbody = document.getElementById('outsourcing_processing_Tbody');
    const addQuantityTbody = document.getElementById('addQuantity_result_tbody');

    try {
        const response = await fetch(`/get_outsourcing?contract_code=${contractCode}`);
        const data = await response.json();

        // 테이블 초기화
        tbody.innerHTML = '';
        Process_tbody.innerHTML = '';
        processingTbody.innerHTML = '';
        addQuantityTbody.innerHTML = '';
        let totalOutsourcingCost = 0; // 총 외주 비용
        let totalOutsourcingCostNoVAT = 0; // VAT 제외 총 비용
        let totalProcessing = 0; // 진행률 합계 (fallback용)
        let rowCount = 0; // 외주 진행률 행 개수 (fallback용)
        let addRowCount = 0; // 추가 제안 행 개수
        // 외주 진행률 평균 계산용(부서= "외주형태 - 업체명" 복합키)
        const deptProgress = {}; // { deptKey: { sum: number, count: number } }

        if (data.length > 0) {
            // 데이터가 있는 경우 각 행 추가
            const processBohalTargets = {};// {deptKey: [td, td, ...]}
            data.forEach(item => {
                const cost = parseFloat(item.change_Cost) || 0;
                const costNoVAT = parseFloat(item.change_Cost_NoVAT) || 0;
                totalOutsourcingCost += cost;
                totalOutsourcingCostNoVAT += costNoVAT;

                if (item.outsourcing_type === '추가 제안') {
                    // 추가 제안인 경우 addQuantityTbody에 추가
                    const addRow = document.createElement('tr');
                    addRow.innerHTML = `
                        <td>${item.outsourcing_type || '-'}</td>
                        <td>${item.outsourcing_company || '-'}</td>
                        <td>${cost.toLocaleString()} 원</td>
                        <td>${costNoVAT.toLocaleString()} 원</td>
                        <td class="wrap-text">${item.outsourcing_quantity ? item.outsourcing_quantity.replace(/\n/g, '<br>') : '-'}</td>
                    `;
                    addQuantityTbody.appendChild(addRow);
                    addRowCount++;
                    return; // 추가 제안은 다른 테이블에 추가하고 다음 아이템으로 넘어감
                }
                else {
                    // 사업 개요 외주 테이블 행 추가
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.outsourcing_type || '-'}</td>
                        <td>${item.outsourcing_company || '-'}</td>
                        <td>${cost.toLocaleString()} 원</td>
                        <td>${costNoVAT.toLocaleString()} 원</td>
                        <td class="wrap-text">${item.outsourcing_quantity ? item.outsourcing_quantity.replace(/\n/g, '<br>') : '-'}</td>
                    `;
                    tbody.appendChild(row);

                    // 외주 진행률 탭: 보할 표시 + 진행률 표기(수정 불가)
                    const process_row = document.createElement('tr');
                    const compName = (item.outsourcing_company || '-');
                    const otype = (item.outsourcing_type || '').trim();
                    const deptKey = `${otype} - ${compName}`.trim();
                    process_row.innerHTML = `
                        <td>${item.outsourcing_type || '-'}</td>
                        <td>${compName}</td>
                        <td class="no_wrap" data-bohal="${deptKey}">-</td>
                        <td class="no_wrap" onclick="TextChange(this, true)">${(parseFloat(item.processing) || 0)}%</td>
                        <td class="wrap-text">${item.outsourcing_quantity ? item.outsourcing_quantity.replace(/\n/g, '<br>') : '-'}</td>
                    `;
                    Process_tbody.appendChild(process_row);
                    // 수집: 보할 채울 셀 모으기
                    const bohalTd = process_row.querySelector('td[data-bohal]');
                    const key = deptKey;
                    if (bohalTd && key) {
                        if (!processBohalTargets[key]) processBohalTargets[key] = [];
                        processBohalTargets[key].push(bohalTd);
                    }

                    // 실제 진행비 외주 테이블 행 추가
                    const processing_row = document.createElement('tr');
                    const processingValue = parseFloat(item.processing) || 0;
                    totalProcessing += processingValue; // 진행률 합산
                    rowCount++;
                    // 복합키(외주형태 - 업체명)별 평균 집계
                    const comp = (item.outsourcing_company || '').trim();
                    const k = `${otype} - ${comp}`.trim();
                    if (k) {
                        if (!deptProgress[k]) deptProgress[k] = { sum: 0, count: 0 };
                        deptProgress[k].sum += processingValue;
                        deptProgress[k].count += 1;
                    }

                    processing_row.innerHTML = `
                        <td>${item.outsourcing_type || '-'}</td>
                        <td>${item.outsourcing_company || '-'}</td>
                        <td class="wrap-text">${item.outsourcing_quantity ? item.outsourcing_quantity.replace(/\n/g, '<br>') : '-'}</td>
                        <td style="background: ${getProgressBackground(processingValue)};">
                            ${processingValue || '-'}%
                        </td>
                    `;
                    processingTbody.appendChild(processing_row);
                }
            });

            // 가중합(보할) 기반 외주 합계 계산
            // 1) 복합키별 평균 진행률 계산
            const avgByDeptKey = {};
            Object.keys(deptProgress).forEach(k => {
                const { sum, count } = deptProgress[k];
                avgByDeptKey[k] = count > 0 ? (sum / count) : 0;
            });

            // 2) 복합키별 보할 요청 병렬 수행 → {deptKey: bohal}
            let weightMap = {};
            try {
                const deptKeys = Object.keys(avgByDeptKey);
                const promises = deptKeys.map(async dk => {
                    const resp = await fetch(`/get_department_bohal?contract_code=${encodeURIComponent(contractCode)}&department=${encodeURIComponent(dk)}`);
                    if (!resp.ok) return [dk, 0];
                    const js = await resp.json();
                    const w = parseFloat(js && js.bohal);
                    return [dk, isNaN(w) ? 0 : w];
                });
                const pairs = await Promise.all(promises);
                pairs.forEach(([dk, w]) => { weightMap[dk] = w; });
            } catch (e) {
                console.warn('보할 조회 실패, 외주 합계는 단순 평균으로 표시합니다.', e);
                weightMap = {};
            }

            // 3) 보할 합계 (정규화: Σw로 나눠 100 가정)
            const weights = Object.values(weightMap).filter(w => w > 0);
            let displayTotalProgress = '0.0';
            if (weights.length > 0) {
                // 가중 평균: sum(p_i * w_i) / sum(w_i)
                let contrib = 0;
                let sumW = 0;
                Object.keys(avgByDeptKey).forEach(dk => {
                    const p = parseFloat(avgByDeptKey[dk]) || 0;
                    const w = parseFloat(weightMap[dk]) || 0;
                    contrib += p * w;
                    sumW += w;
                });
                const normalized = sumW > 0 ? (contrib / sumW) : 0; // 0~100
                displayTotalProgress = (normalized === 100 ? '100' : normalized.toFixed(1));
            } else {
                // 보할이 하나도 없으면 기존 단순 평균으로 표시
                const totalProgress = rowCount > 0 ? (totalProcessing / rowCount) : 0;
                displayTotalProgress = (totalProgress === 100 ? '100' : totalProgress.toFixed(1));
            }

            const totalRow = document.createElement('tr');
            totalRow.innerHTML = `
                <th colspan="2" style="text-align: center; background-color: #ebf7d3;">합계</th>
                <td colspan="2" style="background: linear-gradient(to right, #B1FA9C ${displayTotalProgress}%, transparent ${displayTotalProgress}%)">
                    ${displayTotalProgress}%
                </td>
            `;
            processingTbody.prepend(totalRow);

            // 진행률 탭: 보할 값 비동기 채우기
            try {
                const keys = Object.keys(processBohalTargets);
                await Promise.all(keys.map(async dk => {
                    try {
                        const r = await fetch(`/get_department_bohal?contract_code=${encodeURIComponent(contractCode)}&department=${encodeURIComponent(dk)}`);
                        const js = await r.json();
                        const w = parseFloat(js && js.bohal);
                        const text = isNaN(w) ? '-' : String(w);
                        (processBohalTargets[dk] || []).forEach(td => td.textContent = text);
                    } catch (e) {
                        (processBohalTargets[dk] || []).forEach(td => td.textContent = '-');
                    }
                }));
            } catch (e) {
                /* noop */
            }

            if (addRowCount === 0) {
                addQuantityTbody.innerHTML = `<tr><td colspan="5">-</td></tr>`;
            }

        } else {
            // 데이터가 없는 경우 빈 행 추가
            tbody.innerHTML = `<tr><td colspan="5">-</td></tr>`;
            Process_tbody.innerHTML = `<tr><td colspan="5">-</td></tr>`;
            processingTbody.innerHTML = `<tr><td colspan="4">-</td></tr>`;
            addQuantityTbody.innerHTML = `<tr><td colspan="5">-</td></tr>`;
        }


    } catch (error) {
        console.error('Error fetching outsourcing data:', error);

        // 에러 발생 시 빈 행 추가
        tbody.innerHTML = `<tr><td colspan="5">-</td></tr>`;
        Process_tbody.innerHTML = `<tr><td colspan="5">-</td></tr>`;
        processingTbody.innerHTML = `<tr><td colspan="4">-</td></tr>`;
        addQuantityTbody.innerHTML = `<tr><td colspan="5">-</td></tr>`;

        // 에러 시 0으로 표시
        document.getElementById('outsourcing_money').textContent = '0 원';
        document.getElementById('outsourcing_per').textContent = '0.00%';
        document.getElementById('Real_outsourcing_money').textContent = '0 원';
        document.getElementById('Real_outsourcing_per').textContent = '0.00%';
    }
}

// 외주 금액 지급 탭 렌더링
async function updateOutsourcingMoneyPaymentTable() {
    const tbody = document.getElementById('outsourcing_moneyPayment_tbody');
    if (!tbody) return;

    // 템플릿에서 전달된 지급 내역 데이터
    const payments = (typeof OUTSOURCING_PAYMENTS !== 'undefined' && Array.isArray(OUTSOURCING_PAYMENTS)) ? OUTSOURCING_PAYMENTS : [];

    // 외주 원가(기준 금액) 매핑: outsourcing.id -> change_Cost
    const contractCode = document.getElementById('project-contractCode')?.value || '';
    let baseCostById = {};
    let baseList = [];
    let typeById = {};
    try {
        const resp = await fetch(`/get_outsourcing?contract_code=${encodeURIComponent(contractCode)}`);
        baseList = await resp.json();
        baseList.forEach(item => {
            if (item && item.id != null) {
                typeById[item.id] = (item.outsourcing_type || '').trim();
                if (typeById[item.id] === '추가 제안') return; // 제외
                const base = parseFloat(item.change_Cost) || 0;
                baseCostById[item.id] = base;
            }
        });
    } catch (e) {
        console.warn('외주 원가 조회 실패, 잔액 계산에서 기준금액을 0으로 처리합니다.', e);
        baseCostById = {};
    }

    // 전역 캐시로 저장(추가 행에서 사용)
    // 선택 목록용: '추가 제안' 제외한 리스트만 보관
    window.__outsourcingBaseList = (baseList || []).filter(it => (it.outsourcing_type || '').trim() !== '추가 제안');
    window.__outsourcingBaseCostById = baseCostById;

    // 초기화
    tbody.innerHTML = '';

    // 지급 데이터 없을 때도 추가 버튼으로 바로 입력 가능하도록 placeholder만 표시
    const filteredPayments = (payments || []).filter(p => (typeById[p.outsourcing_id] || '').trim() !== '추가 제안');
    if (!filteredPayments.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.setAttribute('data-placeholder', 'true');
        emptyRow.innerHTML = `<td colspan="8">-</td>`;
        tbody.appendChild(emptyRow);
        // 핸들러 바인딩 및 잔액 초기화만 수행 후 종료
        attachMoneyPaymentEventHandlers();
        recomputeMoneyPaymentBalances();
        return;
    }

    // 그룹핑: outsourcing_id 별로 정렬(지급일자 오름차순)
    const groups = {};
    filteredPayments.forEach(p => {
        const k = p.outsourcing_id;
        if (!groups[k]) groups[k] = [];
        groups[k].push(p);
    });

    Object.keys(groups).forEach(k => {
        groups[k].sort((a, b) => {
            const da = a.PaymentDate ? new Date(a.PaymentDate) : null;
            const db = b.PaymentDate ? new Date(b.PaymentDate) : null;
            if (da && db) return da - db;
            if (da && !db) return -1;
            if (!da && db) return 1;
            return 0;
        });
    });

    // 날짜 문자열을 yyyy-mm-dd로 정규화하는 헬퍼
    const toYMD = (val) => {
        if (!val) return '-';
        if (typeof val === 'string') {
            const s = val.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // 이미 yyyy-mm-dd
            const d = new Date(s);
            if (!isNaN(d)) {
                try {
                    return d.toISOString().slice(0, 10);
                } catch { /* noop */ }
            }
            return '-';
        }
        if (val instanceof Date && !isNaN(val)) {
            return val.toISOString().slice(0, 10);
        }
        return '-';
    };

    // 렌더링: 각 그룹별 누계로 잔액 계산 (가정: 잔액 = 외주비 기준금액 - 현재까지 지급누계)
    Object.entries(groups).forEach(([outsourcingId, rows]) => {
        const base = baseCostById[outsourcingId] || 0;
        let cumulative = 0;

        rows.forEach(p => {
            const company = p.CompanyName || '-';
            const division = p.Division || '-';
            const costVAT = parseFloat(p.Cost_VAT) || 0;
            const vatExcluded = Math.round(costVAT / 1.1);
            const payDate = toYMD(p.PaymentDate);
            const remark = (p.Remark || '').toString();

            cumulative += costVAT;
            let remain = Math.max(0, Math.round(base - cumulative));

            const tr = document.createElement('tr');
            tr.setAttribute('data-outsourcing-id', outsourcingId);
            // 업체명 select 박스 구성 (outsourcing_type이 '추가 제안'인 항목은 제외)
            const selectBaseList = (window.__outsourcingBaseList || []).filter(item => {
                const t = (item.outsourcing_type || '').trim();
                return t !== '추가 제안';
            });
            const selectOptions = selectBaseList.map(item => {
                const selected = String(item.id) === String(outsourcingId) ? 'selected' : '';
                const txt = (item.outsourcing_company || '-');
                return `<option value="${item.id}" ${selected}>${txt}</option>`;
            }).join('');

            const trHtml = `
                <td><input type="checkbox" class="row-check" /></td>
                <td>
                    <select class="outsourcing-company-select">${selectOptions}</select>
                </td>
                <td data-blank-on-edit="true" onclick="TextChange(this, true)">${division || '-'}</td>
                <td class="amount-cell" onclick="TextChangeWithCurrency(this)">${costVAT ? costVAT.toLocaleString() + ' 원' : '-'}</td>
                <td class="vat-excluded-cell">${vatExcluded.toLocaleString()} 원</td>
                <td class="remain-cell">${remain.toLocaleString()} 원</td>
                <td onclick="DateInputChange(this)">${payDate}</td>
                <td onclick="TextChange(this, true)">${remark ? remark.replace(/\\n/g, '<br>') : '-'}</td>
            `;
            tr.innerHTML = trHtml;
            tbody.appendChild(tr);
        });
    });

    // 이벤트 위임: 금액 편집 종료 시 재계산, 업체 변경 시 재계산
    attachMoneyPaymentEventHandlers();
    recomputeMoneyPaymentBalances();
}

// 메인 화면용 외주비 지급현황(읽기 전용) 렌더링 - 카드형(우선) + 구버전 테이블 호환
async function updateOutsourcingMoneyPaymentView() {
    const cardsWrap = document.getElementById('outsourcing_moneyPayment_cards');
    const legacyTbody = document.getElementById('outsourcing_moneyPayment_view_tbody');
    if (!cardsWrap && !legacyTbody) return; // 표시할 영역이 없으면 스킵

    // 템플릿에서 전달된 지급 내역 데이터 (필터는 타입 매핑 후 적용)
    const paymentsAll = (typeof OUTSOURCING_PAYMENTS !== 'undefined' && Array.isArray(OUTSOURCING_PAYMENTS)) ? OUTSOURCING_PAYMENTS : [];

    // 외주 원가(기준 금액) 매핑: outsourcing.id -> change_Cost 및 회사명 id->name
    const contractCode = document.getElementById('project-contractCode')?.value || '';
    let baseCostById = {}, nameById = {}, typeById = {};
    try {
        const resp = await fetch(`/get_outsourcing?contract_code=${encodeURIComponent(contractCode)}`);
        const baseList = await resp.json();
        baseList.forEach(item => {
            if (item && item.id != null) {
                typeById[item.id] = (item.outsourcing_type || '').trim();
                if (typeById[item.id] === '추가 제안') return; // 제외
                baseCostById[item.id] = parseFloat(item.change_Cost) || 0;
                nameById[item.id] = item.outsourcing_company || '-';
            }
        });
    } catch (e) {
        console.warn('외주 원가 조회 실패(뷰), 잔액 계산에서 기준금액을 0으로 처리합니다.', e);
        baseCostById = {};
    }

    // '추가 제안' 타입 지급 내역은 화면에서 제외
    const payments = paymentsAll.filter(p => (typeById[p.outsourcing_id] || '').trim() !== '추가 제안');

    // 날짜 문자열을 yyyy-mm-dd로 정규화하는 헬퍼
    const toYMD = (val) => {
        if (!val) return '-';
        if (typeof val === 'string') {
            const s = val.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // 이미 yyyy-mm-dd
            const d = new Date(s);
            if (!isNaN(d)) {
                try { return d.toISOString().slice(0, 10); } catch { /* noop */ }
            }
            return '-';
        }
        if (val instanceof Date && !isNaN(val)) return val.toISOString().slice(0, 10);
        return '-';
    };

    // 그룹핑 및 정렬
    const groups = {};
    payments.forEach(p => {
        const k = p.outsourcing_id;
        if (!groups[k]) groups[k] = [];
        groups[k].push(p);
    });
    Object.keys(groups).forEach(k => {
        groups[k].sort((a, b) => {
            const da = a.PaymentDate ? new Date(a.PaymentDate) : null;
            const db = b.PaymentDate ? new Date(b.PaymentDate) : null;
            if (da && db) return da - db;
            if (da && !db) return -1;
            if (!da && db) return 1;
            return 0;
        });
    });

    // 카드형 렌더링 우선
    if (cardsWrap) {
        cardsWrap.innerHTML = '';
        if (!payments.length) {
            cardsWrap.innerHTML = '<div class="omp-empty">-</div>';
            return;
        }

        Object.entries(groups).forEach(([outsourcingId, rows]) => {
            const company = (rows[0]?.CompanyName && rows[0].CompanyName.trim()) || nameById[outsourcingId] || '-';
            const base = baseCostById[outsourcingId] || 0;

            // 카드 구성
            const card = document.createElement('div');
            card.className = 'omp-card';

            const header = document.createElement('div');
            header.className = 'omp-card-header';
            header.innerHTML = `
                <div class="omp-title">${company} <span class="omp-count">(${rows.length})</span></div>
                <div class="omp-arrow" aria-hidden="true">&#9654;</div>
            `; // ▶

            const body = document.createElement('div');
            body.className = 'omp-card-body';
            body.style.display = 'none';

            // 상세 테이블 (기존 컬럼 유지)
            const table = document.createElement('table');
            table.className = 'custom-table th-no-wrap';
            table.innerHTML = `
                <thead>
                    <tr>
                        <th style="width: 15%;">업체명</th>
                        <th style="width: 15%;">구분</th>
                        <th style="width: 15%;">금액</th>
                        <th style="width: 15%;">금액(VAT 제외)</th>
                        <th style="width: 15%;">잔액</th>
                        <th style="width: 15%;">지급일자</th>
                        <th style="width: 20%;">비고</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;

            const tBody = table.querySelector('tbody');
            let cumulative = 0;
            rows.forEach(p => {
                const division = p.Division || '-';
                const costVAT = parseFloat(p.Cost_VAT) || 0;
                const vatExcluded = Math.round(costVAT / 1.1);
                const payDate = toYMD(p.PaymentDate);
                const remark = (p.Remark || '').toString();
                cumulative += costVAT;
                const remain = Math.max(0, Math.round(base - cumulative));

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${company}</td>
                    <td>${division}</td>
                    <td>${costVAT ? costVAT.toLocaleString() + ' 원' : '-'}</td>
                    <td>${vatExcluded.toLocaleString()} 원</td>
                    <td>${remain.toLocaleString()} 원</td>
                    <td>${payDate}</td>
                    <td>${remark ? remark.replace(/\n/g, '<br>') : '-'}</td>
                `;
                tBody.appendChild(tr);
            });

            body.appendChild(table);
            card.appendChild(header);
            card.appendChild(body);
            cardsWrap.appendChild(card);

            // 토글 이벤트
            header.addEventListener('click', () => {
                const opened = body.style.display !== 'none';
                body.style.display = opened ? 'none' : 'block';
                const arrow = header.querySelector('.omp-arrow');
                if (arrow) arrow.innerHTML = opened ? '&#9654;' : '&#9660;'; // ▶ ▼
            });
        });

        return; // 카드 렌더링 완료
    }

    // 구버전 테이블 tbody가 있을 경우 기존 방식 유지
    if (legacyTbody) {
        legacyTbody.innerHTML = '';
        if (!payments.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="7">-</td>`;
            legacyTbody.appendChild(tr);
            return;
        }

        Object.entries(groups).forEach(([outsourcingId, rows]) => {
            const base = baseCostById[outsourcingId] || 0;
            let cumulative = 0;

            rows.forEach(p => {
                const company = (p.CompanyName && p.CompanyName.trim()) || nameById[outsourcingId] || '-';
                const division = p.Division || '-';
                const costVAT = parseFloat(p.Cost_VAT) || 0;
                const vatExcluded = Math.round(costVAT / 1.1);
                const payDate = toYMD(p.PaymentDate);
                const remark = (p.Remark || '').toString();

                cumulative += costVAT;
                const remain = Math.max(0, Math.round(base - cumulative));

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${company}</td>
                    <td>${division}</td>
                    <td>${costVAT ? costVAT.toLocaleString() + ' 원' : '-'}</td>
                    <td>${vatExcluded.toLocaleString()} 원</td>
                    <td>${remain.toLocaleString()} 원</td>
                    <td>${payDate}</td>
                    <td>${remark ? remark.replace(/\n/g, '<br>') : '-'}</td>
                `;
                legacyTbody.appendChild(tr);
            });
        });
    }
}

// 행 추가(+ 버튼)
function addMoneyPaymentRow() {
    const tbody = document.getElementById('outsourcing_moneyPayment_tbody');
    if (!tbody) return;

    // '추가 제안' 타입은 선택 목록에서 제외
    const baseList = (window.__outsourcingBaseList || []).filter(item => {
        const t = (item.outsourcing_type || '').trim();
        return t !== '추가 제안';
    });
    if (!baseList.length) {
        alert('외주 업체 목록을 가져오지 못했습니다. 페이지를 새로고침 해주세요.');
        return;
    }

    // placeholder 제거
    const firstRow = tbody.querySelector('tr');
    if (firstRow && (firstRow.getAttribute('data-placeholder') === 'true' || firstRow.textContent.trim() === '-')) {
        tbody.removeChild(firstRow);
    }

    // 첫 항목을 기본 선택
    const defaultId = baseList[0].id;
    const base = (window.__outsourcingBaseCostById && window.__outsourcingBaseCostById[defaultId]) || 0;
    const selectOptions = baseList.map(item => {
        const selected = String(item.id) === String(defaultId) ? 'selected' : '';
        const txt = (item.outsourcing_company || '-');
        return `<option value="${item.id}" ${selected}>${txt}</option>`;
    }).join('');

    const tr = document.createElement('tr');
    tr.setAttribute('data-outsourcing-id', defaultId);
    tr.innerHTML = `
        <td><input type="checkbox" class="row-check" /></td>
        <td>
            <select class="outsourcing-company-select">${selectOptions}</select>
        </td>
        <td data-blank-on-edit="true" onclick="TextChange(this, true)">-</td>
        <td class="amount-cell" onclick="TextChangeWithCurrency(this)">-</td>
        <td class="vat-excluded-cell">0 원</td>
        <td class="remain-cell">${(Math.round(base)).toLocaleString()} 원</td>
        <td onclick="DateInputChange(this)">-</td>
        <td onclick="TextChange(this, true)">-</td>
    `;

    tbody.appendChild(tr);
    attachMoneyPaymentEventHandlers();
    recomputeMoneyPaymentBalances();
}

function attachMoneyPaymentEventHandlers() {
    const tbody = document.getElementById('outsourcing_moneyPayment_tbody');
    if (!tbody) return;

    // 업체 선택 변경 시
    tbody.querySelectorAll('select.outsourcing-company-select').forEach(sel => {
        if (sel.__boundChange) return; // 중복 바인딩 방지
        sel.__boundChange = true;
        sel.addEventListener('change', (e) => {
            const tr = e.target.closest('tr');
            if (tr) tr.setAttribute('data-outsourcing-id', e.target.value);
            recomputeMoneyPaymentBalances();
        });
    });

    // 금액 입력 종료 시 재계산 (focusout 사용)
    if (!tbody.__boundFocusout) {
        tbody.__boundFocusout = true;
        tbody.addEventListener('focusout', (e) => {
            const td = e.target.closest('td');
            if (!td) return;
            // 금액 칸인지 확인 (열 index 2 또는 amount-cell 클래스)
            const tr = td.parentElement;
            const idx = Array.from(tr.children).indexOf(td);
            if (idx === 3 || td.classList.contains('amount-cell')) {
                // TextChangeWithCurrency가 blur에서 금액 표시를 갱신한 다음에 재계산
                setTimeout(() => recomputeMoneyPaymentBalances(), 0);
            }
        });
    }
}

// 금액/업체 변경 시 VAT제외(반올림)와 잔액을 자동 재계산
function recomputeMoneyPaymentBalances() {
    const tbody = document.getElementById('outsourcing_moneyPayment_tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const baseCost = window.__outsourcingBaseCostById || {};

    // 그룹별 누계 초기화
    const accum = {};

    rows.forEach(tr => {
        const outsourcingId = tr.getAttribute('data-outsourcing-id') || (tr.querySelector('select.outsourcing-company-select')?.value) || '';
        const base = baseCost[outsourcingId] || 0;

        // 금액 파싱
        const amountTd = tr.children[3];
        const vatTd = tr.children[4];
        const remainTd = tr.children[5];

        let amountVal = 0;
        if (amountTd) {
            amountVal = parseInt(String(amountTd.textContent || '0').replace(/[^\d]/g, ''), 10) || 0;
        }

        // VAT 제외(무조건 반올림)
        const vatExcluded = Math.round(amountVal / 1.1);
        if (vatTd) vatTd.textContent = `${vatExcluded.toLocaleString()} 원`;

        if (!accum[outsourcingId]) accum[outsourcingId] = 0;
        accum[outsourcingId] += amountVal;

        const remain = Math.max(0, Math.round(base - accum[outsourcingId]));
        if (remainTd) remainTd.textContent = `${remain.toLocaleString()} 원`;
    });
}

// 외주 금액 지급 저장
async function saveOutsourcingMoneyPayments() {
    try {
        const contractCode = document.getElementById('project-contractCode')?.value || '';
        const tbody = document.getElementById('outsourcing_moneyPayment_tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => !r.getAttribute('data-placeholder'));
        const data = [];

        rows.forEach(tr => {
            const tds = tr.children;
            const sel = tr.querySelector('select.outsourcing-company-select');
            const outsourcing_id = sel ? sel.value : '';

            // 구분
            const divTd = tds[2];
            const divInput = divTd ? divTd.querySelector('input') : null;
            const Division = (divInput ? divInput.value : (divTd?.textContent || '')).trim();

            // 금액 (숫자만)
            const amtTd = tds[3];
            const amtInput = amtTd ? amtTd.querySelector('input') : null;
            let Cost_VAT = 0;
            if (amtInput) {
                Cost_VAT = parseInt(String(amtInput.value || '').replace(/[^\d]/g, ''), 10) || 0;
            } else {
                Cost_VAT = parseInt(String(amtTd?.textContent || '').replace(/[^\d]/g, ''), 10) || 0;
            }

            // 지급일자
            const payTd = tds[6];
            const payInput = payTd ? payTd.querySelector('input[type="date"]') : null;
            let PaymentDate = '';
            if (payInput) {
                PaymentDate = (payInput.value || '').trim();
            } else {
                const raw = (payTd?.textContent || '').trim();
                PaymentDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
            }

            // 비고
            const remarkTd = tds[7];
            const remarkInput = remarkTd ? remarkTd.querySelector('input') : null;
            const Remark = (remarkInput ? remarkInput.value : (remarkTd?.innerText || '')).trim();

            if (!outsourcing_id) return; // 업체 필수

            // 완전 빈 행은 제외
            const hasContent = Division || Cost_VAT > 0 || PaymentDate || Remark;
            if (!hasContent) return;

            data.push({
                outsourcing_id,
                CompanyName: sel?.selectedOptions?.[0]?.textContent?.trim() || '',
                Division,
                Cost_VAT,
                PaymentDate,
                Remark
            });
        });

        const resp = await fetch('/api/save_outsourcing_payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractCode, data })
        });

        if (!resp.ok) {
            const t = await resp.text();
            throw new Error(t || '저장 실패');
        }

        const result = await resp.json();
        if (result && result.success) {
            alert('외주 금액 지급 내역이 저장되었습니다.');
            reloadWithCurrentState();
        } else {
            throw new Error(result?.message || '저장 실패');
        }
    } catch (e) {
        console.error(e);
        alert('저장 중 오류가 발생했습니다.');
    }
}

// 외주사업 수정용
async function loadEditableOutsourcingTable() {
    const contractCode = document.getElementById('project-contractCode').value;
    const tbody = document.getElementById('edit_outsourcing_result_tbody');
    if (!tbody) return;
    // 초기화
    tbody.innerHTML = '';

    try {
        const response = await fetch(`/get_outsourcing?contract_code=${encodeURIComponent(contractCode)}`);
        const data = await response.json();

        if (Array.isArray(data) && data.length) {
            for (const item of data) {
                const row = document.createElement('tr');
                row.setAttribute('data-id', item.id);

                // 1. 외주 형태 select
                const typeCell = document.createElement('td');
                typeCell.innerHTML = `
                    <select onchange="updateRecordsSum(this.parentElement.parentElement)">
                        <option value="전량 외주"${item.outsourcing_type === '전량 외주' ? ' selected' : ''}>전량 외주</option>
                        <option value="부분 외주"${item.outsourcing_type === '부분 외주' ? ' selected' : ''}>부분 외주</option>
                        <option value="추가 제안"${item.outsourcing_type === '추가 제안' ? ' selected' : ''}>추가 제안</option>
                        <option value="삭제">삭제</option>
                    </select>
                `;
                row.appendChild(typeCell);

                // 2. 외주 업체명 (편집 가능 텍스트)
                const companyCell = document.createElement('td');
                companyCell.textContent = item.outsourcing_company || '-';
                companyCell.setAttribute('onclick', 'TextChange(this, true)');
                row.appendChild(companyCell);

                // 3. 보할 (%) 편집 가능
                const bohalCell = document.createElement('td');
                bohalCell.className = 'no_wrap';
                bohalCell.textContent = '-';
                bohalCell.setAttribute('onclick', 'TextChange(this, true)');
                row.appendChild(bohalCell);

                // 4. 외주 금액 (VAT 포함) 편집 가능
                const costCell = document.createElement('td');
                const costValue = item.change_Cost ? Math.round(item.change_Cost).toLocaleString() + ' 원' : '0 원';
                costCell.textContent = costValue;
                costCell.setAttribute('onclick', 'TextChangeWithCurrency(this)');
                row.appendChild(costCell);

                // 5. 외주 금액 (VAT 제외: 원본 change_Cost_NoVAT 있으면 그대로, 없으면 cost /1.1)
                const vatExcludedCell = document.createElement('td');
                let vatExcluded = 0;
                if (item.change_Cost_NoVAT) {
                    vatExcluded = Math.round(item.change_Cost_NoVAT);
                } else if (item.change_Cost) {
                    vatExcluded = Math.round(item.change_Cost / 1.1);
                }
                vatExcludedCell.textContent = `${vatExcluded.toLocaleString()} 원`;
                row.appendChild(vatExcludedCell);

                // 6. 외주 물량 (멀티라인 편집 가능)
                const quantityCell = document.createElement('td');
                quantityCell.innerHTML = (item.outsourcing_quantity || '-').replace(/\n/g, '<br>');
                quantityCell.setAttribute('onclick', 'TextChangeWithMultiline(this, true)');
                row.appendChild(quantityCell);

                // 행 추가
                tbody.appendChild(row);

                // 비동기: 보할 값 채우기
                try {
                    const deptKey = `${(item.outsourcing_type || '').trim()} - ${(item.outsourcing_company || '').trim()}`;
                    const respB = await fetch(`/get_department_bohal?contract_code=${encodeURIComponent(contractCode)}&department=${encodeURIComponent(deptKey)}`);
                    const js = await respB.json();
                    const w = parseFloat(js && js.bohal);
                    if (!isNaN(w)) bohalCell.textContent = w.toString();
                } catch (e) {
                    console.warn('보할 조회 실패', e);
                }
            }
        } else {
            // 데이터 없음: 빈 행
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="6">-</td>';
            tbody.appendChild(emptyRow);
        }
    } catch (error) {
        console.error('Error loading editable outsourcing data:', error);
        tbody.innerHTML = '<tr><td colspan="6">-</td></tr>';
    }
}

// 텍스트박스로 전환 시 줄넘김 처리 포함
function TextChangeWithMultiline(td, isText = false) {
    // 이미 input이 있는 경우 return
    if (td.querySelector('textarea')) return;

    // textarea 생성 및 설정
    const textarea = document.createElement('textarea');
    const currentValue = td.innerHTML.trim().replace(/<br>/g, '\n'); // <br>을 줄넘김으로 변환
    textarea.value = currentValue; // 현재 값을 textarea의 초기값으로 설정
    textarea.classList.add('editable-textarea');

    // td 크기와 동일하게 textarea 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const savetd = currentValue; // 기존 값을 저장
    td.innerHTML = ''; // td 내용을 비우고
    td.appendChild(textarea); // textarea 추가

    // 스타일 설정
    textarea.style.width = (tdWidth - 2) + 'px'; // 테두리 고려하여 2px 감소
    textarea.style.height = (tdHeight - 2) + 'px'; // 테두리 고려하여 2px 감소
    textarea.style.border = '1px solid #cbd5e0';
    textarea.style.borderRadius = '4px';
    textarea.style.padding = '2px 4px'; // 좌우 패딩 추가
    textarea.style.margin = '0';
    textarea.style.boxSizing = 'border-box';
    textarea.style.fontSize = '14px';
    textarea.style.backgroundColor = '#ffffff';
    textarea.focus();

    // blur 이벤트 발생 시 처리
    textarea.addEventListener('blur', () => {
        const value = textarea.value.trim().replace(/\n/g, '<br>'); // 줄넘김을 <br>로 변환
        td.innerHTML = value || '-'; // 값이 비어있으면 기본값으로 설정
    });

    // Enter 키를 눌렀을 때 blur 발생
    textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            textarea.blur();
        }
    });
}

// 텍스트박스로 전환 시 금액 처리 포함
function TextChangeWithCurrency(td) {
    // 이미 input이 있는 경우 return
    if (td.querySelector('input')) return;

    // input 생성 및 설정
    const input = document.createElement('input');
    const currentValue = td.textContent.replace(/[^\d]/g, '').trim(); // 금액만 추출
    // 초기값도 콤마 포맷 적용
    input.value = currentValue ? parseInt(currentValue, 10).toLocaleString() : '';
    input.classList.add('editable-input');

    // td 크기와 동일하게 input 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    td.innerHTML = ''; // td 내용을 비우고
    td.appendChild(input); // input 추가

    // 스타일 설정
    input.style.width = (tdWidth - 2) + 'px'; // 테두리 고려하여 2px 감소
    input.style.height = (tdHeight - 2) + 'px'; // 테두리 고려하여 2px 감소
    input.style.border = '1px solid #cbd5e0';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px'; // 좌우 패딩 추가
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.style.fontSize = '14px';
    input.style.backgroundColor = '#ffffff';
    input.focus();

    // blur 이벤트 발생 시 처리
    input.addEventListener('blur', () => {
        const raw = input.value.replace(/[^\d]/g, '').trim(); // 숫자만 유지
        const numeric = parseInt(raw || '0', 10) || 0; // 정수 변환
        td.textContent = numeric.toLocaleString() + ' 원'; // 포맷팅 후 표시(콤마 유지)

        // VAT 제외 금액 업데이트 (다음 셀)
        const row = td.parentElement;
        const vatCell = row.cells[4];
        const vatExcluded = Math.round(numeric / 1.1);
        if (vatCell) vatCell.textContent = `${vatExcluded.toLocaleString()} 원`;

        // 외주 금액 지급 테이블일 경우 잔액 재계산 트리거
        if (td.closest('#outsourcing_moneyPayment_tbody')) {
            setTimeout(() => {
                try { recomputeMoneyPaymentBalances(); } catch (e) { console.warn(e); }
            }, 0);
        }
    });

    // input 이벤트 발생 시 실시간 자릿수 표시
    input.addEventListener('input', () => {
        let value = input.value.replace(/[^\d]/g, '').trim(); // 숫자만 유지
        input.value = value ? parseInt(value, 10).toLocaleString() : ''; // 자릿수 추가
    });

    // Enter 키를 눌렀을 때 blur 발생
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
        }
    });
}

// 외주 금액 지급 테이블 전용: 지급일자 달력/yyyy-mm-dd 입력
function DateInputChange(td) {
    if (td.querySelector('input')) return;

    const input = document.createElement('input');
    input.type = 'date';
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;

    // 초기값: yyyy-mm-dd 형식이면 그대로, 아니면 비움
    const raw = (td.textContent || '').trim();
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    input.value = isYMD ? raw : '';

    td.innerHTML = '';
    td.appendChild(input);

    input.style.width = (tdWidth - 2) + 'px';
    input.style.height = (tdHeight - 2) + 'px';
    input.style.border = '1px solid #cbd5e0';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.style.fontSize = '14px';
    input.style.backgroundColor = '#ffffff';
    input.focus();

    const commit = () => {
        let v = (input.value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            // 일부 브라우저는 date 입력을 로컬 형식으로 반환할 수 있음 → 보정 불가 시 '-' 처리
            td.textContent = '-';
        } else {
            td.textContent = v;
        }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
}

//외주사업 수정 저장
async function saveEditableOutsourcingTable() {
    const tableRows = document.querySelectorAll('#edit_outsourcing_result_tbody tr');
    const contractCode = document.getElementById('project-contractCode').value;
    const updates = [];

    tableRows.forEach(row => {
        const id = row.getAttribute('data-id'); // 고유 id 가져오기
        const outsourcingType = row.cells[0].querySelector('select').value;
        const outsourcingCompany = row.cells[1].textContent.trim();
        const bohalRaw = row.cells[2].textContent.trim();
        let bohalVal = parseFloat(bohalRaw.replace(/[^\d.]/g, '')) || 0; // 소수점 허용
        bohalVal = Math.min(100, Math.max(0, Math.round(bohalVal * 10) / 10));
        const outsourcingCost = parseInt(row.cells[3].textContent.replace(/[^\d]/g, ''), 10) || 0;
        // 줄넘김 처리
        const quantityCell = row.cells[5];
        const outsourcingQuantity = quantityCell.dataset.originalValue
            ? quantityCell.dataset.originalValue // dataset에서 원본 값을 가져옴
            : quantityCell.innerHTML.replace(/<br\s*\/?>/g, '\n').trim(); // <br>을 \n으로 변환

        updates.push({
            id: id,
            outsourcing_type: outsourcingType,
            outsourcing_company: outsourcingCompany,
            outsourcing_cost: outsourcingCost,
            outsourcing_quantity: outsourcingQuantity,
            contract_code: contractCode,
            bohal: bohalVal
        });
    });

    try {
        const response = await fetch('/update_outsourcing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });

        const result = await response.json();
        if (result.success) {
            alert('수정 내용이 저장되었습니다.');
            reloadWithCurrentState();
        } else {
            alert('저장에 실패했습니다.');
        }
    } catch (error) {
        console.error('Error saving data:', error);
        alert('저장 중 오류가 발생했습니다.');
    }
}

// ModifyRecords_table 저장 시 삭제 처리 포함(빈 테이블 유지)
function saveModifyExpenseRecords() {
    const contractCode = document.getElementById('project-contractCode').value;
    const projectID = document.getElementById('project-id').value;
    const tbody = document.getElementById('Dep_Modify_Record_tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    // 실제 데이터 행 추출(checkbox + select 있는 행)
    const dataRows = rows.filter(r => r.querySelector('select'));
    const checkedForDeletion = dataRows.filter(r => r.querySelector('input.row-check:checked'));
    const deleteAll = checkedForDeletion.length === dataRows.length && dataRows.length > 0;
    // 모달 버튼의 data-department로 원본 컨텍스트 식별 (fir, sec)
    const modifySaveBtn = document.getElementById('modifySave_BTN');
    const depContext = modifySaveBtn ? modifySaveBtn.getAttribute('data-department') : null;

    // 컨텍스트에 따라 실제 부서명/clone 여부 결정
    let departmentName = '';
    switch (depContext) {
        case 'fir':
            departmentName = document.getElementById('Dep_fir_header_text')?.textContent || '';
            break;
        case 'sec':
            departmentName = document.getElementById('Dep_sec_header_text')?.textContent || '';
            break;
        default:
            // 안전장치: depContext가 없으면 화면의 활성 탭 기준으로 추론
            {
                departmentName = document.getElementById('Dep_fir_header_text')?.textContent || '';
            }
    }
    if (!departmentName) {
        // 최종 실패 시 가드
        departmentName = '수정부서';
    }

    // 1) 모든 행 삭제 선택 → 서버에서 그 부서 레코드 삭제 후 클라이언트에 placeholder 추가
    if (deleteAll) {
        fetch('/api/save_expense_records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ProjectID: projectID,
                RecordsData: [],
                ContractCode: contractCode,
                deleteDepartments: [departmentName]
            })
        })
            .then(r => r.json())
            .then(js => {
                // 요청 사항: placeholder 행 추가하지 않음, 알림 없이 즉시 처리
                tbody.innerHTML = '';
                setTimeout(() => reloadWithCurrentState(), 500);
            })
            .catch(e => {
                console.error(e);
                alert('삭제 중 오류가 발생했습니다.');
            });
        return;
    }

    // 2) 일부 삭제: 체크된 행 제거하고 남은 것 저장
    checkedForDeletion.forEach(r => r.remove());

    const remainingRows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.querySelector('select'));
    if (remainingRows.length === 0) {
        // 서버에 해당 부서 전체 삭제 요청
        fetch('/api/save_expense_records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ProjectID: projectID,
                RecordsData: [],
                ContractCode: contractCode,
                deleteDepartments: [departmentName]
            })
        })
            .then(r => r.json())
            .then(js => {
                // 알림 없이 즉시 처리
                setTimeout(() => reloadWithCurrentState(), 500);
            })
            .catch(e => console.error(e));
        return;
    }

    // 저장 직전에 각 행의 금액(Amount)을 최신 값으로 강제 재계산해 반영
    remainingRows.forEach(r => recordCal(r));

    const RecordsData = remainingRows.map(row => {
        const cells = row.querySelectorAll('td');
        const account = cells[1].querySelector('select').value;
        return {
            ContractCode: contractCode,
            account,
            department: departmentName,
            person_count: (cells[2].innerText || '0').replace(/,/g, ''),
            frequency: (cells[3].innerText || '0').replace(/,/g, ''),
            days: (cells[4].innerText || '0').replace(/,/g, ''),
            unit_price: (cells[5].innerText || '0').replace(/,/g, ''),
            amount: (cells[6].innerText || '0').replace(/,/g, ''),
            note: cells[7].innerText || ''
        };
    });

    fetch('/api/save_expense_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ProjectID: projectID,
            RecordsData
        })
    })
        .then(r => r.json())
        .then(js => {
            alert('저장됐습니다.');
            setTimeout(() => reloadWithCurrentState(), 500);
        })
        .catch(e => {
            console.error(e);
            alert('저장 중 오류가 발생했습니다.');
        });
}

function appendEmptyModifyRow(tbody) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="text-align:center"><input type="checkbox" class="row-check"></td>
        <td><select><option value="복리후생비/식대">복리후생비/식대</option></select></td>
        <td class="edit_cell" onclick="TextChange(this)"></td>
        <td class="edit_cell" onclick="TextChange(this)"></td>
        <td class="edit_cell" onclick="TextChange(this)"></td>
        <td class="Price-cell" onclick="TextChange(this)"></td>
        <td class="amount-cell"></td>
        <td class="edit_cell" onclick="TextChange(this, true)"></td>
    `;
    tbody.appendChild(tr);
}

//엑셀 다운로드
function downloadExcel() {
    const activeMonth = document.querySelector('.month-btn.active').value;
    const department = document.getElementById('Dep_fir_Bud_header_text').textContent.split('\t')[0];

    // 현재 월의 로그 데이터 필터링
    const filteredLogs = currentExpenseLogs.filter(log => {
        const date = new Date(log.log_date);
        const logMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return logMonth === activeMonth;
    });

    // Excel 워크북 생성
    const wb = XLSX.utils.book_new();

    // 데이터를 Excel 형식으로 변환
    const excelData = filteredLogs.map(log => {
        const date = new Date(log.log_date);
        const tax = Math.round(((log.money || 0) - ((log.money || 0) / 1.1)) * 100) / 100;
        const supply = Math.round(((log.money || 0) / 1.1) * 100) / 100;
        return {
            '날짜': date.toLocaleDateString(),
            '항목': log.use_account || '',
            '내역': log.history || '',
            '유형': log.type || '',
            '세액': tax,
            '공급가액': supply,
            '금액': log.money || 0
        };
    });

    // 합계 계산
    const totals = excelData.reduce((acc, curr) => {
        acc.세액 += curr.세액;
        acc.공급가액 += curr.공급가액;
        acc.금액 += curr.금액;
        return acc;
    }, { 세액: 0, 공급가액: 0, 금액: 0 });

    // 합계 행 추가
    excelData.push({
        '날짜': '',
        '항목': '',
        '내역': '',
        '유형': '합계',
        '세액': totals.세액,
        '공급가액': totals.공급가액,
        '금액': totals.금액
    });

    // 워크시트 생성
    const ws = XLSX.utils.json_to_sheet(excelData);

    // 열 너비 설정
    ws['!cols'] = [
        { wch: 15 },  // 날짜
        { wch: 20 },  // 항목
        { wch: 30 },  // 내역
        { wch: 10 },  // 유형
        { wch: 15 },  // 세액
        { wch: 15 },  // 공급가액
        { wch: 15 }   // 금액
    ];

    // 모든 숫자 셀에 형식 적용
    for (let i = 1; i <= excelData.length; i++) {
        // 세액 (E열)
        if (ws[`E${i}`]) {
            ws[`E${i}`].z = '#,##0.00';
            ws[`E${i}`].t = 'n';
        }
        // 공급가액 (F열)
        if (ws[`F${i}`]) {
            ws[`F${i}`].z = '#,##0.00';
            ws[`F${i}`].t = 'n';
        }
        // 금액 (G열)
        if (ws[`G${i}`]) {
            ws[`G${i}`].z = '#,##0';
            ws[`G${i}`].t = 'n';
        }
    }

    // 합계 행 스타일링
    const lastRow = excelData.length;
    ['E', 'F', 'G'].forEach(col => {
        const cell = ws[`${col}${lastRow}`];
        if (!cell.s) cell.s = {};
        cell.s.font = { bold: true };
        // 합계 행의 숫자 형식 유지
        cell.t = 'n';
        cell.z = col === 'G' ? '#,##0' : '#,##0.00';
    });

    // 워크북에 워크시트 추가
    XLSX.utils.book_append_sheet(wb, ws, '경비로그');

    // 파일 다운로드
    const fileName = `${department}_경비_${activeMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// === 저장 버튼 클릭 시: 현재 탭 상태 저장 + 동일 detail URL로 새로고침 ===
function reloadWithCurrentState() {
    const activeTab = document.querySelector('.tabcontent[style*="display: block"]');
    if (activeTab) {
        sessionStorage.setItem('isButtonReload', 'true');
        sessionStorage.setItem('activeTab', activeTab.id);
    }

    const projectId = window.PROJECT_ID || document.getElementById('project-id')?.value;
    if (!projectId) {
        console.warn('[WARN] projectId 없음 → 일반 새로고침 실행');
        window.location.reload();
        return;
    }

    const url = `/project_detail/${projectId}`;
    window.location.href = url;
}

//코멘트 저장
async function saveComment() {
    try {
        const contractCode = document.getElementById('project-contractCode').value;
        const tbody = document.getElementById('comment_tbody');
        const comments = [];
        const sessionDepEl = document.getElementById('sessionDep');
        const sessionDep = sessionDepEl ? sessionDepEl.value : '';

        function normalizeDept(d) {
            if (!d) return '';
            const s = String(d).trim();
            const map = {
                '총무부': '경영본부',
                '경영지원부': '경영본부',
                '임원실': '경영본부',
                'GIS사업지원부': 'GIS사업부'
            };
            return map[s] || s;
        }

        Array.from(tbody.rows).forEach((row, index) => {
            const deptTd = row.cells[0];
            const commentTd = row.cells[1];

            // 부서명 정규화
            let rawDept = '';
            if (deptTd) {
                rawDept = deptTd.dataset.department ? deptTd.dataset.department.trim()
                    : (deptTd.textContent || '').trim();
            }
            let deptValue = normalizeDept(rawDept);
            if (!deptValue || deptValue.toUpperCase() === 'NULL' || deptValue.toUpperCase() === 'NONE') {
                deptValue = normalizeDept(sessionDep || '');
            }

            // 값 읽기: textarea 편집 중이면 value 우선
            let textValue = '';
            const ta = commentTd ? commentTd.querySelector('textarea') : null;
            if (ta) {
                textValue = ta.value || '';
            } else {
                const rawHTML = commentTd ? String(commentTd.innerHTML || '') : '';
                // <br> → \n, 엔티티 디코드
                textValue = rawHTML
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&nbsp;/g, ' ');
            }

            // 앞뒤 공백만 정리(줄바꿈은 유지)
            textValue = textValue.split(/\r?\n/).map(s => s.replace(/^\s+|\s+$/g, '')).join('\n');

            // 이제 빈 문자열도 포함해서 모두 push (빈 문자열은 '삭제' 의미)
            comments.push({
                contractcode: contractCode,
                department: deptValue,
                comment: textValue,   // '' 이면 서버에서 빈 코멘트로 저장됨(삭제 느낌)
                input_num: index + 1
            });
        });

        const response = await fetch('/api/save_comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(comments)
        });

        if (!response.ok) throw new Error('저장에 실패했습니다.');

        await response.json();
        alert('코멘트가 저장되었습니다.');
        reloadWithCurrentState();
    } catch (error) {
        console.error('Error saving comments:', error);
        alert('코멘트 저장 중 오류가 발생했습니다.');
    }
}

// 외부 인력 단가 저장 함수
async function saveExternalLaborData() {
    try {

        // 현재 계약 코드 가져오기
        const contractCode = document.getElementById('project-contractCode').value;

        // 테이블의 모든 행 데이터 수집
        const tbody = document.getElementById('externalTable_tbody');
        const test = tbody.rows.cells;
        const laborData = [];

        Array.from(tbody.rows).forEach((row, index) => {
            const cells = row.cells;
            // 직급과 월급 값 수집
            const position = cells[0].textContent.trim(); // 직급
            const monthlyRate = parseFloat(cells[1].textContent.replace(/,/g, '').trim()) || 0; // 월급
            const dailyRate = parseFloat(cells[2].textContent.replace(/,/g, '').trim()) || 0; // 일급
            const contractDate = cells[3]?.textContent.trim() || ''; // 계약 일자


            // 값이 있는 행만 추가
            if (position && monthlyRate > 0 && dailyRate > 0 && contractDate) {
                laborData.push({
                    position,
                    monthly_rate: monthlyRate,
                    daily_rate: dailyRate,
                    contract_date: contractDate
                });
            }
        });

        // 데이터가 없으면 함수 종료
        if (laborData.length === 0) {
            alert('저장할 외부 인력 단가 데이터가 없습니다.');
            return;
        }


        // API 호출
        const response = await fetch('/api/save_external_labor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contractcode: contractCode,
                data: laborData
            })
        });


        if (!response.ok) {
            throw new Error('저장에 실패했습니다.');
        }

        const result = await response.json();

        if (result.success) {
            alert('저장되었습니다.');
            reloadWithCurrentState();
        } else {
            throw new Error(result.message || '저장에 실패했습니다.');
        }
    } catch (error) {
        alert('저장 중 오류가 발생했습니다.');
    }
}

function calculateVATExcluded() {
    // 외주 금액 입력 필드
    const outsourceAmountInput = document.getElementById('outsource_amount');
    // VAT 제외 금액 출력 필드
    const vatExcludedInput = document.getElementById('outsource_amount_vat_excluded');

    // 외주 금액 값 가져오기
    const outsourceAmount = parseFloat(outsourceAmountInput.value.replace(/,/g, '')); // ',' 제거 후 숫자로 변환

    // 외주 금액이 유효한 숫자인 경우 VAT 제외 금액 계산
    if (!isNaN(outsourceAmount)) {
        const vatExcluded = Math.round(outsourceAmount / 1.1); // 반올림하여 정수로 변환
        vatExcludedInput.value = vatExcluded.toLocaleString(); // 콤마 추가하여 출력
    } else {
        vatExcludedInput.value = ''; // 유효하지 않으면 빈 값으로 설정
    }
}

//////////////////////////예상진행비 현황///////////////////////////
//////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////

//예상진행비 현황
async function updateFeetable() {

    const table = document.getElementById('EX_fee_table');
    if (!table) {
        console.warn("Element 'EX_fee_table' not found.");
        return;
    }


    // 부가세 제외 사업비 (숫자로 변환)
    const ProjectCost_NoVAT = parseFloat(
        document.getElementById('costNoVAT')?.value.replace(/[^0-9.-]/g, '') || 0
    );

    // 지분율 (백분율을 소수점으로 변환)
    const ContributionRate = parseFloat(document.getElementById('ContributionRate')?.textContent.replace(/[^0-9.-]/g, '') || 0) / 100;

    // 사업비(A) = ProjectCost_NoVAT * ContributionRate
    const BusinessCost_A = Math.round(ProjectCost_NoVAT * ContributionRate);

    const AcademicResearchRate = parseFloat(document.getElementById('AcademicResearchRate').value) || 0;
    const OperationalRate = parseFloat(document.getElementById('OperationalRate').value) || 0;
    const EquipmentRate = parseFloat(document.getElementById('EquipmentRate').value) || 0;

    //제경비 금액 산출
    const AcademicResearchRate_money = Math.round(BusinessCost_A * (AcademicResearchRate / 100)) //사전비용 금액
    const OperationalRate_money = Math.round(BusinessCost_A * (OperationalRate / 100)) // 운영비용 금액
    const EquipmentRate_money = Math.round(BusinessCost_A * (EquipmentRate / 100))// 공정비용 금액

    //제경비 소계
    const company_Money_Per = AcademicResearchRate + OperationalRate + EquipmentRate; //제경비 비율 합계
    const company_Money = AcademicResearchRate_money + OperationalRate_money + EquipmentRate_money; //제경비 금액 합계

    //검토 예상 자체 인건비
    const EX_fir_budget_money = Number(document.getElementById('fir_budgetSum').textContent.replace(/[^0-9.-]/g, '') || 0);
    const EX_sec_budget_money = Number(document.getElementById('sec_budgetSum').textContent.replace(/[^0-9.-]/g, '') || 0);

    //검토 예상 자체 경비
    const EX_fir_record = Number(document.getElementById('fir_recordSum').textContent.replace(/[^0-9.-]/g, '') || 0);
    const EX_sec_record = Number(document.getElementById('sec_recordSum').textContent.replace(/[^0-9.-]/g, '') || 0);

    //검토 예상 자체 인건비
    const EX_budget_sum = EX_fir_budget_money + EX_sec_budget_money; //인건비 합계
    const EX_budget_per = parseFloat(EX_budget_sum / BusinessCost_A) * 100 // 인건비 비율

    //검토 예상 자체 경비
    const EX_record_sum = EX_fir_record + EX_sec_record; //경비 합계
    const EX_record_per = parseFloat(EX_record_sum / BusinessCost_A) * 100 // 경비 비율

    //예상 실행 경비 소계, 합계, 영업 이익
    const EX_execution_money = EX_budget_sum + EX_record_sum; // 소계 금액
    const EX_execution_per = EX_budget_per + EX_record_per; // 소계 비율

    // <thead> 생성
    table.innerHTML = `
    <thead>
        <tr>
            <th colspan="2">구분</th>
            <th>비율</th>
            <th>금액</th>
        </tr>
    </thead>
    <tbody id="EX_fee_tbody">
        <tr>
            <td colspan="2" style="background-color: #d8f8ea;">사업비(지분율)(A)</td>
            <td colspan="2" style="background-color: #d8f8ea;">${BusinessCost_A.toLocaleString()}원</td>
        </tr>
        <tr>
            <td rowspan="4" style="width: 27%;">제경비(B)</td>
            <td style="width: 27%;">사전비용</td>
            <td>${AcademicResearchRate}%</td>
            <td>${AcademicResearchRate_money.toLocaleString()}원</td>
        </tr>
        <tr>
            <td>운영비용</td>
            <td>${OperationalRate}%</td>
            <td>${OperationalRate_money.toLocaleString()}원</td>
        </tr>
        <tr>
            <td>공정비용</td>
            <td>${EquipmentRate}%</td>
            <td>${EquipmentRate_money.toLocaleString()}원</td>
        </tr>
        <tr class="sub-total">
            <td style="background-color: #bae4ea;">소계</td>
            <td id = "EX_companyPer" style="background-color: #bae4ea;">${company_Money_Per.toFixed(3)}%</td>
            <td id = "EX_companyMoney" style="background-color: #bae4ea;">${company_Money.toLocaleString()}원</td>
        </tr>

        <tr>
            <td rowspan="3">직영 사업수행비(C)</td>
            <td>자체인건비</td>
            <td>${EX_budget_per.toFixed(3)}%</td>
            <td>${EX_budget_sum.toLocaleString()}원</td>
        </tr>

        <tr>
            <td>자체 경비</td>
            <td>${EX_record_per.toFixed(3)}%</td>
            <td>${EX_record_sum.toLocaleString()}원</td>
        </tr>

        <tr class="sub-total">
            <td style="background-color: #bae4ea;">소계</td>
            <td style="background-color: #bae4ea;">${EX_execution_per.toFixed(3)}%</td>
            <td style="background-color: #bae4ea;">${EX_execution_money.toLocaleString()}원</td>
        </tr>

        <tr id="outsourcing-insert-point"></tr>

        <tr class="total">
            <td colspan="2" style="background-color: #ebf7d3;">합 계(S2 = B + C + D)</td>
            <td id = "totalPer" style="background-color: #ebf7d3;"></td>
            <td id = "totalSum" style="background-color: #ebf7d3;"></td>
        </tr>

        <tr class="profit">
            <td colspan="2" style="background-color: #ebf7d3;">영업이익(A - S2)</td>
            <td id = "profitPer" style="background-color: #ebf7d3;"></td>
            <td id = "profitSum" style="background-color: #ebf7d3;"></td>
        </tr>
    </tbody>
`;

    // 외주 내용 삽입
    const tbody = document.getElementById('EX_fee_tbody');
    const insertPoint = document.getElementById('outsourcing-insert-point');

    //외주 행 생성 기다림
    const outsourcingRowsHtml = await generateOutsourcingRows(false);

    const tempContainer = document.createElement('tbody');
    tempContainer.innerHTML = outsourcingRowsHtml;

    Array.from(tempContainer.children).forEach(row => {
        tbody.insertBefore(row, insertPoint);
    });
    insertPoint.remove();

    //이후 계산 및 DOM 삽입도 이제 안정적으로 가능
    const outsourceTotalCostEl = document.getElementById("outsourceTotalCost");
    const outsourceTotalPerEl = document.getElementById("outsourceTotalPer");

    const outsourceTotalCost = parseInt(outsourceTotalCostEl?.textContent.replace(/[^0-9.-]/g, '') || '0');
    const outsourceTotalPer = parseFloat(outsourceTotalPerEl?.textContent.replace(/[^0-9.-]/g, '') || '0');

    //DOM 요소들
    const totalSum = document.getElementById('totalSum');
    const totalPer = document.getElementById('totalPer');
    const profitSum = document.getElementById('profitSum');
    const profitPer = document.getElementById('profitPer');

    //계산
    const execution_sum = company_Money + EX_execution_money + outsourceTotalCost;
    const execution_per_sum = company_Money_Per + EX_execution_per + outsourceTotalPer;

    const profit_money = BusinessCost_A - execution_sum;
    const profit_per = (profit_money / BusinessCost_A) * 100;
    const profit_color = profit_money > 0 ? "red" : "blue";

    //출력
    if (totalSum) totalSum.textContent = execution_sum.toLocaleString() + "원";
    if (totalPer) totalPer.textContent = execution_per_sum.toFixed(3) + "%";

    if (profitSum) {
        profitSum.style.color = profit_color;
        profitSum.textContent = profit_money.toLocaleString() + "원";
    }
    if (profitPer) {
        profitPer.style.color = profit_color;
        profitPer.textContent = profit_per.toFixed(3) + "%";
    }

    return {
        outsourceTotalCost,
    };
}

// 외주 행 생성 함수
function generateOutsourcingRows(flag = false) {
    const contractCode = document.getElementById('project-contractCode').value;
    if (!contractCode) return Promise.resolve('');

    let ex_performance = 0;
    let real_performance = 0;

    // 성과심사비 분기
    const performanceData = Array.isArray(performance_result?.filtered_data)
        ? performance_result.filtered_data
        : [];

    performanceData.forEach(item => {
        switch (item.description) {
            case "당초 내역서":
                ex_performance = item.amount;
                break;
            case "변경 내역서":
            case "실납부액":
                real_performance = item.amount;
                break;
            case "발주처 납부":
            case "성과심사 없음":
                ex_performance = item.amount;
                real_performance = item.amount;
                break;
        }
    });

    let projectCostNoVAT = flag
        ? parseFloat(document.getElementById('ProjectCost_NoVAT')?.textContent.replace(/[^0-9.-]/g, '') || 0)
        : parseFloat(document.getElementById('costNoVAT')?.value.replace(/[^0-9.-]/g, '') || 0);

    const contributionRate = parseFloat(
        document.getElementById('ContributionRate')?.textContent.replace(/[^0-9.-]/g, '') || 0
    ) / 100;

    const BusinessCost_A = Math.round(projectCostNoVAT * contributionRate);

    return fetch(`/get_outsourcingCompanyList?contract_code=${contractCode}&flag=${flag}`)
        .then(response => response.json())
        .then(data => {
            let rowsHtml = '';
            const allItems = data.outsourcing_items || [];
            const items = flag ? allItems : allItems.filter(entry => entry.type !== '추가 제안');
            const idPrefix = flag ? "Real_" : "";

            let totalOutsourceCost = 0;
            const rowCount = items.length;

            if (items.length === 0) {
                // 외주 없음 + 성과심사비 (rowspan 시작 포함)
                const performanceCost = flag ? real_performance : ex_performance;
                const performancePercent = BusinessCost_A ? ((performanceCost / BusinessCost_A) * 100).toFixed(3) : '0.000';
                const totalCost = performanceCost;
                const totalPercent = performancePercent;

                rowsHtml += `
                    <tr>
                        <td rowspan="3">기타 경비(D)</td>
                        <td colspan="3" style="text-align:center;">외주 없음</td>
                    </tr>
                    <tr>
                        <td>성과심사비</td>
                        <td>${performancePercent}%</td>
                        <td>${performanceCost.toLocaleString()}원</td>
                    </tr>
                    <tr class="sub-total">
                        <td style="background-color: #bae4ea;">소계</td>
                        <td id="${idPrefix}outsourceTotalPer" style="background-color: #bae4ea;">${totalPercent}%</td>
                        <td id="${idPrefix}outsourceTotalCost" style="background-color: #bae4ea;">${totalCost.toLocaleString()}원</td>
                    </tr>
                `;
            } else {
                // 외주 있음
                items.forEach((entry, idx) => {
                    const company = entry.company || '외주';
                    const cost = parseFloat(entry.cost || 0);
                    const percent = BusinessCost_A ? ((cost / BusinessCost_A) * 100).toFixed(3) : '0.000';
                    totalOutsourceCost += cost;

                    if (idx === 0) {
                        rowsHtml += `
                            <tr>
                                <td rowspan="${rowCount + 2}">기타 경비(D)</td>
                                <td>${company}</td>
                                <td>${percent}%</td>
                                <td>${cost.toLocaleString()}원</td>
                            </tr>
                        `;
                    } else {
                        rowsHtml += `
                            <tr>
                                <td>${company}</td>
                                <td>${percent}%</td>
                                <td>${cost.toLocaleString()}원</td>
                            </tr>
                        `;
                    }
                });

                const performanceCost = flag ? real_performance : ex_performance;
                const performancePercent = BusinessCost_A ? ((performanceCost / BusinessCost_A) * 100).toFixed(3) : '0.000';

                // 성과심사비 행
                rowsHtml += `
                    <tr>
                        <td>성과심사비</td>
                        <td>${performancePercent}%</td>
                        <td>${performanceCost.toLocaleString()}원</td>
                    </tr>
                `;

                // 소계 행
                const totalCost = totalOutsourceCost + performanceCost;
                const totalPercent = BusinessCost_A ? ((totalCost / BusinessCost_A) * 100).toFixed(3) : '0.000';

                rowsHtml += `
                    <tr class="sub-total">
                        <td style="background-color: #bae4ea;">소계</td>
                        <td id="${idPrefix}outsourceTotalPer" style="background-color: #bae4ea;">${totalPercent}%</td>
                        <td id="${idPrefix}outsourceTotalCost" style="background-color: #bae4ea;">${totalCost.toLocaleString()}원</td>
                    </tr>
                `;
            }

            return rowsHtml;
        })
        .catch(error => {
            console.error('외주 리스트 가져오기 실패:', error);
            return '';
        });
}

//실제 진행비 현황
async function updateActualFeetable() {
    const table = document.getElementById('actual_fee_table');
    if (!table) {
        console.warn("Element 'actual_fee_table' not found.");
        return;
    }
    table.innerHTML = '';
    // 부가세 제외 사업비 (숫자로 변환)
    const ProjectCost_NoVAT = parseFloat(
        document.getElementById('ProjectCost_NoVAT')?.textContent.replace(/[^0-9.-]/g, '') || 0
    );
    // 지분율 (백분율을 소수점으로 변환)
    const ContributionRate = parseFloat(document.getElementById('ContributionRate')?.textContent.replace(/[^0-9.-]/g, '') || 0) / 100;
    // 사업비(A) = ProjectCost_NoVAT * ContributionRate
    const BusinessCost_A = Math.round(ProjectCost_NoVAT * ContributionRate);

    // 실제 제경비 값
    const AcademicResearchRate = parseFloat(document.getElementById('AcademicResearchRate').value) || 0;
    const OperationalRate = parseFloat(document.getElementById('OperationalRate').value) || 0;
    const EquipmentRate = parseFloat(document.getElementById('EquipmentRate').value) || 0;

    // 제경비 금액 산출
    const Real_AcademicResearchRate_money = Math.round(BusinessCost_A * (AcademicResearchRate / 100));
    const Real_OperationalRate_money = Math.round(BusinessCost_A * (OperationalRate / 100));
    const Real_EquipmentRate_money = Math.round(BusinessCost_A * (EquipmentRate / 100));

    // 제경비 소계
    const Real_company_Money_Per = AcademicResearchRate + OperationalRate + EquipmentRate;
    const Real_company_Money = Real_AcademicResearchRate_money + Real_OperationalRate_money + Real_EquipmentRate_money;

    // 실제 자체 인건비
    const Real_budget_money = Number(document.getElementById('Real_budgetSum').textContent.replace(/[^0-9.-]/g, '') || 0);
    const Real_budget_per = (Real_budget_money / BusinessCost_A) * 100;

    // 실제 자체 경비
    const Real_record_money = Number(document.getElementById('Real_recordSum').textContent.replace(/[^0-9.-]/g, '') || 0);
    const Real_record_per = (Real_record_money / BusinessCost_A) * 100;

    // 실제 실행 경비 소계
    const Real_execution_money = Real_budget_money + Real_record_money;
    const Real_execution_per = Real_budget_per + Real_record_per;



    // <thead> 생성
    table.innerHTML = `
        <thead>
            <tr>
                <th colspan="2">구분</th>
                <th>비율</th>
                <th>금액</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td colspan="2" style="background-color: #d8f8ea;">사업비(A)</td>
                <td colspan="2" style="background-color: #d8f8ea;" id = "ContributionCost">${BusinessCost_A.toLocaleString()}원</td>
            </tr>
            <tr>
                <td rowspan="4">제경비(B)</td>
                <td>사전비용</td>
                <td>${AcademicResearchRate.toFixed(3)}%</td>
                <td>${Real_AcademicResearchRate_money.toLocaleString()}원</td>
            </tr>
            <tr>
                <td>운영비용</td>
                <td>${OperationalRate.toFixed(3)}%</td>
                <td>${Real_OperationalRate_money.toLocaleString()}원</td>
            </tr>
            <tr>
                <td>공정비용</td>
                <td>${EquipmentRate.toFixed(3)}%</td>
                <td>${Real_EquipmentRate_money.toLocaleString()}원</td>
            </tr>
            <tr class="sub-total">
                <td style="background-color: #bae4ea;">소계</td>
                <td id = "REAL_companyPer" style="background-color: #bae4ea;">${Real_company_Money_Per.toFixed(3)}%</td>
                <td id = "REAL_companyMoney" style="background-color: #bae4ea;">${Real_company_Money.toLocaleString()}원</td>
            </tr>
            <tr>
                <td rowspan="3">직영 사업수행비(C)</td>
                <td>자체 인건비</td>
                <td>${Real_budget_per.toFixed(3)}%</td>
                <td>${Real_budget_money.toLocaleString()}원</td>
            </tr>
            <tr>
                <td>자체 경비</td>
                <td>${Real_record_per.toFixed(3)}%</td>
                <td>${Real_record_money.toLocaleString()}원</td>
            </tr>
            
            <tr class="sub-total">
                <td style="background-color: #bae4ea;">소계</td>
                <td style="background-color: #bae4ea;">${Real_execution_per.toFixed(3)}%</td>
                <td style="background-color: #bae4ea;">${Real_execution_money.toLocaleString()}원</td>
            </tr>

            <tr id="Real_outsourcing-insert-point"></tr>

            <tr class="total">
                <td colspan="2" style="background-color: #ebf7d3;">합 계(S2 = B + C + D)</td>
                <td id = "Real_totalPer" style="background-color: #ebf7d3;"></td>
                <td id = "Real_totalSum" style="background-color: #ebf7d3;"></td>
            </tr>

            <tr class="profit">
                <td colspan="2" style="background-color: #ebf7d3;">영업이익(A - S2)</td>
                <td id = "Real_profitPer" style="background-color: #ebf7d3;"></td>
                <td id = "Real_profitSum" style="background-color: #ebf7d3;"></td>
            </tr>
        </tbody>
    `;
    // 외주 내용 삽입
    const tbody = document.getElementById('actual_fee_table').querySelector('tbody');
    const insertPoint = document.getElementById('Real_outsourcing-insert-point');

    //외주 행 생성 기다림
    const outsourcingRowsHtml = await generateOutsourcingRows(true);

    const tempContainer = document.createElement('tbody');
    tempContainer.innerHTML = outsourcingRowsHtml;

    Array.from(tempContainer.children).forEach(row => {
        tbody.insertBefore(row, insertPoint);
    });
    insertPoint.remove();

    //DOM 요소에서 값 꺼내기
    const outsourceTotalCostEl = document.getElementById("Real_outsourceTotalCost");
    const outsourceTotalPerEl = document.getElementById("Real_outsourceTotalPer");

    const outsourceTotalCost = Number(outsourceTotalCostEl?.textContent.replace(/[^0-9.-]/g, '') || 0);
    const outsourceTotalPer = Number(outsourceTotalPerEl?.textContent.replace(/[^0-9.-]/g, '') || 0);

    //DOM 요소들
    const totalSum = document.getElementById('Real_totalSum');
    const totalPer = document.getElementById('Real_totalPer');
    const profitSum = document.getElementById('Real_profitSum');
    const profitPer = document.getElementById('Real_profitPer');

    //계산
    const execution_sum = Real_company_Money + Real_execution_money + outsourceTotalCost;
    const execution_per_sum = Real_company_Money_Per + Real_execution_per + outsourceTotalPer;

    const profit_money = BusinessCost_A - execution_sum;
    const profit_per = (profit_money / BusinessCost_A) * 100;
    const profit_color = profit_money > 0 ? "red" : "blue";

    //출력
    if (totalSum) totalSum.textContent = execution_sum.toLocaleString() + "원";
    if (totalPer) totalPer.textContent = execution_per_sum.toFixed(3) + "%";

    if (profitSum) {
        profitSum.style.color = profit_color;
        profitSum.textContent = profit_money.toLocaleString() + "원";
    }
    if (profitPer) {
        profitPer.style.color = profit_color;
        profitPer.textContent = profit_per.toFixed(3) + "%";
    }

    return {
        outsourceTotalCost,
    };
}

//통계
async function generateComparisonTable() {
    // 예상 진행비 업데이트
    const expectedOutsource = await updateFeetable();
    // 실제 진행비 업데이트
    const actualOutsource = await updateActualFeetable();

    // 테이블의 tbody 요소 가져오기
    const table = document.getElementById('comparison_Table');
    table.innerHTML = ''; // 기존 데이터 초기화

    const expectedtable = document.getElementById('EX_fee_table')
    const actualtable = document.getElementById('actual_fee_table')

    // 예상 데이터
    const expectedData = {
        projectCost: Number(expectedtable.querySelector('tbody tr:nth-child(1) td:nth-child(2)').textContent.replace(/[^0-9.-]/g, '')),
        academicResearch: Number(expectedtable.querySelector('tbody tr:nth-child(2) td:nth-child(4)').textContent.replace(/[^0-9.-]/g, '')),
        operationalCost: Number(expectedtable.querySelector('tbody tr:nth-child(3) td:nth-child(3)').textContent.replace(/[^0-9.-]/g, '')),
        equipmentCost: Number(expectedtable.querySelector('tbody tr:nth-child(4) td:nth-child(3)').textContent.replace(/[^0-9.-]/g, '')),
        budget: Number(expectedtable.querySelector('tbody tr:nth-child(6) td:nth-child(4)').textContent.replace(/[^0-9.-]/g, '')),
        records: Number(expectedtable.querySelector('tbody tr:nth-child(7) td:nth-child(3)').textContent.replace(/[^0-9.-]/g, '')),
        outsourcing: expectedOutsource.outsourceTotalCost,
        performance: 0
    };
    //실제 데이터
    const actualData = {
        projectCost: Number(actualtable.querySelector('tbody tr:nth-child(1) td:nth-child(2)').textContent.replace(/[^0-9.-]/g, '')),
        academicResearch: Number(actualtable.querySelector('tbody tr:nth-child(2) td:nth-child(4)').textContent.replace(/[^0-9.-]/g, '')),
        operationalCost: Number(actualtable.querySelector('tbody tr:nth-child(3) td:nth-child(3)').textContent.replace(/[^0-9.-]/g, '')),
        equipmentCost: Number(actualtable.querySelector('tbody tr:nth-child(4) td:nth-child(3)').textContent.replace(/[^0-9.-]/g, '')),
        budget: Number(actualtable.querySelector('tbody tr:nth-child(6) td:nth-child(4)').textContent.replace(/[^0-9.-]/g, '')),
        records: Number(actualtable.querySelector('tbody tr:nth-child(7) td:nth-child(3)').textContent.replace(/[^0-9.-]/g, '')),
        outsourcing: actualOutsource.outsourceTotalCost,
        performance: 0
    };
    const comparisonPerformanceData = Array.isArray(performance_result?.filtered_data)
        ? performance_result.filtered_data
        : [];

    comparisonPerformanceData.forEach(item => {
        switch (item.description) {
            case "당초 내역서":
                expectedData.performance = item.amount;
                break;
            case "변경 내역서":
            case "실납부액":
                actualData.performance = item.amount;
                break;
            case "발주처 납부":
            case "성과심사 없음":
                expectedData.performance = item.amount;
                actualData.performance = item.amount;
                break;
        }
    });

    expectedData.outsourcing = expectedOutsource.outsourceTotalCost - expectedData.performance; // 성과심사비를 제외한 외주 비용
    actualData.outsourcing = actualOutsource.outsourceTotalCost - actualData.performance;

    //예상 소계 계산
    const expectedSumData = {
        companyMoney: expectedData.academicResearch + expectedData.operationalCost + expectedData.equipmentCost,
        executionSum: expectedData.budget + expectedData.records,
        otherRecords: expectedData.outsourcing + expectedData.performance, //성과심사비 추가

    };
    //예상 총계, 영업 이익, 이익율
    const EXtotalMoney = expectedSumData.companyMoney + expectedSumData.executionSum + expectedSumData.otherRecords; // 총계 S = B+C+D
    const EXprofit_money = expectedData.projectCost - EXtotalMoney; //영업이익 A - S
    const EXprofit_per = (EXprofit_money / expectedData.projectCost) * 100;

    //실제 소계 계산
    const actualSumData = {
        companyMoney: actualData.academicResearch + actualData.operationalCost + actualData.equipmentCost,
        executionSum: actualData.budget + actualData.records,
        otherRecords: actualData.outsourcing + actualData.performance, //성과심사비 추가

    };
    //실제 총계, 영업 이익, 이익율
    const actualtotalMoney = actualSumData.companyMoney + actualSumData.executionSum + actualSumData.otherRecords; // 총계 S = B+C+D
    const actualprofit_money = actualData.projectCost - actualtotalMoney; //영업이익 A - S
    const actualprofit_per = (actualprofit_money / actualData.projectCost) * 100;

    // 차액 계산
    const differenceData = {
        projectCost: actualData.projectCost - expectedData.projectCost,
        academicResearch: actualData.academicResearch - expectedData.academicResearch,
        operationalCost: actualData.operationalCost - expectedData.operationalCost,
        equipmentCost: actualData.equipmentCost - expectedData.equipmentCost,
        budget: actualData.budget - expectedData.budget,
        records: actualData.records - expectedData.records,
        outsourcing: actualData.outsourcing - expectedData.outsourcing,
        performance: actualData.performance - expectedData.performance,
    };
    const differencecompanyMoney = actualSumData.companyMoney - expectedSumData.companyMoney;
    const differenceexecutionSum = actualSumData.executionSum - expectedSumData.executionSum;
    const differenceotherRecords = actualSumData.otherRecords - expectedSumData.otherRecords;
    const differencetotalMoney = actualtotalMoney - EXtotalMoney;
    const differenceprofit_money = actualprofit_money - EXprofit_money;

    //손익 글씨 색상
    const differenceData_Cost_color = differenceData.projectCost > 0 ? "red" : "blue";
    const differenceData_companyMoney_color = differencecompanyMoney < 0 ? "red" : "blue";
    const differenceData_executionSum_color = differenceexecutionSum < 0 ? "red" : "blue";
    const differenceData_otherRecords_color = differenceotherRecords < 0 ? "red" : "blue";
    const differenceData_total_color = differencetotalMoney < 0 ? "red" : "blue";
    const differenceData_profit_color = differenceprofit_money > 0 ? "red" : "blue";

    // 데이터를 테이블에 삽입
    table.innerHTML = `
    <thead>
        <tr>
            <th colspan="5">통계</th>
        </tr>
        <tr>
            <th colspan="2">구분</th>
            <th>예상</th>
            <th>실제</th>
            <th>차액</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td colspan="2" style="background-color: #d8f8ea;">사업비(A)</td>
            <td id = "EX_projectCost" style="background-color: #d8f8ea; width: 20%;">${expectedData.projectCost.toLocaleString()}원</td>
            <td id = "REAL_projectCost" style="background-color: #d8f8ea; width: 20%;">${actualData.projectCost.toLocaleString()}원</td>
            <td style="background-color: #d8f8ea; width: 20%; color: ${differenceData_Cost_color}">${differenceData.projectCost.toLocaleString()}원</td>
        </tr>
        <tr>
            <td rowspan="4">제경비(B)</td>
            <td>사전비용</td>
            <td>${expectedData.academicResearch.toLocaleString()}원</td>
            <td>${actualData.academicResearch.toLocaleString()}원</td>
            <td>${differenceData.academicResearch.toLocaleString()}원</td>
        </tr>
        <tr>
            <td>운영비용</td>
            <td>${expectedData.operationalCost.toLocaleString()}원</td>
            <td>${actualData.operationalCost.toLocaleString()}원</td>
            <td>${differenceData.operationalCost.toLocaleString()}원</td>
        </tr>
        <tr>
            <td>공정비용</td>
            <td>${expectedData.equipmentCost.toLocaleString()}원</td>
            <td>${actualData.equipmentCost.toLocaleString()}원</td>
            <td>${differenceData.equipmentCost.toLocaleString()}원</td>
        </tr>
        <tr class="sub-total">
            <td style="background-color: #bae4ea;">소계</td>
            <td style="background-color: #bae4ea;">${expectedSumData.companyMoney.toLocaleString()}원</td>
            <td style="background-color: #bae4ea;">${actualSumData.companyMoney.toLocaleString()}원</td>
            <td style="background-color: #bae4ea; color: ${differenceData_Cost_color}">${differencecompanyMoney.toLocaleString()}원</td>
        </tr>

        <tr>
            <td rowspan="3">자체 실행 경비(C)</td>
            <td>자체 인건비</td>
            <td>${expectedData.budget.toLocaleString()}원</td>
            <td>${actualData.budget.toLocaleString()}원</td>
            <td>${differenceData.budget.toLocaleString()}원</td>
        </tr>
        <tr>
            <td>자체 경비</td>
           <td>${expectedData.records.toLocaleString()}원</td>
            <td>${actualData.records.toLocaleString()}원</td>
            <td>${differenceData.records.toLocaleString()}원</td>
        </tr>
        <tr class="sub-total">
             <td style="background-color: #bae4ea;">소계</td>
            <td style="background-color: #bae4ea;">${expectedSumData.executionSum.toLocaleString()}원</td>
            <td style="background-color: #bae4ea;">${actualSumData.executionSum.toLocaleString()}원</td>
            <td style="background-color: #bae4ea; color: ${differenceData_executionSum_color}">${differenceexecutionSum.toLocaleString()}원</td>
        </tr>


        <tr>
            <td rowspan="3">기타 경비(D)</td>
            <td>외주 경비</td>
            <td>${expectedData.outsourcing.toLocaleString()}원</td>
            <td>${actualData.outsourcing.toLocaleString()}원</td>
            <td>${differenceData.outsourcing.toLocaleString()}원</td>
        </tr>
        <tr>
            <td>성과심사비</td>
            <td>${expectedData.performance.toLocaleString()}원</td>
            <td>${actualData.performance.toLocaleString()}원</td>
            <td>${differenceData.performance.toLocaleString()}원</td>
        </tr>

        <tr class="sub-total">
             <td style="background-color: #bae4ea;">소계</td>
            <td style="background-color: #bae4ea;">${expectedSumData.otherRecords.toLocaleString()}원</td>
            <td style="background-color: #bae4ea;">${actualSumData.otherRecords.toLocaleString()}원</td>
            <td style="background-color: #bae4ea; color: ${differenceData_otherRecords_color} ">${differenceotherRecords.toLocaleString()}원</td>
        </tr>
        <tr class="total">
            <td colspan="2" style="background-color: #ebf7d3;">합계(S = B + C + D)</td>
            <td id = "EX_totalSum" style="background-color: #ebf7d3;">${EXtotalMoney.toLocaleString()}원</td>
            <td id = "REAL_totalSum" style="background-color: #ebf7d3;">${actualtotalMoney.toLocaleString()}원</td>
            <td style="background-color: #ebf7d3; color: ${differenceData_total_color} ">${differencetotalMoney.toLocaleString()}원</td>
        </tr>
        <tr class="profit">
            <td colspan="2" style="background-color: #ebf7d3;">영업이익(A - S)</td>
            <td id = "EX_profitMoney" style="background-color: #ebf7d3;">${EXprofit_money.toLocaleString()}원</td>
            <td id = "REAL_profitMoney" style="background-color: #ebf7d3;">${actualprofit_money.toLocaleString()}원</td>
            <td style="background-color: #ebf7d3; color: ${differenceData_profit_color} ">${differenceprofit_money.toLocaleString()}원</td>
        </tr>
        <tr class="profit">
            <td colspan="2" style="background-color: #ebf7d3;">이익율</td>
            <td id = "EX_profitPer" style="background-color: #ebf7d3;">${EXprofit_per.toFixed(3)}%</td>
            <td id = "REAL_profitPer" style="background-color: #ebf7d3;">${actualprofit_per.toFixed(3)}%</td>
            <td style="background-color: #ebf7d3;"></td>
        </tr>
    </tbody>
`;
    createCharts();
    makeresult();
}



// 경비 상세보기 기능
function recordsDetail(button, dep) {
    const row = button.closest("tr"); // 클릭된 버튼이 속한 행
    const account = row.dataset.account; // 해당 행의 account 정보
    const tbody = row.parentElement; // 테이블 tbody
    const nextRow = row.nextElementSibling;
    let details;
    // 이미 상세 행이 존재하면 삭제 (토글 기능)
    if (nextRow && nextRow.classList.contains("detail-row")) {
        nextRow.remove();
        button.textContent = "▼"; // 버튼을 다시 ▼로 변경
        return;
    }
    // 해당 account에 맞는 상세 데이터 필터링
    if (dep === 'fir') {
        details = firstRecords.filter(record => record[1] === account);
    }
    else if (dep === 'sec') {
        details = secondRecords.filter(record => record[1] === account);
    }
    else {
        details = [];
    }

    if (details.length > 0) {
        let detailHtml = `
            <tr class="detail-row">
                <td colspan="7">
                    <table class="custom-table">
                        <thead>
                            <tr>
                               <th style="width: 30%;">항 목</th>
                                <th style="width: 5%;">인 원</th>
                                <th style="width: 5%;">횟 수</th>
                                <th style="width: 5%;">일 수</th>
                                <th style="width: 15%;">단 가</th>
                                <th style="width: 25%;">금 액</th>
                                <th style="width: 25%;">비 고</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        details.forEach(detail => {
            detailHtml += `
                <tr>
                    <td>${detail[1]}</td> <!-- account -->
                    <td>${detail[3]}</td> <!-- 인원 -->
                    <td>${detail[4]}</td> <!-- 횟수 -->
                    <td>${detail[7]}</td> <!-- 일수 -->
                    <td>${parseInt(detail[8]).toLocaleString()}</td> <!-- 단가 -->
                    <td>${parseInt(detail[5]).toLocaleString()}</td> <!-- 금액 -->
                    <td>${detail[9] || ''}</td> <!-- 비고 -->
                </tr>
            `;
        });

        detailHtml += `</tbody></table></td></tr>`;

        row.insertAdjacentHTML("afterend", detailHtml);
        button.textContent = "▲"; // 버튼을 ▲로 변경
    }
}

//  긴 텍스트 줄이기 & 괄호 안의 내용 유지
function truncateText(text, maxLength = 25) {
    if (!text) return "-";

    // 괄호 안의 내용 추출
    const match = text.match(/\(.*?\)$/);
    const bracketContent = match ? match[0] : ""; // 예: (3차)

    // 괄호 제외한 본문 길이 계산
    const mainText = match ? text.replace(bracketContent, "").trim() : text;

    // maxLength보다 길면 "..." 처리하고, 괄호 내용 추가
    if (mainText.length > maxLength) {
        return mainText.substring(0, maxLength) + "..." + bracketContent;
    }

    return text;
}
//공통 파일 처리 함수
async function uploadFilesToServer(files) {
    try {
        const formData = new FormData();
        const contractCode = document.getElementById('project-contractCode').value;

        for (let file of files) {
            formData.append('files', file);
        }
        formData.append('contractCode', contractCode);

        const response = await fetch('/upload_files', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            alert('파일이 성공적으로 업로드되었습니다.');
            await updateFileList(); // 필요 시 구현하세요
        } else {
            alert(result.message || '파일 업로드에 실패했습니다.');
        }
    } catch (error) {
        console.error('[ERROR] Upload error:', error);
        alert('파일 업로드 중 오류가 발생했습니다.');
    }
}

//드래그앤드랍 & input 통합 함수
function initFileUpload({ dropZoneId, inputId, outputId }) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(inputId);
    const output = document.getElementById(outputId);

    function handleFiles(files) {
        Array.from(files).forEach(file => {
            const fileItem = document.createElement("div");
            fileItem.textContent = file.name;
            output.appendChild(fileItem);
        });

        uploadFilesToServer(files); // 서버 업로드
    }

    // input 파일 선택
    fileInput.addEventListener("change", (e) => {
        handleFiles(e.target.files);
    });

    // 드래그 이벤트
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#007bff";
    });

    dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#ccc";
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#ccc";
        const files = e.dataTransfer.files;
        handleFiles(files);
    });
}

//파일 업로드 input 직접 클릭 시 리스너
function setupFileUploadListener() {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (this.files.length > 0) {
                // 이미 initFileUpload에 위임되었지만 안전하게 중복 호출 방지
            }
        });
    }
}

//실시간 진행비 수정 기능 함수
function saveEditTable() {

    const btns = document.getElementsByClassName("tablinks");
    for (let i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute("onclick")?.includes("Dep_fir_Money")) {
            openTab({ currentTarget: btns[i] }, 'Dep_fir_Money');
            break;
        }
    }

    const MoneyTable = document.getElementById('Dep_fir_Specific_data');

    document.getElementById('useMoney_Save').style.display = 'block'
    document.getElementById('BTN_Box').style.display = 'block'
    enableTdEditing("Dep_fir_Budget_data");

    const rows = MoneyTable.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');

        //0열: 경비항목 select 추가 (에러 방지 조건 포함)
        if (cells[0] && !cells[0].querySelector('select')) {
            const originalText = cells[0].textContent.trim();
            const select = document.createElement('select');
            const options = [
                '선택하세요.',
                '복리후생비/식대', '복리후생비/음료 외',
                '여비교통비/(출장)숙박', '여비교통비/주차료', '여비교통비/대중교통',
                '소모품비/현장물품', '소모품비/기타소모품',
                '차량유지비/주유', '차량유지비/차량수리 외',
                '도서인쇄비/출력 및 제본', '운반비/등기우편 외',
                '지급수수료/증명서발급', '기타/그 외 기타'
            ];

            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (opt === originalText) option.selected = true;
                select.appendChild(option);
            });

            // 변경 시 내역 자동 반영
            select.onchange = function () {
                const val = this.value;
                const map = {
                    '복리후생비/식대': '식대',
                    '복리후생비/음료 외': '음료 외',
                    '여비교통비/(출장)숙박': '(출장)숙박',
                    '여비교통비/주차료': '주차료',
                    '여비교통비/대중교통': '대중교통',
                    '소모품비/현장물품': '현장물품',
                    '소모품비/기타소모품': '기타소모품',
                    '차량유지비/주유': '주유',
                    '차량유지비/차량수리 외': '차량수리 외',
                    '도서인쇄비/출력 및 제본': '출력 및 제본',
                    '운반비/등기우편 외': '등기우편 외',
                    '지급수수료/증명서발급': '증명서발급',
                    '기타/그 외 기타': '그 외 기타'
                };
                if (cells[2]) cells[2].textContent = map[val] || '';
            };

            cells[0].textContent = '';
            cells[0].appendChild(select);
        }

        // 1열: 카드/현금 select 추가
        if (!cells[1].querySelector('select')) {
            const originalText = cells[1].textContent.trim();
            const select = document.createElement('select');
            ['카드', '현금'].forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (opt === originalText) option.selected = true;
                select.appendChild(option);
            });

            cells[1].textContent = '';
            cells[1].appendChild(select);
        }

        // 5열: 금액 입력 td에 inputMoney 이벤트 부여
        if (cells[5]) {
            cells[5].onclick = function () {
                inputMoney(this);
            };
        }

        // 4, 5열: id 설정
        if (cells[3]) cells[3].id = 'duty';
        if (cells[4]) cells[4].id = 'NoVAT';
    });

}

function saveProjectStatus() {
    const selectedStatus = document.querySelector('input[name="project_status"]:checked').value;
    const contractCode = document.getElementById('project-contractCode').value;
    let statusToSend = selectedStatus;

    // 준공이면 연도 select 값 붙이기
    if (selectedStatus === '준공') {
        const yearSelect = document.getElementById('year_select');
        const selectedYear = yearSelect.value;
        if (selectedYear) {
            statusToSend = `준공(${selectedYear.slice(-2)})`; // '준공(25)' 형태
        }
    }

    if (!contractCode || !statusToSend) {
        alert("프로젝트 코드 또는 상태가 유효하지 않습니다.");
        return;
    }

    fetch('/update_project_status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contractCode: contractCode,
            project_status: statusToSend
        })
    })
        .then(response => response.json())
        .then((data) => {
            if (data.success) {
                alert('프로젝트 현황이 성공적으로 저장되었습니다.');
                reloadWithCurrentState();
            } else {
                alert("현황 저장 실패: " + (data.message || '알 수 없는 오류'));
            }
        })
        .catch(error => {
            console.error('에러 발생:', error);
            alert("서버 통신 중 문제가 발생했습니다.");
        });
}

function removeCheckedRows(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        const checkboxCell = row.querySelector('td input[type="checkbox"]');
        if (checkboxCell && checkboxCell.checked) {
            row.remove();
        }
    });

    // 체크된 행 모두 제거 후, 남은 행이 없으면 1개 추가
    const remainingRows = tbody.querySelectorAll('tr');
    if (remainingRows.length === 0) {
        if (tbodyId === 'outsourcing_moneyPayment_tbody') {
            // 외주 지급 테이블은 전용 행 생성기를 사용
            addMoneyPaymentRow();
        } else {
            addRows(tbodyId, 1);
        }
    }
}


// tr에 우클릭 이벤트 바인딩
function enableRowContextMenu(tbodyId) {
    const rows = document.querySelectorAll(`#${tbodyId} tr`);
    rows.forEach(row => {
        row.oncontextmenu = function (e) {
            e.preventDefault();
            contextTargetRow = this;

            const menu = document.getElementById('contextMenu');
            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
        };
    });
}

// 삽입 실행
function insertRowAtContextTarget(position) {
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'none';

    if (!contextTargetRow) return;

    const newRow = createEmptyTaskRow();  // 행 생성 함수
    const parent = contextTargetRow.parentNode;

    if (position === 'above') {
        parent.insertBefore(newRow, contextTargetRow);
    } else if (position === 'below') {
        parent.insertBefore(newRow, contextTargetRow.nextSibling);
    }
}

function createEmptyTaskRow() {
    const tr = document.createElement('tr');

    // 체크박스 열
    const tdCheck = document.createElement('td');
    tdCheck.style.textAlign = 'center';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    tdCheck.appendChild(checkbox);
    tr.appendChild(tdCheck);

    // 항목, 수량, 단위 열
    for (let i = 0; i < 3; i++) {
        const td = document.createElement('td');
        td.className = 'edit_cell';
        td.style.height = '13px';
        td.onclick = function () {
            TextChange(this, i !== 1);  // 수량 칸은 숫자만 허용 시 true
        };
        tr.appendChild(td);
    }

    return tr;
}

function deleteProject() {
    if (!confirm('정말로 이 프로젝트와 관련된 모든 데이터를 삭제하시겠습니까?\n(복구가 불가능 합니다.)')) return;


    const contractCode = document.getElementById('project-contractCode').value;
    fetch(`/api/delete_project/${encodeURIComponent(contractCode)}`, {
        method: 'DELETE'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('프로젝트 및 관련 데이터가 삭제되었습니다.');
                // 필요하다면 메인 페이지 등으로 이동
                location.href = '/';
            } else {
                alert('삭제 실패: ' + (data.message || '알 수 없는 오류'));
            }
        })
        .catch(err => {
            console.error(err);
            alert('서버 오류로 삭제에 실패했습니다.');
        });
}

function makeYear() {
    const select = document.getElementById('year_select');
    const thisYear = new Date().getFullYear();
    for (let y = thisYear; y >= 2000; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + '년';
        select.appendChild(opt);
    }
}

function makeresult() {
    const table = document.getElementById('result_tbody');

    //사업비
    const EXprojectCost = document.getElementById('EX_projectCost').textContent
    const REALprojectCost = document.getElementById('REAL_projectCost').textContent

    //사업진행비 합계
    const EXtotalSum = document.getElementById('EX_totalSum').textContent
    const REALtotalSum = document.getElementById('REAL_totalSum').textContent

    //영업이익
    const EXprofitMoney = document.getElementById('EX_profitMoney').textContent
    const REALprofitMoney = document.getElementById('REAL_profitMoney').textContent

    //이익율
    const EXprofitPer = document.getElementById('EX_profitPer').textContent
    const REALprofitPer = document.getElementById('REAL_profitPer').textContent

    //제경비 금액
    const EXcompanyMoney = document.getElementById('EX_companyMoney').textContent
    const REALcompanyMoney = document.getElementById('REAL_companyMoney').textContent

    //제경비 비율
    const EXcompanyPer = document.getElementById('EX_companyPer').textContent
    const REALcompanyPer = document.getElementById('REAL_companyPer').textContent

    // (추가) 숫자 변환 & 클래스 결정 유틸
    const toNumber = (s) => {
        const n = parseFloat(String(s).replace(/[^\d.-]/g, '')); // 쉼표/원/% 제거
        return isNaN(n) ? 0 : n;
    };
    const signClass = (v) => v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';

    // (추가) 영업이익 수치값
    //영업이익금 및 이익률
    const EXprofitMoneyVal = toNumber(EXprofitMoney);
    const EXprofitPerVal = toNumber(EXprofitPer);

    const REALprofitMoneyVal = toNumber(REALprofitMoney);
    const REALprofitPerVal = toNumber(REALprofitPer);

    table.innerHTML = ''; // 기존 데이터 초기화

    // ★주의: result_tbody는 이미 <tbody>이므로 여기서 또 <tbody>를 넣지 않음
    table.innerHTML = `
        <tr style="height: 25px; text-align: left;">
            <td style="font-size: 14px; text-align: left;">
                사업수행 총 비용 <strong>${EXprojectCost}</strong>에서
                예상사업비 예상손익은 <strong class="${signClass(EXprofitMoneyVal)}">${EXprofitMoney}</strong>과
                실제사업비 예상손익은 <strong class="${signClass(REALprofitMoneyVal)}">${REALprofitMoney}</strong>으로 집계
            </td>
        </tr>

        <tr style="height: 25px; text-align: left;">
            <td style="font-size: 14px; text-align: left;">
                예상사업비 예산은 <strong>${EXprojectCost}</strong>에서
                예상사업비의 합은 <strong class="${signClass(EXprofitMoneyVal)}">${EXtotalSum}</strong>으로
                손익비율은 <strong class="${signClass(REALprofitPerVal)}">${EXprofitPer}</strong>의 손익발생 사업으로 집계
            </td>
        </tr>

        <tr style="height: 25px; text-align: left;">
            <td style="font-size: 14px; text-align: left;">
                실제사업비 예산은 <strong>${REALprojectCost}</strong>에서
                실제사업비의 합은 <strong class="${signClass(REALprofitMoneyVal)}">${REALtotalSum}</strong>으로
                손익비율은 <strong class="${signClass(REALprofitPerVal)}">${REALprofitPer}</strong>의 손익발생 사업으로 집계
            </td>
        </tr>

        <tr style="height: 25px; text-align: left;">
            <td style="font-size: 14px; text-align: left;">
                예상사업비의 제경비는 전체사업비 대비 <strong>${EXcompanyPer}</strong>를 반영하여
                <strong>${EXcompanyMoney}</strong>으로 적용
            </td>
        </tr>

        <tr style="height: 25px; text-align: left;">
            <td style="font-size: 14px; text-align: left;">
                실제사업비의 제경비는 전체 사업비 대비 <strong>${REALcompanyPer}</strong>를 반영하여
                <strong>${REALcompanyMoney}</strong>으로 적용
            </td>
        </tr>

        <tr style="height: 25px; text-align: left;">
            <td style="font-weight: bold; font-size: 14px; text-align: left;">
                본 사업은 전체사업비(${REALprojectCost})에서 실제사업수행비(<strong class="${signClass(REALprofitMoneyVal)}">${REALtotalSum}</strong>)이 소요해
                이익률 <strong class="${signClass(REALprofitPerVal)}">${REALprofitPer}</strong>인 사업으로 확인됨.
            </td>
        </tr>
    `;
}

function maybeEditComment(td) {
    try {
        // normalize 함수 추가: 특정 부서명을 경영본부로 통합
        function normalizeDept(d) {
            if (!d) return '';
            const s = String(d).trim();
            const map = {
                '총무부': '경영본부',
                '경영지원부': '경영본부',
                '임원실': '경영본부',
                'GIS사업지원부': 'GIS사업부'
            };
            return map[s] || s;
        }

        const sessionDepRaw = document.getElementById('sessionDep')?.value || '';
        const sessionDep = normalizeDept(sessionDepRaw);

        const row = td.parentElement;
        const deptTd = row.querySelector('td[data-department]');
        const deptRaw = deptTd ? (deptTd.dataset.department || deptTd.textContent) : '';
        const dept = normalizeDept(deptRaw);

        if (!dept || dept !== sessionDep) {
            // 권한 없으면 아무 동작 하지 않음
            return;
        }

        // 이미 편집 중이면 중복 생성 방지
        if (td.querySelector('textarea')) return;

        // 기존에 td에 <br>로 저장된 줄바꿈을 \n으로 복원해서 textarea에 넣음
        const rawHTML = td.innerHTML || '';
        const initial = (rawHTML.replace(/<br\s*\/?>/gi, '\n') || '').trim();

        td.innerHTML = '';

        const ta = document.createElement('textarea');
        ta.className = 'comment-textarea';
        ta.style.boxSizing = 'border-box';
        ta.style.width = '100%';
        ta.style.height = '120px';
        ta.style.resize = 'vertical';
        ta.style.fontSize = '14px';
        ta.value = initial;

        // blur 시 textarea를 텍스트(HTML)로 복원
        ta.addEventListener('blur', function () {
            replaceTextAreaWithText(td, ta.value);
        });

        // Ctrl/Cmd + Enter 로 저장(blur)
        ta.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                ta.blur();
            }
        });

        td.appendChild(ta);
        ta.focus();
        // 커서 끝으로 이동
        ta.selectionStart = ta.selectionEnd = ta.value.length;
    } catch (err) {
        console.error('maybeEditComment error:', err);
    }
}

function replaceTextAreaWithText(td, value) {
    // 값이 비어있으면 빈 문자열로 표시
    const safeValue = (value == null) ? '' : String(value);

    // HTML 이스케이프 (XSS 방지)
    const escaped = safeValue
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 개행을 <br>로 변환하여 td에 삽입
    td.innerHTML = escaped.replace(/\r?\n/g, '<br>');
}

