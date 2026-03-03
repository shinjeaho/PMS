async function weeklyLoadAndRenderDetail() {
  const root = document.getElementById('weeklyDetailRoot');
  const weekStart = root?.dataset?.weekStart;
  if (!root || !weekStart) return;

  try {
    const res = await fetch(`/api/weekly_detail?week_start=${encodeURIComponent(weekStart)}`);
    const data = await res.json();
    if (!data.ok) {
      root.innerHTML = `<div style="color:#b00020;">로드 실패: ${data.message || '알 수 없는 오류'}</div>`;
      return;
    }
    root.innerHTML = '';
    renderWeeklyTables(root, data);
  } catch (e) {
    console.error('weekly_detail load error:', e);
    root.innerHTML = `<div style="color:#b00020;">요청 중 오류가 발생했습니다.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', weeklyLoadAndRenderDetail);

function weeklyDeptLabelHtml(deptName) {
  const name = String(deptName || '-');
  const limit = weeklyGetScheduleLineLimitForDept(name);
  return `${escapeHtml(name)}<span class="dept-line-limit"> (${limit}줄)</span>`;
}

function weeklyDeptNameHtml(deptName) {
  const name = String(deptName || '-');
  return `${escapeHtml(name)}`;
}

function addDays(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

// 한국 고정 공휴일(간단 버전): 1/1, 3/1, 5/5, 6/6, 8/15, 10/3, 12/25
// 대체/음력 공휴일은 제외. 필요 시 확장 가능.
function isFixedHoliday(date) {
  const m = date.getMonth() + 1; // 1-12
  const d = date.getDate();
  const key = `${m}/${d}`;
  switch (key) {
    case '1/1':   // 신정
    case '3/1':   // 삼일절
    case '5/5':   // 어린이날
    case '6/6':   // 현충일
    case '8/15':  // 광복절
    case '10/3':  // 개천절
    case '12/25': // 성탄절
      return true;
    default:
      return false;
  }
}


// 입력 HTML을 줄 단위로 분리해 각 줄을 <div>로 감싸는 정규화 함수
function weeklyNormalizeHtmlToDivLines(html) {
  const raw = String(html || '');
  if (!raw.trim()) return '';

  let s = raw;
  // 줄바꿈 문자들을 <br>로 통일
  s = s.replace(/\r\n|\r|\n/g, '<br>');
  s = s.replace(/<br\s*\/?>/gi, '<br>');
  // 블록 닫는 태그를 줄 구분으로 변환
  s = s.replace(/<\/(div|p|li|h[1-6])\s*>/gi, '<br>');
  // 블록 여는 태그도 줄 구분으로 처리(여는 태그 제거만 하면 내부가 붙어있을 수 있으므로)
  s = s.replace(/<(div|p|li|h[1-6])\b[^>]*>/gi, '<br>');
  // 연속된 <br>는 하나로 축약
  s = s.replace(/(?:<br>\s*){2,}/g, '<br>');

  const parts = s.split(/<br>/i).map(p => String(p)).filter(p => p !== '');
  return parts
    .map(weeklyPreserveLeadingSpaces)
    .filter(Boolean)
    .map(p => `<div class="weekly-line">${p}</div>`)
    .join('');
}

function weeklyPreserveLeadingSpaces(line) {
  const trimmedEnd = line.replace(/\s+$/g, '');
  if (trimmedEnd.trim() === '') return '';
  const match = trimmedEnd.match(/^\s+/);
  if (!match) return trimmedEnd;
  const lead = match[0];
  const nbsp = lead.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  return nbsp + trimmedEnd.slice(lead.length);
}

function weeklyPreserveLeadingSpacesInHtml(html) {
  const raw = String(html || '');
  if (!raw.trim()) return '';
  let s = raw;
  s = s.replace(/\r\n|\r|\n/g, '<br>');
  s = s.replace(/<br\s*\/?>/gi, '<br>');
  s = s.replace(/<\/(div|p|li|h[1-6])\s*>/gi, '<br>');
  s = s.replace(/<(div|p|li|h[1-6])\b[^>]*>/gi, '<br>');
  s = s.replace(/(?:<br>\s*){2,}/g, '<br>');
  const parts = s.split(/<br>/i).map(p => String(p)).filter(p => p !== '');
  return parts
    .map(weeklyPreserveLeadingSpaces)
    .filter(Boolean)
    .join('<br>');
}

function renderWeeklyTables(root, data) {
  // 모달에서 재사용할 수 있도록 전역에 저장
  window.__weeklyDetailData__ = data;
  const { week = {}, departments = [] } = data;
  const weekStart = new Date(week.week_start || root.dataset.weekStart);
  const dayNames = ['월','화','수','목','금','토'];

  // 인쇄 시 데이터가 없더라도 표가 페이지를 채우도록 더미 행을 추가(인쇄 전용)
  function appendPrintOnlyFillRow(tbody, colspan) {
    const tr = document.createElement('tr');
    tr.className = 'print-only';
    const td = document.createElement('td');
    td.colSpan = colspan;
    td.innerHTML = '&nbsp;';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  // 인쇄용: mm -> px 환산
  function pxPerMm() {
    const probe = document.createElement('div');
    probe.style.height = '10mm';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().height / 10;
    document.body.removeChild(probe);
    return px;
  }

  function readPrintFillMm() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--print-table-fill').trim();
    if (v.endsWith('mm')) {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 165;
    }
    return 165;
  }

  // 상단: 부서별 주간일정표
  // 스케줄 섹션 래퍼
  const scheduleSection = document.createElement('div');
  scheduleSection.className = 'schedule-section';

  const hSchedule = document.createElement('div');
  hSchedule.className = 'sub-title';
  const endDate = addDays(weekStart, 6);
  const startMonth = weekStart.getMonth()+1;
  const endMonth = endDate.getMonth()+1;
  // 항상 ~M/D 형식으로 표기
  const rangeText = `${startMonth}/${weekStart.getDate()}~${endMonth}/${endDate.getDate()}`;
  hSchedule.textContent = `부서별 주간일정표 (${week.month || startMonth}월 ${(week.week_index)||''}주차_${rangeText})`;
  scheduleSection.appendChild(hSchedule);

  const tbl1 = document.createElement('table');
  tbl1.className = 'weekly-table';
  // 인쇄 시 표 높이를 페이지에 맞게 채움
  tbl1.classList.add('print-fill');
  // 인쇄 폭 안정화를 위한 colgroup 지정
  const colgroup1 = document.createElement('colgroup');
  const colDept1 = document.createElement('col'); colDept1.className = 'col-dept'; colgroup1.appendChild(colDept1);
  for (let i=0;i<6;i++) { const c = document.createElement('col'); c.className = 'col-day'; colgroup1.appendChild(c); }
  tbl1.appendChild(colgroup1);
  const thead1 = document.createElement('thead');
  const trh1 = document.createElement('tr');
  const thDept1 = document.createElement('th'); thDept1.textContent = '부서'; thDept1.className = 'dept-col'; trh1.appendChild(thDept1);
  for (let i=0;i<6;i++) {
    const d = addDays(weekStart, i);
    const th = document.createElement('th');
    // 토요일만 요일명+날짜 모두 파란색, 공휴일 빨간색
    const isSat = d.getDay() === 6;
    const isHoliday = isFixedHoliday(d);
    let dayLabel, dateLabel;
    if (isHoliday) {
      dayLabel = `<span class=\"red\">${dayNames[i]}</span>`;
      dateLabel = `<span class=\"red\">(${d.getDate()})</span>`;
    } else if (isSat) {
      dayLabel = `<span class=\"blue\">${dayNames[i]}</span>`;
      dateLabel = `<span class=\"blue\">(${d.getDate()})</span>`;
    } else {
      dayLabel = dayNames[i];
      dateLabel = `<span>(${d.getDate()})</span>`;
    }
    th.innerHTML = `${dayLabel}${dateLabel}`;
    th.className = 'day-col';
    trh1.appendChild(th);
  }
  thead1.appendChild(trh1); tbl1.appendChild(thead1);
  const tbody1 = document.createElement('tbody');
  departments.forEach(dept => {
    const tr = document.createElement('tr');
    const tdDept = document.createElement('td');
    tdDept.innerHTML = weeklyDeptNameHtml(dept.department || '-');
    tdDept.className = 'dept-col';
    tr.appendChild(tdDept);
    const keys = ['mon','tue','wed','thu','fri','sat'];
    keys.forEach(k => {
        const td = document.createElement('td'); td.className = 'day-col'; td.innerHTML = weeklyNormalizeHtmlToDivLines(dept.schedule?.[k] || ''); tr.appendChild(td);
    });
    tbody1.appendChild(tr);
  });
  if (!departments || departments.length === 0) {
    // 부서 + 월~토(6) = 7 columns
    appendPrintOnlyFillRow(tbody1, 7);
  }
  tbl1.appendChild(tbody1);
  scheduleSection.appendChild(tbl1);
  root.appendChild(scheduleSection);

  // 하단: 부서별 이슈사항
  const hIssues = document.createElement('div');
  hIssues.className = 'sub-title';
  hIssues.textContent = `부서별 이슈사항 (${week.month || startMonth}월 ${(week.week_index)||''}주차_${rangeText})`;
  root.appendChild(hIssues);

  const tbl2 = document.createElement('table');
  tbl2.className = 'weekly-table';
  tbl2.classList.add('weekly-issues-table');
  // 이슈 표 colgroup 지정
  const colgroup2 = document.createElement('colgroup');
  const colDept2 = document.createElement('col'); colDept2.className = 'col-dept'; colgroup2.appendChild(colDept2);
  const colPrev = document.createElement('col'); colPrev.className = 'col-issue'; colgroup2.appendChild(colPrev);
  const colCurr = document.createElement('col'); colCurr.className = 'col-issue'; colgroup2.appendChild(colCurr);
  tbl2.appendChild(colgroup2);
  const thead2 = document.createElement('thead');
  const trh2 = document.createElement('tr');
  const thDept2 = document.createElement('th'); thDept2.textContent = '부서'; thDept2.className = 'dept-col'; trh2.appendChild(thDept2);
  const thPrev = document.createElement('th'); thPrev.textContent = '전주'; thPrev.className = 'issue-col'; trh2.appendChild(thPrev);
  const thCurr = document.createElement('th'); thCurr.innerHTML = '<span class="blue">금주</span>'; thCurr.className = 'issue-col'; trh2.appendChild(thCurr);
  thead2.appendChild(trh2); tbl2.appendChild(thead2);
  const tbody2 = document.createElement('tbody');
  departments.forEach(dept => {
    const tr = document.createElement('tr');
    const tdDept = document.createElement('td');
    tdDept.innerHTML = weeklyDeptNameHtml(dept.department || '-');
    tdDept.className = 'dept-col';
    tr.appendChild(tdDept);
    const tdPrev = document.createElement('td'); tdPrev.className = 'issue-col'; tdPrev.innerHTML = weeklyNormalizeHtmlToDivLines(dept.issues?.prev || ''); tr.appendChild(tdPrev);
    const tdCurr = document.createElement('td'); tdCurr.className = 'issue-col'; tdCurr.innerHTML = weeklyNormalizeHtmlToDivLines(dept.issues?.curr || ''); tr.appendChild(tdCurr);
    tbody2.appendChild(tr);
  });
  if (!departments || departments.length === 0) {
    // 부서 + 전주 + 금주 = 3 columns
    appendPrintOnlyFillRow(tbody2, 3);
  }
  tbl2.appendChild(tbody2);
  root.appendChild(tbl2);

  // 인쇄 시 표 높이를 페이지에 맞게 채우도록 행 높이 균등 분배
  function applyPrintFillHeights() {
    try {
      const ppm = pxPerMm();
      const targetMm = readPrintFillMm();
      const targetTableHeightPx = targetMm * ppm;

      // 이슈표는 한 부서의 내용이 페이지를 넘을 수 있으므로,
      // 강제 높이/행높이 균등 분배를 적용하지 않고 자연스럽게 페이지가 넘어가도록 둠.
      if (tbl1 && tbl1.isConnected) {
        const thead = tbl1.querySelector('thead');
        const tbody = tbl1.querySelector('tbody');
        if (tbody) {
          tbl1.style.height = `${targetTableHeightPx}px`;
          const theadHeight = thead ? thead.getBoundingClientRect().height : 0;
          const rows = Array.from(tbody.querySelectorAll('tr'));
          const rowCount = rows.length || 1;
          const rowHeight = Math.max(18, (targetTableHeightPx - theadHeight) / rowCount);
          rows.forEach((tr) => {
            tr.style.height = `${rowHeight}px`;
          });
        }
      }

      // 페이지 break 후 비어있는 부서명 셀 채우기
      try {
        weeklyFillEmptyDeptNames(tbl2);
      } catch (e) {
        console.warn('weeklyFillEmptyDeptNames failed:', e);
      }
    } catch (e) {
      console.warn('print fill compute failed:', e);
    }
  }

  function clearPrintFillHeights() {
    // schedule 표
    if (tbl1) {
      tbl1.style.height = '';
      const tbody = tbl1.querySelector('tbody');
      if (tbody) {
        Array.from(tbody.querySelectorAll('tr')).forEach((tr) => {
          tr.style.height = '';
        });
      }
    }

    // 이슈표: 인쇄 전 행 분할을 원상 복구
    try {
      weeklyRestoreIssuesTableAfterPrint(tbl2);
    } catch (e) {
      console.warn('weeklyRestoreIssuesTableAfterPrint failed:', e);
    }
  }

  if (!window.__weeklyPrintFillBound__) {
    window.__weeklyPrintFillBound__ = true;
    
    const handleBeforePrint = () => {
      applyPrintFillHeights();
    };

    const handleAfterPrint = () => {
      clearPrintFillHeights();
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    const mq = window.matchMedia ? window.matchMedia('print') : null;
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', (e) => {
        if (e.matches) {
          handleBeforePrint();
        } else {
          handleAfterPrint();
        }
      });
    }
  }
} // end of renderWeeklyTables

