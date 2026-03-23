
document.addEventListener('DOMContentLoaded', function () {
    initStaffGridSort();
    initProjectListSort();
    initResetPasswordConfirmModal();
    initDeleteStaffConfirmModal();
    initMeetingUploadModal();
    initDailyReportModal();
    initDailyWriteModal();
    const yearTitle = document.getElementById('projectYEAR').value;
    const reportAuth = Number(document.getElementById('sessionReportAuth')?.value || 0) === 1;
    const meetingAuth = Number(document.getElementById('sessionMeetingAuth')?.value || 0) === 1;

    if (meetingAuth) {
        const meetingLi = document.getElementById('meeting-li');
        if (meetingLi) meetingLi.style.display = 'list-item';
    }

    const projectAuth = Number(document.getElementById('sessionProjectAuth')?.value || 1) === 1;
    if (!projectAuth) {
        if (meetingAuth && typeof viewMeetingMinutes === 'function') {
            viewMeetingMinutes();
        } else if (reportAuth && typeof viewWeeklyReports === 'function') {
            viewWeeklyReports();
        }
        bindNoProjectAuthTabGuards();
        return;
    }

    fetchProjects(1);
    let userName = document.getElementById('sessionName').value;
    let userAuth = document.getElementById('sessionAuth').value;

    const dataAuth = Number(document.getElementById('sessionDataAuth')?.value || 0) === 1;
    if (dataAuth) {
        const integrationLi = document.getElementById("integration-li");
        if (integrationLi) integrationLi.style.display = "list-item";
        document.getElementById("annualBTN").style.display = "list-item";
        const annualMoneyBtn = document.getElementById("annualMoneyBTN");
        if (annualMoneyBtn) annualMoneyBtn.style.display = "list-item";
        const annualManagmentBtn = document.getElementById("annualManagmentBTN");
        if (annualManagmentBtn) annualManagmentBtn.style.display = "list-item";
        document.getElementById("stopProject").style.display = "list-item";
        document.getElementById("completeProject").style.display = "list-item";
        document.getElementById("processProjectEngineers").style.display = "list-item";
        document.getElementById("processProjectProgress").style.display = "list-item";
    }

    //관리자일 때 설정 버튼 보여주기
    if (userAuth === '관리자') {
        document.getElementById("setting-li").style.display = "list-item";
    }

    if (meetingAuth) {
        const meetingLi = document.getElementById('meeting-li');
        if (meetingLi) meetingLi.style.display = 'list-item';
    }

    // Enter 검색
    document.getElementById("search").addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            document.getElementById('search_BTN').click();
        }
    });

    const searchScopeEl = document.getElementById('searchScope');
    if (searchScopeEl) {
        searchScopeEl.addEventListener('change', () => {
            handleSearch(1);
        });
    }

    const header = document.querySelector('header.pageheader');
    if (header) {
        header.style.cursor = 'pointer';
        header.addEventListener('click', function () {
            window.location.href = '/';
        });
    }
});

// ===== 계정관리(직원) 테이블 정렬: 이름/부서/등급만 =====
// 목록/검색/회의록 상태
const projectsPerPage = 20;
let currentPage = 1;
let totalPages = 1;
let searchTerm = "";
let searchYear = "";
let currentView = "";
let projectRowsCache = [];
const projectSortState = {
    key: null,
    dir: 'default',
    nameMode: 'default'
};
let meetingItemsAll = [];
let meetingItemsFiltered = [];
let meetingCurrentPage = 1;
const meetingsPerPage = 20;
let meetingSelectedYear = '';
let meetingSearchText = '';

let dailyReportYear = null;
let dailyReportMonth = null;
let dailyCalendarRenderToken = 0;
const dailyHolidayCache = new Map();

let uaDeptFilter = '(주)삼인공간정보';
let uaDeptExpanded = new Set(['(주)삼인공간정보']);
let uaStaffKeyword = '';
let pendingResetUsers = [];
let pendingDeleteRows = [];

function initResetPasswordConfirmModal() {
    const modal = document.getElementById('resetPasswordConfirmModal');
    const closeBtn = document.getElementById('resetPasswordConfirmClose');
    const cancelBtn = document.getElementById('resetPasswordConfirmCancel');
    const okBtn = document.getElementById('resetPasswordConfirmOk');

    if (!modal || !closeBtn || !cancelBtn || !okBtn) return;
    if (modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    const closeModal = () => {
        modal.classList.remove('show');
        pendingResetUsers = [];
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    okBtn.addEventListener('click', () => {
        const users = Array.isArray(pendingResetUsers) ? [...pendingResetUsers] : [];
        closeModal();
        if (!users.length) return;
        submitResetPassword(users);
    });
}

function initDeleteStaffConfirmModal() {
    const modal = document.getElementById('deleteStaffConfirmModal');
    const closeBtn = document.getElementById('deleteStaffConfirmClose');
    const cancelBtn = document.getElementById('deleteStaffConfirmCancel');
    const okBtn = document.getElementById('deleteStaffConfirmOk');

    if (!modal || !closeBtn || !cancelBtn || !okBtn) return;
    if (modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    const closeModal = () => {
        modal.classList.remove('show');
        pendingDeleteRows = [];
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    okBtn.addEventListener('click', () => {
        const rows = Array.isArray(pendingDeleteRows) ? [...pendingDeleteRows] : [];
        closeModal();
        if (!rows.length) return;
        rows.forEach((row) => {
            if (row && row.parentNode) row.remove();
        });
        const table = document.getElementById('staffGrid');
        const checkAll = table?.querySelector('input.check-all');
        if (checkAll) checkAll.checked = false;
        uaApplyStaffRowZebra();
    });
}

function openDeleteStaffConfirmModal(targetRows) {
    const modal = document.getElementById('deleteStaffConfirmModal');
    const messageEl = document.getElementById('deleteStaffConfirmMessage');
    if (!modal || !messageEl) return;

    const count = Array.isArray(targetRows) ? targetRows.length : 0;
    messageEl.textContent = `선택한 ${count}명의 직원을 삭제하시겠습니까?`;
    pendingDeleteRows = Array.isArray(targetRows) ? targetRows : [];
    modal.classList.add('show');
}

function openResetPasswordConfirmModal(usersToReset) {
    const modal = document.getElementById('resetPasswordConfirmModal');
    const messageEl = document.getElementById('resetPasswordConfirmMessage');
    if (!modal || !messageEl) return;

    const namesText = usersToReset.map((user) => `'${user.name}'`).join(', ');
    messageEl.textContent = `${namesText}의 비밀번호를 초기화 하시겠습니까?`;
    pendingResetUsers = usersToReset;
    modal.classList.add('show');
}

function submitResetPassword(usersToReset) {
    fetch('/reset_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usersToReset)
    })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                alert('비밀번호 초기화 완료');
            } else {
                alert('초기화 실패: ' + result.message);
            }
        })
        .catch(err => {
            console.error('[초기화 오류]', err);
            alert('요청 중 오류 발생');
        });
}

function setStaffCheckboxEditable(isEditable) {
    const table = document.getElementById('staffGrid');
    if (!table) return;

    const checkboxes = table.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
        checkbox.disabled = !isEditable;
    });

    if (!isEditable) {
        const checkAll = table.querySelector('input.check-all');
        if (checkAll) checkAll.checked = false;
        table.querySelectorAll('input.row-check').forEach((checkbox) => {
            checkbox.checked = false;
        });
    }
}

function setStaffFormControlsEditable(isEditable) {
    const table = document.getElementById('staffGrid');
    if (!table) return;

    table.querySelectorAll('td[data-field="department"] select, td[data-field="auth"] select, td[data-field="join_date"] input[type="date"]').forEach((control) => {
        control.disabled = !isEditable;
    });
}

function resetSettingsAccountEditState() {
    const table = document.getElementById('staffGrid');
    if (!table) return;

    table.classList.remove('staff-editing');
    setStaffCheckboxEditable(false);
    setStaffFormControlsEditable(false);

    table.querySelectorAll('td.staff-text-editable').forEach((cell) => {
        cell.contentEditable = 'false';
        cell.classList.remove('staff-text-editable');
    });

    const deleteBtn = document.getElementById('deleteBTN');
    const saveBtn = document.getElementById('saveBTN');
    const addRowBtn = document.getElementById('addRowBTN');
    const resetBtn = document.getElementById('resetBTN');

    if (deleteBtn) deleteBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';
    if (addRowBtn) addRowBtn.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    resetSettingsAccountEditState();
}

const uaDeptTreeData = [
    {
        label: '(주)삼인공간정보',
        children: [
            { label: '임원실' },
            { label: '기업부설연구소' },
            {
                label: '경영본부',
                children: [
                    { label: '경영지원부' },
                    { label: '총무부' }
                ]
            },
            {
                label: '사업본부',
                children: [
                    { label: 'GIS사업부' },
                    { label: '공간정보사업부' }
                ]
            },
            {
                label: '영업본부',
                children: [
                    { label: '공공사업부' },
                    { label: '공정관리부' }
                ]
            },
            {
                label: '비아이티',
                children: [
                    { label: 'BIT' },
                    { label: 'BIT 공정관리부' }
                ]
            }
        ]
    }
];

function uaCollectDeptLabels(targetLabel) {
    const normalizedTarget = uaNormalizeDeptName(targetLabel);
    if (!normalizedTarget) return new Set();

    const labels = new Set();

    const walk = (node) => {
        if (!node) return false;

        const nodeLabel = uaNormalizeDeptName(node.label);
        const isMatch = nodeLabel === normalizedTarget;

        let childMatched = false;
        const children = Array.isArray(node.children) ? node.children : [];
        children.forEach((child) => {
            if (walk(child)) childMatched = true;
        });

        if (isMatch || childMatched) {
            labels.add(nodeLabel);
            children.forEach((child) => {
                const collectAll = (childNode) => {
                    if (!childNode) return;
                    labels.add(uaNormalizeDeptName(childNode.label));
                    (childNode.children || []).forEach(collectAll);
                };
                collectAll(child);
            });
            return true;
        }
        return false;
    };

    uaDeptTreeData.forEach((root) => walk(root));
    return labels;
}

function uaNormalizeDeptName(name) {
    const raw = String(name || '').replace(/\s+/g, ' ').trim();
    const alias = {
        'GIS사업지원부': 'GIS사업부',
        'GIS지원사업부': 'GIS사업부',
        'BIT공정관리부': 'BIT 공정관리부',
        '총무부(BIT)': 'BIT',
        '공정관리부(BIT)': 'BIT 공정관리부',
        '연구소': '기업부설연구소'
    };
    return alias[raw] || raw;
}

function uaGetDeptFromRow(row) {
    const deptSelect = row?.querySelector('td[data-field="department"] select');
    if (deptSelect) return uaNormalizeDeptName(deptSelect.value);
    const text = row?.querySelector('td[data-field="department"]')?.textContent || '';
    return uaNormalizeDeptName(text);
}

function uaGetSearchTextFromRow(row) {
    const empNo = (row.querySelector('td[data-field="emp_no"]')?.textContent || '').trim();
    const userId = (row.querySelector('td[data-field="user_id"]')?.textContent || '').trim();
    const dept = uaGetDeptFromRow(row);
    const name = (row.querySelector('td[data-field="name"]')?.textContent || '').trim();
    const position = (row.querySelector('td[data-field="position"]')?.textContent || '').trim();
    const phone = (row.querySelector('td[data-field="phone"]')?.textContent || '').trim();
    const auth = (row.querySelector('td[data-field="auth"] select')?.value || '').trim();
    return [empNo, userId, dept, name, position, phone, auth].join(' ').toLowerCase();
}

function uaApplyStaffSearch() {
    const searchInput = document.getElementById('searchBox');
    uaStaffKeyword = String(searchInput?.value || '').trim().toLowerCase();
    uaFilterStaffRows();
}

function uaApplyStaffRowZebra() {
    const tbody = document.querySelector('#staffGrid tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    let visibleIndex = 0;

    rows.forEach((row) => {
        const hidden = row.style.display === 'none';
        row.classList.remove('staff-even');
        if (hidden) return;

        visibleIndex += 1;
        if (visibleIndex % 2 === 0) row.classList.add('staff-even');
    });
}

function uaFilterStaffRows() {
    const tbody = document.querySelector('#staffGrid tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));

    const normalizedFilter = uaNormalizeDeptName(uaDeptFilter || '');
    const isAll = !normalizedFilter || normalizedFilter === '(주)삼인공간정보';

    rows.forEach((row) => {
        const dept = uaGetDeptFromRow(row);
        const deptMatched = isAll ? true : (dept === normalizedFilter);
        const keywordMatched = !uaStaffKeyword || uaGetSearchTextFromRow(row).includes(uaStaffKeyword);
        row.style.display = (deptMatched && keywordMatched) ? '' : 'none';
    });

    uaApplyStaffRowZebra();
}

function uaCreateDeptNode(node, depth = 0) {
    const li = document.createElement('li');
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = uaDeptExpanded.has(String(node.label));

    const row = document.createElement('div');
    row.className = 'dept-item';
    if (uaDeptFilter && String(uaDeptFilter) === String(node.label)) row.classList.add('is-selected');
    row.style.paddingLeft = `${Math.max(0, depth) * 6}px`;

    if (hasChildren) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'dept-toggle';
        toggleBtn.textContent = isExpanded ? '-' : '+';
        toggleBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        row.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            const next = !expanded;
            toggleBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
            toggleBtn.textContent = next ? '-' : '+';
            if (next) uaDeptExpanded.add(String(node.label));
            else uaDeptExpanded.delete(String(node.label));
            uaRenderDeptTree();
        });
    } else {
        const spacer = document.createElement('span');
        spacer.style.display = 'inline-block';
        spacer.style.width = '14px';
        row.appendChild(spacer);
    }

    const label = document.createElement('div');
    label.className = 'dept-label';
    label.textContent = node.label;
    row.appendChild(label);

    row.addEventListener('click', () => {
        uaDeptFilter = node.label;
        uaRenderDeptTree();
        uaFilterStaffRows();
    });

    li.appendChild(row);

    if (hasChildren) {
        const children = document.createElement('ul');
        children.className = 'dept-children';
        children.style.display = isExpanded ? 'block' : 'none';
        node.children.forEach((child) => children.appendChild(uaCreateDeptNode(child, depth + 1)));
        li.appendChild(children);
    }

    return li;
}

function uaRenderDeptTree() {
    const host = document.getElementById('uaDeptTree');
    if (!host) return;
    host.innerHTML = '';
    const ul = document.createElement('ul');
    uaDeptTreeData.forEach((node) => ul.appendChild(uaCreateDeptNode(node, 0)));
    host.appendChild(ul);
}

function initSettingsAccountUi() {
    const host = document.getElementById('uaDeptTree');
    if (!host) return;

    const searchInput = document.getElementById('searchBox');
    const searchBtn = document.querySelector('#settingsModal .ua-toolbar-search button');

    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = '1';
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                uaApplyStaffSearch();
            }
        });
    }

    if (searchBtn && !searchBtn.dataset.bound) {
        searchBtn.dataset.bound = '1';
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            uaApplyStaffSearch();
        });
    }

    uaRenderDeptTree();
    uaFilterStaffRows();
}

function initStaffGridSort() {
    const table = document.getElementById('staffGrid');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    let maxIdx = -1;
    rows.forEach((row, i) => {
        if (!row.dataset.originalIndex) row.dataset.originalIndex = String(i);
        const n = Number(row.dataset.originalIndex);
        if (!Number.isNaN(n)) maxIdx = Math.max(maxIdx, n);
    });
    table.dataset.staffNextIndex = String(maxIdx + 1);

    const thName = document.getElementById('staffSortName');
    const thDept = document.getElementById('staffSortDept');
    const thAuth = document.getElementById('staffSortAuth');
    const thPosition = document.getElementById('staffSortPosition');
    if (!thName || !thDept || !thAuth || !thPosition) return;

    const state = { key: null, dir: 'default' };
    const setup = (th, key) => {
        th.style.cursor = 'pointer';
        ensureSortIndicator(th);
        th.addEventListener('click', () => {
            const active = document.activeElement;
            if (active && active.tagName === 'INPUT' && table.contains(active)) active.blur();

            if (state.key === key) {
                if (state.dir === 'default') state.dir = 'asc';
                else if (state.dir === 'asc') state.dir = 'desc';
                else state.dir = 'default';
            } else {
                state.key = key;
                state.dir = 'asc';
            }

            sortStaffGridRows(table, state.key, state.dir);
            ensureSortIndicator(thName).textContent = (state.key === 'name') ? dirToArrow(state.dir) : '';
            ensureSortIndicator(thDept).textContent = (state.key === 'dept') ? dirToArrow(state.dir) : '';
            ensureSortIndicator(thPosition).textContent = (state.key === 'position') ? dirToArrow(state.dir) : '';
            ensureSortIndicator(thAuth).textContent = (state.key === 'auth') ? dirToArrow(state.dir) : '';
        });
    };

    setup(thName, 'name');
    setup(thDept, 'dept');
    setup(thPosition, 'position');
    setup(thAuth, 'auth');

    ensureSortIndicator(thName).textContent = '';
    ensureSortIndicator(thDept).textContent = '';
    ensureSortIndicator(thPosition).textContent = '';
    ensureSortIndicator(thAuth).textContent = '';

    sortStaffGridRows(table, 'emp_no', 'asc');
}

function ensureSortIndicator(th) {
    let span = th.querySelector('.sort-indicator');
    if (!span) {
        span = document.createElement('span');
        span.className = 'sort-indicator';
        span.style.marginLeft = '6px';
        th.appendChild(span);
    }
    return span;
}

function dirToArrow(dir) {
    if (dir === 'asc') return '▲';
    if (dir === 'desc') return '▼';
    return '';
}

function getStaffRowName(row) {
    return (row.querySelector('td[data-field="name"]')?.textContent || '').trim();
}

function getStaffRowDept(row) {
    const deptSelect = row.querySelector('td[data-field="department"] select');
    return (deptSelect ? deptSelect.value : '').trim();
}

function getStaffRowAuth(row) {
    const authSelect = row.querySelector('td[data-field="auth"] select');
    return (authSelect ? authSelect.value : '').trim();
}

function getStaffRowPosition(row) {
    return (row.querySelector('td[data-field="position"]')?.textContent || '').trim();
}

function getPositionOrder(position) {
    const normalized = String(position || '').trim();
    const order = {
        '대표이사': 1,
        '부사장': 2,
        '전무이사': 3,
        '상무이사': 4,
        '이사': 5,
        '부장': 6,
        '차장': 7,
        '과장': 8,
        '대리': 9,
        '주임': 10,
        '사원': 11,
    };
    return Object.prototype.hasOwnProperty.call(order, normalized) ? order[normalized] : 99;
}

function formatPhoneNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';

    if (digits.length <= 3) return digits;

    if (digits.startsWith('02')) {
        if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
        if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
        return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }

    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function placeCaretAtEnd(element) {
    if (!element) return;
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
}

function getStaffRowEmpNo(row) {
    return (row.querySelector('td[data-field="emp_no"]')?.textContent || '').trim();
}

function sortStaffGridRows(table, key, dir) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));

    if (dir === 'default' || !key) {
        rows.sort((a, b) => Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0));
    } else {
        const getVal = (row) => {
            if (key === 'emp_no') return getStaffRowEmpNo(row);
            if (key === 'name') return getStaffRowName(row);
            if (key === 'dept') return getStaffRowDept(row);
            if (key === 'position') return getStaffRowPosition(row);
            return getStaffRowAuth(row);
        };
        rows.sort((a, b) => {
            const va = getVal(a);
            const vb = getVal(b);
            const na = !va;
            const nb = !vb;
            if (na && !nb) return 1;
            if (!na && nb) return -1;
            if (na && nb) {
                return Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0);
            }
            const sa = String(va).trim();
            const sb = String(vb).trim();
            if (key === 'position') {
                let cmp = getPositionOrder(sa) - getPositionOrder(sb);
                if (cmp === 0) {
                    cmp = sa.localeCompare(sb, 'ko-KR', { sensitivity: 'base' });
                }
                if (cmp === 0) {
                    cmp = Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0);
                }
                return dir === 'asc' ? cmp : -cmp;
            }
            const isNumA = /^\d+(?:\.\d+)?$/.test(sa);
            const isNumB = /^\d+(?:\.\d+)?$/.test(sb);
            let cmp = 0;
            if (isNumA && isNumB) {
                const nna = Number(sa);
                const nnb = Number(sb);
                cmp = nna === nnb ? 0 : (nna < nnb ? -1 : 1);
            } else {
                cmp = sa.localeCompare(sb, 'ko-KR', { sensitivity: 'base' });
            }
            if (cmp === 0) {
                cmp = Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0);
            }
            return dir === 'asc' ? cmp : -cmp;
        });
    }

    const frag = document.createDocumentFragment();
    rows.forEach(r => frag.appendChild(r));
    tbody.appendChild(frag);
    uaApplyStaffRowZebra();
}

