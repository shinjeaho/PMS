document.addEventListener("DOMContentLoaded", function () {
    cal_annualProject();
    enableHorizontalDragScroll('table-container');

    const tableContainer = document.getElementById('table-container');
    const fakeScrollbar = document.getElementById('fake-scrollbar');
    const table = tableContainer.querySelector('table');

    // fake-scrollbar-content가 이미 있으면 재사용, 없으면 생성
    let fakeContent = fakeScrollbar.querySelector('.fake-scrollbar-content');
    if (!fakeContent) {
        fakeContent = document.createElement('div');
        fakeContent.className = 'fake-scrollbar-content';
        fakeScrollbar.appendChild(fakeContent);
    }

    function syncFakeScrollbarWidth() {
        const tableContainer = document.getElementById('table-container');
        const fakeScrollbar = document.getElementById('fake-scrollbar');
        const table = tableContainer.querySelector('table');
        const fakeContent = fakeScrollbar.querySelector('.fake-scrollbar-content');
        // fake-scrollbar의 width를 tableContainer의 clientWidth로 맞춤
        fakeScrollbar.style.width = tableContainer.clientWidth + 'px';
        // fakeContent의 width를 table의 scrollWidth로 맞춤
        fakeContent.style.width = table.scrollWidth + 'px';
    }

    // 최초 동기화
    syncFakeScrollbarWidth();

    // 창 크기 변경 시 동기화
    window.addEventListener('resize', syncFakeScrollbarWidth);

    // 테이블 데이터가 바뀔 때도 동기화 필요 (예: 필터, 정렬 등)
    // renderAnnualProjectTable 함수 끝에 syncFakeScrollbarWidth(); 호출 추가

    // 스크롤 동기화
    fakeScrollbar.addEventListener('scroll', function () {
        tableContainer.scrollLeft = fakeScrollbar.scrollLeft;
    });
    tableContainer.addEventListener('scroll', function () {
        fakeScrollbar.scrollLeft = tableContainer.scrollLeft;
    });
});


const processedProjects = [];  // 전역 저장소
let currentSort = { key: null, type: null, dir: 'asc' }; // 정렬 상태
let initialOrderMap = null; // 최초 화면 순서(projectID -> index)
//합계
let total = {
    ProjectCost_NoVAT: 0,
    ProjectCost: 0,
    contractCostShare: 0,
    contractCostShareVAT: 0,
    EX_money: 0,
    estimated_labor: 0,
    estimated_expense: 0,
    estimated_other: 0,
    estimated_performance: 0,
    estimated_profit: 0,
    realCostShare_VAT: 0,
    realCostShare: 0,
    AC_money: 0,
    actual_labor: 0,
    actual_expense: 0,
    actual_other: 0,
    actual_performance: 0,
    actual_profit: 0,
    advanceTotal: 0,
    progress1stTotal: 0,     //1차 기성금 합계
    progress2ndTotal: 0,     //2차 기성금 합계
    completionTotal: 0
};
let marginFilterStates = {
    EX: 'all',
    AC: 'all'
};

