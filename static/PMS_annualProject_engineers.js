const processedProjects = [];
let currentSort = { key: null, type: null, dir: 'asc' };
let initialOrderMap = null;
let isEditing = false;
let currentFilter = { field: 'contract', keyword: '', status: '' };
let editTrackingBound = false;

document.addEventListener('DOMContentLoaded', function () {
    const raw = Array.isArray(window.projects) ? window.projects : [];
    processedProjects.length = 0;
    raw.forEach(project => {
        const chief = Array.isArray(project.chief) ? project.chief : [];
        const subchief = Array.isArray(project.subchief) ? project.subchief : [];
        const participants = Array.isArray(project.participants) ? project.participants : [];
        const computedTotal = chief.length + subchief.length + participants.length;
        const totalCount = Number(project.total_count);

        processedProjects.push({
            ...project,
            chief,
            subchief,
            participants,
            total_count: Number.isFinite(totalCount) ? totalCount : computedTotal
        });
    });

    if (!initialOrderMap) {
        initialOrderMap = new Map();
        processedProjects.forEach((p, idx) => {
            const key = p.ContractCode || String(idx);
            initialOrderMap.set(key, idx);
        });
    }

    if (processedProjects.length === 0) {
        console.warn('[engineers] window.projects is empty. Fetching from API...');
        loadEngineersSummary(document.getElementById('engineersYearSelect')?.value || '');
    } else {
        renderEngineersTable(processedProjects);
    }
    enableHorizontalDragScroll('table-container');
    setupFakeScrollbar();
    bindEngineersToolbar();
});

function bindEngineersToolbar() {
    const select = document.getElementById('engineersYearSelect');
    if (select) {
        select.addEventListener('change', function () {
            const value = select.value || '';
            loadEngineersSummary(value);
        });
    }

    const exportBtn = document.getElementById('engineersExportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportEngineersTableToExcel);
    }

    const searchBtn = document.getElementById('engineersSearchBtn');
    if (searchBtn) searchBtn.addEventListener('click', applySearchFilter);

    const searchInput = document.getElementById('engineersSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applySearchFilter();
        });
    }

    const statusSelect = document.getElementById('engineersStatusSelect');
    if (statusSelect) statusSelect.addEventListener('change', () => applySearchFilter(true));

    const editBtn = document.getElementById('engineersEditBtn');
    if (editBtn) editBtn.addEventListener('click', enableEditMode);

    const saveBtn = document.getElementById('engineersSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveEngineersChanges);
}

function loadEngineersSummary(year) {
    const qs = year ? `?year=${encodeURIComponent(year)}` : '';
    fetch(`/api/annual_project_engineers${qs}`)
        .then(res => res.json())
        .then(data => {
            if (!data || data.success !== true) return;
            const list = Array.isArray(data.projects) ? data.projects : [];
            processedProjects.length = 0;
            list.forEach(project => {
                const chief = Array.isArray(project.chief) ? project.chief : [];
                const subchief = Array.isArray(project.subchief) ? project.subchief : [];
                const participants = Array.isArray(project.participants) ? project.participants : [];
                const computedTotal = chief.length + subchief.length + participants.length;
                const totalCount = Number(project.total_count);

                processedProjects.push({
                    ...project,
                    chief,
                    subchief,
                    participants,
                    total_count: Number.isFinite(totalCount) ? totalCount : computedTotal
                });
            });

            initialOrderMap = null;
            processedProjects.forEach((p, idx) => {
                if (!initialOrderMap) initialOrderMap = new Map();
                const key = p.ContractCode || String(idx);
                initialOrderMap.set(key, idx);
            });

            currentSort = { key: null, type: null, dir: 'asc' };
            isEditing = false;
            updateEditButtons();
            applySearchFilter(true);
        })
        .catch(err => {
            console.error('engineers summary load failed:', err);
        });
}

