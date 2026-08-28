const MONTHLY_REPORT_DEPARTMENTS = [
  '경영지원부',
  '총무부',
  '공공사업부',
  '공정관리부',
  'GIS사업부',
  '공간정보사업부',
  '기업부설연구소',
  'BIT',
  'BIT공정관리부',
];
const MONTHLY_REPORT_ALL_DEPARTMENT_USERS = new Set([
  '김정욱',
  '최태혁',
  '한형섭',
  '나준영',
  '최도현',
  '개발',
]);

let __monthlyState = {
  year: null,
  month: null,
  activeDept: '',
  issueMap: new Map(),
  meetingByDept: new Map(),
};

function normalizeMonthlyDepartmentName(raw) {
  const base = String(raw || '').trim();
  if (!base) return '';
  if (base === 'BIT 공정관리부') return 'BIT공정관리부';
  if (base === '연구소') return '기업부설연구소';
  if (base === '기업부설연구소(연구소)') return '기업부설연구소';
  return base;
}

function getVisibleMonthlyDepartments() {
  const userName = String(document.getElementById('monthlyUserName')?.value || '').trim();
  if (MONTHLY_REPORT_ALL_DEPARTMENT_USERS.has(userName)) {
    return MONTHLY_REPORT_DEPARTMENTS;
  }

  const department = normalizeMonthlyDepartmentName(
    document.getElementById('sessionDept')?.value || '',
  );
  return MONTHLY_REPORT_DEPARTMENTS.includes(department) ? [department] : [];
}

function parseIntSafe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtmlSafe(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildWeekRangeText(weekStartRaw) {
  const raw = String(weekStartRaw || '').trim();
  if (!raw) return '';

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';

  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  end.setDate(end.getDate() + 6);

  const sMonth = start.getMonth() + 1;
  const sDay = start.getDate();
  const eMonth = end.getMonth() + 1;
  const eDay = end.getDate();
  return `${sMonth}/${sDay} ~ ${eMonth}/${eDay}`;
}

function buildWeekCellHtml(row) {
  const title = String(row?.week_title || '').trim();
  const m = title.match(/(\d{1,2})월(\d+)주차/);
  const weekLabel = m
    ? `${Number(m[1])}월 ${Number(m[2])}주차`
    : (title || '-');

  const range = buildWeekRangeText(row?.week_start);
  if (!range) return escapeHtmlSafe(weekLabel);

  return `${escapeHtmlSafe(weekLabel)}<br>(${escapeHtmlSafe(range)})`;
}

function buildMeetingFileUrl(meeting) {
  const meetingId = meeting?.id;
  if (meetingId) {
    return `/doc_editor_api/meeting/file/${encodeURIComponent(meetingId)}/${encodeURIComponent('PDF')}`;
  }
  return meeting?.file_path || '';
}

function buildMeetingPdfFrameSrc(meeting) {
  const filePath = buildMeetingFileUrl(meeting);
  if (!filePath) return '';
  const separator = filePath.includes('#') ? '&' : '#';
  return `${filePath}${separator}toolbar=0&navpanes=0&scrollbar=0`;
}

function getYearMonthKeyFromMeeting(item) {
  const raw = String(item?.meeting_datetime || item?.created_at || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  return `${m[1]}-${m[2]}`;
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search || '');
  const yearInput = document.getElementById('monthlyYear');
  const monthInput = document.getElementById('monthlyMonth');
  const deptInput = document.getElementById('monthlyInitialDept');

  const year = parseIntSafe(params.get('year') || yearInput?.value || new Date().getFullYear(), new Date().getFullYear());
  const month = parseIntSafe(params.get('month') || monthInput?.value || (new Date().getMonth() + 1), new Date().getMonth() + 1);

  const visibleDepartments = getVisibleMonthlyDepartments();
  let dept = normalizeMonthlyDepartmentName(params.get('dept') || deptInput?.value || '');
  if (!visibleDepartments.includes(dept)) dept = visibleDepartments[0] || '';

  return { year, month, dept };
}

function pickDefaultActiveDept(initialDept) {
  const visibleDepartments = getVisibleMonthlyDepartments();
  if (visibleDepartments.includes(initialDept) && hasAnyDataForDept(initialDept)) {
    return initialDept;
  }

  const firstWithData = visibleDepartments.find((dept) => hasAnyDataForDept(dept));
  return firstWithData || visibleDepartments[0] || '';
}

function hasAnyDataForDept(dept) {
  const issueList = __monthlyState.issueMap.get(dept) || [];
  const meeting = __monthlyState.meetingByDept.get(dept) || null;
  return issueList.length > 0 || !!meeting;
}

function renderTitle(year, month) {
  const title = `${month}월 월간보고`;
  const pageTitle = document.getElementById('monthlyPageTitle');
  if (pageTitle) pageTitle.textContent = title;
  const h1 = document.getElementById('projectName');
  if (h1) h1.textContent = `${year}년 ${month}월 월간보고`;
  document.title = `${year}년 ${month}월 월간보고`;
}

function renderDeptTabs() {
  const host = document.getElementById('monthlyDeptTabs');
  if (!host) return;

  host.innerHTML = '';
  getVisibleMonthlyDepartments().forEach((dept) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'monthly-dept-tab';
    btn.setAttribute('role', 'tab');
    btn.dataset.dept = dept;
    btn.textContent = dept;

    const active = dept === __monthlyState.activeDept;
    const hasData = hasAnyDataForDept(dept);

    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.disabled = !hasData;

    if (hasData) {
      btn.addEventListener('click', () => {
        if (__monthlyState.activeDept === dept) return;
        __monthlyState.activeDept = dept;
        renderDeptTabs();
        renderIssueTable();
        renderPdfViewer();
      });
    }

    host.appendChild(btn);
  });
}