function cal_annualProject() {
    const table = document.getElementById("annualProject_tbody");
    table.innerHTML = "";
    processedProjects.length = 0;



    total = {
        ProjectCost_NoVAT: 0,
        ProjectCost: 0,
        contractCostShare: 0,
        contractCostShareVAT: 0,
        EX_money: 0,
        estimated_labor: 0,
        estimated_expense: 0,
        estimated_other: 0,
        estimated_performance: 0,
        estimated_profit: 0,
        realCostShare_VAT: 0,
        realCostShare: 0,
        AC_money: 0,
        actual_labor: 0,
        actual_expense: 0,
        actual_other: 0,
        actual_performance: 0,
        actual_profit: 0,
        advanceTotal: 0,
        progress1stTotal: 0,
        progress2ndTotal: 0,
        completionTotal: 0
    };

    //연도 수집
    const currentYear = new Date().getFullYear();

    projects.forEach(project => {

        // 변경사업비(총괄) 기준 값 계산
        const changeProjectCost = Number(project.ChangeProjectCost) || 0; // VAT 포함
        const changeProjectCost_NoVAT = Math.round(changeProjectCost / 1.1) || 0; // VAT 제외(1.1로 역산)

        //사업비 VAT 제외
        let contractCostShare = Math.round(project.ProjectCost_NoVAT * (project.ContributionRate / 100));
        //사업비 VAT 포함
        let contractCostShareVAT = Math.round(project.ProjectCost * (project.ContributionRate / 100));
        //제경비
        const EX_company_money = Math.round(contractCostShare * (project.AcademicResearchRate / 100)) +
            Math.round(contractCostShare * (project.OperationalRate / 100)) +
            Math.round(contractCostShare * (project.EquipmentRate / 100));
        //예상 수익
        const estimated_profit = Math.round(contractCostShare - project.estimated_total - EX_company_money);
        //예상 마진율
        const estimated_margin = contractCostShare === 0 ? 0 : ((estimated_profit / contractCostShare) * 100).toFixed(3);

        //실제비용 
        let realCostShare_VAT = Math.round(project.ChangeProjectCost * (project.ContributionRate / 100));
        let realCostShare = Math.round((project.ChangeProjectCost / 1.1) * (project.ContributionRate / 100));
        if (realCostShare <= 0) {
            realCostShare = contractCostShare;
        }

        const AC_company_money = Math.round(realCostShare * (project.AcademicResearchRate / 100)) +
            Math.round(realCostShare * (project.OperationalRate / 100)) +
            Math.round(realCostShare * (project.EquipmentRate / 100));

        const actual_profit = Math.round(realCostShare - project.actual_total - AC_company_money);
        const actual_margin = realCostShare === 0 ? 0 : ((actual_profit / realCostShare) * 100).toFixed(3);

        //사업비 수령내역 - 선금 (연도별 색상 적용)
        const advanceReceipts = project.receipt_details.filter(receipt => receipt.division.includes('선금'));
        const advanceTotal = advanceReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
        const hasCurrentYearAdvance = advanceReceipts.some(receipt => {
            if (!receipt.receipt_date) return false;
            const receiptYear = new Date(receipt.receipt_date).getFullYear();
            return receiptYear === currentYear;
        });

        //사업비 수령내역 - 기성금 (올해 이전 = 1차, 올해 이후 = 2차)
        const progressReceipts = project.receipt_details.filter(receipt => receipt.division.includes('기성'));
        const progress1stTotal = progressReceipts
            .filter(receipt => {
                if (!receipt.receipt_date) return false;
                const receiptYear = new Date(receipt.receipt_date).getFullYear();
                return receiptYear < currentYear;  // 올해 이전
            })
            .reduce((sum, receipt) => sum + receipt.amount, 0);

        const progress2ndTotal = progressReceipts
            .filter(receipt => {
                if (!receipt.receipt_date) return false;
                const receiptYear = new Date(receipt.receipt_date).getFullYear();
                return receiptYear >= currentYear;  // 올해 이후
            })
            .reduce((sum, receipt) => sum + receipt.amount, 0);

        const hasCurrentYearProgress1st = progress1stTotal > 0;  // 1차 기성금이 있으면 true
        const hasCurrentYearProgress2nd = progress2ndTotal > 0;  // 2차 기성금이 있으면 true

        //사업비 수령내역 - 준공금 (연도별 색상 적용)
        const completionReceipts = project.receipt_details.filter(receipt => receipt.division.includes('준공'));
        const completionTotal = completionReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
        const hasCurrentYearCompletion = completionReceipts.some(receipt => {
            if (!receipt.receipt_date) return false;
            const receiptYear = new Date(receipt.receipt_date).getFullYear();
            return receiptYear === currentYear;
        });


        // 총괄 사업비 합계는 변경사업비 기준으로 집계
        total.ProjectCost_NoVAT += changeProjectCost_NoVAT;
        total.ProjectCost += changeProjectCost;
        total.contractCostShare += contractCostShare;
        total.contractCostShareVAT += contractCostShareVAT;
        total.EX_money += EX_company_money;
        total.estimated_labor += project.estimated_labor || 0;
        total.estimated_expense += project.estimated_expense || 0;
        total.estimated_other += project.estimated_other || 0;
        total.estimated_performance += project.estimated_performance || 0;
        total.estimated_profit += estimated_profit;
        total.realCostShare_VAT += realCostShare_VAT;
        total.realCostShare += realCostShare;
        total.AC_money += AC_company_money;
        total.actual_labor += project.actual_labor || 0;
        total.actual_expense += project.actual_expense || 0;
        total.actual_other += project.actual_other || 0;
        total.actual_performance += project.actual_performance || 0;
        total.actual_profit += actual_profit;
        total.advanceTotal += advanceTotal;
        total.progress1stTotal += progress1stTotal;
        total.progress2ndTotal += progress2ndTotal;
        total.completionTotal += completionTotal;
        // 외주비 지급/잔금 합계 (잔금 = 실제진행비의 외주경비 - 지급금액; 단, 화면 표시는 양수값)
        const paid = Number(project.outsourcing_paid || 0); // Cost_NoVAT 합계
        const balance = Number(project.actual_other || 0) - paid; // 남은 집행 예정액(+), 초과지급 시 음수
        total.outsourcing_paid = (total.outsourcing_paid || 0) + paid;
        total.outsourcing_balance = (total.outsourcing_balance || 0) + balance;


        processedProjects.push({
            ...project,
            // 화면/엑셀 일관성을 위해 렌더링에서는 ProjectCost 필드를 사용하므로,
            // 여기에서 변경사업비 값으로 재정의한다.
            ProjectCost: changeProjectCost,
            ProjectCost_NoVAT: changeProjectCost_NoVAT,
            contractCostShare,
            contractCostShareVAT,
            estimated_profit,
            estimated_margin,
            EX_company_money,
            AC_company_money,
            realCostShare_VAT,
            realCostShare,
            actual_profit,
            actual_margin,
            AC_company_money,

            //수령내역 (기성금 1차/2차 분리)
            advanceTotal,
            progress1stTotal,        // 올해 이전 기성금
            progress2ndTotal,        // 올해 이후 기성금
            completionTotal,

            //현재 연도 수령내역 여부
            hasCurrentYearAdvance,
            hasCurrentYearProgress1st,
            hasCurrentYearProgress2nd,
            hasCurrentYearCompletion,

            // 세분화 항목 추가
            estimated_labor: project.estimated_labor,
            estimated_expense: project.estimated_expense,
            estimated_other: project.estimated_other,
            estimated_performance: project.estimated_performance,

            actual_labor: project.actual_labor,
            actual_expense: project.actual_expense,
            actual_other: project.actual_other,
            actual_performance: project.actual_performance,
            outsourcing_paid: paid,
            outsourcing_balance: Math.abs(balance) // 화면 표시는 양수
        });
        if (project.ContractCode === '24-용역-004-03') {
            console.log(processedProjects)
        }
    });
    renderAnnualProjectTable(processedProjects);

    // 최초 진입 시 순서 저장(한 번만 셋업)
    if (!initialOrderMap) {
        initialOrderMap = new Map();
        processedProjects.forEach((p, idx) => initialOrderMap.set(p.projectID, idx));
    }
}