function exportEngineersTableToExcel() {
    if (typeof XLSX === 'undefined') return;

    const list = getFilteredProjects();
    let maxSubchief = 0;
    let maxParticipants = 0;
    list.forEach(project => {
        maxSubchief = Math.max(maxSubchief, (project.subchief || []).length);
        maxParticipants = Math.max(maxParticipants, (project.participants || []).length);
    });
    if (maxSubchief === 0) maxSubchief = 1;
    if (maxParticipants === 0) maxParticipants = 1;

    const headers = [
        '사업번호',
        '사업명',
        '사책수',
        '분책수',
        '분참수',
        '총원',
        '사책'
    ];

    for (let i = 0; i < maxSubchief; i += 1) {
        headers.push(maxSubchief === 1 ? '분책' : `분책${i + 1}`);
    }
    for (let i = 0; i < maxParticipants; i += 1) {
        headers.push(maxParticipants === 1 ? '분참' : `분참${i + 1}`);
    }

    const rows = list.map(project => {
        const row = [
            project.ContractCode || '',
            project.ProjectName || '',
            project.chief_count ?? 0,
            project.subchief_count ?? 0,
            project.participant_count ?? 0,
            project.total_count ?? 0,
            (project.chief || []).join(', ')
        ];

        for (let i = 0; i < maxSubchief; i += 1) {
            row.push(project.subchief?.[i] || '');
        }
        for (let i = 0; i < maxParticipants; i += 1) {
            row.push(project.participants?.[i] || '');
        }
        return row;
    });

    const data = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '참여기술자');

    const year = document.getElementById('engineersYearSelect')?.value || '전체';
    const safeYear = year === '전체' ? '전체' : `${year}년`;
    const keyword = (currentFilter.keyword || '').trim();
    const safeKeyword = keyword ? `_${keyword}` : '';
    XLSX.writeFile(wb, `참여기술자_${safeYear}${safeKeyword}.xlsx`);
}