function bindNoProjectAuthTabGuards() {
    if (window.__noProjectAuthTabGuardsBound__) return;
    window.__noProjectAuthTabGuardsBound__ = true;

    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    navbar.addEventListener('click', (e) => {
        const projectAuth = Number(document.getElementById('sessionProjectAuth')?.value || 1) === 1;
        const reportAuth = Number(document.getElementById('sessionReportAuth')?.value || 0) === 1;
        const meetingAuth = Number(document.getElementById('sessionMeetingAuth')?.value || 0) === 1;
        if (projectAuth) return;

        const clickable = e.target && e.target.closest ? e.target.closest('button, a') : null;
        if (!clickable) return;

        const onclick = String(clickable.getAttribute('onclick') || '');
        const allowMeeting = onclick.includes('viewMeetingMinutes') && meetingAuth;
        const allowWeekly = onclick.includes('viewWeeklyReports') && reportAuth;
        const allowDaily = onclick.includes('viewDailyReports') && reportAuth;
        if (allowMeeting || allowWeekly || allowDaily) return;

        e.preventDefault();
        e.stopPropagation();
        alert('권한이 없습니다. 관리자에게 문의 해 주세요');
    }, true);
}

function viewDailyReports() {
    initDailyReportModal();
    if (dailyReportYear == null || dailyReportMonth == null) {
        const now = new Date();
        dailyReportYear = now.getFullYear();
        dailyReportMonth = now.getMonth() + 1;
    }
    currentView = 'daily';
    _weeklyHideReportsToolbar();
    _ensureSearchVisible(false);
    _dailyShowSection();
    const titleEl = document.getElementById('yearTitle');
    if (titleEl) titleEl.textContent = '일일 보고서';
    clearActiveButtons();
    dailyReportRenderAll();
}

function initDailyReportModal() {
    const section = document.getElementById('dailyReportSection');
    if (!section || section.dataset.bound === '1') return;

    const yearPrevBtn = document.getElementById('dailyYearPrevBtn');
    const yearNextBtn = document.getElementById('dailyYearNextBtn');
    const monthPrevBtn = document.getElementById('dailyMonthPrevBtn');
    const monthNextBtn = document.getElementById('dailyMonthNextBtn');
    const yearDisplay = document.getElementById('dailyYearDisplay');
    const monthDisplay = document.getElementById('dailyMonthDisplay');

    if (yearPrevBtn) yearPrevBtn.onclick = () => {
        dailyReportYear -= 1;
        dailyReportRenderAll();
    };
    if (yearNextBtn) yearNextBtn.onclick = () => {
        dailyReportYear += 1;
        dailyReportRenderAll();
    };
    if (monthPrevBtn) monthPrevBtn.onclick = () => {
        dailyReportMonth -= 1;
        if (dailyReportMonth < 1) {
            dailyReportMonth = 12;
            dailyReportYear -= 1;
        }
        dailyReportRenderAll();
    };
    if (monthNextBtn) monthNextBtn.onclick = () => {
        dailyReportMonth += 1;
        if (dailyReportMonth > 12) {
            dailyReportMonth = 1;
            dailyReportYear += 1;
        }
        dailyReportRenderAll();
    };

    if (yearDisplay) {
        yearDisplay.onclick = (event) => {
            event.stopPropagation();
            dailyReportTogglePicker('year');
        };
    }
    if (monthDisplay) {
        monthDisplay.onclick = (event) => {
            event.stopPropagation();
            dailyReportTogglePicker('month');
        };
    }

    document.addEventListener('click', dailyReportDocumentClickHandler);
    section.dataset.bound = '1';

    if (dailyReportYear == null || dailyReportMonth == null) {
        const now = new Date();
        dailyReportYear = now.getFullYear();
        dailyReportMonth = now.getMonth() + 1;
    }
}

function dailyReportDocumentClickHandler(event) {
    const periodBox = document.querySelector('.daily-report-period-box');
    const section = document.getElementById('dailyReportSection');
    if (!section || section.style.display === 'none') return;
    if (!periodBox) return;
    if (!periodBox.contains(event.target)) {
        dailyReportHidePickerPanels();
    }
}

function dailyReportTogglePicker(type) {
    const yearPicker = document.getElementById('dailyYearPicker');
    const monthPicker = document.getElementById('dailyMonthPicker');
    if (!yearPicker || !monthPicker) return;

    if (type === 'year') {
        const willShow = !yearPicker.classList.contains('show');
        dailyReportHidePickerPanels();
        if (willShow) yearPicker.classList.add('show');
        return;
    }

    const willShow = !monthPicker.classList.contains('show');
    dailyReportHidePickerPanels();
    if (willShow) monthPicker.classList.add('show');
}

function dailyReportHidePickerPanels() {
    const yearPicker = document.getElementById('dailyYearPicker');
    const monthPicker = document.getElementById('dailyMonthPicker');
    if (yearPicker) yearPicker.classList.remove('show');
    if (monthPicker) monthPicker.classList.remove('show');
}

function dailyReportRenderDeptLabel() {
    const deptEl = document.getElementById('dailyReportDeptLabel');
    if (!deptEl) return;
    const dept = String(document.getElementById('sessionDept')?.value || '').trim();
    deptEl.textContent = `${dept || '-'} 일일보고서`;
}

function dailyReportRenderPeriodText() {
    const yearDisplay = document.getElementById('dailyYearDisplay');
    const monthDisplay = document.getElementById('dailyMonthDisplay');
    if (yearDisplay) yearDisplay.textContent = `${dailyReportYear}년`;
    if (monthDisplay) monthDisplay.textContent = `${dailyReportMonth}월`;
}

function dailyReportRenderYearPicker() {
    const picker = document.getElementById('dailyYearPicker');
    if (!picker) return;

    const startYear = dailyReportYear - 6;
    const years = Array.from({ length: 13 }, (_, idx) => startYear + idx);

    picker.innerHTML = years.map((year) => {
        const active = year === dailyReportYear ? 'active' : '';
        return `<button type="button" class="daily-picker-item ${active}" data-year="${year}">${year}년</button>`;
    }).join('');

    picker.querySelectorAll('[data-year]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const year = Number(button.getAttribute('data-year'));
            if (!Number.isFinite(year)) return;
            dailyReportYear = year;
            dailyReportRenderAll();
            dailyReportHidePickerPanels();
        });
    });
}

function dailyReportRenderMonthPicker() {
    const picker = document.getElementById('dailyMonthPicker');
    if (!picker) return;

    picker.innerHTML = Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1;
        const active = month === dailyReportMonth ? 'active' : '';
        return `<button type="button" class="daily-picker-item ${active}" data-month="${month}">${month}월</button>`;
    }).join('');

    picker.querySelectorAll('[data-month]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const month = Number(button.getAttribute('data-month'));
            if (!Number.isFinite(month)) return;
            dailyReportMonth = month;
            dailyReportRenderAll();
            dailyReportHidePickerPanels();
        });
    });
}

function dailyReportRenderAll() {
    dailyReportRenderDeptLabel();
    dailyReportRenderPeriodText();
    dailyReportRenderYearPicker();
    dailyReportRenderMonthPicker();
    dailyReportRenderCalendar();
}

function dailyReportPad2(n) {
    return String(n).padStart(2, '0');
}

function dailyReportBuildDateKey(year, month, day) {
    return `${year}-${dailyReportPad2(month)}-${dailyReportPad2(day)}`;
}

function dailyReportGetFallbackHolidaySet(year) {
    const fixed = [
        [1, 1],
        [3, 1],
        [5, 5],
        [6, 6],
        [8, 15],
        [10, 3],
        [10, 9],
        [12, 25]
    ];
    const set = new Set();
    fixed.forEach(([month, day]) => {
        set.add(dailyReportBuildDateKey(year, month, day));
    });
    return set;
}

function dailyReportFetchHolidaySet(year) {
    if (!Number.isFinite(Number(year))) {
        return Promise.resolve(dailyReportGetFallbackHolidaySet(new Date().getFullYear()));
    }
    if (dailyHolidayCache.has(year)) {
        return Promise.resolve(dailyHolidayCache.get(year));
    }

    const fallback = dailyReportGetFallbackHolidaySet(year);
    const url = `https://date.nager.at/api/v3/PublicHolidays/${encodeURIComponent(year)}/KR`;

    return fetch(url)
        .then((res) => {
            if (!res.ok) throw new Error(`holiday api ${res.status}`);
            return res.json();
        })
        .then((items) => {
            const set = new Set(fallback);
            if (Array.isArray(items)) {
                items.forEach((item) => {
                    const dateText = String(item?.date || '').trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) set.add(dateText);
                });
            }
            dailyHolidayCache.set(year, set);
            return set;
        })
        .catch(() => {
            dailyHolidayCache.set(year, fallback);
            return fallback;
        });
}

function dailyReportBuildCalendarHtml(holidaySet) {
    const firstDay = new Date(dailyReportYear, dailyReportMonth - 1, 1);
    const firstWeekday = firstDay.getDay();
    const daysInMonth = new Date(dailyReportYear, dailyReportMonth, 0).getDate();
    const today = new Date();

    const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    let day = 1;
    const rows = [];

    for (let row = 0; row < 6; row += 1) {
        const cells = [];
        for (let col = 0; col < 7; col += 1) {
            if (row === 0 && col < firstWeekday) {
                cells.push('<td class="is-empty">&nbsp;</td>');
            } else if (day > daysInMonth) {
                cells.push('<td class="is-empty">&nbsp;</td>');
            } else {
                const dateKey = dailyReportBuildDateKey(dailyReportYear, dailyReportMonth, day);
                const isToday = today.getFullYear() === dailyReportYear
                    && (today.getMonth() + 1) === dailyReportMonth
                    && today.getDate() === day;
                const isSunday = col === 0;
                const isSaturday = col === 6;
                const isHoliday = holidaySet.has(dateKey);
                const classes = [];
                if (isToday) classes.push('is-today');
                if (isSunday) classes.push('is-sun');
                if (isSaturday) classes.push('is-sat');
                if (isHoliday) classes.push('is-holiday');
                cells.push(`<td class="${classes.join(' ')}">${day}</td>`);
                day += 1;
            }
        }
        rows.push(`<tr>${cells.join('')}</tr>`);
        if (day > daysInMonth) break;
    }

    const headHtml = weekdayLabels
        .map((label, idx) => {
            const cls = idx === 0 ? 'is-sun' : (idx === 6 ? 'is-sat' : '');
            return `<th class="${cls}">${label}</th>`;
        })
        .join('');

    return `
        <table>
            <thead>
                <tr>${headHtml}</tr>
            </thead>
            <tbody>
                ${rows.join('')}
            </tbody>
        </table>
    `;
}

function dailyReportRenderCalendar() {
    const host = document.getElementById('dailyReportCalendar');
    if (!host) return;

    const token = ++dailyCalendarRenderToken;
    const fallbackSet = dailyReportGetFallbackHolidaySet(dailyReportYear);
    host.innerHTML = dailyReportBuildCalendarHtml(fallbackSet);

    dailyReportFetchHolidaySet(dailyReportYear)
        .then((holidaySet) => {
            if (token !== dailyCalendarRenderToken) return;
            host.innerHTML = dailyReportBuildCalendarHtml(holidaySet);
        })
        .catch(() => {
            if (token !== dailyCalendarRenderToken) return;
            host.innerHTML = dailyReportBuildCalendarHtml(fallbackSet);
        });
}

function initDailyWriteModal() {
    const modal = document.getElementById('dailyWriteModal');
    if (!modal || modal.dataset.bound === '1') return;

    const innerCheck = document.getElementById('dailyTypeInner');
    const outerCheck = document.getElementById('dailyTypeOuter');

    if (innerCheck) {
        innerCheck.addEventListener('change', syncDailyWriteTypeSections);
    }
    if (outerCheck) {
        outerCheck.addEventListener('change', syncDailyWriteTypeSections);
    }

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeDailyWriteModal();
    });

    modal.dataset.bound = '1';
}

function syncDailyWriteTypeSections() {
    const innerChecked = !!document.getElementById('dailyTypeInner')?.checked;
    const outerChecked = !!document.getElementById('dailyTypeOuter')?.checked;
    const innerSection = document.getElementById('dailyInnerSection');
    const outerSection = document.getElementById('dailyOuterSection');

    if (innerSection) innerSection.style.display = innerChecked ? '' : 'none';
    if (outerSection) outerSection.style.display = outerChecked ? '' : 'none';
}

function openDailyWriteModal() {
    const modal = document.getElementById('dailyWriteModal');
    if (!modal) return;
    modal.classList.add('show');
    document.body.classList.add('modal-open');

    const dept = String(document.getElementById('sessionDept')?.value || '').trim();
    const author = String(document.getElementById('sessionName')?.value || '').trim();

    const deptInput = document.getElementById('dailyWriteDept');
    const dateInput = document.getElementById('dailyWriteDate');
    const authorInput = document.getElementById('dailyWriteAuthor');
    const outerMetaInput = document.getElementById('dailyOuterMeta');
    const innerCheck = document.getElementById('dailyTypeInner');
    const outerCheck = document.getElementById('dailyTypeOuter');

    if (deptInput) deptInput.value = dept;
    if (authorInput) authorInput.value = author;
    if (dateInput && !dateInput.value) dateInput.value = formatDateYMD(new Date());
    if (outerMetaInput && !String(outerMetaInput.value || '').trim()) {
        outerMetaInput.value = '방문일시 : \n업체명/담당자 : \n방문자 : ';
    }
    if (innerCheck) innerCheck.checked = true;
    if (outerCheck) outerCheck.checked = false;

    syncDailyWriteTypeSections();
}

function closeDailyWriteModal() {
    const modal = document.getElementById('dailyWriteModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
}

//기본 프로젝트 목록 가져오기
function fetchProjects(page = 1) {
    _dailyHideSection();
    const scope = document.getElementById('searchScope')?.value || 'year';
    const year = document.getElementById("projectYEAR")?.value || '';
    let url = `/api/get_projects/?page=${encodeURIComponent(page)}`;
    if (scope !== 'all' && year) {
        url += `&year=${encodeURIComponent(year)}`;
    }

    fetch(url)
        .then(response => response.json())
        .then(data => {
            renderTable(data.projects || []);
            renderPagination(data.current_page || 1, data.total_pages || 1);
            const titleEl = document.getElementById('yearTitle');
            if (titleEl) {
                titleEl.textContent = scope === 'all' ? '전체 사업' : `${year}년 사업`;
            }
            const pg = document.getElementById("pagination");
            if (pg) pg.style.display = 'block';
            clearActiveButtons();
            _ensureSearchVisible(true);
            _ensureSearchScopeVisible(true);
            _weeklyHideReportsToolbar();
        })
        .catch(error => console.error("Error fetching projects:", error));
}
//연차사업 모아보기 (페이지네이션 포함)
function viewYearlyProjects(page = 1) {
    _dailyHideSection();
    currentView = "yearly";
    setTableHead('yearly');
    fetch(`/api/yearly_projects?type=yearly&page=${page}`)
        .then(response => response.json())
        .then(data => {
            renderTable(data.projects);
            renderPagination(data.current_page, data.total_pages, "yearly"); //타입 추가!
            document.getElementById('yearTitle').textContent = "연차사업 모아보기";
            document.getElementById("pagination").style.display = 'block';
            setActiveButton("연차사업");
            _ensureSearchVisible(true);
            _ensureSearchScopeVisible(false);
            _weeklyHideReportsToolbar();
        })
        .catch(error => console.error("Error fetching yearly projects:", error));
}

//검토사업 모아보기 (페이지네이션 포함)
function viewExamineProjects(page = 1) {
    _dailyHideSection();
    currentView = "examine";
    setTableHead('examine');
    fetch(`/api/yearly_projects?type=examine&page=${page}`)
        .then(response => response.json())
        .then(data => {
            renderTable(data.projects);
            renderPagination(data.current_page, data.total_pages, "examine"); //타입 추가!
            document.getElementById('yearTitle').textContent = "검토사업 모아보기";
            document.getElementById("pagination").style.display = 'block';
            setActiveButton("검토사업");
            _ensureSearchVisible(true);
            _ensureSearchScopeVisible(false);
            _weeklyHideReportsToolbar();
        })
        .catch(error => console.error("Error fetching examine projects:", error));
}

// 연도별 통합자료 모아보기 (페이지네이션 없이 전체 출력)
function viewAnnualProjects() {
    _dailyHideSection();
    currentView = "annual";
    setTableHead('annual'); // thead를 통합자료로 변경
    console.log('mode:', currentView);
    const tableBody = document.getElementById("projectList_tbody");
    tableBody.innerHTML = "";

    // 2. 연도별 통합자료 목록 추가
    const years = [...available_years].sort((a, b) => b - a);
    years.forEach(year => {
        const row = document.createElement("tr");
        row.innerHTML = `<td style="padding: 15px; font-size: 16px; cursor: pointer; transition: background-color 0.2s;"
                            onmouseover="this.style.backgroundColor='#7e8b97ff'"
                            onmouseout="this.style.backgroundColor=''">${year}년 연도별 비용 산출 통합자료</td>`;
        row.onclick = () => {
            window.location.href = `/PMS_annualProject/year/${year}`;
        };
        tableBody.appendChild(row);
    });

    // 페이지네이션 숨기기
    document.getElementById("pagination").style.display = 'none';

    // 타이틀 등 UI 업데이트
    document.getElementById('yearTitle').textContent = "연도별 비용 산출 통합자료";
    setActiveButton("검토사업");
    _ensureSearchVisible(false);
    _weeklyHideReportsToolbar();
}

function viewAnnualMoney() {
    const year = document.getElementById('projectYEAR')?.value;
    if (year) {
        window.location.href = `/PMS_annualProject/money/${encodeURIComponent(year)}`;
        return;
    }
    const nowYear = new Date().getFullYear();
    window.location.href = `/PMS_annualProject/money/${encodeURIComponent(nowYear)}`;
}

function viewAnnualManagment() {
    const year = document.getElementById('projectYEAR')?.value;
    if (year) {
        window.location.href = `/PMS_annualManagment/${encodeURIComponent(year)}`;
        return;
    }
    const nowYear = new Date().getFullYear();
    window.location.href = `/PMS_annualManagment/${encodeURIComponent(nowYear)}`;
}
// thead를 모드에 따라 동적으로 변경
function setTableHead(mode) {
    const thead = document.querySelector('.projectList thead');
    if (mode === 'annual') {
        thead.innerHTML = `<tr><th>통합자료 목록</th></tr>`;
    } else if (mode === 'weekly') {
        thead.innerHTML = `<tr><th>주간 보고서 목록</th></tr>`;
    } else if (mode === 'meeting') {
        thead.innerHTML = `
            <tr>
                <th style="width: 10%; text-align:center;">문서번호</th>
                <th style="width: 5%; text-align:center; white-space:nowrap;">사업번호</th>
                <th style="width: 36%;">제목</th>
                <th style="width: 8%; text-align:center;">작성자</th>
                <th style="width: 16%; text-align:center;">작성일</th>
                <th style="width: 8%; text-align:center;">조회수</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th id="projectSortContractCode" data-sort-key="contract_code" class="project-sortable" style="width: 15%;">사업번호</th>
                <th id="projectSortProjectName" data-sort-key="project_name" class="project-sortable" style="width: 55%;" title="오름차순 → 내림차순 → 사업관리 이슈사항(사업번호 내림차순)">사업명</th>
                <th id="projectSortStatus" data-sort-key="project_status" class="project-sortable" style="width: 10%;">준공여부</th>
                <th id="projectSortProgress" data-sort-key="progress" class="project-sortable" style="width: 10%;">진행률</th>
                <th id="projectSortOutsourcing" data-sort-key="outsourcing" class="project-sortable" style="width: 10%;">외주구분</th>
            </tr>
        `;
        updateProjectSortIndicators();
    }
}

function _ensureSearchVisible(visible) {
    const el = document.getElementById('searchDIV');
    if (!el) return;
    el.style.display = visible ? 'flex' : 'none';
}

function _ensureSearchScopeVisible(visible) {
    const scope = document.getElementById('searchScope');
    if (!scope) return;
    scope.style.display = visible ? '' : 'none';
}

function _dailyShowSection() {
    const section = document.getElementById('dailyReportSection');
    const table = document.querySelector('.projectList');
    if (section) section.style.display = 'block';
    if (table) table.style.display = 'none';

    const pg = document.getElementById('pagination');
    if (pg) pg.style.display = 'none';
}

function _dailyHideSection() {
    const section = document.getElementById('dailyReportSection');
    const table = document.querySelector('.projectList');
    if (section) section.style.display = 'none';
    if (table) table.style.display = '';
    dailyReportHidePickerPanels();
}

function _weeklyParseYearFromWeekStart(weekStartStr) {
    const m = /^\s*(\d{4})-\d{2}-\d{2}\s*$/.exec(String(weekStartStr || ''));
    return m ? Number(m[1]) : null;
}

function _weeklyGetAvailableYearsForFilter(weeks) {
    const years = new Set();
    const MIN_YEAR = 2025;
    const currentYear = new Date().getFullYear();
    if (Array.isArray(weeks)) {
        weeks.forEach(w => {
            const y = _weeklyParseYearFromWeekStart(w?.week_start);
            if (y) years.add(y);
        });
    }
    if (typeof available_years !== 'undefined' && Array.isArray(available_years)) {
        available_years.forEach(y => years.add(Number(y)));
    }

    // 데이터가 없어도 2025년부터 현재 연도까지는 항상 표시
    const existing = Array.from(years).filter(Number.isFinite);
    const maxYear = Math.max(currentYear, ...existing, MIN_YEAR);
    for (let y = MIN_YEAR; y <= maxYear; y++) {
        years.add(y);
    }

    return Array.from(years)
        .filter((y) => Number.isFinite(y) && y >= MIN_YEAR)
        .sort((a, b) => b - a);
}

function _weeklyEnsureReportsToolbar() {
    const el = document.getElementById('weeklyReportsToolbar');
    if (!el) return null;
    const top = document.getElementById('weeklyReportsTopBar');
    if (top) top.style.display = 'flex';
    return el;
}

function _weeklyHideReportsToolbar() {
    const el = document.getElementById('weeklyReportsToolbar');
    if (!el) return;
    el.innerHTML = '';

    const top = document.getElementById('weeklyReportsTopBar');
    if (top) top.style.display = 'none';
}

function initProjectListSort() {
    const table = document.querySelector('.projectList');
    if (!table || table.dataset.sortBound === '1') return;

    table.addEventListener('click', (event) => {
        const th = event.target.closest('th[data-sort-key]');
        if (!th || !table.contains(th)) return;

        const key = th.dataset.sortKey;
        if (!key) return;

        if (key === 'project_name') {
            if (projectSortState.key !== key || projectSortState.nameMode === 'default') {
                projectSortState.key = key;
                projectSortState.dir = 'asc';
                projectSortState.nameMode = 'asc';
            } else if (projectSortState.nameMode === 'asc') {
                projectSortState.dir = 'desc';
                projectSortState.nameMode = 'desc';
            } else if (projectSortState.nameMode === 'desc') {
                projectSortState.dir = 'default';
                projectSortState.nameMode = 'issue';
            } else {
                projectSortState.key = null;
                projectSortState.dir = 'default';
                projectSortState.nameMode = 'default';
            }
        } else {
            projectSortState.nameMode = 'default';

            if (projectSortState.key === key) {
                if (projectSortState.dir === 'default') projectSortState.dir = 'asc';
                else if (projectSortState.dir === 'asc') projectSortState.dir = 'desc';
                else projectSortState.dir = 'default';

                if (projectSortState.dir === 'default') {
                    projectSortState.key = null;
                }
            } else {
                projectSortState.key = key;
                projectSortState.dir = 'asc';
            }
        }

        updateProjectSortIndicators();
        renderTable(projectRowsCache || []);
    });

    table.dataset.sortBound = '1';
    updateProjectSortIndicators();
}

function getProjectOutsourcingText(project) {
    const rawOutsourcing =
        project.outsourcingCheck ??
        project.outsourcingcheck ??
        project.outsourcingType ??
        project.outsourcing_type ??
        '';

    const normalizedOutsourcing = String(rawOutsourcing).replace(/\s/g, '');
    const outsourcingVal = Number(rawOutsourcing);

    if (outsourcingVal === 1 || normalizedOutsourcing === '전량외주') return '전량외주';
    if (outsourcingVal === 2 || normalizedOutsourcing === '부분외주') return '부분외주';
    return '';
}

function getProjectStatusText(project) {
    return project.project_status === null || project.project_status === undefined ? '진행중' : String(project.project_status);
}

function parseProjectProgress(project) {
    const num = Number(project.progress);
    return Number.isFinite(num) ? num : 0;
}

function compareProjectStrings(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'ko-KR', { numeric: true, sensitivity: 'base' });
}