function renderAnnualProjectTable(dataList) {
    const table = document.getElementById("annualProject_tbody");
    table.innerHTML = "";
    // 현재 정렬 상태 적용
    const list = applySort(dataList);

    let totalHasCurrentYearAdvance = false;
    let totalHasCurrentYearProgress1st = false;
    let totalHasCurrentYearProgress2nd = false;
    let totalHasCurrentYearCompletion = false;

    list.forEach((project, i) => {
        const row = document.createElement("tr");
        if (project.project_status && project.project_status.includes("준공")) {
            row.classList.add("completed-row");
        }
        const estColor = getTextColorByProfit(project.estimated_profit, project.estimated_margin);
        const actColor = getTextColorByProfit(project.actual_profit, project.actual_margin);

        //합계에서 현재 연도 수령내역 여부 체크
        if (project.hasCurrentYearAdvance) totalHasCurrentYearAdvance = true;
        if (project.hasCurrentYearProgress1st) totalHasCurrentYearProgress1st = true;
        if (project.hasCurrentYearProgress2nd) totalHasCurrentYearProgress2nd = true;
        if (project.hasCurrentYearCompletion) totalHasCurrentYearCompletion = true;

        //행 렌더링 (기성금 1차/2차 분리, 색상 적용)
        row.innerHTML = `
          <td class="sticky-col-3" style="text-align: center;">${i + 1}</td>
          <td class="sticky-col" style="text-align: left;"><a href="/project_detail/${project.projectID}">${project.ContractCode}</a></td>
          <td class="sticky-col-2" style="text-align: left;" data-full="${project.ProjectName}"><a href="/project_detail/${project.projectID}">${truncateText(project.ProjectName)}</a></td>
          <td style="text-align: left;" title="${project.orderPlace ? project.orderPlace : ''}">${project.orderPlace ? truncateOrderPlace(project.orderPlace) : '-'}</td>
          <td>${formatDate(project.StartDate)}</td> 
          <td>${formatDate(project.EndDate)}</td>
          <td>${formatDDayDisplay(project.D_Day)}</td> 
          <td>${(project.total_progress !== undefined && project.total_progress !== null) ? (function (p) { const n = parseFloat(p); if (isNaN(n)) return '-'; const f = n.toFixed(2).replace(/\.0+$/, '').replace(/\.(\d)0$/, '.$1'); return f + '%'; })(project.total_progress) : '-'}</td>
          <td>${project.performance_review ? project.performance_review : '-'}</td>

          <td>${project.ProjectCost.toLocaleString()}</td>
          <td style="border-right:3px solid #999;">${project.ProjectCost_NoVAT.toLocaleString()}</td>

          <td>${project.contractCostShareVAT.toLocaleString()}</td>
          <td>${project.contractCostShare.toLocaleString()}</td>
          <td>${project.EX_company_money.toLocaleString()}</td>
          <td>${project.estimated_labor.toLocaleString()}</td>
          <td>${project.estimated_expense.toLocaleString()}</td>
          <td>${project.estimated_other.toLocaleString()}</td>
          <td>${project.estimated_performance.toLocaleString()}</td>
          <td style="color: ${estColor};" class="estimated_margin">${project.estimated_profit.toLocaleString()}</td>
          <td style="color: ${estColor}; border-right:3px solid #999;" class="estimated_margin">${project.estimated_margin}%</td>

          <td>${project.realCostShare_VAT.toLocaleString()}</td>
          <td>${project.realCostShare.toLocaleString()}</td>
          <td>${project.AC_company_money.toLocaleString()}</td>
          <td>${project.actual_labor.toLocaleString()}</td>
          <td>${project.actual_expense.toLocaleString()}</td>
          <td>${project.actual_other.toLocaleString()}</td>
          <td>${project.actual_performance.toLocaleString()}</td>
          <td style="color: ${actColor};" class="actual_margin">${project.actual_profit.toLocaleString()}</td>
          <td style="color: ${actColor}; border-right:3px solid #999;" class="actual_margin">${project.actual_margin}%</td>

                    <!--수령내역 (현재 연도 기준 색상 적용, 기성금 1차/2차 분리) -->
                    <td style="color: ${project.hasCurrentYearAdvance ? 'red' : 'black'}; font-weight: ${project.hasCurrentYearAdvance ? 'bold' : 'normal'};">${project.advanceTotal.toLocaleString()}</td>
                    <td style="color: black; font-weight: normal;">${project.progress1stTotal.toLocaleString()}</td>
                    <td style="color: ${project.progress2ndTotal > 0 ? 'red' : 'black'}; font-weight: ${project.progress2ndTotal > 0 ? 'bold' : 'normal'};">${project.progress2ndTotal.toLocaleString()}</td>
                    <td style="color: ${project.hasCurrentYearCompletion ? 'red' : 'black'}; font-weight: ${project.hasCurrentYearCompletion ? 'bold' : 'normal'}; border-right:3px solid #999;">${project.completionTotal.toLocaleString()}</td>

                    <td>${project.outsourcing_paid.toLocaleString()}</td>
                    <td style="border-right:3px solid #999;">${Math.abs(project.outsourcing_balance).toLocaleString()}</td>
        `;
        // 리스크 존재 시 연한 빨간색 강조
        if (project.has_risk) {
            row.classList.add('risk-row');
        }
        table.appendChild(row);
    });

    const estMargin = total.contractCostShare === 0 ? 0 : (total.estimated_profit / total.contractCostShare * 100).toFixed(3);
    const actMargin = total.realCostShare === 0 ? 0 : (total.actual_profit / total.realCostShare * 100).toFixed(3);

    const totalRow = document.createElement("tr");
    totalRow.style.fontWeight = "bold";
    totalRow.style.backgroundColor = "#f0f0f0";
    totalRow.classList.add("summary-row");

    //합계 행 (기성금 1차/2차 분리, 색상 적용)
    totalRow.innerHTML = `
        <td colspan="9" style="text-align:center;">합계</td>
        <td>${total.ProjectCost.toLocaleString()}</td>
        <td style="border-right:3px solid #999;">${total.ProjectCost_NoVAT.toLocaleString()}</td>

        <td id="sum_contractCostShare">${total.contractCostShareVAT.toLocaleString()}</td>
        <td id="sum_contractCostShare">${total.contractCostShare.toLocaleString()}</td>
        <td id="sum_EX_money">${total.EX_money.toLocaleString()}</td>
        <td id="sum_estimated_labor">${total.estimated_labor.toLocaleString()}</td>
        <td id="sum_estimated_expense">${total.estimated_expense.toLocaleString()}</td>
        <td id="sum_estimated_other">${total.estimated_other.toLocaleString()}</td>
        <td id="sum_estimated_performance">${total.estimated_performance.toLocaleString()}</td>
        <td id="sum_estimated_profit" style="color:${getTextColorByProfit(total.estimated_profit, estMargin)};">${total.estimated_profit.toLocaleString()}</td>
        <td id="sum_estimated_margin" style="color:${getTextColorByProfit(total.estimated_profit, estMargin)}; border-right:3px solid #999;">${estMargin}%</td>

        <td>${total.realCostShare_VAT.toLocaleString()}</td>
        <td id="sum_realCostShare">${total.realCostShare.toLocaleString()}</td>
        <td id="sum_AC_money">${total.AC_money.toLocaleString()}</td>
        <td id="sum_actual_labor">${total.actual_labor.toLocaleString()}</td>
        <td id="sum_actual_expense">${total.actual_expense.toLocaleString()}</td>
        <td id="sum_actual_other">${total.actual_other.toLocaleString()}</td>
        <td id="sum_actual_performance">${total.actual_performance.toLocaleString()}</td>
        <td id="sum_actual_profit" style="color:${getTextColorByProfit(total.actual_profit, actMargin)};">${total.actual_profit.toLocaleString()}</td>
        <td id="sum_actual_margin" style="color:${getTextColorByProfit(total.actual_profit, actMargin)}; border-right:3px solid #999;">${actMargin}%</td>

        <td style="color: ${totalHasCurrentYearAdvance ? 'red' : 'black'}; font-weight: bold;" id="sum_advanceTotal">${total.advanceTotal.toLocaleString()}</td>
        <td style="color: black; font-weight: bold;" id="sum_progress1stTotal">${total.progress1stTotal.toLocaleString()}</td>
        <td style="color: ${total.progress2ndTotal > 0 ? 'red' : 'black'}; font-weight: bold;" id="sum_progress2ndTotal">${total.progress2ndTotal.toLocaleString()}</td>
        <td style="color: ${totalHasCurrentYearCompletion ? 'red' : 'black'}; font-weight: bold; border-right:3px solid #999;" id="sum_completionTotal">${total.completionTotal.toLocaleString()}</td>

        <td id="sum_outsourcing_paid">${(total.outsourcing_paid || 0).toLocaleString()}</td>
        <td id="sum_outsourcing_balance" style="border-right:3px solid #999;">${Math.abs(total.outsourcing_balance || 0).toLocaleString()}</td>
    `;

    table.appendChild(totalRow);

    // 기존 스크롤 동기화 코드...
    const tableContainer = document.getElementById('table-container');
    const fakeScrollbar = document.getElementById('fake-scrollbar');
    const fakeContent = fakeScrollbar.querySelector('.fake-scrollbar-content');
    if (fakeContent) {
        const tableElem = tableContainer.querySelector('table');
        if (tableElem) {
            fakeContent.style.width = tableElem.scrollWidth + 'px';
        }
    }
}
//프로젝트 마진율 필터
// function filterByMargin(type) {
//     const order = ['all', `${type}_positive`, `${type}_negative`];
//     const current = marginFilterStates[type];
//     const nextIndex = (order.indexOf(current) + 1) % order.length;
//     const nextValue = order[nextIndex];
//     marginFilterStates[type] = nextValue;