function renderEngineersTable(dataList) {
    const table = document.getElementById('engineers-table');
    const thead = table?.querySelector('thead');
    const tbody = document.getElementById('engineers-tbody');
    if (!table || !thead || !tbody) return;

    if (!Array.isArray(dataList) || dataList.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.textContent = '표시할 데이터가 없습니다.';
        td.style.textAlign = 'center';
        td.style.padding = '20px';
        tr.appendChild(td);
        tbody.appendChild(tr);
        updateResultCount(0);
        syncFakeScrollbarWidth();
        return;
    }

    let maxSubchief = 0;
    let maxParticipants = 0;
    dataList.forEach(project => {
        maxSubchief = Math.max(maxSubchief, (project.subchief || []).length);
        maxParticipants = Math.max(maxParticipants, (project.participants || []).length);
    });
    if (maxSubchief === 0) maxSubchief = 1;
    if (maxParticipants === 0) maxParticipants = 1;

    thead.innerHTML = '';
    const groupRow = document.createElement('tr');
    const groupLeft = document.createElement('th');
    groupLeft.colSpan = 6;
    groupLeft.textContent = '구분';
    groupLeft.classList.add('engineers-group-split');
    const groupRight = document.createElement('th');
    groupRight.colSpan = 1 + maxSubchief + maxParticipants;
    groupRight.textContent = '참여기술자';
    groupRow.appendChild(groupLeft);
    groupRow.appendChild(groupRight);

    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
        <th class="sticky-col-a" data-key="ContractCode" data-type="string" style="cursor:pointer;">사업번호</th>
        <th class="sticky-col-b" data-key="ProjectName" data-type="string" style="cursor:pointer;">사업명</th>
        <th data-key="chief_count" data-type="number" style="cursor:pointer;">사책수</th>
        <th data-key="subchief_count" data-type="number" style="cursor:pointer;">분책수</th>
        <th data-key="participant_count" data-type="number" style="cursor:pointer;">분참수</th>
        <th class="engineers-total-col" data-key="total_count" data-type="number" style="cursor:pointer;">총원</th>
        <th class="engineers-name-header">사책</th>
    `;

    for (let i = 0; i < maxSubchief; i += 1) {
        const th = document.createElement('th');
        th.className = 'engineers-name-header';
        th.textContent = maxSubchief === 1 ? '분책' : `분책${i + 1}`;
        headerRow.appendChild(th);
    }

    for (let i = 0; i < maxParticipants; i += 1) {
        const th = document.createElement('th');
        th.className = 'engineers-name-header';
        th.textContent = maxParticipants === 1 ? '분참' : `분참${i + 1}`;
        th.classList.add('engineers-participant-header');
        headerRow.appendChild(th);
    }

    thead.appendChild(groupRow);
    thead.appendChild(headerRow);

    headerRow.querySelectorAll('[data-key]').forEach(th => {
        th.addEventListener('click', () => sortBy(th.dataset.key, th.dataset.type));
    });

    tbody.innerHTML = '';
    const list = applySort(dataList);
    const nameKeyword = (currentFilter.field === 'name')
        ? (currentFilter.keyword || '').toLowerCase()
        : '';

    list.forEach(project => {
        const tr = document.createElement('tr');
        const statusLabel = normalizeProjectStatus(project.project_status);
        tr.dataset.contractCode = project.ContractCode || '';
        tr.dataset.edited = '0';
        if (statusLabel === '준공') tr.classList.add('engineers-status-complete');
        if (statusLabel === '용역중지') tr.classList.add('engineers-status-stop');
        tr.appendChild(createLinkCell(project.ContractCode || '', project.projectID, 'sticky-col-a'));
        tr.appendChild(createLinkCell(project.ProjectName || '', project.projectID, 'sticky-col-b'));
        tr.appendChild(createCell(String(project.chief_count ?? 0)));
        tr.appendChild(createCell(String(project.subchief_count ?? 0)));
        tr.appendChild(createCell(String(project.participant_count ?? 0)));
        tr.appendChild(createCell(String(project.total_count ?? ''), 'engineers-total-col'));
        tr.appendChild(createNameCell((project.chief || []).join(', '), 'chief', undefined, nameKeyword));

        for (let i = 0; i < maxSubchief; i += 1) {
            tr.appendChild(createNameCell(project.subchief?.[i] || '', 'subchief', i, nameKeyword));
        }
        for (let i = 0; i < maxParticipants; i += 1) {
            tr.appendChild(createNameCell(project.participants?.[i] || '', 'participant', i, nameKeyword));
        }

        tbody.appendChild(tr);
    });

    if (isEditing) bindEditTracking(tbody);

    updateResultCount(list.length);
    syncFakeScrollbarWidth();
}

function updateResultCount(count) {
    const el = document.getElementById('engineersResultCount');
    if (!el) return;
    el.textContent = `검색결과 : ${count}개`;
}

function createCell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function createLinkCell(text, projectId, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    const label = text || '';
    if (!projectId) {
        td.textContent = label;
        return td;
    }
    const link = document.createElement('a');
    link.href = `/project_detail/${projectId}`;
    link.textContent = label;
    td.appendChild(link);
    return td;
}

function createNameCell(text, role, index, keyword) {
    const td = document.createElement('td');
    const normalized = String(text || '').toLowerCase();
    const hasMatch = keyword && normalized.includes(keyword);
    if (isEditing) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = text || '';
        input.className = 'engineers-input';
        input.title = text || '';
        input.dataset.role = role;
        if (index !== undefined) input.dataset.index = String(index);
        td.appendChild(input);
    } else {
        td.textContent = text || '';
        td.classList.add('engineers-name-cell');
        td.title = text || '';
    }
    td.classList.add('engineers-name-cell');
    if (role === 'participant') td.classList.add('engineers-participant-cell');
    if (hasMatch) td.classList.add('engineers-name-match');
    return td;
}

function bindEditTracking(tbody) {
    if (editTrackingBound) return;
    editTrackingBound = true;
    tbody.addEventListener('input', (e) => {
        const target = e.target;
        if (!target || !target.classList || !target.classList.contains('engineers-input')) return;
        const row = target.closest('tr');
        if (row) row.dataset.edited = '1';
    });
}

function sortBy(key, type = 'string') {
    if (currentSort.key === key) {
        if (currentSort.dir === 'asc') currentSort.dir = 'desc';
        else if (currentSort.dir === 'desc') currentSort = { key: null, type: null, dir: 'default' };
    } else {
        currentSort = { key, type, dir: 'asc' };
    }

    renderEngineersTable(getFilteredProjects());
}

function applySort(list) {
    if (!currentSort.key || currentSort.dir === 'default') return applyInitialOrder(list);
    const arr = [...list];
    const { key, type, dir } = currentSort;
    arr.sort((a, b) => compareValues(a[key], b[key], type, dir));
    return arr;
}

function applySearchFilter(silent) {
    const field = document.getElementById('engineersSearchField')?.value || 'contract';
    const keyword = (document.getElementById('engineersSearchInput')?.value || '').trim();
    const status = (document.getElementById('engineersStatusSelect')?.value || '').trim();
    currentFilter = { field, keyword, status };
    if (!silent) currentSort = { key: null, type: null, dir: 'asc' };
    renderEngineersTable(getFilteredProjects());
}

function getFilteredProjects() {
    const keyword = (currentFilter.keyword || '').toLowerCase();
    const field = currentFilter.field;
    const status = currentFilter.status || '';

    return processedProjects.filter(project => {
        const statusLabel = normalizeProjectStatus(project.project_status);
        if (status && statusLabel !== status) {
            return false;
        }
        if (!keyword) return true;
        if (field === 'contract') {
            return String(project.ContractCode || '').toLowerCase().includes(keyword);
        }
        if (field === 'project') {
            return String(project.ProjectName || '').toLowerCase().includes(keyword);
        }
        const names = []
            .concat(project.chief || [])
            .concat(project.subchief || [])
            .concat(project.participants || [])
            .join(' ');
        return names.toLowerCase().includes(keyword);
    });
}

function normalizeProjectStatus(rawStatus) {
    if (!rawStatus) return '진행중';
    const status = String(rawStatus).trim();
    if (!status) return '진행중';
    if (status.startsWith('준공')) return '준공';
    if (status === '용역중지') return '용역중지';
    if (status === '진행중') return '진행중';
    return status;
}

function enableEditMode() {
    isEditing = true;
    updateEditButtons();
    toggleEditingClass(true);
    renderEngineersTable(getFilteredProjects());
}

function updateEditButtons() {
    const editBtn = document.getElementById('engineersEditBtn');
    const saveBtn = document.getElementById('engineersSaveBtn');
    if (!editBtn || !saveBtn) return;
    editBtn.style.display = isEditing ? 'none' : 'inline-flex';
    saveBtn.style.display = isEditing ? 'inline-flex' : 'none';
}

function toggleEditingClass(active) {
    const table = document.getElementById('engineers-table');
    if (!table) return;
    table.classList.toggle('is-editing', !!active);
}

function saveEngineersChanges() {
    const tbody = document.getElementById('engineers-tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const editedRows = rows.filter(row => row.dataset.edited === '1');
    const targetRows = editedRows.length > 0 ? editedRows : rows;
    if (targetRows.length === 0) return;

    const payload = targetRows.map(row => {
        const contractcode = row.dataset.contractCode || '';
        const chief = [];
        const subchief = [];
        const participants = [];

        const inputs = row.querySelectorAll('input.engineers-input');
        inputs.forEach(input => {
            const role = input.dataset.role;
            const raw = input.value || '';
            if (role === 'chief') {
                raw.split(',').map(v => v.trim()).filter(Boolean).forEach(v => chief.push(v));
            } else if (role === 'subchief') {
                if (raw.trim()) subchief.push(raw.trim());
            } else if (role === 'participant') {
                if (raw.trim()) participants.push(raw.trim());
            }
        });

        return { contractcode, chief, subchief, participants };
    });

    fetch('/api/annual_project_engineers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: payload })
    })
        .then(res => res.json())
        .then(data => {
            if (!data || data.success !== true) {
                alert(data?.message || '저장에 실패했습니다.');
                return;
            }
            isEditing = false;
            updateEditButtons();
            toggleEditingClass(false);
            const year = document.getElementById('engineersYearSelect')?.value || '';
            loadEngineersSummary(year);
        })
        .catch(err => {
            console.error('engineers save failed:', err);
            alert('저장 중 오류가 발생했습니다.');
        });
}

function applyInitialOrder(list) {
    if (!initialOrderMap) return list;
    const arr = [...list];
    arr.sort((a, b) => {
        const ka = a.ContractCode || '';
        const kb = b.ContractCode || '';
        const ia = initialOrderMap.has(ka) ? initialOrderMap.get(ka) : Number.MAX_SAFE_INTEGER;
        const ib = initialOrderMap.has(kb) ? initialOrderMap.get(kb) : Number.MAX_SAFE_INTEGER;
        return ia - ib;
    });
    return arr;
}

function compareValues(a, b, type = 'string', dir = 'asc') {
    const isNullA = a === null || a === undefined || a === '';
    const isNullB = b === null || b === undefined || b === '';
    if (isNullA && !isNullB) return 1;
    if (!isNullA && isNullB) return -1;
    if (isNullA && isNullB) return 0;

    let result = 0;
    if (type === 'number') {
        const na = Number(a);
        const nb = Number(b);
        result = na === nb ? 0 : (na < nb ? -1 : 1);
    } else {
        const sa = String(a);
        const sb = String(b);
        const ga = scriptGroup(sa);
        const gb = scriptGroup(sb);
        if (ga !== gb) result = ga - gb;
        else result = sa.localeCompare(sb, 'ko-KR', { sensitivity: 'base' });
    }
    return dir === 'asc' ? result : -result;
}

function scriptGroup(s) {
    const first = s.trim().charAt(0);
    if (/^[0-9]/.test(first)) return 1;
    if (/^[A-Za-z]/.test(first)) return 2;
    if (/^[가-힣]/.test(first)) return 3;
    return 0;
}

function enableHorizontalDragScroll(divId) {
    const el = document.getElementById(divId);
    if (!el) return;
    let isDown = false;
    let startX;
    let scrollLeft;

    el.addEventListener('mousedown', function (e) {
        isDown = true;
        el.classList.add('dragging');
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
        el.style.userSelect = 'none';
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mouseup', function () {
        isDown = false;
        el.classList.remove('dragging');
        el.style.userSelect = '';
        document.body.style.userSelect = '';
    });
    el.addEventListener('mouseleave', function () {
        isDown = false;
        el.classList.remove('dragging');
        el.style.userSelect = '';
        document.body.style.userSelect = '';
    });
    el.addEventListener('mousemove', function (e) {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        el.scrollLeft = scrollLeft - (x - startX);
    });
    el.addEventListener('selectstart', function (e) {
        if (isDown) e.preventDefault();
    });
}

let fakeScrollbarState = null;

function setupFakeScrollbar() {
    const tableContainer = document.getElementById('table-container');
    const fakeScrollbar = document.getElementById('fake-scrollbar');
    if (!tableContainer || !fakeScrollbar) return;
    const table = tableContainer.querySelector('table');
    if (!table) return;

    let fakeContent = fakeScrollbar.querySelector('.fake-scrollbar-content');
    if (!fakeContent) {
        fakeContent = document.createElement('div');
        fakeContent.className = 'fake-scrollbar-content';
        fakeScrollbar.appendChild(fakeContent);
    }

    fakeScrollbarState = { tableContainer, fakeScrollbar, table, fakeContent };
    syncFakeScrollbarWidth();
    window.addEventListener('resize', syncFakeScrollbarWidth);

    fakeScrollbar.addEventListener('scroll', function () {
        tableContainer.scrollLeft = fakeScrollbar.scrollLeft;
    });
    tableContainer.addEventListener('scroll', function () {
        fakeScrollbar.scrollLeft = tableContainer.scrollLeft;
    });
}

function syncFakeScrollbarWidth() {
    if (!fakeScrollbarState) return;
    const { tableContainer, fakeScrollbar, table, fakeContent } = fakeScrollbarState;
    fakeScrollbar.style.width = tableContainer.clientWidth + 'px';
    fakeContent.style.width = table.scrollWidth + 'px';
}