// ====== 인쇄 시 이슈표: 페이지 넘김 시 부서명 반복(행 분할) ======
// 브라우저는 table-row가 페이지 중간에서 잘릴 때 첫 컬럼(부서)을 자동 반복해주지 않으므로,
// beforeprint에 HTML을 높이 기준으로 여러 행으로 쪼개서 부서명을 매 행에 다시 렌더링한다.

function weeklyIsIssuesTable(table) {
  if (!table) return false;
  try {
    const ths = Array.from(table.querySelectorAll('thead th'));
    if (ths.length !== 3) return false;
    const labels = ths.map(th => (th.textContent || '').trim());
    return labels[0] === '부서' && labels.includes('전주') && labels.includes('금주');
  } catch (_) {
    return false;
  }
}

function weeklyIssuesCellWidthPxForPrint() {
  // 인쇄 기준 폭(weekly_detail.html에서 277mm) + 부서 칸 25mm
  const ppm = weeklyCssPxPerMmForPrint();
  const totalWidthPx = 277 * ppm;
  const deptWidthPx = 25 * ppm;
  return (totalWidthPx - deptWidthPx) / 2;
}

function weeklyIssuesPageHeightPxForPrint() {
  const ppm = weeklyCssPxPerMmForPrint();
  
  // CSS 변수에서 페이지 높이 정보 읽기
  const root = document.documentElement;
  const style = getComputedStyle(root);
  
  // CSS 변수 읽기 (기본값 설정)
  let pageHeightMm = parseFloat(style.getPropertyValue('--print-page-height')) || 210;
  let marginTopMm = parseFloat(style.getPropertyValue('--print-page-margin-top')) || 10;
  let marginBottomMm = parseFloat(style.getPropertyValue('--print-page-margin-bottom')) || 10;
  let headerHeightMm = parseFloat(style.getPropertyValue('--print-page-header-height')) || 8;
  
  // 유효 높이 = 전체 높이 - 상하 여백 - 헤더 높이
  // 더 보수적으로: 추가 여유 공간 5mm 확보 (예측 오차 대비)
  const effectiveHeightMm = pageHeightMm - marginTopMm - marginBottomMm - headerHeightMm - 5;
  const pageHeightPx = effectiveHeightMm * ppm;
  
  return Math.max(pageHeightPx, 400); // 최소값 보장 (400px)
}