//     document.querySelector(`input[name="marginFilter"][value="${nextValue}"]`).checked = true;

//     let filtered = processedProjects;
//     if (nextValue === `${type}_positive`) {
//         filtered = processedProjects.filter(p =>
//             parseFloat(type === 'EX' ? p.estimated_profit : p.actual_profit) > 0
//         );
//     } else if (nextValue === `${type}_negative`) {
//         filtered = processedProjects.filter(p =>
//             parseFloat(type === 'EX' ? p.estimated_profit : p.actual_profit) < 0
//         );
//     }

//     const moneyTh = document.getElementById(`${type}_filterMoney`);
//     const marginTh = document.getElementById(`${type}_filterMargin`);

//     if (nextValue.endsWith('positive')) {
//         moneyTh.textContent = '손익금액(+)';
//         marginTh.textContent = '손익비율(+)';
//     } else if (nextValue.endsWith('negative')) {
//         moneyTh.textContent = '손익금액(-)';
//         marginTh.textContent = '손익비율(-)';
//     } else {
//         moneyTh.textContent = '손익금액';
//         marginTh.textContent = '손익비율';
//     }

//     renderAnnualProjectTable(filtered);
// }

let statusFilterState = 'all';
//프로젝트 상태 필터
function filterByStatus() {
    // 토글 순서: 전체 → 준공 → 진행중 → 전체 ...
    const order = ['all', '준공', '진행중'];
    const nextIndex = (order.indexOf(statusFilterState) + 1) % order.length;
    statusFilterState = order[nextIndex];

    // 버튼 또는 th 텍스트 변경
    const statusTh = document.getElementById('status_filterTh');
    if (statusTh) {
        if (statusFilterState === '준공') statusTh.textContent = '준공 사업명';
        else if (statusFilterState === '진행중') statusTh.textContent = '진행중 사업명';
        else statusTh.textContent = '전체 사업명';
    }

    //수정된 필터링 로직
    let filtered = processedProjects;
    if (statusFilterState === '준공') {
        //준공 관련 모든 상태 포함 (연도 포함)
        filtered = processedProjects.filter(p =>
            p.project_status && p.project_status.includes('준공')
        );
        console.log('준공 필터 적용:', filtered.length + '개 프로젝트');
    } else if (statusFilterState === '진행중') {
        //진행중 또는 상태가 없는 경우
        filtered = processedProjects.filter(p =>
            !p.project_status ||
            p.project_status === '진행중' ||
            p.project_status === 'none' ||
            p.project_status === '' ||
            p.project_status === null ||
            p.project_status === undefined ||
            (!p.project_status.includes('준공') && !p.project_status.includes('중지'))
        );
        console.log('진행중 필터 적용:', filtered.length + '개 프로젝트');
    } else {
        console.log('전체 표시:', filtered.length + '개 프로젝트');
    }

    //디버깅: 실제 project_status 값들 확인
    if (statusFilterState === '준공') {
        const statusValues = [...new Set(processedProjects.map(p => p.project_status))];
        console.log('모든 project_status 값들:', statusValues);

        const 준공Projects = processedProjects.filter(p => p.project_status && p.project_status.includes('준공'));
        console.log('준공 포함 프로젝트들:', 준공Projects.map(p => ({
            name: p.ProjectName,
            status: p.project_status
        })));
    }

    renderAnnualProjectTable(filtered);
}