function renderIssueTable() {
  const tbody = document.getElementById('monthlyIssueTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = (__monthlyState.issueMap.get(__monthlyState.activeDept) || []).slice().sort((a, b) => {
    const aTitle = String(a?.week_title || '');
    const bTitle = String(b?.week_title || '');

    const aWeek = Number((aTitle.match(/(\d+)주차/) || [])[1] || Number.MAX_SAFE_INTEGER);
    const bWeek = Number((bTitle.match(/(\d+)주차/) || [])[1] || Number.MAX_SAFE_INTEGER);
    if (aWeek !== bWeek) return aWeek - bWeek;

    const aDate = String(a?.week_start || '');
    const bDate = String(b?.week_start || '');
    return aDate.localeCompare(bDate);
  });
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="2" class="monthly-empty">수집된 전주 이슈사항이 없습니다.</td>`;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const weekTitleHtml = buildWeekCellHtml(row);
    const content = String(row.content_html || '').trim() || '-';
    tr.innerHTML = `
      <td class="monthly-week-col">${weekTitleHtml}</td>
      <td class="monthly-content-col">${content}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPdfViewer() {
  const frame = document.getElementById('monthlyPdfFrame');
  const empty = document.getElementById('monthlyPdfEmpty');
  if (!frame || !empty) return;

  const meeting = __monthlyState.meetingByDept.get(__monthlyState.activeDept) || null;
  const src = buildMeetingPdfFrameSrc(meeting);
  if (!src) {
    frame.style.display = 'none';
    frame.src = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  frame.style.display = 'block';
  frame.src = src;
}

function buildMeetingByDept(items, year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const map = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (getYearMonthKeyFromMeeting(item) !== key) return;

    const dept = normalizeMonthlyDepartmentName(item?.attendees || '');
    if (!MONTHLY_REPORT_DEPARTMENTS.includes(dept)) return;

    if (!map.has(dept)) {
      map.set(dept, item);
    }
  });

  return map;
}

function buildIssueMapFromApi(data) {
  const map = new Map();
  const list = Array.isArray(data?.departments) ? data.departments : [];
  list.forEach((deptRow) => {
    const dept = normalizeMonthlyDepartmentName(deptRow?.department || '');
    if (!dept) return;
    const issues = Array.isArray(deptRow?.issues) ? deptRow.issues : [];
    map.set(dept, issues);
  });
  return map;
}

async function monthlyLoadAndRender() {
  const { year, month, dept } = getQueryParams();
  __monthlyState.year = year;
  __monthlyState.month = month;

  renderTitle(year, month);

  try {
    const [meetingRes, issuesRes] = await Promise.all([
      fetch('/doc_editor_api/monthly/list'),
      fetch(`/api/monthly_prev_issues?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
    ]);

    const meetingData = await meetingRes.json();
    const issuesData = await issuesRes.json();

    __monthlyState.meetingByDept = buildMeetingByDept(meetingData?.items || [], year, month);
    __monthlyState.issueMap = buildIssueMapFromApi(issuesData);

    __monthlyState.activeDept = pickDefaultActiveDept(dept);
    renderDeptTabs();
    renderIssueTable();
    renderPdfViewer();
  } catch (err) {
    console.error('monthly_report load error:', err);
    const tbody = document.getElementById('monthlyIssueTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="2" class="monthly-empty" style="color:#b00020;">데이터를 불러오지 못했습니다.</td></tr>';
    }
    const frame = document.getElementById('monthlyPdfFrame');
    const empty = document.getElementById('monthlyPdfEmpty');
    if (frame) frame.style.display = 'none';
    if (empty) {
      empty.style.display = 'flex';
      empty.textContent = '월간보고 PDF를 불러오지 못했습니다.';
    }
  }
}

function goBackToMonthlyList() {
  const year = __monthlyState.year || new Date().getFullYear();
  window.location.href = `/PMS_Business/${encodeURIComponent(year)}?tab=monthly`;
}

function navigateMonthlyReport(monthOffset) {
  const baseYear = Number(__monthlyState.year) || new Date().getFullYear();
  const baseMonth = Number(__monthlyState.month) || (new Date().getMonth() + 1);
  const target = new Date(baseYear, baseMonth - 1 + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth() + 1;
  const dept = normalizeMonthlyDepartmentName(__monthlyState.activeDept);

  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (dept) params.set('dept', dept);
  window.location.href = `/monthly_report?${params.toString()}`;
}

function goToPreviousMonthlyReport() {
  navigateMonthlyReport(-1);
}

function goToNextMonthlyReport() {
  navigateMonthlyReport(1);
}

document.addEventListener('DOMContentLoaded', monthlyLoadAndRender);