function weeklyIssuesHtmlToLineHtmlArray(html) {
  const raw = String(html || '');
  if (!raw.trim()) return [];

  // <br> 중심으로 잘게 쪼개되, block 종료 태그도 줄바꿈으로 간주
  let s = raw;
  s = s.replace(/<br\s*\/?>/gi, '<br>');
  s = s.replace(/<\/(div|p|li|h[1-6])\s*>/gi, '<br>');
  s = s.replace(/<(div|p|li|h[1-6])\b[^>]*>/gi, '');

  const parts = s.split(/<br>/i);
  return parts
    .map(p => weeklyPreserveLeadingSpaces(String(p)))
    .filter(p => p !== '');
}

function weeklyIssuesMeasureHtmlHeightPx(html, widthPx) {
  const box = weeklyEnsureIssuesMeasureBox();
  box.style.width = `${Math.max(40, Math.floor(widthPx))}px`;
  box.innerHTML = html || '';
  return box.scrollHeight || 0;
}

function weeklyIssuesTakePrefixLineCountToFit(lines, widthPx, maxHeightPx) {
  if (!lines || lines.length === 0) return 0;
  const box = weeklyEnsureIssuesMeasureBox();
  box.style.width = `${Math.max(40, Math.floor(widthPx))}px`;

  let lo = 1;
  let hi = lines.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    box.innerHTML = lines.slice(0, mid).join('<br>');
    if (box.scrollHeight <= maxHeightPx) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

let __weeklyIssuesMeasureBox = null;
let __weeklyIssuesMeasureStyleInjected = false;

function weeklyIssuesGetLineHeightValue() {
  const root = document.documentElement;
  const v = getComputedStyle(root).getPropertyValue('--weekly-issues-line-height').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 1.6;
}

function weeklyEnsureIssuesMeasureStyles() {
  if (__weeklyIssuesMeasureStyleInjected) return;
  const style = document.createElement('style');
  style.id = 'weekly-issues-measure-style';
  style.textContent = `
    .weekly-issues-measure-box p,
    .weekly-issues-measure-box ol,
    .weekly-issues-measure-box ul { margin: 0; }
    .weekly-issues-measure-box ol,
    .weekly-issues-measure-box ul { padding-left: 16px; }
  `;
  document.head.appendChild(style);
  __weeklyIssuesMeasureStyleInjected = true;
}

function weeklyEnsureIssuesMeasureBox() {
  if (__weeklyIssuesMeasureBox && __weeklyIssuesMeasureBox.isConnected) {
    __weeklyIssuesMeasureBox.style.lineHeight = String(weeklyIssuesGetLineHeightValue());
    return __weeklyIssuesMeasureBox;
  }
  weeklyEnsureIssuesMeasureStyles();
  const box = document.createElement('div');
  box.className = 'weekly-issues-measure-box';
  box.style.position = 'fixed';
  box.style.left = '-100000px';
  box.style.top = '0';
  box.style.visibility = 'hidden';
  box.style.pointerEvents = 'none';
  box.style.whiteSpace = 'normal';
  box.style.wordBreak = 'break-word';
  box.style.overflowWrap = 'anywhere';
  box.style.boxSizing = 'border-box';
  box.style.fontSize = '8pt';
  box.style.lineHeight = String(weeklyIssuesGetLineHeightValue());
  box.style.padding = '2mm';
  box.style.fontFamily = window.getComputedStyle(document.body).fontFamily;
  document.body.appendChild(box);
  __weeklyIssuesMeasureBox = box;
  return box;
}

// 페이지 break 후 비어있는 부서명 셀 채우기
function weeklyFillEmptyDeptNames(table) {
  if (!table || !table.isConnected) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  let currentDeptName = '';
  let currentDeptHtml = '';

  rows.forEach((tr, idx) => {
    const deptCell = tr.querySelector('td.dept-col');
    if (!deptCell) return;

    const cellText = deptCell.textContent.trim();
    const cellHtml = deptCell.innerHTML.trim();

    // 부서명이 있는 경우
    if (cellText !== '' && cellHtml !== '') {
      currentDeptName = cellText;
      currentDeptHtml = deptCell.innerHTML;
      console.log(`[Row ${idx}] Found dept: ${currentDeptName}`);
    } 
    // 부서명이 비어있는 경우
    else if (cellText === '' && currentDeptHtml !== '') {
      // 이전 부서명으로 채우기
      deptCell.innerHTML = currentDeptHtml;
      deptCell.style.textAlign = 'center';
      deptCell.style.verticalAlign = 'middle';
      console.log(`[Row ${idx}] Filled with: ${currentDeptName}`);
    }
  });
}

function weeklyRepeatDeptNamesOnPageBreak(table) {
  if (!weeklyIsIssuesTable(table)) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (rows.length === 0) return;

  // 각 행을 순회하며 페이지 경계 감지
  let lastPageY = 0;
  let currentDeptName = '';
  let currentDeptHtml = '';

  rows.forEach((tr, idx) => {
    const deptCell = tr.querySelector('td.dept-col');
    if (!deptCell) return;

    // 현재 행의 부서명 저장
    if (deptCell.innerHTML.trim() !== '') {
      currentDeptName = deptCell.innerHTML;
      currentDeptHtml = deptCell.innerHTML;
    }

    // 현재 행이 이전 행과 다른 페이지에 있는지 감지
    // (getBoundingClientRect는 인쇄 중에는 부정확하므로, data 속성 사용)
    // 대신 간단하게: 같은 부서의 두 번째 이상의 행인 경우, 부서명 표시
    if (idx > 0) {
      const prevTr = rows[idx - 1];
      const prevDeptCell = prevTr.querySelector('td.dept-col');
      const prevDeptHtml = prevDeptCell ? prevDeptCell.innerHTML : '';

      // 이전 행과 현재 행의 부서가 같은데, 현재 부서명이 비어있다면
      // → page-break가 일어난 것으로 간주, 부서명 다시 표시
      if (prevDeptHtml === currentDeptHtml && deptCell.innerHTML.trim() === '') {
        // 페이지 break 감지: 부서명을 다시 표시
        deptCell.innerHTML = currentDeptHtml;
        deptCell.style.textAlign = 'center';
        deptCell.style.verticalAlign = 'middle';
        // 마크: 이 셀이 break 후 부서명을 반복한 것임을 표시
        deptCell.setAttribute('data-repeat-dept', 'true');
      } else if (deptCell.innerHTML.trim() !== '') {
        // 새로운 부서 시작
        currentDeptHtml = deptCell.innerHTML;
      }
    }
  });
}

function weeklyPrepareIssuesTableForPrint(table) {
  if (!weeklyIsIssuesTable(table)) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // 이미 준비되었으면 중복 처리 방지
  if (tbody.dataset.weeklyIssuesPrepared === '1') return;
  tbody.dataset.weeklyIssuesPrepared = '1';

  // 원본 백업
  if (!tbody.dataset.weeklyOrigHtml) {
    tbody.dataset.weeklyOrigHtml = tbody.innerHTML;
  }

  const widthPx = weeklyIssuesCellWidthPxForPrint();
  const pageHeightPx = weeklyIssuesPageHeightPxForPrint();
  const thead = table.querySelector('thead');
  const theadHeightPx = thead ? thead.getBoundingClientRect().height : 0;
  
  // [Fix for Page 1 Gap Issue]
  // 화면(Screen)에서의 테이블 위치(tableTopPx)는 인쇄(Print) 시와 다릅니다.
  // (화면엔 네비게이션바, 버튼 등이 있지만 인쇄엔 숨겨짐)
  // 따라서 화면 기준 위치를 사용하면 1페이지 가용 공간을 과소평가하게 됩니다.
  // 인쇄 시 표가 페이지 최상단(혹은 제목 바로 아래)에 온다고 가정하고 cursorY를 초기화합니다.
  let cursorY = theadHeightPx; 
  
  let pageIndex = Math.max(0, Math.floor((cursorY + 1) / pageHeightPx));
  let remaining = (pageIndex + 1) * pageHeightPx - cursorY;

  // 인쇄 시 실제 행 높이 기반으로 동적 계산
  // (이슈 표 줄간격 설정을 반영한 측정값 사용)
  const issuesMeasureBox = weeklyEnsureIssuesMeasureBox();
  const issuesMetrics = weeklyGetScheduleMeasureMetricsPx(issuesMeasureBox);
  const issuesSafetyPx = Math.ceil(issuesMetrics.lineHeightPx * 0.4);
  const minRowHeightPx = Math.max(issuesMetrics.paddingYPx + issuesMetrics.lineHeightPx, 20) + issuesSafetyPx;
  const freshPageRemainingPx = Math.max(0, pageHeightPx - theadHeightPx);

  const rows = Array.from(tbody.querySelectorAll('tr'));
  const newRows = [];

  const goNextPage = () => {
    pageIndex += 1;
    cursorY = pageIndex * pageHeightPx + theadHeightPx;
    remaining = freshPageRemainingPx;
  };
  
  // 부서명 반복을 위해 루프 간 상태 저장
  let lastDeptNameInLoop = '';

  rows.forEach((tr) => {
    const tds = Array.from(tr.children);
    if (tds.length < 3) {
      newRows.push(tr.cloneNode(true));
      return;
    }

    // 페이지 끝에 애매한 남은 공간이 있으면 다음 페이지로 넘김 (보수적 처리)
    if (remaining < minRowHeightPx + issuesSafetyPx) {
      goNextPage();
    }

    const remainingEffective = Math.max(0, remaining - issuesSafetyPx);
    const deptHtml = tds[0].innerHTML; // html content (includes tags if any)
    const prevHtml = tds[1].innerHTML;
    const currHtml = tds[2].innerHTML;

    // 부서명 추적: 현재 행에 부서명이 있으면 업데이트
    // 주의: deptHtml이 비어있으면 ( rowspan처럼 생략된 경우 ) 이전 값을 유지해야 함.
    if (deptHtml && deptHtml.trim().length > 0) {
        lastDeptNameInLoop = deptHtml;
    }

    let prevLines = weeklyIssuesHtmlToLineHtmlArray(prevHtml);
    let currLines = weeklyIssuesHtmlToLineHtmlArray(currHtml);

    // 내용이 모두 비어있으면 원래처럼 한 줄만넣기 (빈 행이어도 부서칸은 유지해야 함)
    // 단, 높이 계산 후 페이지 넘기면 부서명 다시 찍어야 함.
    // 여기선 단순화: 내용 없으면 높이 아주 작음 -> 그냥 추가
    if (prevLines.length === 0 && currLines.length === 0) {
      // 그냥 tr 복제는 위험(page break context 모름). 새로 생성.
      const r = document.createElement('tr');
      const tdDept = document.createElement('td'); tdDept.className = 'dept-col'; 
      tdDept.innerHTML = deptHtml; 
      r.appendChild(tdDept);
      const tdPrev = document.createElement('td'); tdPrev.className = 'issue-col'; tdPrev.innerHTML = ''; r.appendChild(tdPrev);
      const tdCurr = document.createElement('td'); tdCurr.className = 'issue-col'; tdCurr.innerHTML = ''; r.appendChild(tdCurr);
      newRows.push(r);
      // 높이 반영 (최소높이)
        const h = minRowHeightPx;
        if (h <= remainingEffective) {
          remaining -= h;
          cursorY += h;
      } else {
          // 넘치면?
          goNextPage();
          // 새 페이지 첫줄이므로 부서명 필히 표시
          if (!deptHtml || deptHtml.trim().length === 0) {
              tdDept.innerHTML = lastDeptNameInLoop;
          }
          remaining -= h;
          cursorY += h; 
      }
      return;
    }

    /* ------------------------------------------------------------------
       [Smart Check] 통째로 들어가는지 확인
       ------------------------------------------------------------------ */
    const fullPrevHtml = prevLines.join('<br>');
    const fullCurrHtml = currLines.join('<br>');
    // 높이 측정
    const hPrev = weeklyIssuesMeasureHtmlHeightPx(fullPrevHtml, widthPx);
    const hCurr = weeklyIssuesMeasureHtmlHeightPx(fullCurrHtml, widthPx);
    const fullRowHeight = Math.max(minRowHeightPx, hPrev + issuesSafetyPx, hCurr + issuesSafetyPx);

    if (fullRowHeight <= remainingEffective) {
       // Fits completely!
       const r = document.createElement('tr');
       const tdDept = document.createElement('td'); tdDept.className = 'dept-col'; 
       tdDept.innerHTML = deptHtml; // Maintain original
       r.appendChild(tdDept);
       
       const tdPrev = document.createElement('td'); tdPrev.className = 'issue-col'; tdPrev.innerHTML = fullPrevHtml; r.appendChild(tdPrev);
       const tdCurr = document.createElement('td'); tdCurr.className = 'issue-col'; tdCurr.innerHTML = fullCurrHtml; r.appendChild(tdCurr);
       
       newRows.push(r);
       remaining -= fullRowHeight;
       cursorY += fullRowHeight;
       return;
    }

    /* ------------------------------------------------------------------
       [Split] 안 들어가면 나눈다 (Chunking)
       ------------------------------------------------------------------ */
    let tempPrevLines = [...prevLines];
    let tempCurrLines = [...currLines];
    let sliceIndex = 0;

    while (tempPrevLines.length > 0 || tempCurrLines.length > 0) {
        
        // [1] 공간 확보: 남은 공간이 최소 높이보다 작으면 다음 페이지로
        if (remaining < minRowHeightPx) {
            goNextPage();
        }

        const allowHeight = Math.max(0, remaining - issuesSafetyPx);
        let nPrev = 0;
        let nCurr = 0;
        
        // [2] 남은 공간(allowHeight)에 들어갈 만큼만 라인 계산
        if (tempPrevLines.length > 0 || tempCurrLines.length > 0) {
            nPrev = weeklyIssuesTakePrefixLineCountToFit(tempPrevLines, widthPx, allowHeight);
            nCurr = weeklyIssuesTakePrefixLineCountToFit(tempCurrLines, widthPx, allowHeight);
            
            // 안전장치: 공간이 넉넉한데도 0줄 계산되면 1줄 강제 (무한루프 방지)
            if (nPrev === 0 && tempPrevLines.length > 0 && remaining > 50) nPrev = 1;
            if (nCurr === 0 && tempCurrLines.length > 0 && remaining > 50) nCurr = 1;
        }

        // 만약 공간 부족으로 둘 다 0줄이라면 -> 강제 다음 페이지
        if ((nPrev === 0 && tempPrevLines.length > 0) || (nCurr === 0 && tempCurrLines.length > 0)) {
             goNextPage();
             continue;
        }

        // [3] Chunk 생성 (앞부분 잘라내기)
        const chunkPrev = tempPrevLines.splice(0, nPrev).join('<br>');
        const chunkCurr = tempCurrLines.splice(0, nCurr).join('<br>');

        const chunkHPrev = weeklyIssuesMeasureHtmlHeightPx(chunkPrev, widthPx);
        const chunkHCurr = weeklyIssuesMeasureHtmlHeightPx(chunkCurr, widthPx);
        const rowH = Math.max(minRowHeightPx, chunkHPrev + issuesSafetyPx, chunkHCurr + issuesSafetyPx);
        
        // [4] 행(tr) 생성 및 추가
        const r = document.createElement('tr');
        const tdDept = document.createElement('td'); 
        tdDept.className = 'dept-col';

        // 부서명 표시 로직:
        // 첫 조각(sliceIndex===0)은 원본 데이터 그대로.
        // 그 외(sliceIndex > 0)는 무조건 새 페이지(아래 로직에 의해)이므로, 부서명 반복 표시.
        if (sliceIndex === 0) {
             if (deptHtml && deptHtml.trim().length > 0) tdDept.innerHTML = deptHtml;
             else tdDept.innerHTML = lastDeptNameInLoop; 
        } else {
             // 2번째 조각부터는 무조건 새 페이지라고 가정하고 부서명 채움
             tdDept.innerHTML = lastDeptNameInLoop;
             // [중요 수정] 브라우저에게 "이 행 앞에서 페이지를 넘기라"고 명령
             r.style.breakBefore = 'page';
             r.style.pageBreakBefore = 'always';
        }
        
        tdDept.style.textAlign = 'center';
        tdDept.style.verticalAlign = 'middle';
        r.appendChild(tdDept);
        
        const tdPrev = document.createElement('td'); tdPrev.className = 'issue-col'; tdPrev.innerHTML = chunkPrev; r.appendChild(tdPrev);
        const tdCurr = document.createElement('td'); tdCurr.className = 'issue-col'; tdCurr.innerHTML = chunkCurr; r.appendChild(tdCurr);

        newRows.push(r);
        
        remaining -= rowH;
        cursorY += rowH;
        sliceIndex++;

        // [핵심] 내용이 더 남았다면? (다음 조각이 필요하다면?)
        // 현재 조각을 끝으로 "이 페이지는 마감"하고 넘긴다.
        if (tempPrevLines.length > 0 || tempCurrLines.length > 0) {
            goNextPage();
            
            // [Fix] 브라우저가 Visual Split을 인식하도록
            // 다음 조각(다음 루프의 tr)에 대해 page-break-before를 확실히 건다.
            // (하지만 여기는 루프 끝이므로 다음 루프 진입 시 처리해야 함)
            // 대신, 루프 안에서 생성하는 `r`에 "이 `r`이 새 페이지 첫 행인가?"를 마킹하면 됨.
            // pageIndex가 goNextPage()로 인해 증가했으므로, 
            // 다음 루프에서 `pageIndex > startPageIndex` 조건이 True가 됨.
            // 하지만 Visual Break를 위해 CSS 속성도 필요할 수 있음.
        } else {
             // 끝났으면? page-break-inside: auto (기본값)
        }
    }
  });

  tbody.innerHTML = '';
  newRows.forEach((r, i) => {
      // [Fix for Visual Glitch]
      // 만약 우리가 계산상 "새 페이지"라고 판단했는데(Dept Repeat 등),
      // 브라우저가 같은 페이지에 붙여버리면 안 됨.
      // 따라서 dept-col이 [반복]된 경우(원래 비어있는데 채운 경우)에는
      // 확실하게 page-break-before를 준다.
      
      const deptTd = r.querySelector('.dept-col');
      if (deptTd && deptTd.innerHTML.trim().length > 0) {
           // 원래 데이터에는 없는데 우리가 채운 것인지 확인은 어렵지만,
           // Chunking 로직에서 `sliceIndex > 0`인 녀석들은 무조건 새 페이지여야 함.
           // 하지만 newRows엔 그런 정보가 없음.
           // 따라서, 위의 while 루프 생성 시점에 스타일을 박아야 함.
      }
      tbody.appendChild(r);
  });
}

// --------------------------------------------------------------------------------------
// [구버전 함수 정리] 더 이상 사용하지 않는 보조 함수들은 제거하거나 비워둠
// --------------------------------------------------------------------------------------

function weeklyRestoreIssuesTableAfterPrint(table) {
  if (!weeklyIsIssuesTable(table)) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  if (tbody.dataset.weeklyIssuesPrepared !== '1') return;
  
  const orig = tbody.dataset.weeklyOrigHtml;
  if (orig != null) {
    tbody.innerHTML = orig;
  }

  delete tbody.dataset.weeklyIssuesPrepared;
  delete tbody.dataset.weeklyOrigHtml;
}

// ====== 주간 입력/수정 모달 기능 ======
let _weeklyEditMonday = null;

function openWeeklyEditModal() {
  const modal = document.getElementById('weeklyEditModal');
  if (!modal) return;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // 현재 세션 부서를 콘솔에 출력 (요청사항)
  try {
    const sessionDeptEl = document.getElementById('sessionDept');
    const sessionDept = sessionDeptEl?.value || '';
    console.log('[weekly-detail] sessionDept:', sessionDept);
  } catch (e) {
    console.warn('세션 부서 로깅 실패:', e);
  }

  // 초기화: 현재 페이지의 주 시작일 기반
  const root = document.getElementById('weeklyDetailRoot');
  const weekStartStr = root?.dataset?.weekStart;
  _weeklyEditMonday = new Date(weekStartStr);
  initWeeklyEditTables();

  // 버튼 핸들러 바인딩
  const saveBtn = document.getElementById('saveWeeklyBtn');
  const submitBtn = document.getElementById('submitWeeklyBtn');
  if (submitBtn) submitBtn.onclick = submitWeekly;

  // 플로팅(인라인) 툴바 생성 및 편집 셀 이벤트 바인딩
  createWeeklyToolbar();
  bindWeeklyEditableEvents();
}

function closeWeeklyEditModal() {
  const modal = document.getElementById('weeklyEditModal');
  if (!modal) return;
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
}

function initWeeklyEditTables() {
  const data = window.__weeklyDetailData__ || {};
  const { week = {}, departments = [] } = data;
  const monday = _weeklyEditMonday || new Date(week.week_start || document.getElementById('weeklyDetailRoot').dataset.weekStart);

  // 기준 부서 선택: 세션 부서 존재 시 우선, 없으면 첫 부서
  const sessionDeptEl = document.getElementById('sessionDept');
  const sessionDept = sessionDeptEl?.value || '';
  let initDept = departments.find(d => d.department === sessionDept);
  if (!initDept) {
    // 세션 부서가 존재하면 목록에 없어도 세션 부서명으로 초기화, 없으면 첫 부서 사용
    initDept = sessionDept
      ? { department: sessionDept }
      : (departments[0] || { department: '내 부서' });
  }

  renderEditTitles(monday, week);
  renderEditScheduleTable(monday, initDept);
  renderEditIssuesTable(initDept);
}

function renderEditTitles(monday, weekMeta) {
  const month = monday.getMonth() + 1;
  const firstDay = new Date(monday.getFullYear(), month - 1, 1);
  const daysUntilMonday = (1 - firstDay.getDay() + 7) % 7;
  const firstMonDate = 1 + daysUntilMonday;
  const weekIndex = Math.floor((monday.getDate() - firstMonDate) / 7) + 1;
  const end = addDays(monday, 6);
  const endMonth = end.getMonth()+1;
  // 항상 ~M/D 형식으로 표기
  const range = `${month}/${monday.getDate()}~${endMonth}/${end.getDate()}`;

  const scheduleRangeEl = document.getElementById('weeklyScheduleRange');
  if (scheduleRangeEl) scheduleRangeEl.textContent = `부서별 주간일정표 (${range})`;

  const issuesTitleEl = document.getElementById('weeklyIssuesTitle');
  if (issuesTitleEl) issuesTitleEl.textContent = `부서별 이슈사항 (${month}월 ${weekIndex}주차_${range})`;
}

function renderEditScheduleTable(monday, dept) {
  const table = document.getElementById('weeklyScheduleTable');
  if (!table) return;
  table.innerHTML = '';

  const dayNames = ['월','화','수','목','금','토'];
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  // 부서 헤더
  const thDept = document.createElement('th');
  thDept.textContent = '부서';
  thDept.className = 'dept-col';
  trh.appendChild(thDept);
  // 요일 헤더(날짜/색 반영)
  for (let i=0;i<6;i++) {
    const d = addDays(monday, i);
    const th = document.createElement('th');
    // 토요일만 요일명+날짜 모두 파란색, 공휴일 빨간색
    const isSat = d.getDay() === 6;
    const isHoliday = isFixedHoliday(d);
    let dayLabel, dateLabel;
    if (isHoliday) {
      dayLabel = `<span class=\"red\">${dayNames[i]}</span>`;
      dateLabel = `<span class=\"red\">(${d.getDate()})</span>`;
    } else if (isSat) {
      dayLabel = `<span class=\"blue\">${dayNames[i]}</span>`;
      dateLabel = `<span class=\"blue\">(${d.getDate()})</span>`;
    } else {
      dayLabel = dayNames[i];
      dateLabel = `<span>(${d.getDate()})</span>`;
    }
    th.innerHTML = `${dayLabel}${dateLabel}`;
    th.className = 'day-col';
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const tr = document.createElement('tr');
  const deptTd = document.createElement('td');
  deptTd.innerHTML = weeklyDeptLabelHtml(dept.department || '내 부서');
  deptTd.className = 'dept-col';
  tr.appendChild(deptTd);

  const keys = ['mon','tue','wed','thu','fri','sat'];
  keys.forEach(k => {
    const td = document.createElement('td');
    td.className = 'day-col';
    const div = document.createElement('div');
    div.className = 'weekly-editable';
    div.contentEditable = 'true';
    div.innerHTML = dept.schedule?.[k] || '';
    div.setAttribute('spellcheck', 'false');
    div.setAttribute('autocorrect', 'off');
    div.setAttribute('autocapitalize', 'off');
    div.setAttribute('data-gramm', 'false');
    div.setAttribute('data-gramm_editor', 'false');
    div.style.minHeight = '60px';
    div.style.outline = 'none';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak = 'break-word';
    div.style.overflowWrap = 'anywhere';
    div.dataset.weeklyLastGoodHtml = div.innerHTML || '';
    td.appendChild(div);
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
  table.appendChild(tbody);
}

function renderEditIssuesTable(dept) {
  const table = document.getElementById('weeklyIssuesTable');
  if (!table) return;
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['부서','전주','금주'].forEach((h, idx) => {
    const th = document.createElement('th');
    th.textContent = h;
    th.className = idx === 0 ? 'dept-col' : 'issue-col';
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const tr = document.createElement('tr');
  const deptTd = document.createElement('td');
  deptTd.innerHTML = weeklyDeptNameHtml(dept.department || '내 부서');
  deptTd.className = 'dept-col';
  tr.appendChild(deptTd);

  const tdPrev = document.createElement('td');
  tdPrev.className = 'issue-col';
  const divPrev = document.createElement('div');
  divPrev.className = 'weekly-editable';
  divPrev.contentEditable = 'true';
  divPrev.innerHTML = dept.issues?.prev || '';
  divPrev.setAttribute('spellcheck', 'false');
  divPrev.setAttribute('autocorrect', 'off');
  divPrev.setAttribute('autocapitalize', 'off');
  divPrev.setAttribute('data-gramm', 'false');
  divPrev.setAttribute('data-gramm_editor', 'false');
  divPrev.style.minHeight = '120px';
  divPrev.style.outline = 'none';
  divPrev.style.whiteSpace = 'pre-wrap';
  divPrev.style.wordBreak = 'break-word';
  divPrev.style.overflowWrap = 'anywhere';
  tdPrev.appendChild(divPrev);
  tr.appendChild(tdPrev);

  const tdCurr = document.createElement('td');
  tdCurr.className = 'issue-col';
  const divCurr = document.createElement('div');
  divCurr.className = 'weekly-editable';
  divCurr.contentEditable = 'true';
  divCurr.innerHTML = dept.issues?.curr || '';
  divCurr.setAttribute('spellcheck', 'false');
  divCurr.setAttribute('autocorrect', 'off');
  divCurr.setAttribute('autocapitalize', 'off');
  divCurr.setAttribute('data-gramm', 'false');
  divCurr.setAttribute('data-gramm_editor', 'false');
  divCurr.style.minHeight = '120px';
  divCurr.style.outline = 'none';
  divCurr.style.whiteSpace = 'pre-wrap';
  divCurr.style.wordBreak = 'break-word';
  divCurr.style.overflowWrap = 'anywhere';
  tdCurr.appendChild(divCurr);
  tr.appendChild(tdCurr);

  tbody.appendChild(tr);
  table.appendChild(tbody);
}

// ====== 일정표(week schedule) 칸: 부서별 줄 수 제한 (인쇄 기준, 방법 B) ======
const WEEKLY_SCHEDULE_LINE_LIMITS = (() => {
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

function weeklyNormalizeDeptName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function weeklyGetScheduleLineLimitForDept(deptName) {
  const key = weeklyNormalizeDeptName(deptName);
  const exact = WEEKLY_SCHEDULE_LINE_LIMITS.get(key);
  if (exact != null) return exact;

  // 부서명이 약간 달라도 매칭되도록(가장 긴 키 우선)
  let best = null;
  for (const [k, v] of WEEKLY_SCHEDULE_LINE_LIMITS.entries()) {
    if (!k) continue;
    if (key.includes(k) || k.includes(key)) {
      if (!best || k.length > best.k.length) best = { k, v };
    }
  }
  return best ? best.v : 3;
}

let __weeklyScheduleMeasureBox = null;
let __weeklyScheduleMeasureStyleInjected = false;

function weeklyCssPxPerMmForPrint() {
  // 인쇄 레이아웃(CSS px)은 보통 96dpi 기준으로 계산됨 (25.4mm = 1in = 96px)
  return 96 / 25.4;
}

function weeklyEnsureScheduleMeasureStyles() {
  if (__weeklyScheduleMeasureStyleInjected) return;
  const style = document.createElement('style');
  style.id = 'weekly-schedule-measure-style';
  style.textContent = `
    .weekly-schedule-measure-box p,
    .weekly-schedule-measure-box ol,
    .weekly-schedule-measure-box ul { margin: 0; }
    .weekly-schedule-measure-box ol,
    .weekly-schedule-measure-box ul { padding-left: 16px; }
  `;
  document.head.appendChild(style);
  __weeklyScheduleMeasureStyleInjected = true;
}

function weeklyEnsureScheduleMeasureBox() {
  if (__weeklyScheduleMeasureBox && __weeklyScheduleMeasureBox.isConnected) return __weeklyScheduleMeasureBox;
  weeklyEnsureScheduleMeasureStyles();
  const box = document.createElement('div');
  box.className = 'weekly-schedule-measure-box';
  box.style.position = 'fixed';
  box.style.left = '-100000px';
  box.style.top = '0';
  box.style.visibility = 'hidden';
  box.style.pointerEvents = 'none';
  box.style.whiteSpace = 'normal';
  box.style.wordBreak = 'break-word';
  box.style.overflowWrap = 'anywhere';
  box.style.boxSizing = 'border-box';
  // print CSS와 동일하게 모사 (weekly_detail.html @media print)
  // px 대신 pt/mm을 사용하면 스케일/해상도 차이에 따른 반올림 오차를 줄이는 데 유리
  box.style.fontSize = '8pt';
  box.style.lineHeight = '1.35';
  box.style.padding = '2mm';
  box.style.fontFamily = window.getComputedStyle(document.body).fontFamily;
  document.body.appendChild(box);
  __weeklyScheduleMeasureBox = box;
  return box;
}

function weeklyGetScheduleMeasureMetricsPx(measureEl) {
  const cs = window.getComputedStyle(measureEl);
  const lineHeightPx = parseFloat(cs.lineHeight);
  const paddingTopPx = parseFloat(cs.paddingTop) || 0;
  const paddingBottomPx = parseFloat(cs.paddingBottom) || 0;
  return {
    lineHeightPx: Number.isFinite(lineHeightPx) ? lineHeightPx : 0,
    paddingYPx: paddingTopPx + paddingBottomPx,
  };
}

function weeklyTrimDomToHeight(containerEl, maxHeightPx) {
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

function weeklyTrimHtmlToPrintLines(html, widthPx, maxLines) {
  const box = weeklyEnsureScheduleMeasureBox();
  box.style.width = `${Math.max(40, Math.floor(widthPx))}px`;
  box.innerHTML = html || '';

  const metrics = weeklyGetScheduleMeasureMetricsPx(box);
  // computed style 기반으로 계산 (브라우저/해상도에 따른 px 반올림 차이 최소화)
  const maxHeightPx = metrics.paddingYPx + (metrics.lineHeightPx * Math.max(1, maxLines)) + 1;

  if (box.scrollHeight <= maxHeightPx) return html || '';
  weeklyTrimDomToHeight(box, maxHeightPx);
  return box.innerHTML;
}

function weeklyTrimScheduleCellsBeforeSubmit() {
  const deptCell = document.querySelector('#weeklyScheduleTable tbody tr td.dept-col');
  const deptName = deptCell?.textContent || document.getElementById('sessionDept')?.value || '';
  const maxLines = weeklyGetScheduleLineLimitForDept(deptName);

  const scheduleEditables = document.querySelectorAll('#weeklyScheduleTable tbody .weekly-editable');
  scheduleEditables.forEach((cell) => {
    const td = cell.closest('td');
    const widthPx = weeklyScheduleColumnWidthPxForPrint(td);
    cell.innerHTML = weeklyTrimHtmlToPrintLines(cell.innerHTML, widthPx, maxLines);
  });
}

function weeklyIsScheduleEditable(el) {
  return !!(el && el.classList && el.classList.contains('weekly-editable') && el.closest && el.closest('#weeklyScheduleTable'));
}

function weeklyScheduleMaxHeightPxForLines(maxLines) {
  const box = weeklyEnsureScheduleMeasureBox();
  const metrics = weeklyGetScheduleMeasureMetricsPx(box);
  return metrics.paddingYPx + (metrics.lineHeightPx * Math.max(1, maxLines)) + 1;
}

function weeklyScheduleCellWidthPxForPrint() {
  const ppm = weeklyCssPxPerMmForPrint();
  const totalWidthPx = 277 * ppm;
  const deptWidthPx = 25 * ppm;
  const dayWidthPx = (totalWidthPx - deptWidthPx) / 5.5;
  const satWidthPx = dayWidthPx / 2;
  return { dayWidthPx, satWidthPx };
}

function weeklyScheduleColumnWidthPxForPrint(td) {
  const widths = weeklyScheduleCellWidthPxForPrint();
  if (!td || !td.parentElement) return widths.dayWidthPx;
  const colIndex = Array.from(td.parentElement.children).indexOf(td);
  return colIndex === 6 ? widths.satWidthPx : widths.dayWidthPx;
}

function weeklyScheduleWouldOverflowHtml(html, widthPx, maxLines) {
  const box = weeklyEnsureScheduleMeasureBox();
  box.style.width = `${Math.max(40, Math.floor(widthPx))}px`;
  box.innerHTML = html || '';
  const maxHeightPx = weeklyScheduleMaxHeightPxForLines(maxLines);
  return box.scrollHeight > maxHeightPx;
}

function weeklyScheduleLiveValidate(el, { showAlert = true } = {}) {
  if (!weeklyIsScheduleEditable(el)) return true;

  const deptCell = document.querySelector('#weeklyScheduleTable tbody tr td.dept-col');
  const deptNameRaw = deptCell?.textContent || document.getElementById('sessionDept')?.value || '';
  const deptName = weeklyNormalizeDeptName(deptNameRaw);
  const maxLines = weeklyGetScheduleLineLimitForDept(deptName);
  const widthPx = weeklyScheduleColumnWidthPxForPrint(el.closest('td'));

  const currentHtml = el.innerHTML || '';
  const overflow = weeklyScheduleWouldOverflowHtml(currentHtml, widthPx, maxLines);
  if (!overflow) {
    el.dataset.weeklyLastGoodHtml = currentHtml;
    return true;
  }

  // 초과 시 마지막 정상 상태로 롤백
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

function _collectWeeklyPayload() {
  const root = document.getElementById('weeklyDetailRoot');
  const week_start = root?.dataset?.weekStart || '';

  // 일정표 칸만: 부서별 줄 수 제한(인쇄 기준) 적용
  weeklyTrimScheduleCellsBeforeSubmit();

  const scheduleEditables = document.querySelectorAll('#weeklyScheduleTable tbody .weekly-editable');
  const schedule = {
    mon: weeklyPreserveLeadingSpacesInHtml(scheduleEditables[0]?.innerHTML || ''),
    tue: weeklyPreserveLeadingSpacesInHtml(scheduleEditables[1]?.innerHTML || ''),
    wed: weeklyPreserveLeadingSpacesInHtml(scheduleEditables[2]?.innerHTML || ''),
    thu: weeklyPreserveLeadingSpacesInHtml(scheduleEditables[3]?.innerHTML || ''),
    fri: weeklyPreserveLeadingSpacesInHtml(scheduleEditables[4]?.innerHTML || ''),
    sat: weeklyPreserveLeadingSpacesInHtml(scheduleEditables[5]?.innerHTML || '')
  };

  const issuesEditables = document.querySelectorAll('#weeklyIssuesTable tbody .weekly-editable');
  const issues = {
    prev: weeklyPreserveLeadingSpacesInHtml(issuesEditables[0]?.innerHTML || ''),
    curr: weeklyPreserveLeadingSpacesInHtml(issuesEditables[1]?.innerHTML || '')
  };

  return { week_start, schedule, issues };
}

// 임시 저장 기능 제거됨

async function submitWeekly() {
  const payload = _collectWeeklyPayload();
  try {
    const r = await fetch('/api/weekly/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await r.json();
    alert(res.message || (res.ok ? '제출 완료' : '제출 실패'));

    if (res.ok) {
      closeWeeklyEditModal();
      await weeklyLoadAndRenderDetail();
    }
  } catch (err) {
    console.error('submitWeekly error:', err);
    alert('제출 중 오류가 발생했습니다.');
  }
}

// 간단한 편집 기능(브라우저 기본 execCommand 사용)
function weeklyApplyColor(color) {
  try { document.execCommand('foreColor', false, color); } catch (_) {}
}
function weeklyToggleBold() {
  try { document.execCommand('bold'); } catch (_) {}
}
function weeklyClearFormat() {
  try { document.execCommand('removeFormat'); } catch (_) {}
}

// ====== 플로팅 툴바 (헤더 th 좌상단 고정) ======
let weeklyToolbarEl = null;
let currentWeeklyEditable = null;
let weeklyToolbarHovering = false;

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
  el.style.zIndex = '99999';
  el.style.fontFamily = 'inherit';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.whiteSpace = 'nowrap';
  el.style.flexWrap = 'nowrap';
  el.style.userSelect = 'none';

  const mkBtn = (label, onClick, extraStyle = '') => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.background = '#e5e7eb';
    b.style.color = '#111827';
    b.style.border = 'none';
    b.style.borderRadius = '6px';
    b.style.padding = '6px 10px';
    b.style.fontSize = '13px';
    b.style.cursor = 'pointer';
    if (extraStyle) b.style.cssText += ';' + extraStyle;
    b.onmouseenter = () => { weeklyToolbarHovering = true; };
    b.onmouseleave = () => { weeklyToolbarHovering = false; };
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
    return b;
  };

  el.appendChild(mkBtn('파랑', () => weeklyApplyColor('#2563eb'), 'color:#2563eb'));
  el.appendChild(mkBtn('빨강', () => weeklyApplyColor('#ef4444'), 'color:#ef4444'));
  el.appendChild(mkBtn('굵게', () => weeklyToggleBold(), 'font-weight:600'));
  el.appendChild(mkBtn('기본', () => weeklyClearFormat(), ''));

  document.body.appendChild(el);
  weeklyToolbarEl = el;

  weeklyToolbarEl.addEventListener('mouseenter', () => { weeklyToolbarHovering = true; });
  weeklyToolbarEl.addEventListener('mouseleave', () => { weeklyToolbarHovering = false; });
}

function bindWeeklyEditableEvents() {
  currentWeeklyEditable = null;
  const modal = document.getElementById('weeklyEditModal');
  const editables = modal ? modal.querySelectorAll('.weekly-editable') : [];

  const handlerFocus = (el) => {
    currentWeeklyEditable = el;
    showWeeklyToolbar();
    positionWeeklyToolbar();
    if (weeklyIsScheduleEditable(el)) {
      el.dataset.weeklyLastGoodHtml = el.innerHTML || '';
    }
  };
  const handlerBlur = () => {
    if (!weeklyToolbarHovering) hideWeeklyToolbar();
  };
  const handlerInput = (el) => {
    positionWeeklyToolbar();
    weeklyScheduleLiveValidate(el, { showAlert: true });
  };
  const handlerClick = (el) => { currentWeeklyEditable = el; showWeeklyToolbar(); positionWeeklyToolbar(); };

  editables.forEach(el => {
    el.addEventListener('focus', () => handlerFocus(el));
    el.addEventListener('blur', handlerBlur);
    el.addEventListener('input', () => handlerInput(el));
    el.addEventListener('click', () => handlerClick(el));
    el.addEventListener('keyup', () => handlerInput(el));
    el.addEventListener('paste', weeklyHandlePaste);
  });

  const reposition = () => positionWeeklyToolbar();
  window.addEventListener('scroll', reposition, true);

  // 모달 외부 클릭 시 툴바 숨김
  document.addEventListener('mousedown', (e) => {
    const modalContent = document.querySelector('#weeklyEditModal .modal-content');
    if (!modalContent) return;
    const insideEditable = currentWeeklyEditable && (modalContent.contains(e.target));
    const insideToolbar = weeklyToolbarEl && weeklyToolbarEl.contains(e.target);
    if (!insideToolbar && !insideEditable) hideWeeklyToolbar();
  }, true);
}

function showWeeklyToolbar() {
  if (!weeklyToolbarEl) return;
  weeklyToolbarEl.style.display = 'inline-flex';
}
function hideWeeklyToolbar() {
  if (!weeklyToolbarEl) return;
  weeklyToolbarEl.style.display = 'none';
}

function positionWeeklyToolbar() {
  if (!weeklyToolbarEl || !currentWeeklyEditable) return;
  const td = currentWeeklyEditable.closest ? currentWeeklyEditable.closest('td') : currentWeeklyEditable.parentElement;
  if (!td) return;

  // 같은 컬럼의 thead th 좌상단에 고정 배치 (PMS_Business_Year.js와 동일한 UX)
  const table = td.closest('table');
  let anchorRect = null;
  try {
    const colIndex = Array.from(td.parentElement.children).indexOf(td); // 0-based
    const th = table?.querySelector(`thead tr th:nth-child(${colIndex + 1})`);
    if (th) {
      anchorRect = th.getBoundingClientRect();
    }
  } catch (_) {}

  // 폴백: thead th가 없거나 계산 실패 시 td 바깥 상단 좌측에 배치
  const baseRect = anchorRect || td.getBoundingClientRect();
  let left = window.scrollX + baseRect.left + 2;
  let top = window.scrollY + baseRect.top + 2;

  // 뷰포트 넘침 보정
  const maxLeft = window.scrollX + document.documentElement.clientWidth - weeklyToolbarEl.offsetWidth - 8;
  if (left > maxLeft) left = maxLeft;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  weeklyToolbarEl.style.left = left + 'px';
  weeklyToolbarEl.style.top = top + 'px';
}

// 안전한 HTML 이스케이프 (붙여넣기 평문 처리용)
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 붙여넣기 시 서식 제거: 평문 + 줄바꿈만 유지
function weeklyHandlePaste(e) {
  try {
    e.preventDefault();
    const clipboard = e.clipboardData || window.clipboardData;
    const text = clipboard ? (clipboard.getData('text/plain') || clipboard.getData('text') || '') : '';
    const sanitized = escapeHtml(text).replace(/\r?\n/g, '<br>');
    // 평문 삽입: 스타일 없이 기본 서식으로
    const ok = document.execCommand('insertHTML', false, sanitized);
    if (!ok) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        sel.deleteFromDocument();
        const range = sel.getRangeAt(0);
        const frag = document.createDocumentFragment();
        sanitized.split('<br>').forEach((part, idx) => {
          frag.appendChild(document.createTextNode(part));
          if (idx < sanitized.split('<br>').length - 1) frag.appendChild(document.createElement('br'));
        });
        range.insertNode(frag);
      }
    }
    // 최종적으로 서식 초기화(굵게/색상 등 제거)
    weeklyClearFormat();

    // 붙여넣기 후 일정표 칸 실시간 제한 적용(이슈칸은 제외)
    if (e.target && e.target.classList && e.target.classList.contains('weekly-editable')) {
      weeklyScheduleLiveValidate(e.target, { showAlert: true });
    }
  } catch (_) {
    // 실패해도 기본 붙여넣기로 진행되도록 무시
  }
}