function compareProjectContractCodeDesc(a, b) {
    return compareProjectStrings(b?.ContractCode, a?.ContractCode);
}

function sortProjectRows(projects) {
    const rows = (Array.isArray(projects) ? projects : []).map((project, index) => ({ project, index }));
    const key = projectSortState.key;
    const dir = projectSortState.dir;
    const isIssueMode = key === 'project_name' && projectSortState.nameMode === 'issue';

    if (!key || (dir === 'default' && !isIssueMode)) {
        return rows.map(item => item.project);
    }

    rows.sort((left, right) => {
        const a = left.project;
        const b = right.project;

        if (key === 'project_name' && projectSortState.nameMode === 'issue') {
            const riskA = !!a.has_risk;
            const riskB = !!b.has_risk;
            if (riskA !== riskB) return riskA ? -1 : 1;

            const byCodeDesc = compareProjectContractCodeDesc(a, b);
            if (byCodeDesc !== 0) return byCodeDesc;
            return left.index - right.index;
        }

        let cmp = 0;
        if (key === 'contract_code') {
            cmp = compareProjectStrings(a.ContractCode, b.ContractCode);
        } else if (key === 'project_name') {
            cmp = compareProjectStrings(a.ProjectName, b.ProjectName);
        } else if (key === 'project_status') {
            cmp = compareProjectStrings(getProjectStatusText(a), getProjectStatusText(b));
        } else if (key === 'progress') {
            cmp = parseProjectProgress(a) - parseProjectProgress(b);
        } else if (key === 'outsourcing') {
            cmp = compareProjectStrings(getProjectOutsourcingText(a), getProjectOutsourcingText(b));
        }

        if (cmp === 0) {
            cmp = left.index - right.index;
        }

        return dir === 'asc' ? cmp : -cmp;
    });

    return rows.map(item => item.project);
}

function updateProjectSortIndicators() {
    const map = {
        contract_code: document.getElementById('projectSortContractCode'),
        project_name: document.getElementById('projectSortProjectName'),
        project_status: document.getElementById('projectSortStatus'),
        progress: document.getElementById('projectSortProgress'),
        outsourcing: document.getElementById('projectSortOutsourcing')
    };

    Object.entries(map).forEach(([key, th]) => {
        if (!th) return;
        const span = ensureSortIndicator(th);

        if (projectSortState.key !== key) {
            span.textContent = '';
            return;
        }

        if (key === 'project_name' && projectSortState.nameMode === 'issue') {
            span.textContent = '◆';
            return;
        }

        span.textContent = dirToArrow(projectSortState.dir);
    });
}

function _weeklyRenderReportsToolbar({ years, selectedYear }) {
    const host = _weeklyEnsureReportsToolbar();
    if (!host) return;

    const yr = (selectedYear == null || selectedYear === '') ? '' : String(selectedYear);
    const optionsHtml = [
        `<option value="">전체</option>`,
        ...years.map(y => `<option value="${y}">${y}년</option>`)
    ].join('');

    host.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:600;">연도</div>
            <select id="weeklyReportsYearSelect" class="settingSelect" style="width: 180px; height: 40px;">
                ${optionsHtml}
            </select>
            <button type="button" class="search-button" id="weeklyReportsYearApply" style="height:40px; padding:0 16px;">조회</button>
            <div style="color:#64748b; font-size: 13px;">전체 선택 시 연도별로 묶어서 표시</div>
        </div>
    `;

    const select = document.getElementById('weeklyReportsYearSelect');
    if (select) select.value = yr;
    const applyBtn = document.getElementById('weeklyReportsYearApply');
    if (applyBtn) {
        applyBtn.onclick = () => {
            const v = document.getElementById('weeklyReportsYearSelect')?.value || '';
            _weeklyLoadAndRenderReports({ year: v ? Number(v) : null });
        };
    }
    if (select) {
        select.onchange = () => {
            const v = select.value || '';
            _weeklyLoadAndRenderReports({ year: v ? Number(v) : null });
        };
    }
}

function _weeklyFetchReports(year) {
    const qs = (year == null || year === '') ? '' : `?year=${encodeURIComponent(year)}`;
    return fetch(`/api/weekly_reports${qs}`).then(res => res.json());
}

function _weeklyRenderWeeklyRowsGroupedByYear(tableBody, weeks) {
    const byYear = new Map();
    weeks.forEach(w => {
        const y = _weeklyParseYearFromWeekStart(w.week_start) || 0;
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(w);
    });
    const years = Array.from(byYear.keys()).sort((a, b) => b - a);
    years.forEach(y => {
        const hdr = document.createElement('tr');
        hdr.innerHTML = `<td style="padding: 10px 15px; font-size: 15px; font-weight: 800; background:#f1f5f9;">${y || '-'}년</td>`;
        tableBody.appendChild(hdr);
        (byYear.get(y) || []).forEach(w => {
            const row = document.createElement('tr');
            const title = _weeklyPickDisplayTitle(w);
            row.innerHTML = `<td style="padding: 15px; font-size: 16px; cursor: pointer; transition: background-color 0.2s;"
                onmouseover="this.style.backgroundColor='#f1f5f9'"
                onmouseout="this.style.backgroundColor=''">${title}</td>`;
            row.addEventListener('click', () => {
                if (w.week_start) window.location.href = `/weekly_report/${encodeURIComponent(w.week_start)}`;
            });
            tableBody.appendChild(row);
        });
    });
}

function _weeklyLoadAndRenderReports({ year = null } = {}) {
    const tableBody = document.getElementById('projectList_tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    _weeklyFetchReports(year)
        .then(data => {
            const weeks = Array.isArray(data.weeks) ? data.weeks : [];
            const filterYears = _weeklyGetAvailableYearsForFilter(weeks);
            _weeklyRenderReportsToolbar({ years: filterYears, selectedYear: year });

            if (weeks.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `<td style="padding: 15px; font-size: 16px;">데이터가 없습니다</td>`;
                tableBody.appendChild(row);
                return;
            }

            if (year == null) {
                _weeklyRenderWeeklyRowsGroupedByYear(tableBody, weeks);
            } else {
                weeks.forEach(w => {
                    const row = document.createElement('tr');
                    const title = _weeklyPickDisplayTitle(w);
                    row.innerHTML = `<td style="padding: 15px; font-size: 16px; cursor: pointer; transition: background-color 0.2s;"
                        onmouseover="this.style.backgroundColor='#f1f5f9'"
                        onmouseout="this.style.backgroundColor=''">${title}</td>`;
                    row.addEventListener('click', () => {
                        if (w.week_start) window.location.href = `/weekly_report/${encodeURIComponent(w.week_start)}`;
                    });
                    tableBody.appendChild(row);
                });
            }

            const pg = document.getElementById('pagination');
            if (pg) pg.style.display = 'none';
            const titleEl = document.getElementById('yearTitle');
            if (titleEl) titleEl.textContent = '주간 보고서';
            clearActiveButtons();
        })
        .catch(err => {
            console.error('Error fetching weekly reports:', err);
            const row = document.createElement('tr');
            row.innerHTML = `<td style="padding: 15px; font-size: 16px; color: #b00020;">데이터가 존재하지 않습니다</td>`;
            tableBody.appendChild(row);
            const pg = document.getElementById('pagination');
            if (pg) pg.style.display = 'none';
        });
}

// 주간 보고서 목록 보기
function viewWeeklyReports() {
    _dailyHideSection();
    currentView = 'weekly';
    setTableHead('weekly');
    const tableBody = document.getElementById('projectList_tbody');
    tableBody.innerHTML = '';
    // 주간보고서 입력 버튼 표시
    const weeklyBtn = document.getElementById('openWeeklyInputBtn');
    const topBar = document.getElementById('weeklyReportsTopBar');
    if (topBar) topBar.style.display = 'flex';
    if (weeklyBtn) weeklyBtn.style.display = 'inline-flex';
    _ensureSearchVisible(false);

    // 기본값: 현재 연도 기준
    const nowYear = new Date().getFullYear();
    _weeklyLoadAndRenderReports({ year: nowYear });
}

// 회의록 목록 보기(목록 화면 자체가 전환됨)
function viewMeetingMinutes() {
    _dailyHideSection();
    currentView = 'meeting';
    setTableHead('meeting');

    const tableBody = document.getElementById('projectList_tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // 상단바(weeklyReportsTopBar)를 재사용해서 '회의록 작성' 버튼만 제공
    const topBar = document.getElementById('weeklyReportsTopBar');
    const toolbar = document.getElementById('weeklyReportsToolbar');
    const weeklyBtn = document.getElementById('openWeeklyInputBtn');
    if (topBar) topBar.style.display = 'flex';
    if (weeklyBtn) weeklyBtn.style.display = 'none';
    if (toolbar) {
        toolbar.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; width:100%;">
                <div style="display:flex; align-items:center; gap:8px; min-width:260px; flex:1;">
                    <div style="font-weight:700;">연도</div>
                    <select id="meetingYearFilter" class="settingSelect" style="width: 180px; height: 40px;">
                        <option value="">전체</option>
                    </select>
                </div>
                <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex:1;">
                    <input id="meetingSearchInput" type="text" class="meeting-form-input" style="width:260px; height:40px; border:1px solid black;" placeholder="회의록 검색" autocomplete="off">
                    <button id="meetingSearchBtn" class="search-button" type="button" style="height:40px; padding:0 16px;">검색</button>
                </div>
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; flex:1;">
                    <button class="search-button" type="button" onclick="openMeetingUploadModal()" style="height:40px; padding:0 16px;">회의록 작성</button>
                </div>
            </div>
        `;
    }

    fetch('/doc_editor_api/meeting/list')
        .then(res => res.json())
        .then(data => {
            meetingItemsAll = Array.isArray(data.items) ? data.items : [];
            const years = Array.from(new Set(meetingItemsAll
                .map(item => String(item?.meeting_datetime || item?.created_at || '').match(/^(\d{4})/)?.[1] || '')
                .filter(Boolean)))
                .sort((a, b) => Number(b) - Number(a));

            const yearFilter = document.getElementById('meetingYearFilter');
            if (yearFilter) {
                yearFilter.innerHTML = '<option value="">전체</option>' + years.map(y => `<option value="${y}">${y}년</option>`).join('');
                yearFilter.value = meetingSelectedYear;
                yearFilter.onchange = () => {
                    meetingSelectedYear = yearFilter.value || '';
                    meetingCurrentPage = 1;
                    applyMeetingFiltersAndRender();
                };
            }

            const searchInput = document.getElementById('meetingSearchInput');
            const searchBtn = document.getElementById('meetingSearchBtn');
            if (searchInput) {
                searchInput.value = meetingSearchText;
                searchInput.onkeydown = (e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    meetingSearchText = (searchInput.value || '').trim();
                    meetingCurrentPage = 1;
                    applyMeetingFiltersAndRender();
                };
            }
            if (searchBtn) {
                searchBtn.onclick = () => {
                    meetingSearchText = (document.getElementById('meetingSearchInput')?.value || '').trim();
                    meetingCurrentPage = 1;
                    applyMeetingFiltersAndRender();
                };
            }

            meetingCurrentPage = 1;
            applyMeetingFiltersAndRender();
        })
        .catch(err => {
            console.error('meeting list error:', err);
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" style="padding: 15px; font-size: 16px; text-align:center; color:#b00020;">데이터가 존재하지 않습니다</td>`;
            tableBody.appendChild(row);
            const pg = document.getElementById('pagination');
            if (pg) pg.style.display = 'none';
        });

    const pg = document.getElementById('pagination');
    if (pg) pg.style.display = 'block';
    const titleEl = document.getElementById('yearTitle');
    if (titleEl) titleEl.textContent = '회의록';

    // 회의록 목록에서는 프로젝트 검색 UI는 숨김(혼동 방지)
    _ensureSearchVisible(false);
    clearActiveButtons();
}

function applyMeetingFiltersAndRender() {
    const keyword = String(meetingSearchText || '').trim().toLowerCase();
    meetingItemsFiltered = meetingItemsAll.filter((item) => {
        const rowYear = String(item?.meeting_datetime || item?.created_at || '').match(/^(\d{4})/)?.[1] || '';
        if (meetingSelectedYear && rowYear !== meetingSelectedYear) return false;
        if (!keyword) return true;

        const hay = [
            item?.doc_number,
            item?.contractcode,
            item?.project_name,
            item?.title,
            item?.author,
            item?.original_name,
        ].map(v => String(v || '').toLowerCase()).join(' ');
        return hay.includes(keyword);
    });

    renderMeetingPage();
    renderMeetingPagination();
}

function renderMeetingPage() {
    const tableBody = document.getElementById('projectList_tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (meetingItemsFiltered.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="padding: 15px; font-size: 16px; text-align:center;">데이터가 없습니다</td>`;
        tableBody.appendChild(row);
        return;
    }

    const start = (meetingCurrentPage - 1) * meetingsPerPage;
    const pageItems = meetingItemsFiltered.slice(start, start + meetingsPerPage);

    pageItems.forEach(m => {
        const row = document.createElement('tr');
        if (m.id) row.dataset.meetingId = String(m.id);
        row.innerHTML = `
            <td style="text-align:center; vertical-align:middle;">${escapeHtmlSafe(m.doc_number || '-') }</td>
            <td style="width:18%; text-align:center; vertical-align:middle; white-space:nowrap;">${escapeHtmlSafe(m.contractcode || '-') }</td>
            <td style="padding: 12px 12px; cursor: pointer;" class="meeting-title-cell">${escapeHtmlSafe(m.title || m.original_name || '-') }</td>
            <td style="width:12%; text-align:center; vertical-align:middle;">${escapeHtmlSafe(m.author || '-') }</td>
            <td style="text-align:center; vertical-align:middle;" class="meeting-date-cell">${escapeHtmlSafe(m.created_at || '-') }</td>
            <td style="text-align:center; vertical-align:middle;" class="meeting-view-count-cell">${escapeHtmlSafe(String(m.view_count ?? 0))}</td>
        `;
        const titleCell = row.querySelector('.meeting-title-cell');
        if (titleCell && m.file_path) {
            titleCell.addEventListener('click', () => openMeetingViewModal(m));
            titleCell.addEventListener('mouseenter', () => { titleCell.style.backgroundColor = '#f1f5f9'; });
            titleCell.addEventListener('mouseleave', () => { titleCell.style.backgroundColor = ''; });
        }
        tableBody.appendChild(row);
    });
}

function renderMeetingPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPagesMeeting = Math.max(1, Math.ceil(meetingItemsFiltered.length / meetingsPerPage));
    if (meetingCurrentPage > totalPagesMeeting) meetingCurrentPage = totalPagesMeeting;

    container.innerHTML = '';
    if (meetingItemsFiltered.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const makeBtn = (label, page, disabled = false, active = false) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-button';
        btn.textContent = String(label);
        if (active) btn.classList.add('active');
        btn.disabled = disabled;
        btn.onclick = () => {
            if (disabled) return;
            meetingCurrentPage = page;
            renderMeetingPage();
            renderMeetingPagination();
        };
        return btn;
    };

    container.appendChild(makeBtn('<', Math.max(1, meetingCurrentPage - 1), meetingCurrentPage === 1));
    for (let page = 1; page <= totalPagesMeeting; page++) {
        container.appendChild(makeBtn(page, page, false, page === meetingCurrentPage));
    }
    container.appendChild(makeBtn('>', Math.min(totalPagesMeeting, meetingCurrentPage + 1), meetingCurrentPage === totalPagesMeeting));
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
        .then(async (res) => {
            const data = await parseMeetingApiJson(res);
            if (!res.ok) {
                throw new Error(data?.message || `첨부파일 조회 실패 (HTTP ${res.status})`);
            }
            return data;
        })
        .then(data => {
            if (!data?.success) {
                renderMeetingViewAttachments([]);
                return;
            }
            renderMeetingViewAttachments(Array.isArray(data.items) ? data.items : []);
        })
        .catch((err) => {
            console.error('[meeting] attachment load failed:', err);
            renderMeetingViewAttachments([]);
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
    window.meetingViewCurrentMeeting = meeting || null;
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

    const createdEl = document.getElementById('meetingViewCreatedAt');
    if (createdEl) createdEl.textContent = meeting?.created_at || '-';
    const authorEl = document.getElementById('meetingViewAuthor');
    if (authorEl) authorEl.textContent = meeting?.author || '-';
    const meetingDateEl = document.getElementById('meetingViewMeetingDate');
    if (meetingDateEl) meetingDateEl.textContent = buildMeetingDateRangeForView(meeting);
    const meetingPlaceEl = document.getElementById('meetingViewMeetingPlace');
    if (meetingPlaceEl) meetingPlaceEl.textContent = meeting?.meeting_place || '-';
    const contractEl = document.getElementById('meetingViewContract');
    if (contractEl) contractEl.textContent = meeting?.contractcode || '-';
    const projectNameEl = document.getElementById('meetingViewProjectName');
    if (projectNameEl) projectNameEl.textContent = meeting?.project_name || '-';
    const titleEl = document.getElementById('meetingViewTitle');
    if (titleEl) titleEl.textContent = meeting?.title || meeting?.original_name || '-';

    const sessionName = (document.getElementById('sessionName')?.value || '').trim();
    const authorName = (meeting?.author || '').trim();
    const canEdit = !!sessionName && (!authorName || authorName === sessionName);
    const editBtn = document.querySelector('#meetingViewModal .meeting-view-action[aria-label="수정"]');
    if (editBtn) {
        editBtn.style.display = canEdit ? 'inline-flex' : 'none';
    }

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
    window.meetingViewCurrentMeeting = null;
    renderMeetingViewAttachments([]);
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');

    modal.removeEventListener('click', meetingViewBackdropHandler);
}

function meetingViewEdit() {
    const currentMeeting = window.meetingViewCurrentMeeting;
    if (!currentMeeting) {
        alert('수정할 회의록 정보를 찾을 수 없습니다.');
        return;
    }
    const sessionName = (document.getElementById('sessionName')?.value || '').trim();
    const authorName = (currentMeeting.author || '').trim();
    if (!sessionName || (authorName && authorName !== sessionName)) {
        alert('작성자만 수정할 수 있습니다.');
        return;
    }
    closeMeetingViewModal();
    openMeetingUploadModal(currentMeeting);
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

// 주 시작일(월요일) 문자열로 제목 계산: "M월 N주차" (간단 표기)
function computeWeekTitle(weekStartStr) {
    if (!weekStartStr) return '';
    const d = parseISODateLocal(weekStartStr);
    if (isNaN(d.getTime())) return weekStartStr;
    const monday = startOfWeekMonday(d);
    const { month, weekIndex } = getMonthWeekIndexFromMonday(monday);
    return `${month}월${weekIndex}주차`;
}

// 주 시작일(월요일) 문자열로 제목 계산: "YYYY년 M월N주차" (연도 포함)
function computeWeekTitleWithYear(weekStartStr) {
    if (!weekStartStr) return '';
    const d = parseISODateLocal(weekStartStr);
    if (isNaN(d.getTime())) return weekStartStr;
    const monday = startOfWeekMonday(d);
    const year = monday.getFullYear();
    const { month, weekIndex } = getMonthWeekIndexFromMonday(monday);
    return `${year}년 ${month}월${weekIndex}주차`;
}

// ISO8601 기준의 주(연도/주번호) 계산
function getISOWeekInfo(date) {
    // 입력은 Date 객체(로컬 날짜)로 가정
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // ISO: 주의 목요일을 기준으로 연도 결정
    const day = d.getDay(); // 0=Sun .. 6=Sat
    const isoDay = (day + 6) % 7; // 0=Mon .. 6=Sun
    const thursday = new Date(d);
    thursday.setDate(d.getDate() + (3 - isoDay));
    const isoYear = thursday.getFullYear();

    // 첫 번째 ISO 주의 목요일(해당 ISO 연도의 첫 번째 목요일)을 찾음
    const jan4 = new Date(isoYear, 0, 4);
    const jan4Day = jan4.getDay();
    const jan4IsoDay = (jan4Day + 6) % 7;
    const firstThursday = new Date(isoYear, 0, 4);
    firstThursday.setDate(4 + (3 - jan4IsoDay));

    const msPerDay = 24 * 60 * 60 * 1000;
    const weekNo = 1 + Math.floor((thursday.getTime() - firstThursday.getTime()) / (7 * msPerDay));

    return { isoYear, isoWeek: weekNo };
}

function _weeklyPickDisplayTitle(w) {
    const raw = (w && w.title != null) ? String(w.title).trim() : '';
    if (raw) {
        if (/\d{2,4}\s*년/.test(raw)) return raw;
        const y = _weeklyParseYearFromWeekStart(w?.week_start);
        if (y) return `${y}년 ${raw}`;
        return raw;
    }

    try {
        const d = parseISODateLocal(w?.week_start);
        if (isNaN(d.getTime())) return '';
        // 확실히 해당 주의 월요일을 기준으로 계산
        const monday = startOfWeekMonday(d);
        const { month, weekIndex } = getMonthWeekIndexFromMonday(monday);
        // 디버그: 데이터 불일치 추적용 콘솔 로그
        console.debug('[weeklyTitle]', 'week_start=', String(w?.week_start), 'parsed=', formatDateISO(d), 'monday=', formatDateISO(monday), 'month=', month, 'weekIndex=', weekIndex);
        return `${month}월${weekIndex}주차`;
    } catch (e) {
        return '';
    }
}

function parseISODateLocal(str) {
    const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(String(str || ''));
    if (!m) return new Date(str);
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(y, mo - 1, d);
}

function startOfWeekMonday(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0=Sun, 1=Mon
    const delta = (day + 6) % 7; // Mon=0 ... Sun=6
    d.setDate(d.getDate() - delta);
    return d;
}

// 월 주차 계산 규칙: "1일이 포함된 주"를 1주차로 간주 (월~일 기준)
function getMonthWeekIndexFromMonday(monday) {
    const base = startOfWeekMonday(monday);
    const yyyy = base.getFullYear();
    const month0 = base.getMonth();
    const firstOfMonth = new Date(yyyy, month0, 1);

    // 이번 달 내부의 첫 번째 월요일을 1주차의 시작으로 삼는다.
    const dow = firstOfMonth.getDay(); // 0=Sun .. 6=Sat
    const daysToFirstMonday = ((1 - dow) + 7) % 7; // 0이면 1일이 월요일
    const firstMonthMonday = new Date(yyyy, month0, 1 + daysToFirstMonday);

    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((base.getTime() - firstMonthMonday.getTime()) / msPerDay);
    const weekIndex = diffDays < 0 ? 0 : Math.floor(diffDays / 7) + 1;
    return { month: month0 + 1, weekIndex };
}

//검색 기능 (연도별 보기 & 모아보기 검색 구분)
function handleSearch(page = 1) {
    searchTerm = document.getElementById('search').value.trim();
    searchYear = document.getElementById("projectYEAR")?.value || "";
    const searchScope = document.getElementById('searchScope')?.value || 'year';

    if (!searchTerm) {
        fetchProjects(1);
        return;
    }

    let searchUrl = `/api/search_projects?term=${encodeURIComponent(searchTerm)}&page=${page}`;
    if (currentView === "yearly") {
        searchUrl += "&type=yearly";
    } else if (currentView === "examine") {
        searchUrl += "&type=examine";
    } else if (searchScope !== 'all' && searchYear) {
        searchUrl += `&year=${searchYear}`;
    }

    fetch(searchUrl)
        .then(response => response.json())
        .then(data => {
            renderTable(data.projects);
            renderPagination(data.current_page, data.total_pages, "search"); //"search" 추가
            document.getElementById("pagination").style.display = "block";
        })
        .catch(error => console.error("Error fetching search results:", error));
}

//긴 텍스트 줄이기 & 괄호 안의 내용 유지
function truncateText(text, maxLength = 25) {
    if (!text) return "-";

    // 마지막 괄호 쌍만 추출
    const match = text.match(/\([^()]*\)\s*$/);
    const bracketContent = match ? match[0] : "";

    // 본문에서 마지막 괄호 제거
    const mainText = match ? text.slice(0, match.index).trim() : text;

    // 자르기 처리
    if (mainText.length > maxLength) {
        return mainText.substring(0, maxLength) + "..." + bracketContent;
    }

    return text;
}

//프로젝트 목록을 테이블에 표시
function renderTable(projects) {
    const tableBody = document.getElementById("projectList_tbody");
    tableBody.innerHTML = "";
    projectRowsCache = Array.isArray(projects) ? [...projects] : [];

    const sortedProjects = sortProjectRows(projectRowsCache);
    updateProjectSortIndicators();

    if ((!Array.isArray(sortedProjects) || sortedProjects.length === 0) && String(searchTerm || '').trim()) {
        const headerCols = document.querySelectorAll('.projectList thead th').length || 5;
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="${headerCols}" style="text-align:center; padding:24px 12px; color:#64748b;">검색결과가 없습니다.</td>`;
        tableBody.appendChild(emptyRow);
        return;
    }

    const formatProgress = (val) => {
        if (val === null || val === undefined) return '-';
        const num = parseFloat(val);
        if (isNaN(num)) return '-';
        const fixed = num.toFixed(2);
        return fixed.replace(/\.0+$/, '').replace(/\.(\d)0$/, '.$1');
    };

    sortedProjects.forEach(project => {
        const outsourcingText = getProjectOutsourcingText(project);
        const statusText = getProjectStatusText(project);
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${truncateText(project.ContractCode, 20)}</td>
            <td>${truncateText(project.ProjectName, 25)}</td>
            <td>${statusText}</td>
            <td>${project.progress ? formatProgress(project.progress) + '%' : '0%'}</td>
            <td>
                ${outsourcingText}
            </td>
        `;

        // 리스크 강조 (has_risk 플래그가 true인 행 붉은 배경)
        if (project.has_risk) {
            row.classList.add('risk-row');
        }

        row.onclick = () => {
            if (project.ContractCode.includes("검토")) {
                window.location.href = `/project_examine/${project.ProjectID}`;
            } else {
                window.location.href = `/project_detail/${project.ProjectID}`;
            }
        };
        tableBody.appendChild(row);
    });
}

//페이지네이션 생성 (검색 유지 추가)
function renderPagination(currentPage, totalPages, type = '') {
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = "";
    if (currentPage > 1) {
        paginationContainer.appendChild(createPageButton("<", currentPage - 1, type));
    }

    // 페이지 범위 조정 (너무 많은 버튼 생성 방지)
    if (totalPages > 10) {
        if (currentPage > 3) paginationContainer.appendChild(createPageButton(1, 1, type));
        if (currentPage > 4) paginationContainer.appendChild(createEllipsis());

        for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
            paginationContainer.appendChild(createPageButton(i, i, type, currentPage));
        }

        if (currentPage < totalPages - 3) paginationContainer.appendChild(createEllipsis());
        if (currentPage < totalPages - 2) paginationContainer.appendChild(createPageButton(totalPages, totalPages, type));
    } else {
        for (let i = 1; i <= totalPages; i++) {
            paginationContainer.appendChild(createPageButton(i, i, type, currentPage));
        }
    }

    if (currentPage < totalPages) {
        paginationContainer.appendChild(createPageButton(">", currentPage + 1, type));
    }
}

//페이지 버튼 생성 (검색어 유지 반영)
function createPageButton(label, page, type, currentPage) {
    const pageButton = document.createElement('button');
    pageButton.innerText = label;
    pageButton.classList.add("pagination-button");
    console.log('type:', type);
    if (page === currentPage) {
        pageButton.classList.add("active");
    }

    pageButton.onclick = () => {
        if (type === "yearly") {
            viewYearlyProjects(page);
        } else if (type === "examine") {
            viewExamineProjects(page);
        } else if (type === "search") {
            handleSearch(page); //검색 결과에서 페이지 변경 시 검색 유지
        }
        else if (type === "status") {
            viewStatusProjects(currentStatus, page);
        } else {
            fetchProjects(page);
        }
    };

    return pageButton;
}

//'...' 버튼 생성
function createEllipsis() {
    const ellipsis = document.createElement('span');
    ellipsis.innerText = '...';
    ellipsis.classList.add("pagination-ellipsis");
    return ellipsis;
}


//현재 활성화된 모아보기 버튼 강조
function setActiveButton(selectedTitle) {
    document.querySelectorAll(".filter-buttons button").forEach(button => {
        if (button.innerText.includes(selectedTitle)) {
            button.classList.add("active");
        } else {
            button.classList.remove("active");
        }
    });
}

//모든 버튼 상태 초기화
function clearActiveButtons() {
    document.querySelectorAll(".filter-buttons button").forEach(button => {
        button.classList.remove("active");
    });
}
//기본 목록으로 복귀하면 페이지네이션 복원
function showAllProjects() {
    location.reload();  // 기본 페이지 새로고침
}

// 다운로드 모달 열기
function openDownload() {
    const modal = document.getElementById('downloadModal');
    modal.classList.add('show');

    // 모달 외부 스크롤 막기
    document.body.style.overflow = 'hidden';

    // 모달 닫기 버튼
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = function () {
        closeDownload();
    }

    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', downloadBackdropHandler);
}

function downloadBackdropHandler(event) {
    const modal = document.getElementById('downloadModal');
    if (event.target === modal) {
        closeDownload();
    }
}

// 다운로드 모달 닫기
function closeDownload() {
    const modal = document.getElementById('downloadModal');
    modal.classList.remove('show');
    modal.removeEventListener('click', downloadBackdropHandler);

    // 모달 외부 스크롤 허용
    document.body.style.overflow = 'auto';
}

// 주간보고서 입력 모달 열기
function openWeeklyInput() {
    const modal = document.getElementById('weeklyInputModal');
    if (!modal) return;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // 제출 버튼 활성화 (템플릿의 disabled 제거 대체)
    const submitBtn = document.getElementById('submitWeeklyBtn');
    if (submitBtn) submitBtn.disabled = false;

    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = function () {
            closeWeeklyInput();
        }
    }

    modal.addEventListener('click', weeklyBackdropHandler);

    // 최초 오픈 시 주/부서 기반으로 표 렌더링
    initWeeklyInput();
}

// 주간보고서 입력 모달 닫기
function closeWeeklyInput() {
    const modal = document.getElementById('weeklyInputModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.removeEventListener('click', weeklyBackdropHandler);
    document.body.style.overflow = 'auto';
}

function weeklyBackdropHandler(event) {
    const modal = document.getElementById('weeklyInputModal');
    if (event.target === modal) {
        closeWeeklyInput();
    }
}

// 주간 입력 초기화: 날짜, 타이틀, 표 구성
let weeklyCurrentMonday = null;
let weeklyToolbarEl = null;
let currentWeeklyEditable = null;
let weeklyToolbarHovering = false;

// ====== 주간일정표(weeklyScheduleTable)만: 부서별 줄 수 제한 (인쇄 기준, 방법 B) ======
const WEEKLY_INPUT_SCHEDULE_LINE_LIMITS = (() => {
    const pairs = [
        ['경영지원부', 5],
        ['총무부', 2],
        ['공공사업부', 4],
        ['공정관리부', 3],
        ['GIS사업부', 5],
        ['공간정보사업부', 4],
        ['기업부설연구소(연구소)', 3],
        ['기업부설연구소', 3],
        ['연구소', 3],
        ['BIT', 3],
        ['BIT 공정관리부', 2]
    ];
    const m = new Map();
    pairs.forEach(([k, v]) => m.set(String(k).replace(/\s+/g, ' ').trim(), v));
    return m;
})();

function weeklyInputNormalizeDeptName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim();
}

function weeklyInputGetScheduleLineLimitForDept(deptName) {
    const key = weeklyInputNormalizeDeptName(deptName);
    const exact = WEEKLY_INPUT_SCHEDULE_LINE_LIMITS.get(key);
    if (exact != null) return exact;

    // 부서명이 약간 달라도 매칭되도록(가장 긴 키 우선)
    let best = null;
    for (const [k, v] of WEEKLY_INPUT_SCHEDULE_LINE_LIMITS.entries()) {
        if (!k) continue;
        if (key.includes(k) || k.includes(key)) {
            if (!best || k.length > best.k.length) best = { k, v };
        }
    }
    return best ? best.v : 3;
}

let __weeklyInputScheduleMeasureBox = null;
let __weeklyInputScheduleMeasureStyleInjected = false;

function weeklyInputCssPxPerMmForPrint() {
    // 인쇄 레이아웃(CSS px)은 보통 96dpi 기준으로 계산됨 (25.4mm = 1in = 96px)
    return 96 / 25.4;
}

function weeklyInputEnsureScheduleMeasureStyles() {
    if (__weeklyInputScheduleMeasureStyleInjected) return;
    const style = document.createElement('style');
    style.id = 'weekly-input-schedule-measure-style';
    style.textContent = `
      .weekly-input-schedule-measure-box p,
      .weekly-input-schedule-measure-box ol,
      .weekly-input-schedule-measure-box ul { margin: 0; }
      .weekly-input-schedule-measure-box ol,
      .weekly-input-schedule-measure-box ul { padding-left: 16px; }
    `;
    document.head.appendChild(style);
    __weeklyInputScheduleMeasureStyleInjected = true;
}

function weeklyInputEnsureScheduleMeasureBox() {
    if (__weeklyInputScheduleMeasureBox && __weeklyInputScheduleMeasureBox.isConnected) return __weeklyInputScheduleMeasureBox;
    weeklyInputEnsureScheduleMeasureStyles();
    const box = document.createElement('div');
    box.className = 'weekly-input-schedule-measure-box';
    box.style.position = 'fixed';
    box.style.left = '-100000px';
    box.style.top = '0';
    box.style.visibility = 'hidden';
    box.style.pointerEvents = 'none';
    box.style.whiteSpace = 'normal';
    box.style.wordBreak = 'break-word';
    box.style.overflowWrap = 'anywhere';
    box.style.boxSizing = 'border-box';
    // weekly_detail 인쇄 CSS와 동일하게 모사
    box.style.fontSize = '11px';
    box.style.lineHeight = '1.35';
    box.style.padding = '6px';
    document.body.appendChild(box);
    __weeklyInputScheduleMeasureBox = box;
    return box;
}

function weeklyInputTrimDomToHeight(containerEl, maxHeightPx) {
    const cleanTrailing = () => {
        while (containerEl.lastChild) {
            const n = containerEl.lastChild;
            if (n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim() === '') {
                n.remove();
                continue;
            }
            if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR') {
                n.remove();
                continue;
            }
            break;
        }
    };

    const getLastLeaf = () => {
        let node = containerEl;
        while (node && node.lastChild) node = node.lastChild;
        return node;
    };

    cleanTrailing();
    let guard = 0;
    while (containerEl.scrollHeight > maxHeightPx && guard < 2000) {
        guard += 1;
        const leaf = getLastLeaf();
        if (!leaf || leaf === containerEl) break;

        if (leaf.nodeType === Node.TEXT_NODE) {
            const original = leaf.textContent || '';
            if (!original) {
                leaf.remove();
                cleanTrailing();
                continue;
            }

            let lo = 0;
            let hi = original.length;
            let best = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                leaf.textContent = original.slice(0, mid);
                if (containerEl.scrollHeight <= maxHeightPx) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            leaf.textContent = original.slice(0, best).replace(/\s+$/g, '');
            if (!leaf.textContent) leaf.remove();
            cleanTrailing();
            continue;
        }

        if (leaf.nodeType === Node.ELEMENT_NODE) {
            leaf.remove();
            cleanTrailing();
            continue;
        }

        leaf.remove();
        cleanTrailing();
    }
}

function weeklyInputScheduleMaxHeightPxForLines(maxLines) {
    const lineHeightPx = 11 * 1.35;
    return (6 * 2) + (lineHeightPx * Math.max(1, maxLines)) + 2;
}

function weeklyInputScheduleCellWidthPxForPrint() {
    // weekly_detail 인쇄 기준 폭(277mm) + 부서 칸 90px(인쇄 CSS)
    const ppm = weeklyInputCssPxPerMmForPrint();
    const totalWidthPx = 277 * ppm;
    const deptWidthPx = 90;
    return (totalWidthPx - deptWidthPx) / 6;
}

function weeklyInputTrimHtmlToPrintLines(html, widthPx, maxLines) {
    const box = weeklyInputEnsureScheduleMeasureBox();
    box.style.width = `${Math.max(40, Math.floor(widthPx))}px`;
    box.innerHTML = html || '';
    const maxHeightPx = weeklyInputScheduleMaxHeightPxForLines(maxLines);
    if (box.scrollHeight <= maxHeightPx) return html || '';
    weeklyInputTrimDomToHeight(box, maxHeightPx);
    return box.innerHTML;
}

function weeklyInputIsScheduleEditable(el) {
    return !!(el && el.classList && el.classList.contains('weekly-editable') && el.closest && el.closest('#weeklyScheduleTable'));
}

