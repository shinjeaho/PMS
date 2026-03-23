document.addEventListener('DOMContentLoaded', function () {
    renderAnnualManagmentTable();
    renderAnnualExpenseTable();
    bindYearFilter();
    bindDepartmentFilter();
    bindTabs();
    enableHorizontalDragScroll('table-container');
    syncFakeScrollbar();

    window.addEventListener('resize', syncFakeScrollbar);

    const fakeScrollbar = document.getElementById('fake-scrollbar');
    const tableContainer = document.getElementById('table-container');

    if (fakeScrollbar && tableContainer) {
        fakeScrollbar.addEventListener('scroll', function () {
            tableContainer.scrollLeft = fakeScrollbar.scrollLeft;
        });
        tableContainer.addEventListener('scroll', function () {
            fakeScrollbar.scrollLeft = tableContainer.scrollLeft;
        });
    }
});

function bindTabs() {
    const tabButtons = document.querySelectorAll('.annual-tab-btn');
    if (!tabButtons.length) return;

    tabButtons.forEach((button) => {
        button.addEventListener('click', function () {
            const tab = this.dataset.tab;
            setActiveTab(tab);
        });
    });
}

function setActiveTab(tab) {
    const tabButtons = document.querySelectorAll('.annual-tab-btn');
    const tabTables = document.querySelectorAll('.annual-tab-table');

    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
    });

    tabTables.forEach((table) => {
        table.style.display = table.dataset.tab === tab ? '' : 'none';
    });

    syncFakeScrollbar();
}

function bindYearFilter() {
    const yearSelect = document.getElementById('annualManagmentYear');
    if (!yearSelect) return;

    yearSelect.addEventListener('change', function () {
        const year = Number(this.value || 0);
        if (!year) return;
        const department = getSelectedDepartment();
        const url = new URL(`/PMS_annualManagment/${encodeURIComponent(year)}`, window.location.origin);
        if (department && department !== '전체') {
            url.searchParams.set('department', department);
        }
        window.location.href = url.toString();
    });
}

function bindDepartmentFilter() {
    const departmentSelect = document.getElementById('annualManagmentDepartment');
    const yearSelect = document.getElementById('annualManagmentYear');
    if (!departmentSelect || !yearSelect) return;

    departmentSelect.addEventListener('change', function () {
        const year = Number(yearSelect.value || 0);
        if (!year) return;
        const department = (this.value || '전체').trim();

        const url = new URL(`/PMS_annualManagment/${encodeURIComponent(year)}`, window.location.origin);
        if (department && department !== '전체') {
            url.searchParams.set('department', department);
        }
        window.location.href = url.toString();
    });
}

function getSelectedDepartment() {
    const departmentSelect = document.getElementById('annualManagmentDepartment');
    return (departmentSelect?.value || '전체').trim();
}

function renderAnnualManagmentTable() {
    const projects = Array.isArray(window.projects) ? window.projects : [];
    const positions = Array.isArray(window.positions) ? window.positions : [];
    const tbody = document.getElementById('annualManagment_tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (projects.length === 0) {
        const emptyRow = document.createElement('tr');
        const fixedCols = 7;
        const dynamicCols = (positions.length * 3) + 2;
        emptyRow.innerHTML = `<td colspan="${fixedCols + dynamicCols}" style="text-align:center; padding:18px;">등록된 데이터가 없습니다.</td>`;
        tbody.appendChild(emptyRow);
        return;
    }

    const totals = {};
    positions.forEach((position) => {
        totals[position] = { day: 0, night: 0, holiday: 0, total: 0 };
    });
    let grandTotal = 0;
    let grandAmount = 0;

    projects.forEach((project) => {
        const row = document.createElement('tr');
        const mdStats = project.md_stats || {};
        const progressText = formatProgress(project.total_progress);

        let rowHtml = `
            <td class="sticky-col" style="text-align:left;"><a href="/project_detail/${project.projectID}">${escapeHtml(project.ContractCode || '-')}</a></td>
            <td class="sticky-col-2" style="text-align:left; border-right: 3px solid #999;" title="${escapeHtml(project.ProjectName || '')}"><a href="/project_detail/${project.projectID}">${escapeHtml(project.ProjectName || '-')}</a></td>
            <td>${formatDate(project.StartDate)}</td>
            <td>${formatDate(project.EndDate)}</td>
            <td>${formatDDayDisplay(project.D_Day)}</td>
            <td style="border-right: 3px solid #999;">${progressText}</td>
        `;

        let projectTotal = 0;

        positions.forEach((position) => {
            const stat = mdStats[position] || {};
            const day = toNumber(stat.day_md);
            const night = toNumber(stat.night_md);
            const holiday = toNumber(stat.holiday_md);
            const sum = day + night + holiday;

            totals[position].day += day;
            totals[position].night += night;
            totals[position].holiday += holiday;
            totals[position].total += sum;
            projectTotal += sum;

            rowHtml += `
                <td>${formatMd(day)}</td>
                <td>${formatMd(night)}</td>
                <td style="border-right: 3px solid #999;">${formatMd(holiday)}</td>
            `;
        });

        grandTotal += projectTotal;
        const laborAmount = toNumber(project.labor_amount);
        grandAmount += laborAmount;
        rowHtml += `<td>${formatMd(projectTotal)}</td>`;
        rowHtml += `<td>${formatMoney(laborAmount)}</td>`;

        row.innerHTML = rowHtml;
        tbody.appendChild(row);
    });

    const summaryRow = document.createElement('tr');
    summaryRow.classList.add('summary-row');
    summaryRow.style.fontWeight = 'bold';
    summaryRow.style.backgroundColor = '#f0f0f0';

    let summaryHtml = '<td colspan="6" style="text-align:center; border-right: 3px solid #999;">합계</td>';

    positions.forEach((position) => {
        summaryHtml += `
            <td>${formatMd(totals[position].day)}</td>
            <td>${formatMd(totals[position].night)}</td>
            <td style="border-right: 3px solid #999;">${formatMd(totals[position].holiday)}</td>
        `;
    });

    summaryHtml += `<td>${formatMd(grandTotal)}</td>`;
    summaryHtml += `<td>${formatMoney(grandAmount)}</td>`;
    summaryRow.innerHTML = summaryHtml;
    tbody.appendChild(summaryRow);

    syncFakeScrollbar();
}