function formatDate(dateStr) {
    if (!dateStr) return "";  // null, undefined, 빈 문자열 처리

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";  // 유효하지 않은 날짜 처리

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

//긴 텍스트 줄이기 & 괄호 안의 내용 유지
function truncateText(text, maxLength = 30) {
    if (!text) return "-";

    // 전체 텍스트가 maxLength보다 짧으면 그대로 반환
    if (text.length <= maxLength) {
        return text;
    }

    // 괄호 내용 추출
    const bracketMatches = [...text.matchAll(/\(.*?\)/g)];
    const bracketContent = bracketMatches.map(m => m[0]).join("");

    // 괄호가 없으면 기본 줄이기
    if (bracketContent.length === 0) {
        return text.substring(0, maxLength - 3) + "...";
    }

    // 괄호 제외한 본문
    const mainText = text.replace(/\(.*?\)/g, "").trim();

    // 괄호 + "..." 길이를 고려한 본문 최대 길이
    const reservedLength = bracketContent.length + 3; // 괄호 + "..."
    const mainMaxLength = maxLength - reservedLength;

    // 본문이 너무 길면 줄이고 괄호 붙이기
    if (mainText.length > mainMaxLength && mainMaxLength > 0) {
        return mainText.substring(0, mainMaxLength) + "..." + bracketContent;
    }

    // 그래도 길면 전체를 줄이기
    if ((mainText + bracketContent).length > maxLength) {
        return text.substring(0, maxLength - 3) + "...";
    }

    return text;
}

function getTextColorByProfit(profit, margin) {
    if (profit < 0 || margin < 0) {
        return "red";
    }

    return "black";
}

// 발주처 전용 줄임: 마지막 괄호 내용은 유지하면서 본문이 길면 ... 처리
function truncateOrderPlace(text, maxLength = 10) {
    if (!text) return "-";

    // 마지막 괄호 쌍만 추출
    const match = text.match(/\([^()]*\)\s*$/);
    const bracketContent = match ? match[0] : "";

    // 본문에서 마지막 괄호 제거
    const mainText = match ? text.slice(0, match.index).trim() : text;

    // 본문이 길면 ... + (마지막 괄호) 유지
    if (mainText.length > maxLength) {
        return mainText.substring(0, maxLength) + "..." + bracketContent;
    }

    return text;
}

function enableHorizontalDragScroll(divId) {
    const el = document.getElementById(divId);
    let isDown = false;
    let startX, scrollLeft;

    el.addEventListener('mousedown', function (e) {
        isDown = true;
        el.classList.add('dragging');
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
        // 드래그 중 텍스트 선택 방지
        el.style.userSelect = 'none';
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mouseup', function () {
        isDown = false;
        el.classList.remove('dragging');
        // 선택 가능 상태 복원
        el.style.userSelect = '';
        document.body.style.userSelect = '';
    });
    el.addEventListener('mouseleave', function () {
        isDown = false;
        el.classList.remove('dragging');
        // 선택 가능 상태 복원
        el.style.userSelect = '';
        document.body.style.userSelect = '';
    });
    el.addEventListener('mousemove', function (e) {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        el.scrollLeft = scrollLeft - (x - startX);
    });
    // 드래그 중 발생하는 텍스트 선택 시작 자체를 무시
    el.addEventListener('selectstart', function (e) {
        if (isDown) e.preventDefault();
    });
}

// 엑셀 다운로드 함수 수정
function exportToXlsx() {
    try {
        // 컨텍스트(모드/연도) 파싱 및 제목 생성
        const ctx = parseAnnualContextFromPath();
        const exportTitle = buildExportTitle(ctx);

        // 현재 필터링된 데이터와 합계 데이터 준비
        const currentData = {
            processedProjects: processedProjects,  // 전역 변수
            total: total,  // 전역 변수
            year: ctx.year || new Date().getFullYear(),
            mode: ctx.mode,               // 서버에서 필요하면 사용
            title: exportTitle            // 서버에서 시트 타이틀 등에 사용할 수 있도록 전달
        };

        console.log('📊 엑셀 다운로드 데이터:', currentData);

        // Loading 표시
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'exportLoading';
        loadingDiv.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 9999;">
                <div style="text-align: center;">
                    <div style="margin-bottom: 10px;">📊 엑셀 파일 생성 중...</div>
                    <div style="width: 200px; height: 4px; background: #f0f0f0; border-radius: 2px;">
                        <div style="width: 0%; height: 100%; background: #4472C4; border-radius: 2px; animation: progress 2s ease-in-out infinite;"></div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes progress {
                    0% { width: 0%; }
                    50% { width: 70%; }
                    100% { width: 100%; }
                }
            </style>
        `;
        document.body.appendChild(loadingDiv);

        // Flask API 호출
        fetch('/api/export_annual_project', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentData)
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => Promise.reject(err));
                }
                return response.blob();
            })
            .then(blob => {
                // 파일 다운로드
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${exportTitle}_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                // 성공 메시지
                showNotification('✅ 엑셀 파일이 성공적으로 다운로드되었습니다!', 'success');
            })
            .catch(error => {
                console.error('❌ 엑셀 다운로드 실패:', error);
                showNotification(`❌ 엑셀 다운로드 실패: ${error.message || '알 수 없는 오류'}`, 'error');
            })
            .finally(() => {
                // Loading 제거
                const loading = document.getElementById('exportLoading');
                if (loading) {
                    document.body.removeChild(loading);
                }
            });

    } catch (error) {
        console.error('❌ 엑셀 다운로드 준비 실패:', error);
        showNotification('❌ 엑셀 다운로드 준비 중 오류가 발생했습니다.', 'error');
    }
}

// ===== 다운로드 컨텍스트 유틸 =====
function parseAnnualContextFromPath() {
    // 1) 템플릿에서 주입된 data-mode/year 우선 사용
    let mode = (document.body && document.body.dataset && document.body.dataset.mode) || null;
    let year = (document.body && document.body.dataset && document.body.dataset.year) || null;

    // 2) URL 경로 기반 파싱 (쿼리스트링 제거)
    const pathname = (window.location && window.location.pathname) ? window.location.pathname.split('?')[0] : '';
    const parts = pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('PMS_annualProject');
    if (idx !== -1) {
        const a = parts[idx + 1];
        const b = parts[idx + 2];
        if (!mode && a && ['complete', 'stop', 'progress'].includes(a)) {
            mode = a;
        }
        if (!year) {
            // b가 2025 형태가 아닐 수 있어 4자리 숫자를 추출 시도
            const m = (b || '').match(/(\d{4})/);
            if (m) year = m[1];
            else {
                // /PMS_annualProject/2025 형태
                const aYear = (a || '').match(/(\d{4})/);
                if (aYear) {
                    year = aYear[1];
                    if (!mode) mode = 'annual';
                }
            }
        }
    }

    // 3) 헤더 텍스트에서 연도/모드 보조 추출
    const h = document.getElementById('projectName');
    if (h) {
        if (!year) {
            const ym = h.textContent && h.textContent.match(/([0-9]{4})년/);
            if (ym) year = ym[1];
        }
        if (!mode) {
            const txt = (h.textContent || '').trim();
            if (txt.includes('준공')) mode = 'complete';
            else if (txt.includes('중지')) mode = 'stop';
            else if (txt.includes('진행')) mode = 'progress';
        }
    }

    // 4) 최종 기본값 보정
    if (!mode) mode = 'annual';

    // 디버깅 로그 (필요 시 주석 처리 가능)
    // console.log('[parseAnnualContextFromPath]', { mode, year, parts });

    return { mode, year };
}

function buildExportTitle(ctx) {
    const y = ctx.year ? `${ctx.year}년 ` : '';
    switch (ctx.mode) {
        case 'complete':
            return `${y}준공사업 통합자료`;
        case 'stop':
            return `${y}용역중지 사업 통합자료`;
        case 'progress':
            return `${y}진행 사업 통합자료`;
        default:
            // 연도별 통합자료(일반)
            return ctx.year ? `${ctx.year}년 비용 산출 통합자료` : '비용 산출 통합자료';
    }
}

// 알림 메시지 표시 함수
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        max-width: 400px;
        word-wrap: break-word;
        background-color: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease-out;
    `;

    // 애니메이션 CSS 추가
    if (!document.getElementById('notificationStyle')) {
        const style = document.createElement('style');
        style.id = 'notificationStyle';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // 3초 후 자동 제거
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}
// D-Day 표시 포맷: null/undefined -> '-', 0 -> 'D-Day', 양수 -> 'D+N', 음수 -> 'D-N'
function formatDDayDisplay(value) {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    if (isNaN(num)) return '-';
    if (num === 0) return 'D-0';
    if (num > 0) return `D+${num}`;
    // num < 0
    return `D${num}`; // num 자체가 음수이므로 'D-10' 형태가 됨
}

// ===== 정렬 유틸 =====
function sortBy(key, type = 'string') {
    // 같은 컬럼: asc -> desc -> 초기 화면 순서
    if (currentSort.key === key) {
        if (currentSort.dir === 'asc') currentSort.dir = 'desc';
        else if (currentSort.dir === 'desc') currentSort = { key: null, type: null, dir: 'default' };
    } else {
        currentSort = { key, type, dir: 'asc' };
    }

    // 현재 필터 상태 유지하여 재렌더
    let base = processedProjects;
    if (typeof statusFilterState !== 'undefined') {
        if (statusFilterState === '준공') {
            base = processedProjects.filter(p => p.project_status && p.project_status.includes('준공'));
        } else if (statusFilterState === '진행중') {
            base = processedProjects.filter(p =>
                !p.project_status ||
                p.project_status === '진행중' ||
                p.project_status === 'none' ||
                p.project_status === '' ||
                p.project_status === null ||
                p.project_status === undefined ||
                (!p.project_status.includes('준공') && !p.project_status.includes('중지'))
            );
        }
    }
    renderAnnualProjectTable(base);
}

function applySort(list) {
    // 초기 화면 순서 복귀
    if (!currentSort.key || currentSort.dir === 'default') return applyInitialOrder(list);
    const arr = [...list];
    const { key, type, dir } = currentSort;
    arr.sort((a, b) => compareValues(a[key], b[key], type, dir));
    return arr;
}

function applyInitialOrder(list) {
    if (!initialOrderMap) return list;
    const arr = [...list];
    arr.sort((a, b) => {
        const ia = initialOrderMap.has(a.projectID) ? initialOrderMap.get(a.projectID) : Number.MAX_SAFE_INTEGER;
        const ib = initialOrderMap.has(b.projectID) ? initialOrderMap.get(b.projectID) : Number.MAX_SAFE_INTEGER;
        return ia - ib;
    });
    return arr;
}

function compareValues(a, b, type = 'string', dir = 'asc') {
    // null/빈값 뒤로
    const isNullA = a === null || a === undefined || a === '';
    const isNullB = b === null || b === undefined || b === '';
    if (isNullA && !isNullB) return 1;
    if (!isNullA && isNullB) return -1;
    if (isNullA && isNullB) return 0;

    let result = 0;
    if (type === 'number') {
        const na = Number(a); const nb = Number(b);
        result = na === nb ? 0 : (na < nb ? -1 : 1);
    } else if (type === 'date') {
        const da = new Date(a); const db = new Date(b);
        result = da - db; result = result < 0 ? -1 : result > 0 ? 1 : 0;
    } else { // string
        const sa = String(a); const sb = String(b);
        // MySQL ORDER BY와 최대한 유사하게: 한글 우선, 대소문자 구분 없음, 숫자 자연정렬 비활성
        const ga = scriptGroup(sa); const gb = scriptGroup(sb);
        if (ga !== gb) result = ga - gb;
        else result = sa.localeCompare(sb, 'ko-KR', { sensitivity: 'base' });
    }
    return dir === 'asc' ? result : -result;
}

function scriptGroup(s) {
    const first = s.trim().charAt(0);
    // 정렬 우선순위: 특수문자(0) -> 숫자(1) -> 영어(2) -> 한글(3)
    if (/^[0-9]/.test(first)) return 1;   // 숫자
    if (/^[A-Za-z]/.test(first)) return 2; // 영어
    if (/^[가-힣]/.test(first)) return 3;  // 한글
    return 0; // 그 외 특수문자
}

// 신규 컬럼 정렬 헬퍼 등록 (진행률, 성과심사 여부)
// 진행률: number 타입, 성과심사 여부: string 타입 (이미 sortBy 호출 시 지정됨)