function weeklyInputScheduleWouldOverflowHtml(html, widthPx, maxLines) {
    const box = weeklyInputEnsureScheduleMeasureBox();
    box.style.width = `${Math.max(40, Math.floor(widthPx))}px`;
    box.innerHTML = html || '';
    const maxHeightPx = weeklyInputScheduleMaxHeightPxForLines(maxLines);
    return box.scrollHeight > maxHeightPx;
}

function weeklyInputScheduleLiveValidate(el, { showAlert = true } = {}) {
    if (!weeklyInputIsScheduleEditable(el)) return true;

    const deptTd = document.querySelector('#weeklyScheduleTable tbody tr td:first-child');
    const deptNameRaw = (deptTd && deptTd.textContent) ? deptTd.textContent : (getSessionDepartment() || '');
    const deptName = weeklyInputNormalizeDeptName(deptNameRaw);
    const maxLines = weeklyInputGetScheduleLineLimitForDept(deptName);
    const widthPx = weeklyInputScheduleCellWidthPxForPrint();

    const currentHtml = el.innerHTML || '';
    const overflow = weeklyInputScheduleWouldOverflowHtml(currentHtml, widthPx, maxLines);
    if (!overflow) {
        el.dataset.weeklyLastGoodHtml = currentHtml;
        return true;
    }

    const fallback = el.dataset.weeklyLastGoodHtml ?? '';
    if (fallback !== currentHtml) el.innerHTML = fallback;

    if (showAlert) {
        const now = Date.now();
        const last = Number(el.dataset.weeklyLastAlertAt || '0');
        if (!Number.isFinite(last) || now - last > 800) {
            el.dataset.weeklyLastAlertAt = String(now);
            alert(`[${deptName || '부서'}] 일정표는 칸당 최대 ${maxLines}줄까지만 입력할 수 있습니다.`);
        }
    }
    return false;
}

function weeklyInputTrimScheduleCellsBeforeSubmit() {
    const deptTd = document.querySelector('#weeklyScheduleTable tbody tr td:first-child');
    const deptNameRaw = (deptTd && deptTd.textContent) ? deptTd.textContent : (getSessionDepartment() || '');
    const maxLines = weeklyInputGetScheduleLineLimitForDept(deptNameRaw);
    const widthPx = weeklyInputScheduleCellWidthPxForPrint();

    const scheduleEditables = document.querySelectorAll('#weeklyScheduleTable tbody .weekly-editable');
    scheduleEditables.forEach((cell) => {
        cell.innerHTML = weeklyInputTrimHtmlToPrintLines(cell.innerHTML, widthPx, maxLines);
    });
}

function weeklyInputDeptLabelHtml(deptName) {
    const name = String(deptName || '내 부서');
    const limit = weeklyInputGetScheduleLineLimitForDept(name);
    return `${escapeHtml(name)}<span class="dept-line-limit"> (${limit}줄)</span>`;
}

function initWeeklyInput() {
    const dept = getSessionDepartment();
    const isAdmin = isWeeklyAdminByName();

    // 기본 주차: 일반 사용자는 차주, 관리자는 금주
    weeklyCurrentMonday = isAdmin
        ? getNearestMonday(new Date())
        : addDays(getNearestMonday(new Date()), 7);

    weeklyInputSetAdminMode(isAdmin);
    renderWeeklyTitle(weeklyCurrentMonday);

    if (isAdmin) {
        weeklyInputInitAdminWeekPicker(weeklyCurrentMonday);
        weeklyInputFetchAndRenderAll(weeklyCurrentMonday);
        return;
    }

    renderWeeklyScheduleTable(weeklyCurrentMonday, dept);
    renderWeeklyIssuesTable(dept);

    // 해당 주차에 이미 데이터가 있으면 입력창에도 미리 채움(weekly_detail 조회 API 재사용)
    weeklyInputFetchAndPopulateExisting(weeklyCurrentMonday, dept);

    // 에디터 툴바 생성 및 편집 영역 바인딩
    createWeeklyToolbar();
    bindWeeklyEditableEvents();
}

function weeklyInputCanonDept(name) {
    const n = weeklyInputNormalizeDeptName(name);
    const alias = {
        'GIS사업지원부': 'GIS사업부',
        'GIS지원사업부': 'GIS사업부',
        'BIT공정관리부': 'BIT 공정관리부',
        '연구소': '기업부설연구소',
        '기업부설연구소(연구소)': '기업부설연구소',
    };
    return alias[n] || n;
}

function weeklyInputAllEditablesEmpty() {
    const editables = document.querySelectorAll('#weeklyScheduleTable tbody .weekly-editable, #weeklyIssuesTable tbody .weekly-editable');
    return Array.from(editables).every(el => ((el.innerHTML || '').replace(/<br\s*\/?>/gi, '').trim() === ''));
}

function weeklyInputSetLoadingState(isLoading) {
    const submitBtn = document.getElementById('submitWeeklyBtn');
    if (submitBtn) submitBtn.disabled = !!isLoading;
}

function weeklyInputApplyExistingData(deptObj, deptNameForLimits) {
    const schedule = (deptObj && deptObj.schedule) ? deptObj.schedule : {};
    const issues = (deptObj && deptObj.issues) ? deptObj.issues : {};

    // 일정표는 인쇄 기준 줄 수 제한을 맞춰서 주입
    const maxLines = weeklyInputGetScheduleLineLimitForDept(deptNameForLimits);
    const widthPx = weeklyInputScheduleCellWidthPxForPrint();
    const scheduleHtmls = [
        schedule.mon || '',
        schedule.tue || '',
        schedule.wed || '',
        schedule.thu || '',
        schedule.fri || '',
        schedule.sat || '',
    ].map(html => weeklyInputTrimHtmlToPrintLines(html, widthPx, maxLines));

    const scheduleEditables = document.querySelectorAll('#weeklyScheduleTable tbody .weekly-editable');
    scheduleHtmls.forEach((html, i) => {
        const el = scheduleEditables[i];
        if (!el) return;
        el.innerHTML = html;
        el.dataset.weeklyLastGoodHtml = el.innerHTML || '';
    });

    const issuesEditables = document.querySelectorAll('#weeklyIssuesTable tbody .weekly-editable');
    if (issuesEditables[0]) issuesEditables[0].innerHTML = issues.prev || '';
    if (issuesEditables[1]) issuesEditables[1].innerHTML = issues.curr || '';
}

function weeklyInputFetchAndPopulateExisting(monday, dept) {
    try {
        if (!monday) return;
        const weekStart = formatDateISO(monday);
        const deptCanon = weeklyInputCanonDept(dept);

        weeklyInputSetLoadingState(true);
        fetch(`/api/weekly_detail?week_start=${encodeURIComponent(weekStart)}`)
            .then(r => r.json())
            .then(data => {
                if (!data || !data.ok) return;
                if (!weeklyInputAllEditablesEmpty()) return; // 사용자가 이미 입력을 시작했으면 덮어쓰지 않음

                const departments = Array.isArray(data.departments) ? data.departments : [];
                const target = departments.find(d => weeklyInputCanonDept(d.department) === deptCanon)
                    || departments.find(d => weeklyInputNormalizeDeptName(d.department) === weeklyInputNormalizeDeptName(dept))
                    || null;
                if (!target) return;

                const hasAny = (obj) => {
                    try {
                        const s = (obj && obj.schedule) ? obj.schedule : {};
                        const i = (obj && obj.issues) ? obj.issues : {};
                        const schAny = ['mon','tue','wed','thu','fri','sat'].some(k => String(s[k] || '').trim() !== '');
                        const issAny = ['prev','curr'].some(k => String(i[k] || '').trim() !== '');
                        return schAny || issAny;
                    } catch (_) { return false; }
                };
                if (!hasAny(target)) return;

                weeklyInputApplyExistingData(target, deptCanon || dept);
            })
            .catch(err => {
                console.warn('weeklyInputFetchAndPopulateExisting error:', err);
            })
            .finally(() => {
                weeklyInputSetLoadingState(false);
            });
    } catch (e) {
        weeklyInputSetLoadingState(false);
    }
}

function weeklyInputInitAdminWeekPicker(monday) {
    const picker = document.getElementById('weeklyWeekStartPicker');
    const applyBtn = document.getElementById('weeklyWeekStartApply');
    if (!picker) return;

    const enforceFourDigitYear = () => {
        const raw = String(picker.value || '');
        if (!raw) return;

        if (/^\d{5,}$/.test(raw)) {
            picker.value = raw.slice(0, 4);
            return;
        }

        const parts = raw.split('-');
        if (!parts.length) return;
        if (parts[0].length > 4) {
            parts[0] = parts[0].slice(0, 4);
            picker.value = parts.join('-');
        }
    };

    picker.value = formatDateISO(monday);
    picker.addEventListener('input', enforceFourDigitYear);
    picker.addEventListener('blur', enforceFourDigitYear);

    const apply = () => {
        const value = picker.value;
        if (!value) return;
        const picked = new Date(value);
        if (Number.isNaN(picked.getTime())) return;
        const nextMonday = getNearestMonday(picked);
        weeklyCurrentMonday = nextMonday;
        renderWeeklyTitle(nextMonday);
        weeklyInputFetchAndRenderAll(nextMonday);
    };

    picker.onchange = apply;
    if (applyBtn) applyBtn.onclick = apply;
}

function weeklyInputFetchAndRenderAll(monday) {
    try {
        if (!monday) return;
        const weekStart = formatDateISO(monday);
        weeklyInputSetLoadingState(true);
        fetch(`/api/weekly_detail?week_start=${encodeURIComponent(weekStart)}`)
            .then(r => r.json())
            .then(data => {
                if (!data || !data.ok) {
                    renderWeeklyScheduleTableForAdmin(monday, []);
                    renderWeeklyIssuesTableForAdmin([]);
                    return;
                }
                const departments = Array.isArray(data.departments) ? data.departments : [];
                renderWeeklyScheduleTableForAdmin(monday, departments);
                renderWeeklyIssuesTableForAdmin(departments);
            })
            .catch(err => {
                console.warn('weeklyInputFetchAndRenderAll error:', err);
                renderWeeklyScheduleTableForAdmin(monday, []);
                renderWeeklyIssuesTableForAdmin([]);
            })
            .finally(() => {
                weeklyInputSetLoadingState(false);
                createWeeklyToolbar();
                bindWeeklyEditableEvents();
            });
    } catch (e) {
        weeklyInputSetLoadingState(false);
    }
}

// (주차 변경 화살표 기능 제거로 shiftWeeklyInput 비활성화)

// Date helpers
function getNearestMonday(d) {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = date.getDay(); // 0 Sun ... 6 Sat
    const diff = (day === 0 ? -6 : 1 - day); // move to Monday
    date.setDate(date.getDate() + diff);
    return date;
}

function addDays(d, n) {
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    dd.setDate(dd.getDate() + n);
    return dd;
}

function formatDateISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getSessionDepartment() {
    const deptEl = document.getElementById('sessionDept');
    const dept = (deptEl && deptEl.value) ? deptEl.value : '';
    return dept;
}

function getSessionName() {
    const nameEl = document.getElementById('sessionName');
    return (nameEl && nameEl.value) ? String(nameEl.value).trim() : '';
}

function isWeeklyAdminByName() {
    return getSessionName() === '관리자';
}

function weeklyInputSetAdminMode(isAdmin) {
    const controls = document.getElementById('weeklyAdminControls');
    if (controls) controls.style.display = isAdmin ? 'flex' : 'none';

    const splitBtn = document.getElementById('splitWeeklyBtn');
    if (splitBtn) splitBtn.style.display = isAdmin ? 'inline-block' : 'none';

    const submitBtn = document.getElementById('submitWeeklyBtn');
    if (submitBtn) submitBtn.disabled = false;
}

function renderWeeklyTitle(monday) {
    const end = addDays(monday, 6);
    const sm = monday.getMonth() + 1;
    const em = end.getMonth() + 1;
    // 항상 ~M/D 형식으로 표기
    const range = `${sm}/${monday.getDate()}~${em}/${end.getDate()}`;
    // 월 기준 주차(해당 월의 첫 월요일을 1주차로 계산) 표시
    const year = monday.getFullYear();
    const { month, weekIndex } = getMonthWeekIndexFromMonday(monday);
    const label = `${year}년 ${month}월${weekIndex}주차`;

    const scheduleRangeEl = document.getElementById('weeklyScheduleRange');
    if (scheduleRangeEl) scheduleRangeEl.textContent = `(${label} ${range})`;

    const issuesTitleEl = document.getElementById('weeklyIssuesTitle');
    if (issuesTitleEl) issuesTitleEl.textContent = `(${label} ${range})`;
}

function renderWeeklyScheduleTable(monday, dept) {
    const table = document.getElementById('weeklyScheduleTable');
    if (!table) return;
    // 헤더 구성
    const headers = ['부서'];
    const dayNames = ['월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 6; i++) {
        const d = addDays(monday, i);
        headers.push(`${dayNames[i]}(${d.getDate()})`);
    }
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const deptTd = document.createElement('td');
    // 수정 모달(입력)에서만: 부서명 옆에 (N줄) 표기
    deptTd.innerHTML = weeklyInputDeptLabelHtml(dept || '내 부서');
    deptTd.style.width = '160px';
    deptTd.style.whiteSpace = 'nowrap';
    deptTd.style.wordBreak = 'keep-all';
    tr.appendChild(deptTd);
    for (let i = 0; i < 6; i++) {
        const td = document.createElement('td');
        td.style.verticalAlign = 'top';
        const div = document.createElement('div');
        div.contentEditable = true;
        div.className = 'weekly-editable';
        // 철자/문법 검사 및 자동 교정 비활성화 (빨간 밑줄 방지)
        div.setAttribute('spellcheck', 'false');
        div.setAttribute('autocorrect', 'off');
        div.setAttribute('autocapitalize', 'off');
        // Grammarly 등 확장 플러그인 비활성화 힌트
        div.setAttribute('data-gramm', 'false');
        div.setAttribute('data-gramm_editor', 'false');
        // 셀 내부 스크롤 처리: 테이블 높이 증가 방지
        div.style.height = '100px';
        div.style.maxHeight = '100px';
        div.style.overflowY = 'auto';
        div.style.outline = 'none';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordBreak = 'break-word';
        div.style.paddingRight = '4px';
        // 초기 상태 저장(실시간 제한용)
        div.dataset.weeklyLastGoodHtml = div.innerHTML || '';
        td.appendChild(div);
        tr.appendChild(td);
    }
    tbody.appendChild(tr);
    table.appendChild(tbody);
}

