document.addEventListener("DOMContentLoaded", function () {
    cal_annualProject();
    initAnnualMoneyStatsPanel();
    initVatModeControls();
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
let vatMode = 'include';
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

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function toVat(value) {
    return Math.round(toNumber(value) * 1.1);
}

function toNoVat(value) {
    return Math.round(toNumber(value) / 1.1);
}

function normalizeTiny(value) {
    return Math.abs(value) <= 1 ? 0 : value;
}

function initVatModeControls() {
    const includeInput = document.getElementById('vatIncludeChk');
    const excludeInput = document.getElementById('vatExcludeChk');
    if (!includeInput || !excludeInput) return;

    const mark = (input, active) => {
        const label = input.closest('.annual-vat-check');
        if (label) label.classList.toggle('active', active);
    };

    const applyMode = (mode) => {
        vatMode = mode;
        includeInput.checked = mode === 'include';
        excludeInput.checked = mode === 'exclude';
        mark(includeInput, includeInput.checked);
        mark(excludeInput, excludeInput.checked);
        document.body.setAttribute('data-vat-mode', mode);
        renderAnnualProjectTable(processedProjects);
    };

    includeInput.addEventListener('change', () => applyMode(includeInput.checked ? 'include' : 'exclude'));
    excludeInput.addEventListener('change', () => applyMode(excludeInput.checked ? 'exclude' : 'include'));

    applyMode('exclude');
}

function getVatView(project, options = {}) {
    const mode = options.mode || vatMode;
    const include = mode === 'include';
    const includeReceipt = include;
    const estimatedLabor = toNumber(project.estimated_labor);
    const estimatedExpense = toNumber(project.estimated_expense);
    const estimatedOther = include ? toVat(project.estimated_other) : toNumber(project.estimated_other);
    const estimatedPerformance = toNumber(project.estimated_performance);
    const actualLabor = toNumber(project.actual_labor);
    const actualExpense = toNumber(project.actual_expense);
    const actualOther = include ? toVat(project.actual_other) : toNumber(project.actual_other);
    const actualPerformance = toNumber(project.actual_performance);

    const exMoney = toNumber(project.EX_company_money);
    const acMoney = toNumber(project.AC_company_money);

    const contractCostShareDisplay = include ? toNumber(project.contractCostShareVAT) : toNumber(project.contractCostShare);
    const realCostShareDisplay = include ? toNumber(project.realCostShare_VAT) : toNumber(project.realCostShare);

    const estimatedProfit = Math.round(
        contractCostShareDisplay
        - (exMoney + estimatedLabor + estimatedExpense + estimatedOther + estimatedPerformance)
    );
    const actualProfit = Math.round(
        realCostShareDisplay
        - (acMoney + actualLabor + actualExpense + actualOther + actualPerformance)
    );

    const estimatedMargin = contractCostShareDisplay === 0 ? 0 : ((estimatedProfit / contractCostShareDisplay) * 100);
    const actualMargin = realCostShareDisplay === 0 ? 0 : ((actualProfit / realCostShareDisplay) * 100);

    const advanceTotal = includeReceipt ? toNumber(project.advanceTotal) : toNoVat(project.advanceTotal);
    const progress1stTotal = includeReceipt ? toNumber(project.progress1stTotal) : toNoVat(project.progress1stTotal);
    const progress2ndTotal = includeReceipt ? toNumber(project.progress2ndTotal) : toNoVat(project.progress2ndTotal);
    const completionTotal = includeReceipt ? toNumber(project.completionTotal) : toNoVat(project.completionTotal);

    const outsourcingPaid = include ? toVat(project.outsourcing_paid) : toNumber(project.outsourcing_paid);
    const outsourcingBalanceRaw = include
        ? toVat(project.outsourcing_balance)
        : toNumber(project.outsourcing_balance);
    const outsourcingBalance = Math.abs(normalizeTiny(outsourcingBalanceRaw));

    return {
        exMoney,
        acMoney,
        estimatedLabor,
        estimatedExpense,
        estimatedOther,
        estimatedPerformance,
        actualLabor,
        actualExpense,
        actualOther,
        actualPerformance,
        contractCostShareDisplay,
        realCostShareDisplay,
        estimatedProfit,
        actualProfit,
        estimatedMargin,
        actualMargin,
        advanceTotal,
        progress1stTotal,
        progress2ndTotal,
        completionTotal,
        outsourcingPaid,
        outsourcingBalance,
    };
}

function buildSummary(list, options = {}) {
    return list.reduce((acc, project) => {
        const view = getVatView(project, options);
        acc.orderTotalCostInclude += toNumber(project.ProjectCost);
        acc.orderTotalCostExclude += toNumber(project.ProjectCost_NoVAT);
        acc.orderShareCostInclude += toNumber(project.realCostShare_VAT);
        acc.orderShareCostExclude += toNumber(project.realCostShare);
        acc.contractCostShare += view.contractCostShareDisplay;
        acc.contractCostShareInclude += toNumber(project.contractCostShareVAT);
        acc.contractCostShareExclude += toNumber(project.contractCostShare);
        acc.exMoney += view.exMoney;
        acc.estimatedLabor += view.estimatedLabor;
        acc.estimatedExpense += view.estimatedExpense;
        acc.estimatedOther += view.estimatedOther;
        acc.estimatedPerformance += view.estimatedPerformance;
        acc.estimatedProfit += view.estimatedProfit;
        acc.realCostShare += view.realCostShareDisplay;
        acc.realCostShareInclude += toNumber(project.realCostShare_VAT);
        acc.realCostShareExclude += toNumber(project.realCostShare);
        acc.acMoney += view.acMoney;
        acc.actualLabor += view.actualLabor;
        acc.actualExpense += view.actualExpense;
        acc.actualOther += view.actualOther;
        acc.actualPerformance += view.actualPerformance;
        acc.actualProfit += view.actualProfit;
        acc.advanceTotal += view.advanceTotal;
        acc.progress1stTotal += view.progress1stTotal;
        acc.progress2ndTotal += view.progress2ndTotal;
        acc.completionTotal += view.completionTotal;
        acc.outsourcingPaid += view.outsourcingPaid;
        acc.outsourcingBalance += view.outsourcingBalance;
        return acc;
    }, {
        orderTotalCostInclude: 0,
        orderTotalCostExclude: 0,
        orderShareCostInclude: 0,
        orderShareCostExclude: 0,
        contractCostShare: 0,
        contractCostShareInclude: 0,
        contractCostShareExclude: 0,
        exMoney: 0,
        estimatedLabor: 0,
        estimatedExpense: 0,
        estimatedOther: 0,
        estimatedPerformance: 0,
        estimatedProfit: 0,
        realCostShare: 0,
        realCostShareInclude: 0,
        realCostShareExclude: 0,
        acMoney: 0,
        actualLabor: 0,
        actualExpense: 0,
        actualOther: 0,
        actualPerformance: 0,
        actualProfit: 0,
        advanceTotal: 0,
        progress1stTotal: 0,
        progress2ndTotal: 0,
        completionTotal: 0,
        outsourcingPaid: 0,
        outsourcingBalance: 0,
    });
}

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
        const paid = Number(project.outsourcing_paid || 0); // Cost_NoVAT 합계(현재 연도)
        const rawBalance = Number.isFinite(Number(project.outsourcing_balance))
            ? Number(project.outsourcing_balance)
            : (Number(project.actual_other || 0) - paid);
        const balance = Math.abs(rawBalance) <= 1 ? 0 : rawBalance;
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
            hasCurrentYearOutsourcingPaid: paid > 0,

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

function initAnnualMoneyStatsPanel() {
    const toggle = document.getElementById('annualMoneyStatsToggle');
    const panel = document.getElementById('annualMoneyStatsPanel');
    if (!toggle || !panel) return;

    const applyVisibility = () => {
        panel.style.display = toggle.checked ? 'block' : 'none';
    };

    toggle.addEventListener('change', applyVisibility);
    applyVisibility();
}

function renderAnnualMoneyStats(summary) {
    const panel = document.getElementById('annualMoneyStatsPanel');
    if (!panel) return;

    const safe = summary || {
        orderTotalCostInclude: 0,
        orderTotalCostExclude: 0,
        orderShareCostInclude: 0,
        orderShareCostExclude: 0,
        acMoney: 0,
        actualLabor: 0,
        actualExpense: 0,
        actualPerformance: 0,
        advanceTotal: 0,
        progress1stTotal: 0,
        progress2ndTotal: 0,
        completionTotal: 0,
        outsourcingPaid: 0,
    };

    const bodyYear = Number(document.body?.dataset?.year) || 0;
    const year = bodyYear || new Date().getFullYear();
    const orderTotalCost = Number(vatMode === 'include' ? safe.orderTotalCostInclude : safe.orderTotalCostExclude);
    const orderShareCost = Number(vatMode === 'include' ? safe.orderShareCostInclude : safe.orderShareCostExclude);
    const advanceTotal = Number(safe.advanceTotal || 0);
    const progress1stTotal = Number(safe.progress1stTotal || 0);
    const progress2ndTotal = Number(safe.progress2ndTotal || 0);
    const completionTotal = Number(safe.completionTotal || 0);
    const receiptTotal = advanceTotal + progress1stTotal + progress2ndTotal + completionTotal;

    const actualCost = Number(safe.acMoney || 0)
        + Number(safe.actualLabor || 0)
        + Number(safe.actualExpense || 0)
        + Number(safe.actualPerformance || 0);

    const outsourcingPaid = Number(safe.outsourcingPaid || 0);
    const expenseTotal = actualCost + outsourcingPaid;
    const profitAmount = receiptTotal - expenseTotal;
    const profitRatio = receiptTotal > 0 ? (profitAmount / receiptTotal) * 100 : 0;

    const yearLabels = document.querySelectorAll('.annual-money-year-label');
    yearLabels.forEach(el => {
        el.textContent = String(year);
    });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value;
    };

    const moneyText = (value) => `${Math.round(value).toLocaleString()}`;

    setText('statsOrderTotalCost', moneyText(orderTotalCost));
    setText('statsOrderShareCost', moneyText(orderShareCost));
    setText('statsAdvanceTotal', moneyText(advanceTotal));
    setText('statsProgress1stTotal', moneyText(progress1stTotal));
    setText('statsProgress2ndTotal', moneyText(progress2ndTotal));
    setText('statsCompletionTotal', moneyText(completionTotal));
    setText('statsReceiptTotal', `합계 : ${moneyText(receiptTotal)}`);
    const ratioText = `${profitRatio.toFixed(2)}%`;

    setText('statsActualCost', moneyText(actualCost));
    setText('statsOutsourcingPaid', moneyText(outsourcingPaid));
    setText('statsExpenseTotal', `합계 : ${moneyText(expenseTotal)}`);
    setText('statsProfitAmount', moneyText(profitAmount));
    setText('statsProfitRatio', ratioText);

    renderAnnualMoneyBarGraph({ receiptTotal, actualCost, outsourcingPaid, profitAmount });
    renderAnnualMoneyPieGraph({ receiptTotal, actualCost, outsourcingPaid, profitAmount, profitRatio });
}

function renderAnnualMoneyBarGraph({ receiptTotal, actualCost, outsourcingPaid, profitAmount }) {
    const host = document.getElementById('statsBarGraph');
    if (!host) return;

    const items = [
        { label: '수령금액', value: receiptTotal, color: '#3b82f6' },
        { label: '실제비', value: actualCost, color: '#f59e0b' },
        { label: '외주비', value: outsourcingPaid, color: '#10b981' },
        { label: '수익금액', value: profitAmount, color: profitAmount >= 0 ? '#2563eb' : '#ef4444' },
    ];

    const maxValue = Math.max(...items.map(item => Math.abs(item.value)), 1);

    host.innerHTML = items.map(item => {
        const absValue = Math.abs(item.value);
        const width = absValue === 0 ? 0 : Math.max(4, Math.round((absValue / maxValue) * 100));
        const fillStyle = width === 0
            ? 'width:0%; background:transparent;'
            : `width:${width}%; background:${item.color};`;
        return `
            <div class="annual-money-bar-row">
                <div class="annual-money-bar-label">${item.label}</div>
                <div class="annual-money-bar-track">
                    <div class="annual-money-bar-fill" style="${fillStyle}"></div>
                </div>
                <div class="annual-money-bar-value">${Math.round(item.value).toLocaleString()}</div>
            </div>
        `;
    }).join('');
}

function renderAnnualMoneyPieGraph({ receiptTotal, actualCost, outsourcingPaid, profitAmount, profitRatio }) {
    const host = document.getElementById('statsPieGraph');
    if (!host) return;

    const partActual = Math.max(actualCost, 0);
    const partOutsource = Math.max(outsourcingPaid, 0);
    const partProfit = Math.max(profitAmount, 0);
    const sum = Math.max(partActual + partOutsource + partProfit, 1);

    const p1 = (partActual / sum) * 100;
    const p2 = (partOutsource / sum) * 100;
    const stop1 = p1;
    const stop2 = p1 + p2;
    const bg = `conic-gradient(#f59e0b 0 ${stop1}%, #10b981 ${stop1}% ${stop2}%, #3b82f6 ${stop2}% 100%)`;

    host.innerHTML = `
        <div class="annual-money-pie-block">
            <div class="annual-money-pie" style="background:${bg};">
                <span class="annual-money-pie-text">${profitRatio.toFixed(1)}%</span>
            </div>
            <div class="annual-money-pie-legend" aria-label="원형그래프 범례">
                <div class="annual-money-pie-legend-row">
                    <span class="annual-money-pie-legend-dot" style="background:#f59e0b;"></span>
                    <span class="annual-money-pie-legend-label">실제진행비</span>
                    <span class="annual-money-pie-legend-value">${Math.round(actualCost).toLocaleString()}</span>
                </div>
                <div class="annual-money-pie-legend-row">
                    <span class="annual-money-pie-legend-dot" style="background:#10b981;"></span>
                    <span class="annual-money-pie-legend-label">외주비 지급</span>
                    <span class="annual-money-pie-legend-value">${Math.round(outsourcingPaid).toLocaleString()}</span>
                </div>
                <div class="annual-money-pie-legend-row">
                    <span class="annual-money-pie-legend-dot" style="background:#3b82f6;"></span>
                    <span class="annual-money-pie-legend-label">수익금액</span>
                    <span class="annual-money-pie-legend-value">${Math.round(profitAmount).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}


function renderAnnualProjectTable(dataList) {
    const table = document.getElementById("annualProject_tbody");
    table.innerHTML = "";
    // 현재 정렬 상태 적용
    const list = applySort(dataList);
    const summary = buildSummary(list, { mode: vatMode });

    let totalHasCurrentYearAdvance = false;
    let totalHasCurrentYearProgress1st = false;
    let totalHasCurrentYearProgress2nd = false;
    let totalHasCurrentYearCompletion = false;
    let totalHasCurrentYearOutsourcingPaid = false;

    list.forEach((project, i) => {
        const row = document.createElement("tr");
        if (project.project_status && project.project_status.includes("준공")) {
            row.classList.add("completed-row");
        } else if (project.project_status === '용역중지') {
            row.classList.add("stop-row");
        }
        const vatView = getVatView(project, { mode: vatMode });
        const estColor = getTextColorByProfit(vatView.estimatedProfit, vatView.estimatedMargin);
        const actColor = getTextColorByProfit(vatView.actualProfit, vatView.actualMargin);

        //합계에서 현재 연도 수령내역 여부 체크
        if (project.hasCurrentYearAdvance) totalHasCurrentYearAdvance = true;
        if (project.hasCurrentYearProgress1st) totalHasCurrentYearProgress1st = true;
        if (project.hasCurrentYearProgress2nd) totalHasCurrentYearProgress2nd = true;
        if (project.hasCurrentYearCompletion) totalHasCurrentYearCompletion = true;
        if (project.hasCurrentYearOutsourcingPaid) totalHasCurrentYearOutsourcingPaid = true;

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

          <td class="vat-col-include">${project.ProjectCost.toLocaleString()}</td>
          <td class="vat-col-exclude">${project.ProjectCost_NoVAT.toLocaleString()}</td>

          <td class="vat-col-include">${project.contractCostShareVAT.toLocaleString()}</td>
          <td class="vat-col-exclude">${project.contractCostShare.toLocaleString()}</td>
                    <td>${vatView.exMoney.toLocaleString()}</td>
                    <td>${vatView.estimatedLabor.toLocaleString()}</td>
                    <td>${vatView.estimatedExpense.toLocaleString()}</td>
                    <td>${vatView.estimatedOther.toLocaleString()}</td>
                    <td>${vatView.estimatedPerformance.toLocaleString()}</td>
                    <td style="color: ${estColor};" class="estimated_margin">${vatView.estimatedProfit.toLocaleString()}</td>
                    <td style="color: ${estColor};" class="estimated_margin">${vatView.estimatedMargin.toFixed(3)}%</td>

          <td class="vat-col-include">${project.realCostShare_VAT.toLocaleString()}</td>
          <td class="vat-col-exclude">${project.realCostShare.toLocaleString()}</td>
                    <td>${vatView.acMoney.toLocaleString()}</td>
                    <td>${vatView.actualLabor.toLocaleString()}</td>
                    <td>${vatView.actualExpense.toLocaleString()}</td>
                    <td>${vatView.actualOther.toLocaleString()}</td>
                    <td>${vatView.actualPerformance.toLocaleString()}</td>
                    <td style="color: ${actColor};" class="actual_margin">${vatView.actualProfit.toLocaleString()}</td>
                    <td style="color: ${actColor};" class="actual_margin">${vatView.actualMargin.toFixed(3)}%</td>

          <!--수령내역 (현재 연도 기준 색상 적용, 기성금 1차/2차 분리) -->
                    <td style="color: ${project.hasCurrentYearAdvance ? 'red' : 'black'}; font-weight: ${project.hasCurrentYearAdvance ? 'bold' : 'normal'};">${vatView.advanceTotal.toLocaleString()}</td>
                    <td style="color: black; font-weight: normal;">${vatView.progress1stTotal.toLocaleString()}</td>      <!-- 1차 기성금 (올해 이전) -->
                    <td style="color: ${vatView.progress2ndTotal > 0 ? 'red' : 'black'}; font-weight: ${vatView.progress2ndTotal > 0 ? 'bold' : 'normal'};">${vatView.progress2ndTotal.toLocaleString()}</td>  <!--2차 기성금 (0이면 검은색, 0 초과면 빨간색) -->
                    <td style="color: ${project.hasCurrentYearCompletion ? 'red' : 'black'}; font-weight: ${project.hasCurrentYearCompletion ? 'bold' : 'normal'};">${vatView.completionTotal.toLocaleString()}</td>
                    <td style="color: ${project.hasCurrentYearOutsourcingPaid ? 'red' : 'black'}; font-weight: ${project.hasCurrentYearOutsourcingPaid ? 'bold' : 'normal'}; border-left:3px solid #999;">${vatView.outsourcingPaid.toLocaleString()}</td>
                    <td style="color: ${project.hasCurrentYearOutsourcingPaid ? 'red' : 'black'}; font-weight: ${project.hasCurrentYearOutsourcingPaid ? 'bold' : 'normal'};">${vatView.outsourcingBalance.toLocaleString()}</td>
        `;
        // 리스크 존재 시 연한 빨간색 강조
        if (project.has_risk) {
            row.classList.add('risk-row');
        }
        table.appendChild(row);
    });

    const estMargin = summary.contractCostShare === 0 ? 0 : ((summary.estimatedProfit / summary.contractCostShare) * 100);
    const actMargin = summary.realCostShare === 0 ? 0 : ((summary.actualProfit / summary.realCostShare) * 100);

    const totalRow = document.createElement("tr");
    totalRow.style.fontWeight = "bold";
    totalRow.style.backgroundColor = "#f0f0f0";
    totalRow.classList.add("summary-row");

    //합계 행 (기성금 1차/2차 분리, 색상 적용)
    totalRow.innerHTML = `
        <td colspan="9" style="text-align:center;">합계</td>
        <td class="vat-col-include">${summary.orderTotalCostInclude.toLocaleString()}</td>
        <td class="vat-col-exclude">${summary.orderTotalCostExclude.toLocaleString()}</td>

    <td id="sum_contractCostShare" class="vat-col-include">${summary.contractCostShareInclude.toLocaleString()}</td>
        <td id="sum_contractCostShare" class="vat-col-exclude">${summary.contractCostShareExclude.toLocaleString()}</td>
        <td id="sum_EX_money">${summary.exMoney.toLocaleString()}</td>
        <td id="sum_estimated_labor">${summary.estimatedLabor.toLocaleString()}</td>
        <td id="sum_estimated_expense">${summary.estimatedExpense.toLocaleString()}</td>
        <td id="sum_estimated_other">${summary.estimatedOther.toLocaleString()}</td>
        <td id="sum_estimated_performance">${summary.estimatedPerformance.toLocaleString()}</td>
        <td id="sum_estimated_profit" style="color:${getTextColorByProfit(summary.estimatedProfit, estMargin)};">${summary.estimatedProfit.toLocaleString()}</td>
        <td id="sum_estimated_margin" style="color:${getTextColorByProfit(summary.estimatedProfit, estMargin)};">${estMargin.toFixed(3)}%</td>

    <td class="vat-col-include">${summary.realCostShareInclude.toLocaleString()}</td>
        <td id="sum_realCostShare" class="vat-col-exclude">${summary.realCostShareExclude.toLocaleString()}</td>
        <td id="sum_AC_money">${summary.acMoney.toLocaleString()}</td>
        <td id="sum_actual_labor">${summary.actualLabor.toLocaleString()}</td>
        <td id="sum_actual_expense">${summary.actualExpense.toLocaleString()}</td>
        <td id="sum_actual_other">${summary.actualOther.toLocaleString()}</td>
        <td id="sum_actual_performance">${summary.actualPerformance.toLocaleString()}</td>
        <td id="sum_actual_profit" style="color:${getTextColorByProfit(summary.actualProfit, actMargin)};">${summary.actualProfit.toLocaleString()}</td>
        <td id="sum_actual_margin" style="color:${getTextColorByProfit(summary.actualProfit, actMargin)};">${actMargin.toFixed(3)}%</td>

        <!--합계 행 수령내역 (기성금 1차/2차 분리, 색상 적용) -->
    <td style="color: ${totalHasCurrentYearAdvance ? 'red' : 'black'}; font-weight: bold;" id="sum_advanceTotal">${summary.advanceTotal.toLocaleString()}</td>
        <td style="color: black; font-weight: bold;" id="sum_progress1stTotal">${summary.progress1stTotal.toLocaleString()}</td>      <!-- 1차 기성금 합계 -->
        <td style="color: ${summary.progress2ndTotal > 0 ? 'red' : 'black'}; font-weight: bold;" id="sum_progress2ndTotal">${summary.progress2ndTotal.toLocaleString()}</td>  <!--2차 기성금 합계 (0이면 검은색, 0 초과면 빨간색) -->
    <td style="color: ${totalHasCurrentYearCompletion ? 'red' : 'black'}; font-weight: bold;" id="sum_completionTotal">${summary.completionTotal.toLocaleString()}</td>
    <td id="sum_outsourcing_paid" style="color: ${totalHasCurrentYearOutsourcingPaid ? 'red' : 'black'}; font-weight: bold; border-left:3px solid #999;">${summary.outsourcingPaid.toLocaleString()}</td>
    <td id="sum_outsourcing_balance" style="color: ${totalHasCurrentYearOutsourcingPaid ? 'red' : 'black'}; font-weight: bold;">${summary.outsourcingBalance.toLocaleString()}</td>
    `;

    table.appendChild(totalRow);
    const statsSummary = buildSummary(list, { mode: vatMode });
    renderAnnualMoneyStats(statsSummary);

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
        if (!mode && a && ['complete', 'stop', 'progress', 'money', 'year'].includes(a)) {
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
            else if (txt.includes('사업비 수령내역')) mode = 'money';
        }
    }

    // 4) 최종 기본값 보정
    if (!mode) mode = 'annual';
    if (mode === 'year') mode = 'annual';

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
        case 'money':
            return `${y}사업비 수령내역 모아보기`;
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