function renderAnnualExpenseTable() {
    const projects = Array.isArray(window.projects) ? window.projects : [];
    const tbody = document.getElementById('annualExpense_tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (projects.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="7" style="text-align:center; padding:18px;">등록된 데이터가 없습니다.</td>';
        tbody.appendChild(emptyRow);
        return;
    }

    let grandExpense = 0;

    projects.forEach((project) => {
        const row = document.createElement('tr');
        const expenseAmount = toNumber(project.expense_amount);
        grandExpense += expenseAmount;

        row.innerHTML = `
            <td class="sticky-col" style="text-align:left;"><a href="/project_detail/${project.projectID}">${escapeHtml(project.ContractCode || '-')}</a></td>
            <td class="sticky-col-2" style="text-align:left; border-right: 3px solid #999;" title="${escapeHtml(project.ProjectName || '')}"><a href="/project_detail/${project.projectID}">${escapeHtml(project.ProjectName || '-')}</a></td>
            <td>${formatDate(project.StartDate)}</td>
            <td>${formatDate(project.EndDate)}</td>
            <td>${formatDDayDisplay(project.D_Day)}</td>
            <td style="border-right: 3px solid #999;">${formatProgress(project.total_progress)}</td>
            <td>${formatMoney(expenseAmount)}</td>
        `;

        tbody.appendChild(row);
    });

    const summaryRow = document.createElement('tr');
    summaryRow.classList.add('summary-row');
    summaryRow.style.fontWeight = 'bold';
    summaryRow.style.backgroundColor = '#f0f0f0';
    summaryRow.innerHTML = `
        <td colspan="6" style="text-align:center; border-right: 3px solid #999;">합계</td>
        <td>${formatMoney(grandExpense)}</td>
    `;
    tbody.appendChild(summaryRow);
}

function syncFakeScrollbar() {
    const tableContainer = document.getElementById('table-container');
    const fakeScrollbar = document.getElementById('fake-scrollbar');
    if (!tableContainer || !fakeScrollbar) return;

    let fakeContent = fakeScrollbar.querySelector('.fake-scrollbar-content');
    if (!fakeContent) {
        fakeContent = document.createElement('div');
        fakeContent.className = 'fake-scrollbar-content';
        fakeScrollbar.appendChild(fakeContent);
    }

    const table = tableContainer.querySelector('.annual-tab-table:not([style*="display: none"])') || tableContainer.querySelector('table');
    if (!table) return;

    fakeScrollbar.style.width = tableContainer.clientWidth + 'px';
    fakeContent.style.width = table.scrollWidth + 'px';
}

function enableHorizontalDragScroll(divId) {
    const el = document.getElementById(divId);
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    el.addEventListener('mousedown', function (e) {
        isDown = true;
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
        el.classList.add('dragging');
    });

    document.addEventListener('mouseup', function () {
        isDown = false;
        el.classList.remove('dragging');
    });

    el.addEventListener('mouseleave', function () {
        isDown = false;
        el.classList.remove('dragging');
    });

    el.addEventListener('mousemove', function (e) {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.2;
        el.scrollLeft = scrollLeft - walk;
    });
}

function toNumber(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num : 0;
}

function formatMd(value) {
    const num = toNumber(value);
    return num.toFixed(2);
}

function formatMoney(value) {
    const num = Math.round(toNumber(value));
    return num.toLocaleString();
}

function formatDate(dateValue) {
    if (!dateValue) return '-';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatProgress(progress) {
    const num = Number(progress);
    if (!Number.isFinite(num)) return '-';
    const fixed = num.toFixed(2).replace(/\.0+$/, '').replace(/\.(\d)0$/, '.$1');
    return `${fixed}%`;
}

function formatDDayDisplay(value) {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    if (Number.isNaN(num)) return '-';
    if (num === 0) return 'D-Day';
    if (num > 0) return `D+${num}`;
    return `D${num}`;
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