function renderWeeklyScheduleTableForAdmin(monday, departments) {
    const table = document.getElementById('weeklyScheduleTable');
    if (!table) return;
    const headers = ['부서'];
    const dayNames = ['월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 6; i++) {
        const d = addDays(monday, i);
        headers.push(`${dayNames[i]}(${d.getDate()})`);
    }
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const list = Array.isArray(departments) ? departments : [];
    const rows = list.length ? list : [{ department: '-' }];

    rows.forEach((deptObj) => {
        const tr = document.createElement('tr');
        const deptTd = document.createElement('td');
        const deptName = deptObj?.department || '-';
        deptTd.innerHTML = weeklyInputDeptLabelHtml(deptName);
        deptTd.style.width = '160px';
        deptTd.style.whiteSpace = 'nowrap';
        deptTd.style.wordBreak = 'keep-all';
        tr.appendChild(deptTd);

        const schedule = deptObj?.schedule || {};
        const values = [schedule.mon, schedule.tue, schedule.wed, schedule.thu, schedule.fri, schedule.sat];
        values.forEach((val) => {
            const td = document.createElement('td');
            td.style.verticalAlign = 'top';
            const div = document.createElement('div');
            div.contentEditable = true;
            div.className = 'weekly-editable';
            div.innerHTML = val || '';
            div.setAttribute('spellcheck', 'false');
            div.setAttribute('autocorrect', 'off');
            div.setAttribute('autocapitalize', 'off');
            div.setAttribute('data-gramm', 'false');
            div.setAttribute('data-gramm_editor', 'false');
            div.style.height = '100px';
            div.style.maxHeight = '100px';
            div.style.overflowY = 'auto';
            div.style.outline = 'none';
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordBreak = 'break-word';
            div.style.paddingRight = '4px';
            div.dataset.weeklyLastGoodHtml = div.innerHTML || '';
            td.appendChild(div);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

function renderWeeklyIssuesTable(dept) {
    const table = document.getElementById('weeklyIssuesTable');
    if (!table) return;
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['부서', '전주', '금주'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const deptTd = document.createElement('td');
    deptTd.textContent = dept || '내 부서';
    deptTd.style.width = '160px';
    deptTd.style.whiteSpace = 'nowrap';
    deptTd.style.wordBreak = 'keep-all';
    tr.appendChild(deptTd);

    ['prev', 'curr'].forEach(() => {
        const td = document.createElement('td');
        td.style.verticalAlign = 'top';
        const div = document.createElement('div');
        div.contentEditable = true;
        div.className = 'weekly-editable';
        // 철자/문법 검사 및 자동 교정 비활성화 (빨간 밑줄 방지)
        div.setAttribute('spellcheck', 'false');
        div.setAttribute('autocorrect', 'off');
        div.setAttribute('autocapitalize', 'off');
        div.setAttribute('data-gramm', 'false');
        div.setAttribute('data-gramm_editor', 'false');
        // 셀 내부 스크롤 처리: 테이블 높이 증가 방지
        div.style.height = '355px';
        div.style.maxHeight = '355px';
        div.style.overflowY = 'auto';
        div.style.outline = 'none';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordBreak = 'break-word';
        div.style.paddingRight = '4px';
        td.appendChild(div);
        tr.appendChild(td);
    });
    tbody.appendChild(tr);
    table.appendChild(tbody);
}

function renderWeeklyIssuesTableForAdmin(departments) {
    const table = document.getElementById('weeklyIssuesTable');
    if (!table) return;
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['부서', '전주', '금주'].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const list = Array.isArray(departments) ? departments : [];
    const rows = list.length ? list : [{ department: '-' }];

    rows.forEach((deptObj) => {
        const tr = document.createElement('tr');
        const deptTd = document.createElement('td');
        deptTd.textContent = deptObj?.department || '-';
        deptTd.style.width = '160px';
        deptTd.style.whiteSpace = 'nowrap';
        deptTd.style.wordBreak = 'keep-all';
        tr.appendChild(deptTd);

        const issues = deptObj?.issues || {};
        [issues.prev || '', issues.curr || ''].forEach((val) => {
            const td = document.createElement('td');
            td.style.verticalAlign = 'top';
            const div = document.createElement('div');
            div.contentEditable = true;
            div.className = 'weekly-editable';
            div.innerHTML = val;
            div.setAttribute('spellcheck', 'false');
            div.setAttribute('autocorrect', 'off');
            div.setAttribute('autocapitalize', 'off');
            div.setAttribute('data-gramm', 'false');
            div.setAttribute('data-gramm_editor', 'false');
            div.style.height = '355px';
            div.style.maxHeight = '355px';
            div.style.overflowY = 'auto';
            div.style.outline = 'none';
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordBreak = 'break-word';
            div.style.paddingRight = '4px';
            td.appendChild(div);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

function weeklyInputExtractDeptName(raw) {
    const text = String(raw || '').replace(/\s*\(\d+\s*줄\)\s*$/g, '').trim();
    return text || '';
}

function weeklyInputCollectAllDepartments() {
    const map = new Map();

    const scheduleRows = document.querySelectorAll('#weeklyScheduleTable tbody tr');
    scheduleRows.forEach((tr) => {
        const cells = tr.querySelectorAll('td');
        const deptName = weeklyInputExtractDeptName(cells[0]?.textContent || '');
        if (!deptName) return;
        const editables = tr.querySelectorAll('.weekly-editable');
        const schedule = {
            mon: editables[0]?.innerHTML || '',
            tue: editables[1]?.innerHTML || '',
            wed: editables[2]?.innerHTML || '',
            thu: editables[3]?.innerHTML || '',
            fri: editables[4]?.innerHTML || '',
            sat: editables[5]?.innerHTML || '',
        };
        map.set(deptName, {
            department: deptName,
            schedule,
            issues: { prev: '', curr: '' },
        });
    });

    const issueRows = document.querySelectorAll('#weeklyIssuesTable tbody tr');
    issueRows.forEach((tr) => {
        const cells = tr.querySelectorAll('td');
        const deptName = weeklyInputExtractDeptName(cells[0]?.textContent || '');
        if (!deptName) return;
        const editables = tr.querySelectorAll('.weekly-editable');
        const issues = {
            prev: editables[0]?.innerHTML || '',
            curr: editables[1]?.innerHTML || '',
        };
        const existing = map.get(deptName) || {
            department: deptName,
            schedule: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '' },
            issues: { prev: '', curr: '' },
        };
        existing.issues = issues;
        map.set(deptName, existing);
    });

    return Array.from(map.values());
}

// 임시 저장/제출은 차후 API 연동 예정
function _collectWeeklyPayload() {
    // 주 시작일(월요일)
    const week_start = formatDateISO(weeklyCurrentMonday);

    if (isWeeklyAdminByName()) {
        const departments = weeklyInputCollectAllDepartments();
        return { week_start, departments };
    }

    // 일정표 칸만: 부서별 줄 수 제한(인쇄 기준) 적용
    weeklyInputTrimScheduleCellsBeforeSubmit();

    // 주간 일정: 월~토 6개 편집 영역
    const scheduleEditables = document.querySelectorAll('#weeklyScheduleTable tbody .weekly-editable');
    const schedule = {
        mon: scheduleEditables[0]?.innerHTML || '',
        tue: scheduleEditables[1]?.innerHTML || '',
        wed: scheduleEditables[2]?.innerHTML || '',
        thu: scheduleEditables[3]?.innerHTML || '',
        fri: scheduleEditables[4]?.innerHTML || '',
        sat: scheduleEditables[5]?.innerHTML || ''
    };

    // 이슈: 전주/금주 2개 편집 영역
    const issuesEditables = document.querySelectorAll('#weeklyIssuesTable tbody .weekly-editable');
    const issues = {
        prev: issuesEditables[0]?.innerHTML || '',
        curr: issuesEditables[1]?.innerHTML || ''
    };

    return { week_start, schedule, issues };
}

function saveWeeklyDraft() {
    const payload = _collectWeeklyPayload();
    fetch('/api/weekly/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(async r => {
            if (!r.ok) {
                const txt = await r.text().catch(() => '');
                throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
            }
            return r.json();
        })
        .then(res => {
            if (res.ok) {
                alert('임시 저장되었습니다.');
            } else {
                alert(res.message || '임시 저장에 실패했습니다.');
            }
        })
        .catch(err => {
            console.error('saveWeeklyDraft error:', err);
            alert('임시 저장 중 오류가 발생했습니다.');
        });
}

function submitWeekly() {
    const payload = _collectWeeklyPayload();
    fetch('/api/weekly/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(async r => {
            if (!r.ok) {
                const txt = await r.text().catch(() => '');
                throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
            }
            return r.json();
        })
        .then(res => {
            if (res.ok) {
                alert('제출되었습니다.');
                closeWeeklyInput();
                // 목록 갱신(선택 사항)
                if (typeof viewWeeklyReports === 'function') {
                    viewWeeklyReports();
                }
            } else {
                alert(res.message || '제출에 실패했습니다.');
            }
        })
        .catch(err => {
            console.error('submitWeekly error:', err);
            alert(`제출 중 오류가 발생했습니다.\n${err.message || err}`);
        });
}

// ====== 경량 에디터(파랑/빨강/굵게/기본) ======
function createWeeklyToolbar() {
    if (weeklyToolbarEl) return;
    const el = document.createElement('div');
    el.id = 'weekly-inline-toolbar';
    el.style.position = 'absolute';
    el.style.display = 'none';
    el.style.background = '#ffffff';
    el.style.border = '1px solid #e5e7eb';
    el.style.borderRadius = '6px';
    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
    el.style.padding = '6px';
    el.style.gap = '6px';
    el.style.zIndex = '9999';
    el.style.fontFamily = 'inherit';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.whiteSpace = 'nowrap';

    const mkBtn = (label, onClick, extraStyle = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.padding = '4px 8px';
        b.style.border = '1px solid #cbd5e1';
        b.style.background = '#f8fafc';
        b.style.borderRadius = '4px';
        b.style.cursor = 'pointer';
        b.style.fontSize = '12px';
        if (extraStyle) b.style.cssText += ';' + extraStyle;
        b.addEventListener('mousedown', (e) => { e.preventDefault(); });
        b.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentWeeklyEditable) currentWeeklyEditable.focus();
            onClick();
        });
        return b;
    };

    const btnBlue = mkBtn('파랑', () => weeklyApplyColor('#2563eb'), 'color:#2563eb');
    const btnRed = mkBtn('빨강', () => weeklyApplyColor('#ef4444'), 'color:#ef4444');
    const btnBold = mkBtn('굵게', weeklyToggleBold, 'font-weight:600');
    const btnReset = mkBtn('기본', weeklyClearFormat, '');

    el.appendChild(btnBlue);
    el.appendChild(btnRed);
    el.appendChild(btnBold);
    el.appendChild(btnReset);

    document.body.appendChild(el);
    weeklyToolbarEl = el;
    // 툴바 위에 마우스가 있으면 숨김 방지
    weeklyToolbarEl.addEventListener('mouseenter', () => { weeklyToolbarHovering = true; });
    weeklyToolbarEl.addEventListener('mouseleave', () => { weeklyToolbarHovering = false; });

    // 모달 스크롤/윈도우 스크롤 시 위치 재계산
    const modalBody = document.querySelector('#weeklyInputModal .modal-content');
    const reposition = () => positionWeeklyToolbar();
    window.addEventListener('scroll', reposition, true);
    if (modalBody) modalBody.addEventListener('scroll', reposition, true);

    // 편집영역/툴바 외부 클릭 시 툴바 숨김
    document.addEventListener('mousedown', (e) => {
        if (!weeklyToolbarEl) return;
        const inToolbar = weeklyToolbarEl.contains(e.target);
        const inEditable = currentWeeklyEditable && currentWeeklyEditable.contains(e.target);
        const weeklyModal = document.getElementById('weeklyInputModal');
        const inWeeklyModal = weeklyModal ? weeklyModal.contains(e.target) : false;
        if (inWeeklyModal && !inToolbar && !inEditable) hideWeeklyToolbar();
    }, true);
}

function bindWeeklyEditableEvents() {
    currentWeeklyEditable = null;
    const editables = document.querySelectorAll('#weeklyInputModal .weekly-editable');

    editables.forEach(el => {

        // focus만으로 충분 (click 제거 권장)
        el.addEventListener('focus', () => {
            currentWeeklyEditable = el;
            showWeeklyToolbar();
        });

        el.addEventListener('keyup', () => {
            currentWeeklyEditable = el;
            positionWeeklyToolbar();
            // 일정표 칸만: 인쇄 기준 줄 수 초과 입력 방지
            weeklyInputScheduleLiveValidate(el);
        });

        el.addEventListener('input', () => {
            // 일정표 칸만: 인쇄 기준 줄 수 초과 입력 방지
            weeklyInputScheduleLiveValidate(el);
        });

        el.addEventListener('mouseup', () => {
            currentWeeklyEditable = el;
            positionWeeklyToolbar();
        });

        el.addEventListener('blur', () => {
            setTimeout(() => {
                const active = document.activeElement;

                const focusInToolbar =
                    weeklyToolbarEl && weeklyToolbarEl.contains(active);

                const focusInAnotherEditable =
                    active &&
                    active.classList &&
                    active.classList.contains('weekly-editable');

                // ★ 핵심 조건
                if (!weeklyToolbarHovering &&
                    !focusInToolbar &&
                    !focusInAnotherEditable) {
                    hideWeeklyToolbar();
                }
            }, 0); // 120ms 필요 없음
        });

        // 붙여넣기 시 원본(HWP/Word 등) 서식 제거 → 평문으로 삽입
        el.addEventListener('paste', (e) => {
            try {
                e.preventDefault();
                const cd = e.clipboardData || window.clipboardData;
                let text = cd ? (cd.getData('text/plain') || '') : '';
                if (!text) return;
                text = text.replace(/\r\n?/g, '\n');
                if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                    document.execCommand('insertText', false, text);
                } else {
                    const html = escapeHtml(text).replace(/\n/g, '<br>');
                    document.execCommand('insertHTML', false, html);
                }
                // 삽입 후 검증
                setTimeout(() => weeklyInputScheduleLiveValidate(el), 0);
            } catch (_) { /* no-op */ }
        });

        // 드래그&드롭으로도 서식 유입 방지
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            const dt = e.dataTransfer;
            let text = dt ? (dt.getData('text/plain') || '') : '';
            if (!text) return;
            text = text.replace(/\r\n?/g, '\n');
            if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, text);
            } else {
                const html = escapeHtml(text).replace(/\n/g, '<br>');
                document.execCommand('insertHTML', false, html);
            }
            // 삽입 후 검증
            setTimeout(() => weeklyInputScheduleLiveValidate(el), 0);
        });
    });
}

function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect && rect.width >= 0 && rect.height >= 0) return rect;
    return null;
}

function positionWeeklyToolbar() {
    if (!weeklyToolbarEl || !currentWeeklyEditable) return;
    // tbody를 가리지 않도록: 활성 셀과 같은 컬럼의 thead th 좌상단에 고정 배치
    const margin = 2;
    let left = 8;
    let top = 8;

    const td = currentWeeklyEditable.closest ? currentWeeklyEditable.closest('td') : currentWeeklyEditable.parentElement;
    if (td) {
        const row = td.parentElement;
        const colIndex = Array.prototype.indexOf.call(row.children, td);
        const table = row.closest ? row.closest('table') : null;
        const ths = table ? table.querySelectorAll('thead th') : null;

        if (ths && ths.length) {
            const th = ths[Math.min(colIndex, ths.length - 1)];
            const rectTh = th.getBoundingClientRect();
            left = window.scrollX + rectTh.left + margin;
            top = window.scrollY + rectTh.top + margin; // thead 영역을 덮도록 위치
        } else {
            // thead가 없으면 셀 위쪽으로 띄워서 배치(본문 가림 최소화)
            const rectTd = td.getBoundingClientRect();
            left = window.scrollX + rectTd.left + margin;
            top = window.scrollY + rectTd.top - weeklyToolbarEl.offsetHeight - 4;
        }
    } else {
        const rect = currentWeeklyEditable.getBoundingClientRect();
        left = window.scrollX + rect.left + margin;
        top = window.scrollY + rect.top - weeklyToolbarEl.offsetHeight - 4;
    }

    // 뷰포트 넘침 방지(좌우/상단)
    const maxLeft = window.scrollX + document.documentElement.clientWidth - weeklyToolbarEl.offsetWidth - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    weeklyToolbarEl.style.left = left + 'px';
    weeklyToolbarEl.style.top = top + 'px';
}

function showWeeklyToolbar() {
    if (!weeklyToolbarEl) return;
    weeklyToolbarEl.style.display = 'inline-flex';
    positionWeeklyToolbar();
}

function hideWeeklyToolbar() {
    if (!weeklyToolbarEl) return;
    weeklyToolbarEl.style.display = 'none';
}

function ensureSelectionInEditable() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const container = sel.getRangeAt(0).commonAncestorContainer;
    const node = container.nodeType === 1 ? container : container.parentNode;
    if (currentWeeklyEditable && currentWeeklyEditable.contains(node)) return true;
    if (currentWeeklyEditable) currentWeeklyEditable.focus();
    return !!currentWeeklyEditable;
}

function weeklyApplyColor(color) {
    if (!ensureSelectionInEditable()) return;
    document.execCommand('foreColor', false, color);
}

function weeklyToggleBold() {
    if (!ensureSelectionInEditable()) return;
    document.execCommand('bold');
}

function weeklyClearFormat() {
    if (!ensureSelectionInEditable()) return;
    document.execCommand('removeFormat');
    // 글자색 기본(검정)으로
    document.execCommand('foreColor', false, '#111827');
}

// 안전한 HTML 이스케이프 (붙여넣기 평문 처리용)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

//설정 모달
function openSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    resetSettingsAccountEditState();
    loadExpenseYears();
    initSettingsAccountUi();
    // 모달 닫기 버튼
    const closeBtn = modal.querySelector('.close');
    if (closeBtn && closeBtn.dataset.bound !== '1') {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', closeSettingsModal);
    }

    if (modal.dataset.backdropBound !== '1') {
        modal.dataset.backdropBound = '1';
        modal.addEventListener('click', function settingsBackdropHandler(event) {
            if (event.target === modal) {
                closeSettingsModal();
            }
        });
    }

    // 탭 기능
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        if (button.dataset.bound === '1') return;
        button.dataset.bound = '1';
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const pane = document.getElementById(tabId);
            if (pane) pane.classList.add('active');
        });
    });
}

// 테이블 내 td 클릭 시 textbox로 변경하는 함수
function TextChange(td, isText = false) {
    // 이미 input이 있는 경우 return
    if (td.querySelector('input')) return;

    // input 생성 및 설정
    const input = document.createElement('input');
    input.type = 'text';
    input.value = td.innerText;  // 기존 값을 초기값으로 설정
    input.classList.add('editable-input');

    // td 크기와 동일하게 input 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const savetd = td.innerText;  // 기존 값을 저장

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

    // td 내용 교체
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    // 입력 이벤트
    input.addEventListener('input', () => {
        let value = input.value.replace(/,/g, '');  // 콤마 제거

        // 숫자 유효성 검사
        if (value && isNumeric(value)) {
            input.value = formatWithCommas(value);  // 콤마 추가
        } else if (!isText) {
            console.log('Invalid input');
        }
    });

    // blur 이벤트
    input.addEventListener('blur', () => {
        const value = input.value.replace(/,/g, '');

        // 숫자 유효성 검사 (isText가 false일 때만)
        if (!isText && value !== '' && !isNumeric(value)) {
            alert('숫자만 입력할 수 있습니다.');
            td.innerText = '0';
        } else {
            // 유효한 값이면 포맷팅하여 표시
            const formattedValue = isText ? value : formatWithCommas(value);
            td.innerText = formattedValue;
        }
    });

    // Enter 키 이벤트
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

function loadStandardData(year) {
    if (!year) {
        year = document.getElementById('expenseYear').value;
    }

    // 요청 경로와 파라미터 확인
    console.log(`Fetching data for year: ${year}`); // 디버깅용

    fetch(`/PMS_Expenses/${year}?format=json`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Received data:', data); // 디버깅용
            const tbody = document.getElementById('standard-tbody');
            tbody.innerHTML = '';

            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.Position}</td>
                    <td class="editable" onclick="TextChange(this)">${formatWithCommas(row.MonthlyAverageSalary)}</td>
                    <td class="editable" onclick="TextChange(this)">${formatWithCommas(row.Hours)}</td>
                    <td class="editable" onclick="TextChange(this)">${formatWithCommas(row.Days)}</td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(error => {
            console.error('Error fetching standard data:', error);
            console.error('Error details:', error.message); // 더 자세한 에러 정보
            alert('기준정보를 불러오는데 실패했습니다.');
        });
}

// 연도 목록을 가져와서 select 옵션 생성
function loadExpenseYears() {
    fetch('/api/expenses/years')  // 연도 목록을 가져오는 API
        .then(response => response.json())
        .then(years => {
            const select = document.getElementById('expenseYear');
            select.innerHTML = '';

            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = `${year}년`;
                select.appendChild(option);
            });

            // 현재 연도 선택
            const currentYear = new Date().getFullYear();
            console.log(currentYear)
            select.value = currentYear;

            // 초기 데이터 로드
            loadStandardData(currentYear);
        })
        .catch(error => console.error('Error loading years:', error));
}

// 인건비 새 연도 추가 (빈 테이블 생성)
function addNewYear() {
    const currentSelect = document.getElementById('expenseYear');
    const years = Array.from(currentSelect.options).map(opt => parseInt(opt.value));
    const maxYear = Math.max(...years);
    const newYear = maxYear + 1;

    if (confirm(`${newYear}년도 기준정보를 추가하시겠습니까?`)) {
        // select 옵션 추가
        const option = document.createElement('option');
        option.value = newYear;
        option.textContent = `${newYear}년`;
        currentSelect.add(option);

        // 새로 추가된 연도 선택
        currentSelect.value = newYear;

        // 빈 테이블 생성
        const tbody = document.getElementById('standard-tbody');
        tbody.innerHTML = '';

        // 기본 직급 목록
        const positions = ['이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직'];

        positions.forEach(position => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${position}</td>
                <td class="editable" onclick="TextChange(this)"></td>
                <td class="editable" onclick="TextChange(this)"></td>
                <td class="editable" onclick="TextChange(this)"></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// 저장 버튼 클릭 시 실행되는 함수
function saveTaskItemModal() {
    const year = document.getElementById('expenseYear').value;
    const tbody = document.getElementById('standard-tbody');
    const rows = tbody.getElementsByTagName('tr');

    const expenseData = Array.from(rows).map(row => {
        const cells = row.getElementsByTagName('td');
        return {
            Position: cells[0].textContent,
            MonthlyAverageSalary: cells[1].textContent.replace(/,/g, '') || null,
            Hours: cells[2].textContent.replace(/,/g, '') || null,
            Days: cells[3].textContent.replace(/,/g, '') || null
        };
    });

    fetch('/api/expenses/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            year: year,
            data: expenseData
        })
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('저장되었습니다.');
            } else {
                throw new Error(result.message || '저장 실패');
            }
        })
        .catch(error => {
            console.error('Error saving data:', error);
            alert('저장에 실패했습니다.');
        });
}

// 단가 데이터 로드
function loadPriceData(year) {
    if (!year) {
        year = document.getElementById('priceYear').value;
    }

    fetch(`/api/prices/${year}?format=json`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const tbody = document.getElementById('price-tbody');
            tbody.innerHTML = '';

            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.item}</td>
                    <td class="editable" onclick="TextChange(this)">${formatWithCommas(row.price || '')}</td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(error => {
            console.error('Error loading price data:', error);
            alert('단가 정보를 불러오는데 실패했습니다.');
        });
}

//제경비 검색
function loadCompanyExpenseData(year) {
    // 1) year가 없으면 select에서 읽음
    const select = document.getElementById('companyYEAR');
    if (!year) year = Number(select.value) || new Date().getFullYear();

    fetch(`/api/companyExpense/${year}`)
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(({ years = [], data = [] }) => {
            // 2) 연도 select 갱신
            select.innerHTML = '';
            years.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = `${y}년`;
                if (Number(y) === Number(year)) opt.selected = true;
                select.appendChild(opt);
            });

            // ※ 요청 연도가 years에 없으면 최신 연도로 재요청 (DESC 가정)
            if (!years.includes(Number(year)) && years.length > 0) {
                const latest = years[0];
                // 최신 연도로 선택값 바꾸고 재호출
                select.value = latest;
                return loadCompanyExpenseData(latest);
            }

            // 3) 테이블 갱신
            const tbody = document.getElementById('company-tbody');
            tbody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
          <td>${row.item}</td>
          <td class="editable" onclick="TextChange(this)">${typeof formatWithCommas === 'function' ? formatWithCommas(row.price ?? '') : (row.price ?? '')}</td>
        `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => {
            console.error('Error loading company expense:', err);
            alert('제경비 정보를 불러오는데 실패했습니다.');
        });
}

//단가 새 연도 추가
function addNewPriceYear() {
    const currentSelect = document.getElementById('priceYear');
    const years = Array.from(currentSelect.options).map(opt => parseInt(opt.value));
    const maxYear = Math.max(...years);
    const newYear = maxYear + 1;

    if (confirm(`${newYear}년도 단가 정보를 추가하시겠습니까?`)) {
        // select 옵션 추가
        const option = document.createElement('option');
        option.value = newYear;
        option.textContent = `${newYear}년`;
        currentSelect.add(option);

        // 새로 추가된 연도 선택
        currentSelect.value = newYear;

        // 빈 테이블 생성
        const tbody = document.getElementById('price-tbody');
        tbody.innerHTML = '';

        // 기본 항목 목록
        const priceItems = [
            '복리후생비/식대', '복리후생비/음료 외',
            '여비교통비/(출장)숙박', '여비교통비/주차료', '여비교통비/대중교통',
            '소모품비/현장물품', '소모품비/기타소모품',
            '차량유지비/주유', '차량유지비/차량수리 외',
            '도서인쇄비/출력 및 제본', '운반비/등기우편 외',
            '지급수수료/증명서발급', '기타/그 외 기타'
        ];

        priceItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item}</td>
                <td class="editable" onclick="TextChange(this)"></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// 제경비 새 연도 추가
function addNewCompanyYear() {
    const select = document.getElementById('companyYEAR');     // ← id 맞춤
    const tbody = document.getElementById('company-tbody');   // ← id 맞춤

    // 현재 select의 모든 연도 추출 (숫자 배열)
    const years = Array.from(select.options)
        .map(opt => Number(opt.value))
        .filter(v => !isNaN(v));

    // 기준 연도 계산: 옵션이 없으면 올해 기준, 있으면 최댓값 + 1
    const baseYear = years.length ? Math.max(...years) : new Date().getFullYear();
    const newYear = baseYear + 1;

    // 이미 존재하면 막기
    if (years.includes(newYear)) {
        alert(`${newYear}년은 이미 존재합니다.`);
        return;
    }

    if (!confirm(`${newYear}년도 제경비 비율을 추가하시겠습니까?`)) {
        return;
    }

    // 1) select에 새 연도 추가 (내림차순 유지)
    const option = document.createElement('option');
    option.value = String(newYear);
    option.textContent = `${newYear}년`;
    select.appendChild(option);

    // 내림차순 정렬
    const opts = Array.from(select.options).sort((a, b) => Number(b.value) - Number(a.value));
    select.innerHTML = '';
    opts.forEach(o => select.add(o));

    // 새로 추가된 연도로 선택 변경
    select.value = String(newYear);

    // 2) 테이블 초기 행(빈 값) 생성
    const items = ['사전비용', '운영비용', '공정비용'];
    tbody.innerHTML = '';
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${item}</td>
      <td class="editable" onclick="TextChange(this)"></td>
    `;
        tbody.appendChild(tr);
    });

    // ※ 저장 API는 나중에 구현 예정이므로 여기서는 UI만 구성합니다.
    //    이후 저장 시 /api/companyExpense/:year 로 POST/PUT 하면 됩니다.
}

// 숫자 변환(콤마 제거)
function toNumber(text) {
    const n = Number(String(text ?? '').replace(/[^\d.-]/g, ''));
    return isNaN(n) ? null : n;
}

// 라벨 → DB 컬럼명 매핑
function labelToKey(label) {
    const map = {
        '사전비용': 'AcademicResearchRate',
        '운영비용': 'OperationalRate',
        '공정비용': 'EquipmentRate'
    };
    return map[label] || null;
}

// 제경비 저장
function saveCompanyExpenseData() {
    const year = Number(document.getElementById('companyYEAR').value);
    const rows = Array.from(document.querySelectorAll('#company-tbody tr'));

    const payload = {};
    rows.forEach(tr => {
        const label = tr.cells[0]?.textContent.trim();
        const key = labelToKey(label);
        const val = toNumber(tr.cells[1]?.textContent);
        if (key) payload[key] = val;
    });

    // 필수 컬럼 검증
    const requiredKeys = ['AcademicResearchRate', 'OperationalRate', 'EquipmentRate'];
    for (const k of requiredKeys) {
        if (!(k in payload)) {
            alert('테이블 항목이 올바르지 않습니다.');
            return;
        }
    }

    fetch(`/api/companyExpense/${year}`, {
        method: 'POST', // 백엔드에서 Upsert 처리
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(res => {
            if (res.ok) {
                alert('저장되었습니다.');
                window.location.reload(); // 페이지 새로고침으로 갱신
                // 필요 시 재조회
                // loadCompanyExpenseData(year);
            } else {
                alert(res.message || '저장에 실패했습니다.');
            }
        })
        .catch(err => {
            console.error(err);
            alert('저장 중 오류가 발생했습니다.');
        });
}

// 단가 데이터 저장
function savePriceData() {
    const year = document.getElementById('priceYear').value;
    const tbody = document.getElementById('price-tbody');
    const rows = tbody.getElementsByTagName('tr');

    const priceData = Array.from(rows).map(row => {
        const cells = row.getElementsByTagName('td');
        return {
            item: cells[0].textContent,
            price: cells[1].textContent.replace(/,/g, '') || null
        };
    });

    fetch('/api/prices/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            year: year,
            data: priceData
        })
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('저장되었습니다.');
            } else {
                throw new Error(result.message || '저장 실패');
            }
        })
        .catch(error => {
            console.error('Error saving price data:', error);
            alert('저장에 실패했습니다.');
        });
}

// 연도 목록 로드 (기존 loadExpenseYears 함수 수정)
function loadExpenseYears() {
    fetch('/api/expenses/years')
        .then(response => response.json())
        .then(years => {
            // 인건비 설정 select 업데이트
            const expenseSelect = document.getElementById('expenseYear');
            expenseSelect.innerHTML = '';

            // 단가 설정 select 업데이트
            const priceSelect = document.getElementById('priceYear');
            priceSelect.innerHTML = '';

            //연도정렬
            years.forEach(year => {
                // 인건비 설정 옵션 추가
                const expenseOption = document.createElement('option');
                expenseOption.value = year;
                expenseOption.textContent = `${year}년`;
                expenseSelect.appendChild(expenseOption);

                // 단가 설정 옵션 추가
                const priceOption = document.createElement('option');
                priceOption.value = year;
                priceOption.textContent = `${year}년`;
                priceSelect.appendChild(priceOption);
            });

            // 현재 연도 선택
            const currentYear = new Date().getFullYear();
            expenseSelect.value = currentYear;
            priceSelect.value = currentYear;

            // 초기 데이터 로드
            loadStandardData(currentYear);
            loadPriceData(currentYear);
        })
        .catch(error => console.error('Error loading years:', error));
}


// 엔터 키 입력 시 검색 수행
function handleEnter(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        searchProjects();
    }
}

// 검색 함수
function searchProjects() {
    const searchTerm = document.getElementById('searchProjectsInput').value.trim();
    if (!searchTerm) {
        alert('검색어를 입력하세요.');
        return;
    }

    fetch(`/api/search_reference?term=${encodeURIComponent(searchTerm)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('검색 요청에 실패했습니다.');
            }
            return response.json();
        })
        .then(data => {
            const availableProjects = document.getElementById('availableProjects');
            availableProjects.innerHTML = ''; // 기존 목록 초기화

            if (data.length === 0) {
                const li = document.createElement('li');
                li.textContent = '검색 결과가 없습니다.';
                availableProjects.appendChild(li);
            } else {
                data.forEach(project => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <label>
                            <input 
                                type="checkbox" 
                                class="project-checkbox" 
                                style = "display: none"
                                data-contract-code="${project.ContractCode}" 
                                data-project-name="${project.ProjectName}" 
                                onchange="toggleProjectSelection(this)"
                            />
                            ${project.ContractCode} - ${project.ProjectName}
                        </label>
                    `;
                    availableProjects.appendChild(li);
                });
            }
        })
        .catch(error => {
            console.error('Error fetching projects:', error);
            alert('검색 중 오류가 발생했습니다.');
        });
}

// 선택된 프로젝트를 오른쪽 목록으로 이동
function toggleProjectSelection(checkbox) {
    const selectedProjects = document.getElementById('selectedProjects');

    if (!selectedProjects) {
        console.error('선택된 프로젝트 목록을 표시할 컨테이너가 존재하지 않습니다.');
        return;
    }

    if (checkbox.checked) {
        // 선택된 경우 오른쪽 목록에 추가
        const existingItem = selectedProjects.querySelector(`[data-contract-code="${checkbox.dataset.contractCode}"]`);
        if (!existingItem) {
            const li = document.createElement('li');
            li.textContent = `${checkbox.dataset.contractCode} - ${checkbox.dataset.projectName}`;
            li.setAttribute('data-contract-code', checkbox.dataset.contractCode);
            li.setAttribute('data-project-name', checkbox.dataset.projectName);
            li.classList.add('selected-project');
            li.onclick = () => {
                checkbox.checked = false;
                toggleProjectSelection(checkbox);
            };
            selectedProjects.appendChild(li);
        }
    } else {
        // 체크 해제 시 오른쪽 목록에서 제거
        const itemToRemove = selectedProjects.querySelector(`[data-contract-code="${checkbox.dataset.contractCode}"]`);
        if (itemToRemove) {
            selectedProjects.removeChild(itemToRemove);
        }
    }
}

// 오른쪽에서 클릭하면 체크박스를 해제
function toggleCheckboxState(checkbox) {
    checkbox.checked = false;
    toggleProjectSelection(checkbox);
}

// 다운로드 버튼 클릭 시 데이터 수집 및 전송
function downloadData() {
    // 날짜 수집
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    // 부서 선택 수집
    const departmentSelect = document.getElementById('departmentSelect');
    const selectedDepartment = departmentSelect.value;

    // 선택한 사업 수집
    const selectedProjects = [];
    const selectedProjectItems = document.querySelectorAll('#selectedProjects .selected-project');

    // 선택된 프로젝트를 배열에 추가
    selectedProjectItems.forEach(item => {
        selectedProjects.push({
            contractCode: item.getAttribute('data-contract-code'), // 정확한 속성명 확인
            projectName: item.getAttribute('data-project-name')   // 정확한 속성명 확인
        });
    });

    // 유효성 검사
    if (!startDate || !endDate) {
        alert('기간을 선택해주세요.');
        return;
    }

    if (!selectedDepartment) {
        alert('부서를 선택해주세요.');
        return;
    }

    if (selectedProjects.length === 0) {
        alert('최소 하나의 사업을 선택해주세요.');
        return;
    }

    // 데이터 수집 결과 디버깅
    const requestData = {
        startDate,
        endDate,
        selectedDepartment,
        selectedProjects,
    };

    console.log('수집된 데이터:', requestData);

    // 서버로 데이터 전송
    fetch('/api/download_project_data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
    })
        .then(response => response.blob()) // 서버에서 파일 데이터가 반환된다고 가정
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `주간_다운로드_${startDate}_to_${endDate}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('데이터 다운로드 중 오류 발생:', error);
            alert('데이터 다운로드 중 오류가 발생했습니다.');
        });
}



function addStaffRow() {
    const tbody = document.querySelector("#staffGrid tbody");
    const row = document.createElement("tr");

    // 기본 순서 복구를 위한 originalIndex 부여
    const table = document.getElementById('staffGrid');
    if (table) {
        const next = Number(table.dataset.staffNextIndex || '0');
        row.dataset.originalIndex = String(Number.isNaN(next) ? 0 : next);
        table.dataset.staffNextIndex = String((Number.isNaN(next) ? 0 : next) + 1);
    }

    // 부서 목록
    const departments = [
        '선택하세요.', '경영본부', '사업본부', '영업본부',
        '공간정보사업부', 'GIS사업부', 'GIS사업지원부',
        '연구소', '공공사업부', '공정관리부',
        '경영지원부', '총무부', '임원실'
    ];

    // 권한 목록
    const auths = ['읽기', '읽기/쓰기', '관리자'];

    // 부서 select 생성
    const deptSelect = document.createElement("select");
    departments.forEach(dept => {
        const option = document.createElement("option");
        option.value = dept;
        option.textContent = dept;
        deptSelect.appendChild(option);
    });

    // 권한 select 생성
    const authSelect = document.createElement("select");
    auths.forEach(auth => {
        const option = document.createElement("option");
        option.value = auth;
        option.textContent = auth;
        authSelect.appendChild(option);
    });

    // 행 생성 및 삽입 (체크박스열 + 구분 7칸 + 권한 4칸)
    row.innerHTML = `
            <td class="staff-select-col" style="text-align:center; vertical-align: middle;"><input type="checkbox" class="row-check" aria-label="행 선택"></td>
            <td data-field="emp_no"></td>
            <td data-field="user_id"></td>
            <td data-field="department"></td>
            <td data-field="name"></td>
            <td data-field="position"></td>
            <td data-field="join_date"><input type="date" class="join-date-input" /></td>
            <td data-field="phone"></td>
            <td data-field="auth"></td>
            <td style="text-align:center;"><input type="checkbox" class="projectauth-check" /></td>
            <td style="text-align:center;"><input type="checkbox" class="dataauth-check" /></td>
            <td style="text-align:center;"><input type="checkbox" class="reportauth-check" /></td>
            <td style="text-align:center;"><input type="checkbox" class="meetingauth-check" /></td>
        `;
    tbody.appendChild(row);

    // 부서 셀에 select 삽입
    row.children[3].appendChild(deptSelect);
    // 권한 셀에 select 삽입
    row.children[8].appendChild(authSelect);

    // 텍스트 셀 클릭 편집 가능하게
    enableTdEditing("staffGrid");
    uaApplyStaffRowZebra();
}

function deleteCheckedRows() {
    const checked = Array.from(document.querySelectorAll('.row-check:checked'));
    if (checked.length === 0) {
        alert('삭제할 행을 선택하세요.');
        return;
    }

    const rows = checked
        .map((cb) => cb.closest('tr'))
        .filter((row) => !!row);

    openDeleteStaffConfirmModal(rows);
}

function enableTdEditing(tableId) {
    const table = document.getElementById(tableId);
    if (!table || !table.classList.contains('staff-editing')) return;

    const tableBody = document.querySelector(`#${tableId} tbody`);
    if (!tableBody) return;

    const editableFields = new Set(['emp_no', 'user_id', 'name', 'position', 'phone']);
    const rows = tableBody.querySelectorAll("tr");
    rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        cells.forEach(td => {
            const field = td.dataset.field;
            const isEditable = field && editableFields.has(field);

            if (!isEditable) {
                td.contentEditable = 'false';
                td.classList.remove('staff-text-editable');
                return;
            }

            td.contentEditable = 'true';
            td.spellcheck = false;
            td.classList.add('staff-text-editable');

            if (!td.dataset.editBound) {
                td.dataset.editBound = '1';
                td.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        td.blur();
                    }
                });

                td.addEventListener('input', () => {
                    if (field !== 'phone') return;
                    const raw = td.textContent || '';
                    const formatted = formatPhoneNumber(raw);
                    if (raw === formatted) return;
                    td.textContent = formatted;
                    placeCaretAtEnd(td);
                });

                td.addEventListener('paste', (e) => {
                    if (field !== 'phone') return;
                    e.preventDefault();
                    const pastedText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
                    td.textContent = formatPhoneNumber(pastedText);
                    placeCaretAtEnd(td);
                });

                td.addEventListener('blur', () => {
                    const raw = (td.textContent || '').trim();
                    if (field === 'phone') {
                        td.textContent = formatPhoneNumber(raw);
                        return;
                    }
                    td.textContent = raw;
                });
            }
        });
    });
}


function onEditStaff() {
    const table = document.getElementById("staffGrid");
    if (!table) return;

    // 체크박스 열은 HTML에 고정, 수정 모드에서는 표시만 토글
    table.classList.add('staff-editing');
    setStaffCheckboxEditable(true);
    setStaffFormControlsEditable(true);

    // 전체 선택 체크박스 바인딩(1회)
    const checkAll = table.querySelector('input.check-all');
    if (checkAll && !checkAll.dataset.bound) {
        checkAll.dataset.bound = '1';
        checkAll.addEventListener('change', function () {
            const allChecked = this.checked;
            table.querySelectorAll('input.row-check').forEach(cb => { cb.checked = allChecked; });
        });
    }

    // 3. 삭제/저장 버튼 표시
    document.getElementById('deleteBTN').style.display = 'block'
    document.getElementById('saveBTN').style.display = 'block'
    document.getElementById('addRowBTN').style.display = 'block'
    document.getElementById('resetBTN').style.display = 'block'
    enableTdEditing("staffGrid");

}

function saveStaff() {
    const table = document.getElementById("staffGrid");
    const rows = table.querySelectorAll("tbody tr");

    const staffData = [];
    const seenUserIds = new Map();
    const duplicateUserIds = new Set();

    rows.forEach(row => {
        const deptSelect = row.querySelector('td[data-field="department"] select');
        const authSelect = row.querySelector('td[data-field="auth"] select');

        const dataAuthCheckbox = row.querySelector('input.dataauth-check');
        const reportAuthCheckbox = row.querySelector('input.reportauth-check');
        const projectAuthCheckbox = row.querySelector('input.projectauth-check');
        const meetingAuthCheckbox = row.querySelector('input.meetingauth-check');

        const nameCell = row.querySelector('td[data-field="name"]');
        const userIdCell = row.querySelector('td[data-field="user_id"]');
        const empNoCell = row.querySelector('td[data-field="emp_no"]');
        const positionCell = row.querySelector('td[data-field="position"]');
        const phoneCell = row.querySelector('td[data-field="phone"]');
        const joinDateInput = row.querySelector('td[data-field="join_date"] input[type="date"]');

        const user = {
            Name: (nameCell?.textContent || '').trim(),
            userID: (userIdCell?.textContent || '').trim(),
            Department: deptSelect ? deptSelect.value : '',
            Auth: authSelect ? authSelect.value : '',
            EmpNo: (empNoCell?.textContent || '').trim(),
            Position: (positionCell?.textContent || '').trim(),
            JoinDate: joinDateInput ? (joinDateInput.value || '') : '',
            Phone: formatPhoneNumber((phoneCell?.textContent || '').trim()),
            note: '',
            dataauth: dataAuthCheckbox ? (dataAuthCheckbox.checked ? 1 : 0) : 0,
            reportAUTH: reportAuthCheckbox ? (reportAuthCheckbox.checked ? 1 : 0) : 0,
            meetingAuth: meetingAuthCheckbox ? (meetingAuthCheckbox.checked ? 1 : 0) : 0,
            projectAUTH: projectAuthCheckbox ? (projectAuthCheckbox.checked ? 1 : 0) : 0
        };

        if (user.userID) {
            const normalizedId = user.userID.toLowerCase();
            if (user.Name) {
                if (seenUserIds.has(normalizedId)) {
                    duplicateUserIds.add(user.userID);
                    duplicateUserIds.add(seenUserIds.get(normalizedId));
                } else {
                    seenUserIds.set(normalizedId, user.userID);
                }
            }
            staffData.push(user);
        }
    });

    if (duplicateUserIds.size > 0) {
        const dupText = Array.from(duplicateUserIds).sort().join(', ');
        alert(`중복된 아이디가 있습니다: ${dupText}`);
        return;
    }

    console.log("[STAFF DATA]", staffData);

    fetch("/save_staff", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(staffData)
    })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                alert("저장 완료");
                window.location.reload();
            } else {
                alert(`저장 실패: ${result.message || '요청 데이터를 확인해주세요.'}`);
                console.error(result.message);
            }
        })
        .catch(err => {
            console.error("오류 발생", err);
            alert("요청 중 오류 발생");
        });
}


function resetpassword() {
    const checked = document.querySelectorAll(".row-check:checked");
    if (checked.length === 0) {
        alert("초기화할 행을 선택하세요.");
        return;
    }

    const usersToReset = [];

    checked.forEach(cb => {
        const row = cb.closest("tr");
        const userID = row.querySelector('td[data-field="user_id"]')?.textContent.trim();
        const name = row.querySelector('td[data-field="name"]')?.textContent.trim();

        if (userID && name) {
            usersToReset.push({ userID, name });
        }
    });

    if (usersToReset.length === 0) return;
    openResetPasswordConfirmModal(usersToReset);
}

function pageLogout() {
    fetch('/logout', {
        method: 'POST'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(data.message || '로그아웃 되었습니다.');
                window.location.href = '/login';
            } else {
                alert('로그아웃 실패: ' + (data.message || ''));
            }
        })
        .catch(err => {
            console.error('[LOGOUT ERROR]', err);
            alert('로그아웃 요청 중 오류가 발생했습니다.');
        });
}

let currentStatus = "";  // 전역 상태 변수

// viewStatusProjects 함수
function viewStatusProjects(elementOrStatus, page = 1) {
    currentView = "status";
    setTableHead(currentView);

    if (elementOrStatus instanceof HTMLElement) {
        currentStatus = elementOrStatus.dataset.status;
    } else if (typeof elementOrStatus === "string" && elementOrStatus) {
        currentStatus = elementOrStatus;
    }

    const status = currentStatus;
    console.log('currentStatus:', currentStatus);
    console.log('status:', status);
    fetch(`/api/status_projects?status=${status}&page=${page}`)
        .then(res => res.json())
        .then(data => {
            renderTable(data.projects);
            document.getElementById("yearTitle").textContent = `${statusKor(status)} 사업 모아보기`;
            renderPagination(data.current_page, data.total_pages, 'status');
            document.getElementById("pagination").style.display = 'block'; // ← 반드시 추가
            _ensureSearchVisible(false);
            _weeklyHideReportsToolbar();
        })
        .catch(error => console.error("Error fetching status projects:", error));
}

function statusKor(status) {
    return {
        progress: "진행중",
        complete: "준공",
        stop: "중지"
    }[status] || "기타";
}

// 준공사업 연도별 모아보기
function viewCompleteProjects() {
    currentView = "complete";
    setTableHead('annual'); // thead를 통합자료로 변경
    console.log('mode:', currentView);

    const tableBody = document.getElementById("projectList_tbody");
    tableBody.innerHTML = "";

    // 준공사업 연도별 데이터 가져오기
    fetch('/api/complete_projects_years')
        .then(response => response.json())
        .then(data => {
            console.log('준공사업 연도별 데이터:', data);

            // 연도별로 정렬 (최신순)
            const sortedYears = data.sort((a, b) => b.year - a.year);

            // 각 연도별로 행 생성
            sortedYears.forEach(item => {
                const row = document.createElement("tr");
                //개수 정보 추가하여 중복 방지
                row.innerHTML = `<td style="padding: 15px; font-size: 16px; cursor: pointer; transition: background-color 0.2s;" 
                                    onmouseover="this.style.backgroundColor='#7e8b97ff'"
                                    onmouseout="this.style.backgroundColor=''">${item.year}년 준공사업 통합자료</td>`;

                row.onclick = () => {
                    window.location.href = `/PMS_annualProject/complete/${item.year}`;
                };
                tableBody.appendChild(row);
            });

            // 데이터가 없는 경우
            if (sortedYears.length === 0) {
                const row = document.createElement("tr");
                row.innerHTML = `<td style="text-align: center; color: #999; padding: 20px;">준공사업이 없습니다.</td>`;
                tableBody.appendChild(row);
            }
        })
        .catch(error => {
            console.error('Error fetching complete projects years:', error);

            // 에러 발생시 빈 목록 표시
            const row = document.createElement("tr");
            row.innerHTML = `<td style="text-align: center; color: #f56565; padding: 20px;">데이터를 불러오는데 실패했습니다.</td>`;
            tableBody.appendChild(row);
        });

    // 페이지네이션 숨기기
    document.getElementById("pagination").style.display = 'none';

    // 타이틀 등 UI 업데이트
    document.getElementById('yearTitle').textContent = "준공사업 연도별 통합자료";
    setActiveButton("준공사업");
    _ensureSearchVisible(false);
    _weeklyHideReportsToolbar();
}

// ================== 자료권한 설정 ==================
async function loadDataAuthUsers() {
    const tbody = document.querySelector('#dataAuthGrid tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">불러오는 중...</td></tr>';

    try {
        const resp = await fetch('/api/users_dataauth');
        const data = await resp.json();
        if (!data.success) throw new Error(data.message || '로드 실패');

        const users = data.users || [];
        const keyword = document.getElementById('dataAuthSearchBox')?.value?.trim() || '';
        const filtered = keyword
            ? users.filter(u => [u.Name, u.userID, u.Department, u.Auth, u.note]
                .filter(Boolean)
                .some(v => String(v).includes(keyword)))
            : users;

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="6">-</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        filtered.forEach(u => {
            const tr = document.createElement('tr');
            const checked = (u.dataauth === 1 || u.dataauth === true || String(u.dataauth) === 'True');
            tr.innerHTML = `
                <td>${u.Name || ''}</td>
                <td>${u.userID || ''}</td>
                <td>${u.Department || ''}</td>
                <td>${u.Auth || ''}</td>
                <td><input type="checkbox" class="da-check" ${checked ? 'checked' : ''}></td>
                <td>${u.note || ''}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('자료권한 로드 오류:', e);
        tbody.innerHTML = '<tr><td colspan="6">오류</td></tr>';
    }
}

function filterDataAuthRows() {
    // 이미 loadDataAuthUsers에서 키워드 적용하므로 재호출로 충분
    loadDataAuthUsers();
}

async function saveDataAuth() {
    const tbody = document.querySelector('#dataAuthGrid tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const updates = [];

    rows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 6) return;
        const userID = tds[1].textContent.trim();
        const checkbox = tr.querySelector('input.da-check');
        if (!userID || !checkbox) return;
        updates.push({ userID, dataauth: checkbox.checked });
    });

    try {
        const resp = await fetch('/api/save_users_dataauth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        const data = await resp.json();
        if (data.success) {
            alert('저장 완료');
            loadDataAuthUsers();
        } else {
            alert('저장 실패: ' + (data.message || ''));
        }
    } catch (e) {
        console.error('자료권한 저장 오류:', e);
        alert('요청 중 오류 발생');
    }
}

function saveWeeklySplit() {
    if (!isWeeklyAdminByName()) {
        alert('권한이 없습니다.');
        return;
    }
    const payload = _collectWeeklyPayload();
    fetch('/api/weekly/save_split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(async r => {
            if (!r.ok) {
                const txt = await r.text().catch(() => '');
                throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
            }
            return r.json();
        })
        .then(res => {
            if (res.ok) {
                alert('분할 저장되었습니다.');
            } else {
                alert(res.message || '분할 저장에 실패했습니다.');
            }
        })
        .catch(err => {
            console.error('saveWeeklySplit error:', err);
            alert(`분할 저장 중 오류가 발생했습니다.\n${err.message || err}`);
        });
}

// =========================
// 회의록(시연용): 새창 팝업
// =========================
const __demoMeetings = [
    {
        id: 'demo-a',
        title: 'A제목 회의록',
        when: '2026-01-27 10:15',
        where: '회의실',
        host: '개발팀',
        author: '신재호',
        attendees: '신재호, 개발, 관리자',
        agenda: '주간 진행상황 공유',
        bodyHtml: '1) 금주 업무 정리 및 이슈 공유<br>2) 다음 주 일정/우선순위 합의<br>3) 리스크 및 요청사항 확인'
    },
    {
        id: 'demo-b',
        title: 'B제목 회의록',
        when: '2026-01-26 16:30',
        where: '온라인',
        host: '공정관리부',
        author: '신재호',
        attendees: '신재호, 공정관리부',
        agenda: '사업 리스크 점검',
        bodyHtml: '1) 주요 리스크 확인<br>2) 대응 방안 논의'
    }
];

function openMeetingPopup(meetingId) {
    const meeting = (__demoMeetings || []).find(m => m.id === meetingId);
    if (!meeting) return;

    const features = [
        'width=1100',
        'height=820',
        'top=40',
        'left=60',
        'scrollbars=yes',
        'resizable=yes'
    ].join(',');

    const win = window.open('', `meeting_${meetingId}`, features);
    if (!win) {
        alert('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.');
        return;
    }

    const docHtml = buildMeetingPopupDocumentHtml(meeting);
    win.document.open();
    win.document.write(docHtml);
    win.document.close();
    win.focus();
}

function buildMeetingPopupDocumentHtml(m) {
    const title = escapeHtmlSafe(m.title || '회의록');
    const body = buildMeetingPreviewHtml(m);
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    html, body { margin:0; padding:0; font-family: Arial, sans-serif; background:#f1f5f9; }
    .popup-wrap{ max-width: 980px; margin: 18px auto; padding: 0 14px; }
    .popup-top{ display:flex; align-items:center; justify-content:space-between; gap:10px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; }
    .popup-title{ font-weight:900; font-size:16px; }
    .popup-actions{ display:flex; gap:8px; }
    .btn{ height:36px; padding:0 14px; border-radius:8px; border:1px solid #111; background:#fff; cursor:pointer; font-weight:700; }
    .btn.primary{ background:#111; color:#fff; }
    .popup-body{ margin-top: 12px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding: 12px; }

    .minutes-doc{ background:#fff; padding: 10px; }
    .minutes-doc-title{ text-align:center; font-size: 30px; font-weight: 800; margin: 10px 0 18px; }
    .minutes-gap{ height: 18px; }
    .minutes-table{ width: 100%; border-collapse: collapse; table-layout: fixed; }
    .minutes-table th, .minutes-table td{ border: 1px solid #111; padding: 10px; font-size: 14px; vertical-align: top; word-break: break-word; }
    .minutes-table th{ background:#e5e7eb; text-align:center; font-weight:700; }
    .minutes-content{ min-height: 520px; }

    @media print {
      body{ background:#fff; }
      .popup-top{ display:none; }
      .popup-body{ border:none; }
      .popup-wrap{ margin:0; max-width:none; padding:0; }
    }
  </style>
</head>
<body>
  <div class="popup-wrap">
    <div class="popup-top">
      <div class="popup-title">${title}</div>
      <div class="popup-actions">
        <button class="btn" onclick="window.print()">인쇄</button>
        <button class="btn primary" onclick="window.close()">닫기</button>
      </div>
    </div>
    <div class="popup-body">
      ${body}
    </div>
  </div>
</body>
</html>
    `;
}

function buildMeetingPreviewHtml(m) {
    return `
        <div class="minutes-doc" aria-label="시연용 회의록">
            <div class="minutes-doc-title">회의록</div>

            <table class="minutes-table">
                <colgroup>
                    <col style="width: 20%">
                    <col style="width: 30%">
                    <col style="width: 20%">
                    <col style="width: 30%">
                </colgroup>
                <tbody>
                    <tr>
                        <th>일 시</th>
                        <td>${escapeHtmlSafe(m.when)}</td>
                        <th>장 소</th>
                        <td>${escapeHtmlSafe(m.where)}</td>
                    </tr>
                    <tr>
                        <th>주 관</th>
                        <td>${escapeHtmlSafe(m.host)}</td>
                        <th>작성자</th>
                        <td>${escapeHtmlSafe(m.author)}</td>
                    </tr>
                    <tr>
                        <th>참석자</th>
                        <td colspan="3">${escapeHtmlSafe(m.attendees)}</td>
                    </tr>
                </tbody>
            </table>

            <div class="minutes-gap"></div>

            <table class="minutes-table">
                <colgroup>
                    <col style="width: 20%">
                    <col style="width: 80%">
                </colgroup>
                <tbody>
                    <tr>
                        <th>안 건</th>
                        <td>${escapeHtmlSafe(m.agenda)}</td>
                    </tr>
                    <tr>
                        <th>회의내용</th>
                        <td class="minutes-content">${m.bodyHtml || ''}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
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
// 회의록 업로드 모달
// =========================
let meetingSelectedFile = null;
let meetingSelectedAttachments = [];
let meetingEditingRecordId = null;
let meetingEditExistingPdf = null;
let meetingEditExistingAttachments = [];

async function parseMeetingApiJson(res) {
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
        return res.json();
    }
    const raw = await res.text();
    const preview = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(`JSON이 아닌 응답입니다. (HTTP ${res.status}) ${preview}`);
}

function initDateYearAutoAdvance(input) {
    if (!input || input.dataset.yearAutoAdvanceBound === '1') return;

    input.dataset.yearAutoAdvanceBound = '1';
    let typedYearDigits = 0;

    input.addEventListener('focus', () => {
        typedYearDigits = 0;
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            typedYearDigits = Math.max(0, typedYearDigits - 1);
            return;
        }

        if (!/^\d$/.test(e.key)) return;
        if (typedYearDigits >= 4) return;

        typedYearDigits += 1;
        if (typedYearDigits !== 4) return;

        setTimeout(() => {
            if (typeof input.setSelectionRange === 'function') {
                try {
                    input.setSelectionRange(5, 5);
                    return;
                } catch (_) {
                }
            }

            input.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'ArrowRight',
                code: 'ArrowRight',
                keyCode: 39,
                which: 39,
                bubbles: true
            }));
        }, 0);
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
    const meetingDateStartInput = document.getElementById('meetingDateStart');
    const suggestCell = modal.querySelector('.meeting-suggest-cell');

    initDateYearAutoAdvance(meetingDateStartInput);

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

function openMeetingUploadModal(editMeeting = null) {
    const modal = document.getElementById('meetingUploadModal');
    if (!modal) return;
    modal.classList.add('show');
    document.body.classList.add('modal-open');

    const authorName = document.getElementById('sessionName')?.value || '';
    const authorInput = document.getElementById('meetingAuthor');
    if (authorInput) authorInput.value = authorName;

    const createdAtInput = document.getElementById('meetingCreatedAt');
    if (createdAtInput) createdAtInput.value = formatDateYMD(new Date());

    const projectNumberInput = document.getElementById('meetingProjectNumber');
    const projectNameInput = document.getElementById('meetingProjectName');
    if (projectNumberInput) projectNumberInput.value = '';
    if (projectNameInput) projectNameInput.value = '';

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

    meetingEditingRecordId = null;
    meetingEditExistingPdf = null;
    meetingEditExistingAttachments = [];
    meetingSelectedFile = null;
    meetingSelectedAttachments = [];

    const docInput = document.getElementById('meetingDocNumber');

    if (editMeeting?.id) {
        meetingEditingRecordId = editMeeting.id;
        meetingEditExistingPdf = {
            original_name: editMeeting.original_name || '회의록.pdf',
            file_path: buildMeetingFileUrl(editMeeting),
        };

        if (docInput) docInput.value = editMeeting.doc_number || '';
        if (createdAtInput) createdAtInput.value = editMeeting.created_at || formatDateYMD(new Date());
        if (authorInput) authorInput.value = editMeeting.author || authorName;
        if (projectNumberInput) projectNumberInput.value = editMeeting.contractcode || '';
        if (projectNameInput) projectNameInput.value = editMeeting.project_name || '';
        if (agendaTitleInput) agendaTitleInput.value = editMeeting.title || '';
        if (meetingPlaceInput) meetingPlaceInput.value = editMeeting.meeting_place || '';
        if (meetingOrganizerInput) meetingOrganizerInput.value = editMeeting.organizer || '';
        if (meetingAttendeesInput) meetingAttendeesInput.value = editMeeting.attendees || '';

        const startRaw = String(editMeeting.meeting_datetime || '').trim();
        const startMatch = startRaw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
        if (meetingDateStartInput) meetingDateStartInput.value = startMatch ? startMatch[1] : '';
        if (meetingTimeStartHourInput) meetingTimeStartHourInput.value = startMatch ? startMatch[2] : '';
        if (meetingTimeStartMinuteInput) meetingTimeStartMinuteInput.value = startMatch ? startMatch[3] : '';

        const endRaw = String(editMeeting.meeting_end_datetime || '').trim();
        const endMatch = endRaw.match(/(\d{2}):(\d{2})(?::\d{2})?$/);
        if (meetingTimeEndHourInput) meetingTimeEndHourInput.value = endMatch ? endMatch[1] : '';
        if (meetingTimeEndMinuteInput) meetingTimeEndMinuteInput.value = endMatch ? endMatch[2] : '';

        fetch(`/doc_editor_api/meeting/attachments?meeting_id=${encodeURIComponent(editMeeting.id)}`)
            .then(async (res) => {
                const data = await parseMeetingApiJson(res);
                if (!res.ok) {
                    throw new Error(data?.message || `첨부파일 조회 실패 (HTTP ${res.status})`);
                }
                return data;
            })
            .then(data => {
                meetingEditExistingAttachments = data?.success && Array.isArray(data.items) ? data.items : [];
                renderMeetingAttachmentPendingFiles();
            })
            .catch((err) => {
                console.error('[meeting] attachment fetch failed:', err);
                meetingEditExistingAttachments = [];
                renderMeetingAttachmentPendingFiles();
            });
    } else {
        if (docInput) docInput.value = '';
        fetch('/doc_editor_api/meeting/next_number')
            .then(res => res.json())
            .then(data => {
                if (docInput) docInput.value = data.docNumber || '';
            })
            .catch(err => {
                console.error('[meeting] doc number fetch failed:', err);
            });
    }

    renderMeetingPendingFile(meetingSelectedFile);
    renderMeetingAttachmentPendingFiles();
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

function buildTime24FromParts(hourValue, minuteValue) {
    const hhRaw = (hourValue || '').trim();
    const mmRaw = (minuteValue || '').trim();
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
    const isEditMode = !!meetingEditingRecordId;
    const docNumber = document.getElementById('meetingDocNumber')?.value || '';
    const contractcode = document.getElementById('meetingProjectNumber')?.value || '';
    const projectName = document.getElementById('meetingProjectName')?.value || '';
    const agendaTitle = document.getElementById('meetingAgendaTitle')?.value || document.getElementById('meetingTitle')?.value || '';
    const meetingDateStart = document.getElementById('meetingDateStart')?.value || '';
    const meetingTimeStartHour = document.getElementById('meetingTimeStartHour')?.value || '';
    const meetingTimeStartMinute = document.getElementById('meetingTimeStartMinute')?.value || '';
    const meetingTimeEndHour = document.getElementById('meetingTimeEndHour')?.value || '';
    const meetingTimeEndMinute = document.getElementById('meetingTimeEndMinute')?.value || '';

    const meetingTimeStart = buildTime24FromParts(meetingTimeStartHour, meetingTimeStartMinute);
    const meetingTimeEnd = buildTime24FromParts(meetingTimeEndHour, meetingTimeEndMinute);

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
    if (file) fd.append('file', file);
    if (isEditMode) fd.append('meetingId', String(meetingEditingRecordId));
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

    fetch(isEditMode ? '/doc_editor_api/meeting/update' : '/doc_editor_api/meeting/upload_pdf', {
        method: 'POST',
        body: fd
    })
        .then(async (res) => {
            const data = await parseMeetingApiJson(res);
            if (!res.ok) {
                throw new Error(data?.message || `저장 실패 (HTTP ${res.status})`);
            }
            return data;
        })
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
                        nameEl.textContent = att.originalName || att.original_name || '첨부파일';
                        const actions = document.createElement('div');
                        actions.className = 'meeting-upload-actions';

                        const link = document.createElement('a');
                        link.href = att.fileUrl || att.file_path || '#';
                        link.textContent = '보기';
                        link.target = '_blank';

                        actions.appendChild(link);
                        item.appendChild(nameEl);
                        item.appendChild(actions);
                        attachmentUploadList.appendChild(item);
                    });
                }
            }
            alert(isEditMode ? '회의록이 성공적으로 수정되었습니다.' : '회의록이 성공적으로 저장되었습니다.');
            closeMeetingUploadModal();
            if (currentView === 'meeting') {
                viewMeetingMinutes();
            }
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

    if (!file && !meetingEditExistingPdf) {
        uploadList.innerHTML = '<div class="meeting-upload-empty">선택된 회의록 PDF 파일 없음</div>';
        return;
    }

    if (!file && meetingEditExistingPdf) {
        const item = document.createElement('div');
        item.className = 'meeting-upload-item';
        const nameEl = document.createElement('span');
        nameEl.textContent = `기존 파일: ${meetingEditExistingPdf.original_name || '회의록 PDF 파일'}`;
        const actions = document.createElement('div');
        actions.className = 'meeting-upload-actions';

        const link = document.createElement('a');
        link.href = meetingEditExistingPdf.file_path || '#';
        link.textContent = '보기';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'X';
        removeBtn.setAttribute('aria-label', '기존 회의록 파일 제거');
        removeBtn.addEventListener('click', () => {
            meetingEditExistingPdf = null;
            renderMeetingPendingFile(meetingSelectedFile);
        });

        actions.appendChild(link);
        actions.appendChild(removeBtn);
        item.appendChild(nameEl);
        item.appendChild(actions);
        uploadList.appendChild(item);
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

    const existingAttachments = Array.isArray(meetingEditExistingAttachments) ? meetingEditExistingAttachments : [];
    const newAttachments = Array.isArray(meetingSelectedAttachments) ? meetingSelectedAttachments : [];

    if (existingAttachments.length === 0 && newAttachments.length === 0) {
        uploadList.innerHTML = '<div class="meeting-upload-empty">선택된 첨부파일 없음</div>';
        return;
    }

    existingAttachments.forEach((attachment) => {
        const item = document.createElement('div');
        item.className = 'meeting-upload-item';
        const nameEl = document.createElement('span');
        nameEl.textContent = `기존 파일: ${attachment.original_name || '첨부파일'}`;
        const actions = document.createElement('div');
        actions.className = 'meeting-upload-actions';

        const link = document.createElement('a');
        link.href = attachment.file_path || '#';
        link.textContent = '보기';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'X';
        removeBtn.setAttribute('aria-label', '기존 첨부파일 삭제');
        removeBtn.addEventListener('click', () => {
            deleteMeetingAttachment(attachment.id);
        });

        actions.appendChild(link);
        actions.appendChild(removeBtn);
        item.appendChild(nameEl);
        item.appendChild(actions);
        uploadList.appendChild(item);
    });

    newAttachments.forEach((file, index) => {
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
    if (!meetingSelectedFile && !meetingEditExistingPdf) {
        alert('업로드할 PDF 파일을 선택해 주세요.');
        return;
    }
    uploadMeetingPdf(meetingSelectedFile);
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
        })
        .catch(err => {
            console.error('[meeting] delete failed:', err);
            alert(err.message || '삭제에 실패했습니다.');
        });
}

function deleteMeetingAttachment(attachmentId) {
    if (!attachmentId) return;
    if (!confirm('첨부파일을 삭제하시겠습니까?')) return;

    fetch('/doc_editor_api/meeting/delete_attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: attachmentId })
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || '첨부파일 삭제 실패');
            }
            meetingEditExistingAttachments = (meetingEditExistingAttachments || []).filter(
                (attachment) => String(attachment.id) !== String(attachmentId)
            );
            renderMeetingAttachmentPendingFiles();
        })
        .catch(err => {
            console.error('[meeting] attachment delete failed:', err);
            alert(err.message || '첨부파일 삭제에 실패했습니다.');
        });
}
