document.addEventListener("DOMContentLoaded", function () {
    cal_annualProject();
    initAnnualMoneyStatsPanel();
    initAnnualMoneyQuarterFilter();
    initVatModeControls();
    initAnnualMoneyAnchorNavigation();
});


const processedProjects = [];  // 전역 저장소
const annualMoneyValidationGreenFamilyKeys = new Set();
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
    receivedBeforeTotal: 0,
    advanceTotal: 0,
    progressTotal: 0,
    completionTotal: 0,
    receiptBalance: 0,
    outsourcing_paid_previous: 0
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

function isTotalContractCode(contractCode) {
    return /-00$/.test(String(contractCode || '').trim());
}

function isAnnualMoneyProgressProject(project) {
    const status = String(project?.project_status || '').trim();
    return !status || status === '진행중';
}

function getProjectNameFamilyKey(projectName) {
    let name = String(projectName || '').trim().replace(/\s+/g, ' ');
    const suffixPattern = /^총괄$|^\d+차분$|^장기\d+차$|^연차\d+차$|^\d+차$/;

    while (true) {
        const match = name.match(/^(.*)\(([^()]*)\)\s*$/);
        if (!match) break;

        const [, baseName, suffix] = match;
        if (!suffixPattern.test(String(suffix || '').trim())) {
            break;
        }
        name = String(baseName || '').trim();
    }

    return name;
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
        renderAnnualProjectTable(getFilteredProjectsByQuarter(processedProjects));
    };

    includeInput.addEventListener('change', () => applyMode(includeInput.checked ? 'include' : 'exclude'));
    excludeInput.addEventListener('change', () => applyMode(excludeInput.checked ? 'exclude' : 'include'));

    applyMode('exclude');
}

function initAnnualMoneyAnchorNavigation() {
    const links = Array.from(document.querySelectorAll('.annual-money-anchor-link[href^="#"]'));
    if (!links.length) return;

    const getStickyOffset = () => {
        const topbar = document.querySelector('header.annual-topbar');
        const stickyPanel = document.querySelector('.annual-money-top-sticky');
        const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
        const stickyHeight = stickyPanel ? stickyPanel.getBoundingClientRect().height : 0;
        return Math.ceil(topbarHeight + stickyHeight + 12);
    };

    links.forEach((link) => {
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href') || '';
            if (!href.startsWith('#')) return;

            const target = document.querySelector(href);
            if (!target) return;

            event.preventDefault();
            const offset = getStickyOffset();
            const targetTop = window.scrollY + target.getBoundingClientRect().top - offset;

            window.scrollTo({
                top: Math.max(0, targetTop),
                behavior: 'smooth'
            });

            if (window.history && typeof window.history.replaceState === 'function') {
                window.history.replaceState(null, '', href);
            }
        });
    });
}

function getQuarterSumBefore(quarterMap, quarter) {
    if (!quarter || quarter <= 1) return 0;
    let sum = 0;
    for (let q = 1; q < quarter; q++) {
        sum += Number(quarterMap?.[q] || 0);
    }
    return sum;
}

function getAnnualMoneyVatView(project, quarterOverride = null) {
    const include = vatMode === 'include';
    const q = quarterOverride || getQuarterNumberFromState();

    const projectCostInclude = toNumber(project.ProjectCost);
    const projectCostExclude = toNumber(project.ProjectCost_NoVAT);
    const shareInclude = toNumber(project.realCostShare_VAT);
    const shareExclude = toNumber(project.realCostShare);

    const baseAdvanceBefore = toNumber(project.advanceBeforeTotal);
    const baseProgressBefore = toNumber(project.progressBeforeTotal);
    const baseCompletionBefore = toNumber(project.completionBeforeTotal);
    const baseOutsourcingPaidPrevious = toNumber(project.outsourcing_paid_previous);

    const quarterAdvance = Number(project.quarterAdvance?.[q] || 0);
    const quarterProgress = Number(project.quarterProgress?.[q] || 0);
    const quarterCompletion = Number(project.quarterCompletion?.[q] || 0);
    const quarterPaid = Number(project.quarterPayment?.[q] || 0);

    const advanceCurrentRaw = q ? quarterAdvance : toNumber(project.advanceTotal);
    const progressCurrentRaw = q ? quarterProgress : toNumber(project.progressTotal);
    const completionRaw = q ? quarterCompletion : toNumber(project.completionTotal);

    const advanceBeforeRaw = q
        ? (baseAdvanceBefore + getQuarterSumBefore(project.quarterAdvance, q))
        : baseAdvanceBefore;
    const progressBeforeRaw = q
        ? (baseProgressBefore + getQuarterSumBefore(project.quarterProgress, q))
        : baseProgressBefore;
    const completionBeforeRaw = q
        ? (baseCompletionBefore + getQuarterSumBefore(project.quarterCompletion, q))
        : baseCompletionBefore;

    const paidBeforeRaw = q
        ? (baseOutsourcingPaidPrevious + getQuarterSumBefore(project.quarterPayment, q))
        : baseOutsourcingPaidPrevious;

    const paidRaw = q ? quarterPaid : toNumber(project.outsourcing_paid);

    const advanceBeforeTotal = include ? advanceBeforeRaw : toNoVat(advanceBeforeRaw);
    const progressBeforeTotal = include ? progressBeforeRaw : toNoVat(progressBeforeRaw);
    const completionBeforeTotal = include ? completionBeforeRaw : toNoVat(completionBeforeRaw);
    const advanceTotal = include ? advanceCurrentRaw : toNoVat(advanceCurrentRaw);
    const progressTotal = include ? progressCurrentRaw : toNoVat(progressCurrentRaw);
    const completionTotal = include ? completionRaw : toNoVat(completionRaw);

    const shareBase = include ? shareInclude : shareExclude;
    const receiptCumulative = advanceBeforeTotal + advanceTotal + progressBeforeTotal + progressTotal + completionBeforeTotal + completionTotal;
    const receiptBalance = shareBase - receiptCumulative;

    const outsourcingPaidPrevious = include
        ? toVat(paidBeforeRaw)
        : paidBeforeRaw;
    const outsourcingPaid = include
        ? toVat(paidRaw)
        : paidRaw;

    const outsourcingBalanceNoVat = q
        ? (toNumber(project.actual_other) - (paidBeforeRaw + paidRaw))
        : toNumber(project.outsourcing_balance);
    const outsourcingBalance = Math.abs(include
        ? toVat(outsourcingBalanceNoVat)
        : outsourcingBalanceNoVat);

    return {
        projectCostInclude,
        projectCostExclude,
        shareInclude,
        shareExclude,
        advanceBeforeTotal,
        progressBeforeTotal,
        advanceTotal,
        progressTotal,
        completionTotal,
        receiptBalance,
        outsourcingPaidPrevious,
        outsourcingPaid,
        outsourcingBalance,
    };
}

function cal_annualProject() {
    processedProjects.length = 0;

    const selectedYear = Number(window.selectedYear) || new Date().getFullYear();
    const getReceiptYear = (receipt) => {
        if (!receipt || !receipt.receipt_date) return null;
        const raw = String(receipt.receipt_date).trim();
        const match = raw.match(/^(\d{4})/);
        if (match) return Number(match[1]);
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.getFullYear();
    };

    const getReceiptMonth = (receipt) => {
        if (!receipt || !receipt.receipt_date) return null;
        const raw = String(receipt.receipt_date).trim();
        const match = raw.match(/^\d{4}-(\d{2})/);
        if (match) return Number(match[1]);
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.getMonth() + 1;
    };

    const amountOf = (receipt) => Number(receipt?.amount || 0);
    const quarterByMonth = (month) => {
        const m = Number(month || 0);
        if (m >= 1 && m <= 3) return 1;
        if (m >= 4 && m <= 6) return 2;
        if (m >= 7 && m <= 9) return 3;
        if (m >= 10 && m <= 12) return 4;
        return 0;
    };

    const sourceProjects = Array.isArray(projects) ? projects : [];
    const displayProjects = sourceProjects.filter(project => isAnnualMoneyVisibleProject(project, selectedYear));



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
        receivedBeforeTotal: 0,
        advanceTotal: 0,
        progressTotal: 0,
        completionTotal: 0,
        receiptBalance: 0,
        outsourcing_paid_previous: 0
    };

    // 빨간색 표시는 선택 연도 수령분만 적용
    const currentYear = selectedYear;

    displayProjects.forEach(project => {
        const allReceipts = Array.isArray(project.receipt_details) ? project.receipt_details : [];
        const paymentDetails = Array.isArray(project.outsourcing_payment_details)
            ? project.outsourcing_payment_details
            : [];
        const previousReceipts = allReceipts.filter(receipt => {
            const y = getReceiptYear(receipt);
            return y !== null && y < selectedYear;
        });
        const yearReceipts = allReceipts.filter(receipt => getReceiptYear(receipt) === selectedYear);

        const quarterAdvance = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const quarterProgress = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const quarterCompletion = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const quarterReceiptTotal = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const quarterPayment = { 1: 0, 2: 0, 3: 0, 4: 0 };

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

        // 사업비 수령내역: 조회년도 이전 누적(기수령)
        const receivedBeforeTotal = previousReceipts.reduce((sum, receipt) => sum + amountOf(receipt), 0);
        const advanceBeforeTotal = previousReceipts
            .filter(receipt => String(receipt.division || '').includes('선금'))
            .reduce((sum, receipt) => sum + amountOf(receipt), 0);
        const progressBeforeTotal = previousReceipts
            .filter(receipt => String(receipt.division || '').includes('기성'))
            .reduce((sum, receipt) => sum + amountOf(receipt), 0);
        const completionBeforeTotal = previousReceipts
            .filter(receipt => String(receipt.division || '').includes('준공'))
            .reduce((sum, receipt) => sum + amountOf(receipt), 0);

        //사업비 수령내역 - 선금 (연도별 색상 적용)
        const advanceReceipts = yearReceipts.filter(receipt => String(receipt.division || '').includes('선금'));
        const advanceTotal = advanceReceipts.reduce((sum, receipt) => sum + amountOf(receipt), 0);
        const hasCurrentYearAdvance = advanceTotal > 0;

        // 사업비 수령내역 - 기성금(조회년도 전체)
        const progressReceipts = yearReceipts.filter(receipt => String(receipt.division || '').includes('기성'));
        const progressTotal = progressReceipts.reduce((sum, receipt) => sum + amountOf(receipt), 0);
        const hasCurrentYearProgress = progressTotal > 0;

        //사업비 수령내역 - 준공금 (연도별 색상 적용)
        const completionReceipts = yearReceipts.filter(receipt => String(receipt.division || '').includes('준공'));
        const completionTotal = completionReceipts.reduce((sum, receipt) => sum + amountOf(receipt), 0);
        const hasCurrentYearCompletion = completionTotal > 0;

        yearReceipts.forEach((receipt) => {
            const q = quarterByMonth(getReceiptMonth(receipt));
            if (!q) return;
            const amt = amountOf(receipt);
            const division = String(receipt.division || '');
            if (division.includes('선금')) quarterAdvance[q] += amt;
            else if (division.includes('기성')) quarterProgress[q] += amt;
            else if (division.includes('준공')) quarterCompletion[q] += amt;
            quarterReceiptTotal[q] += amt;
        });

        paymentDetails.forEach((payment) => {
            const rawDate = String(payment.payment_date || '').trim();
            const m = rawDate.match(/^\d{4}-(\d{2})/);
            if (!m) return;
            const q = quarterByMonth(Number(m[1]));
            if (!q) return;
            quarterPayment[q] += Number(payment.amount || 0);
        });

        const receiptCumulative = receivedBeforeTotal + advanceTotal + progressTotal + completionTotal;
        const receiptBalance = contractCostShare - receiptCumulative;


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
        total.receivedBeforeTotal += receivedBeforeTotal;
        total.advanceTotal += advanceTotal;
        total.progressTotal += progressTotal;
        total.completionTotal += completionTotal;
        total.receiptBalance += receiptBalance;
        // 외주비 지급/잔금 합계 (잔금 = 실제진행비의 외주경비 - 지급금액; 단, 화면 표시는 양수값)
        const paidPrevious = Number(project.outsourcing_paid_previous || 0);
        const paid = Number(project.outsourcing_paid || 0); // Cost_NoVAT 합계(해당 연도)
        const rawBalance = Number.isFinite(Number(project.outsourcing_balance))
            ? Number(project.outsourcing_balance)
            : (Number(project.actual_other || 0) - paid);
        const balance = Math.abs(rawBalance) <= 1 ? 0 : rawBalance;
        total.outsourcing_paid_previous = (total.outsourcing_paid_previous || 0) + paidPrevious;
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

            //수령내역
            receivedBeforeTotal,
            advanceBeforeTotal,
            progressBeforeTotal,
            completionBeforeTotal,
            advanceTotal,
            progressTotal,
            completionTotal,
            receiptBalance,
            quarterAdvance,
            quarterProgress,
            quarterCompletion,
            quarterReceiptTotal,
            quarterPayment,

            //현재 연도 수령내역 여부
            hasCurrentYearAdvance,
            hasCurrentYearProgress,
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
            outsourcing_paid_previous: paidPrevious,
            outsourcing_paid: paid,
            outsourcing_balance: Math.abs(balance) // 화면 표시는 양수
        });
        if (project.ContractCode === '24-용역-004-03') {
            console.log(processedProjects)
        }
    });
    renderAnnualProjectTable(getFilteredProjectsByQuarter(processedProjects));

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

function renderAnnualMoneyStats(summary, list = [], precomputedSections = null) {
    const safe = summary || {
        receivedBeforeTotal: 0,
        advanceBeforeTotal: 0,
        progressBeforeTotal: 0,
        advanceTotal: 0,
        progressTotal: 0,
        completionTotal: 0,
        receiptBalance: 0,
        outsourcingPaidPrevious: 0,
        outsourcingPaid: 0,
        outsourcingBalance: 0,
    };
    const year = Number(window.selectedYear) || new Date().getFullYear();
    const advanceTotal = Number(safe.advanceTotal || 0);
    const progressTotal = Number(safe.progressTotal || 0);
    const completionTotal = Number(safe.completionTotal || 0);
    const receiptBalance = Number(safe.receiptBalance || 0);
    const receiptTotal = advanceTotal + progressTotal + completionTotal;
    const receivedBeforeTotal = Number(
        safe.receivedBeforeTotal
        || (Number(safe.advanceBeforeTotal || 0) + Number(safe.progressBeforeTotal || 0))
        || 0
    );

    const outsourcingPaidPrevious = Number(safe.outsourcingPaidPrevious || 0);
    const outsourcingPaid = Number(safe.outsourcingPaid || 0);
    const outsourcingBalance = Number(safe.outsourcingBalance || 0);

    const yearLabels = document.querySelectorAll('.annual-money-year-label');
    yearLabels.forEach(el => {
        el.textContent = String(year);
    });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value;
    };

    const allWrap = document.getElementById('statsAllWrap');
    const quarterWrap = document.getElementById('statsQuarterWrap');
    const q = getQuarterNumberFromState();

    const moneyText = (value) => `${Math.round(value).toLocaleString()}`;
    if (!q) {
        if (allWrap) allWrap.style.display = 'block';
        if (quarterWrap) quarterWrap.style.display = 'none';

        const sections = precomputedSections || splitAnnualMoneySections(Array.isArray(list) ? list : []);
        const balanceBuckets = buildAnnualMoneyStatsBuckets(sections);

        const quarterReceiptTotals = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const quarterPayTotals = { 1: 0, 2: 0, 3: 0, 4: 0 };
        (Array.isArray(list) ? list : []).forEach((project) => {
            for (let qi = 1; qi <= 4; qi++) {
                const v = getAnnualMoneyVatView(project, qi);
                quarterReceiptTotals[qi] += (v.advanceTotal + v.progressTotal + v.completionTotal);
                quarterPayTotals[qi] += v.outsourcingPaid;
            }
        });

        const allPayTotal = quarterPayTotals[1] + quarterPayTotals[2] + quarterPayTotals[3] + quarterPayTotals[4];
        const allReceiptTotal = quarterReceiptTotals[1] + quarterReceiptTotals[2] + quarterReceiptTotals[3] + quarterReceiptTotals[4];

        setText('statsAllAdvanceTotal', moneyText(advanceTotal));
        setText('statsAllProgressTotal', moneyText(progressTotal));
        setText('statsAllCompletionTotal', moneyText(completionTotal));
        setText('statsAllReceivedBeforeTotal', moneyText(receivedBeforeTotal));
        setText('statsAllPayPrevious', moneyText(outsourcingPaidPrevious));
        setText('statsAllReceiptTotal', moneyText(allReceiptTotal));
        setText('statsAllPayGrandTotal', moneyText(allPayTotal));
        setText('statsAllReceiptBalanceCurrent', moneyText(balanceBuckets.current.receiptBalance));
        setText('statsAllReceiptBalanceLong', moneyText(balanceBuckets.long.receiptBalance));
        setText('statsAllReceiptBalanceStop', moneyText(balanceBuckets.stop.receiptBalance));
        setText('statsAllPayBalanceCurrent', moneyText(balanceBuckets.current.outsourcingBalance));
        setText('statsAllPayBalanceLong', moneyText(balanceBuckets.long.outsourcingBalance));
        setText('statsAllPayBalanceStop', moneyText(balanceBuckets.stop.outsourcingBalance));

        setText('statsAllReceiptQ1', moneyText(quarterReceiptTotals[1]));
        setText('statsAllReceiptQ2', moneyText(quarterReceiptTotals[2]));
        setText('statsAllReceiptQ3', moneyText(quarterReceiptTotals[3]));
        setText('statsAllReceiptQ4', moneyText(quarterReceiptTotals[4]));

        setText('statsAllPayQ1', moneyText(quarterPayTotals[1]));
        setText('statsAllPayQ2', moneyText(quarterPayTotals[2]));
        setText('statsAllPayQ3', moneyText(quarterPayTotals[3]));
        setText('statsAllPayQ4', moneyText(quarterPayTotals[4]));

        renderAnnualMoneyReceiptPieGraph({
            advanceTotal,
            progressTotal,
            completionTotal,
        });
        renderAnnualMoneyComparePieGraph({
            receiptTotal: allReceiptTotal,
            payTotal: allPayTotal,
        });
        return;
    }

    if (allWrap) allWrap.style.display = 'none';
    if (quarterWrap) quarterWrap.style.display = 'block';

    setText('statsQuarterLabel', `${q}분기`);
    setText('statsQuarterLabelPay', `${q}분기`);
    setText('statsQAdvance', moneyText(advanceTotal));
    setText('statsQProgress', moneyText(progressTotal));
    setText('statsQCompletion', moneyText(completionTotal));
    setText('statsQReceiptTotal', moneyText(receiptTotal));
    setText('statsQReceiptBalance', moneyText(receiptBalance));
    setText('statsQPay', moneyText(outsourcingPaid));
    setText('statsQPayBalance', moneyText(outsourcingBalance));
}

function renderAnnualMoneyReceiptPieGraph({ advanceTotal, progressTotal, completionTotal }) {
    const host = document.getElementById('statsReceiptPieGraph');
    if (!host) return;

    const parts = [
        { label: '선금', value: Math.max(Number(advanceTotal || 0), 0), color: '#f59e0b' },
        { label: '기성금', value: Math.max(Number(progressTotal || 0), 0), color: '#3b82f6' },
        { label: '준공금', value: Math.max(Number(completionTotal || 0), 0), color: '#22c55e' },
    ];
    const total = parts.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) {
        host.innerHTML = '<div class="annual-money-empty-graph">표시할 데이터가 없습니다.</div>';
        return;
    }

    const p1 = (parts[0].value / total) * 100;
    const p2 = (parts[1].value / total) * 100;
    const stop1 = p1;
    const stop2 = p1 + p2;
    const bg = `conic-gradient(${parts[0].color} 0 ${stop1}%, ${parts[1].color} ${stop1}% ${stop2}%, ${parts[2].color} ${stop2}% 100%)`;

    const rows = parts.map((item) => {
        const ratio = total > 0 ? ((item.value / total) * 100) : 0;
        return `
            <div class="annual-money-pie-legend-row">
                <span class="annual-money-pie-legend-dot" style="background:${item.color};"></span>
                <span class="annual-money-pie-legend-label">${item.label}</span>
                <span class="annual-money-pie-legend-value">${ratio.toFixed(1)}%</span>
            </div>
        `;
    }).join('');

    host.innerHTML = `
        <div class="annual-money-pie-block">
            <div class="annual-money-pie" style="background:${bg};">
                <span class="annual-money-pie-text">${Math.round(total).toLocaleString()}</span>
            </div>
            <div class="annual-money-pie-legend" aria-label="사업비 수령내역 비율 범례">
                ${rows}
            </div>
        </div>
    `;
}

function renderAnnualMoneyComparePieGraph({ receiptTotal, payTotal }) {
    const host = document.getElementById('statsComparePieGraph');
    if (!host) return;

    const receipt = Math.max(Number(receiptTotal || 0), 0);
    const pay = Math.max(Number(payTotal || 0), 0);
    const total = receipt + pay;
    if (total <= 0) {
        host.innerHTML = '<div class="annual-money-empty-graph">표시할 데이터가 없습니다.</div>';
        return;
    }

    const receiptRatio = (receipt / total) * 100;
    const bg = `conic-gradient(#3b82f6 0 ${receiptRatio}%, #ef4444 ${receiptRatio}% 100%)`;

    host.innerHTML = `
        <div class="annual-money-pie-block">
            <div class="annual-money-pie" style="background:${bg};">
                <span class="annual-money-pie-text">${receiptRatio.toFixed(1)}%</span>
            </div>
            <div class="annual-money-pie-legend" aria-label="사업비 수령-외주비 지급 비교 범례">
                <div class="annual-money-pie-legend-row">
                    <span class="annual-money-pie-legend-dot" style="background:#3b82f6;"></span>
                    <span class="annual-money-pie-legend-label">사업비 수령내역</span>
                    <span class="annual-money-pie-legend-value">${Math.round(receipt).toLocaleString()}</span>
                </div>
                <div class="annual-money-pie-legend-row">
                    <span class="annual-money-pie-legend-dot" style="background:#ef4444;"></span>
                    <span class="annual-money-pie-legend-label">외주비 지급내역</span>
                    <span class="annual-money-pie-legend-value">${Math.round(pay).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}

function aggregateAnnualMoneyDisplaySummary(list = []) {
    const source = Array.isArray(list) ? list : [];
    return source.reduce((acc, project) => {
        const v = getAnnualMoneyVatView(project);
        acc.ProjectCost += v.projectCostInclude;
        acc.ProjectCost_NoVAT += v.projectCostExclude;
        acc.realCostShare_VAT += v.shareInclude;
        acc.realCostShare += v.shareExclude;
        acc.receivedBeforeTotal += Number(project.receivedBeforeTotal || 0);
        acc.advanceBeforeTotal += v.advanceBeforeTotal;
        acc.progressBeforeTotal += v.progressBeforeTotal;
        acc.advanceTotal += v.advanceTotal;
        acc.progressTotal += v.progressTotal;
        acc.completionTotal += v.completionTotal;
        acc.receiptBalance += v.receiptBalance;
        acc.outsourcingPaidPrevious += v.outsourcingPaidPrevious;
        acc.outsourcingPaid += v.outsourcingPaid;
        acc.outsourcingBalance += v.outsourcingBalance;
        return acc;
    }, {
        ProjectCost: 0,
        ProjectCost_NoVAT: 0,
        realCostShare_VAT: 0,
        realCostShare: 0,
        receivedBeforeTotal: 0,
        advanceBeforeTotal: 0,
        progressBeforeTotal: 0,
        advanceTotal: 0,
        progressTotal: 0,
        completionTotal: 0,
        receiptBalance: 0,
        outsourcingPaidPrevious: 0,
        outsourcingPaid: 0,
        outsourcingBalance: 0,
    });
}

function aggregateAnnualMoneySummary(list = []) {
    const source = Array.isArray(list) ? list : [];
    return source.reduce((acc, project) => {
        acc.ProjectCost += Number(project.ProjectCost || 0);
        acc.ProjectCost_NoVAT += Number(project.ProjectCost_NoVAT || 0);
        acc.contractCostShare += Number(project.contractCostShare || 0);
        acc.contractCostShareVAT += Number(project.contractCostShareVAT || 0);
        acc.EX_money += Number(project.EX_company_money || 0);
        acc.estimated_labor += Number(project.estimated_labor || 0);
        acc.estimated_expense += Number(project.estimated_expense || 0);
        acc.estimated_other += Number(project.estimated_other || 0);
        acc.estimated_performance += Number(project.estimated_performance || 0);
        acc.estimated_profit += Number(project.estimated_profit || 0);
        acc.realCostShare_VAT += Number(project.realCostShare_VAT || 0);
        acc.realCostShare += Number(project.realCostShare || 0);
        acc.AC_money += Number(project.AC_company_money || 0);
        acc.actual_labor += Number(project.actual_labor || 0);
        acc.actual_expense += Number(project.actual_expense || 0);
        acc.actual_other += Number(project.actual_other || 0);
        acc.actual_performance += Number(project.actual_performance || 0);
        acc.actual_profit += Number(project.actual_profit || 0);
        acc.receivedBeforeTotal += Number(project.receivedBeforeTotal || 0);
        acc.advanceTotal += Number(project.advanceTotal || 0);
        acc.progressTotal += Number(project.progressTotal || 0);
        acc.completionTotal += Number(project.completionTotal || 0);
        acc.receiptBalance += Number(project.receiptBalance || 0);
        acc.outsourcing_paid_previous += Number(project.outsourcing_paid_previous || 0);
        acc.outsourcing_paid += Number(project.outsourcing_paid || 0);
        acc.outsourcing_balance += Number(project.outsourcing_balance || 0);
        return acc;
    }, {
        ProjectCost: 0,
        ProjectCost_NoVAT: 0,
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
        receivedBeforeTotal: 0,
        advanceTotal: 0,
        progressTotal: 0,
        completionTotal: 0,
        receiptBalance: 0,
        outsourcing_paid_previous: 0,
        outsourcing_paid: 0,
        outsourcing_balance: 0,
    });
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
    refreshAnnualMoneyValidationGreenFamilyKeys(processedProjects);
    const list = applySort(dataList);
    const sections = splitAnnualMoneySections(list);
    const statsSourceList = [
        ...sections.currentEvent,
        ...sections.longTerm,
        ...sections.stop,
    ];
    const summary = aggregateAnnualMoneyDisplaySummary(statsSourceList);

    renderAnnualMoneySectionTable('annualMoneyCurrentSection', sections.currentEvent, {
        countId: 'annualMoneyCurrentCount',
        emptyMessage: '당해년도 준공예정 또는 이벤트 발생 사업이 없습니다.'
    });
    renderAnnualMoneySectionTable('annualMoneyLongSection', sections.longTerm, {
        countId: 'annualMoneyLongCount',
        emptyMessage: '장기사업으로 분류된 대상이 없습니다.'
    });
    renderAnnualMoneySectionTable('annualMoneyStopSection', sections.stop, {
        countId: 'annualMoneyStopCount',
        emptyMessage: '용역중지 사업이 없습니다.'
    });
    renderAnnualMoneySectionTable('annualMoneyTotalSection', sections.total, {
        countId: 'annualMoneyTotalCount',
        emptyMessage: '표시할 사업이 없습니다.'
    });

    renderAnnualMoneyStats(summary, statsSourceList, sections);
}

function getYearFromDateValue(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})/);
    if (match) return Number(match[1]);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getFullYear();
}

function isAnnualMoneyStopProject(project) {
    return String(project?.project_status || '').trim() === '용역중지';
}

function hasAnnualMoneyEvent(project) {
    return Boolean(project?.has_risk);
}

function isAnnualMoneyCurrentEventProject(project, selectedYear) {
    if (isAnnualMoneyStopProject(project) || isTotalContractCode(project?.ContractCode)) return false;
    const endYear = getYearFromDateValue(project?.EndDate);
    return endYear === selectedYear || hasAnnualMoneyEvent(project);
}

function isAnnualMoneyLongTermProject(project, selectedYear) {
    if (isAnnualMoneyStopProject(project) || isTotalContractCode(project?.ContractCode)) return false;
    const endYear = getYearFromDateValue(project?.EndDate);
    return endYear !== null && endYear > selectedYear;
}

function isAnnualMoneyLongTermMarkedProject(project, selectedYear) {
    if (isAnnualMoneyStopProject(project) || isTotalContractCode(project?.ContractCode)) return false;
    const startYear = getYearFromDateValue(project?.StartDate);
    const endYear = getYearFromDateValue(project?.EndDate);
    if (endYear !== null && endYear > selectedYear) {
        return true;
    }
    return startYear !== null && endYear !== null && startYear < selectedYear && endYear >= selectedYear;
}

function refreshAnnualMoneyValidationGreenFamilyKeys(list = []) {
    annualMoneyValidationGreenFamilyKeys.clear();

    (Array.isArray(list) ? list : [])
        .filter(project => isTotalContractCode(project?.ContractCode))
        .forEach((project) => {
            const familyKey = getProjectNameFamilyKey(project?.ProjectName);
            if (familyKey) {
                annualMoneyValidationGreenFamilyKeys.add(familyKey);
            }
        });
}

function isAnnualMoneyValidationGreenProject(project) {
    if (!project) return false;
    if (isTotalContractCode(project?.ContractCode)) {
        return true;
    }
    const familyKey = getProjectNameFamilyKey(project?.ProjectName);
    return Boolean(familyKey) && annualMoneyValidationGreenFamilyKeys.has(familyKey);
}

function isAnnualMoneyVisibleProject(project, selectedYear) {
    if (!project) return false;
    if (isTotalContractCode(project?.ContractCode)) {
        return isAnnualMoneyProgressProject(project);
    }
    if (isAnnualMoneyStopProject(project)) {
        return true;
    }
    if (isAnnualMoneyCurrentEventProject(project, selectedYear)) {
        return true;
    }
    if (isAnnualMoneyLongTermProject(project, selectedYear)) {
        return true;
    }
    return false;
}

function splitAnnualMoneySections(list = []) {
    const selectedYear = Number(window.selectedYear) || new Date().getFullYear();
    const sections = {
        currentEvent: [],
        longTerm: [],
        stop: [],
        total: [],
    };

    (Array.isArray(list) ? list : []).forEach((project) => {
        if (isTotalContractCode(project?.ContractCode)) {
            if (isAnnualMoneyProgressProject(project)) {
                sections.total.push(project);
            }
            return;
        }

        if (isAnnualMoneyStopProject(project)) {
            sections.stop.push(project);
            return;
        }

        if (isAnnualMoneyCurrentEventProject(project, selectedYear)) {
            sections.currentEvent.push(project);
            return;
        }

        if (isAnnualMoneyLongTermProject(project, selectedYear)) {
            sections.longTerm.push(project);
        }
    });

    return sections;
}

function summarizeBalanceOnly(list = []) {
    return (Array.isArray(list) ? list : []).reduce((acc, project) => {
        const vatView = getAnnualMoneyVatView(project);
        acc.receiptBalance += vatView.receiptBalance;
        acc.outsourcingBalance += vatView.outsourcingBalance;
        return acc;
    }, {
        receiptBalance: 0,
        outsourcingBalance: 0,
    });
}

function buildFamilyBalanceMap(list = []) {
    const receiptMap = new Map();
    const payMap = new Map();

    (Array.isArray(list) ? list : []).forEach((project) => {
        const familyKey = getProjectNameFamilyKey(project?.ProjectName);
        const vatView = getAnnualMoneyVatView(project);
        receiptMap.set(familyKey, (receiptMap.get(familyKey) || 0) + vatView.receiptBalance);
        payMap.set(familyKey, (payMap.get(familyKey) || 0) + vatView.outsourcingBalance);
    });

    return { receiptMap, payMap };
}

function buildProgressingAnnualFamilyBalanceMap(list = []) {
    const receiptMap = new Map();
    const payMap = new Map();

    (Array.isArray(list) ? list : [])
        .filter(project => !isTotalContractCode(project?.ContractCode))
        .filter(project => Number(project?.yearProject || 0) === 1)
        .filter(project => isAnnualMoneyProgressProject(project))
        .forEach((project) => {
            const familyKey = getProjectNameFamilyKey(project?.ProjectName);
            const vatView = getAnnualMoneyVatView(project);
            receiptMap.set(familyKey, (receiptMap.get(familyKey) || 0) + vatView.receiptBalance);
            payMap.set(familyKey, (payMap.get(familyKey) || 0) + vatView.outsourcingBalance);
        });

    return { receiptMap, payMap };
}

function summarizeLongTermBalance(sections) {
    const longBase = summarizeBalanceOnly(sections.longTerm);
    const progressingAnnuals = buildProgressingAnnualFamilyBalanceMap([
        ...(Array.isArray(sections.currentEvent) ? sections.currentEvent : []),
        ...(Array.isArray(sections.longTerm) ? sections.longTerm : []),
    ]);

    (Array.isArray(sections.total) ? sections.total : []).forEach((project) => {
        const familyKey = getProjectNameFamilyKey(project?.ProjectName);
        const vatView = getAnnualMoneyVatView(project);
        longBase.receiptBalance += vatView.receiptBalance - (progressingAnnuals.receiptMap.get(familyKey) || 0);
        longBase.outsourcingBalance += vatView.outsourcingBalance - (progressingAnnuals.payMap.get(familyKey) || 0);
    });

    return longBase;
}

function buildAnnualMoneyStatsBuckets(sections) {
    return {
        current: summarizeBalanceOnly(sections.currentEvent),
        long: summarizeLongTermBalance(sections),
        stop: summarizeBalanceOnly(sections.stop),
    };
}

function buildAnnualMoneyTableHead() {
    return `
        <thead>
            <tr>
                <th colspan="11" class="group-end">구분</th>
                <th colspan="6" class="group-end">수령내역</th>
                <th colspan="3" class="group-end">외주비 지급내역</th>
            </tr>
            <tr>
                <th class="sticky-col-3" rowspan="2">No.</th>
                <th class="sticky-col" rowspan="2" onclick="sortBy('ContractCode','string')" style="cursor:pointer;">사업번호</th>
                <th class="sticky-col-2" onclick="sortBy('ProjectName','string')" style="cursor:pointer;" rowspan="2">사업명</th>
                <th rowspan="2" onclick="sortBy('orderPlace','string')" style="cursor:pointer;">발주처</th>
                <th rowspan="2" onclick="sortBy('StartDate','date')" style="cursor:pointer;">계약일자</th>
                <th rowspan="2" onclick="sortBy('EndDate','date')" style="cursor:pointer;">준공일자</th>
                <th class="vat-col-include" rowspan="2" onclick="sortBy('ProjectCost','number')" style="cursor:pointer;">사업비(총괄,VAT포함)</th>
                <th class="vat-col-exclude" rowspan="2" onclick="sortBy('ProjectCost_NoVAT','number')" style="cursor:pointer;">사업비(총괄,VAT제외)</th>
                <th rowspan="2" onclick="sortBy('ContributionRate','number')" style="cursor:pointer;">지분율</th>
                <th class="vat-col-include" rowspan="2" onclick="sortBy('realCostShare_VAT','number')" style="cursor:pointer;">사업비(지분,VAT포함)</th>
                <th class="vat-col-exclude group-end" rowspan="2" onclick="sortBy('realCostShare','number')" style="cursor:pointer;">사업비(지분,VAT제외)</th>
                <th colspan="2">선금</th>
                <th colspan="2">기성금</th>
                <th rowspan="2" onclick="sortBy('completionTotal','number')" style="cursor:pointer;">준공금</th>
                <th class="group-end" rowspan="2" onclick="sortBy('receiptBalance','number')" style="cursor:pointer;">잔금</th>
                <th rowspan="2" onclick="sortBy('outsourcing_paid_previous','number')" style="cursor:pointer;">기지급</th>
                <th rowspan="2" onclick="sortBy('outsourcing_paid','number')" style="cursor:pointer;">당해년도</th>
                <th class="group-end" rowspan="2" onclick="sortBy('outsourcing_balance','number')" style="cursor:pointer;">잔금</th>
            </tr>
            <tr>
                <th onclick="sortBy('advanceBeforeTotal','number')" style="cursor:pointer;">기수령</th>
                <th onclick="sortBy('advanceTotal','number')" style="cursor:pointer;">당해년도</th>
                <th onclick="sortBy('progressBeforeTotal','number')" style="cursor:pointer;">기수령</th>
                <th onclick="sortBy('progressTotal','number')" style="cursor:pointer;">당해년도</th>
            </tr>
        </thead>
    `;
}

function renderAnnualMoneySectionTable(containerId, list, options = {}) {
    const host = document.getElementById(containerId);
    const countEl = options.countId ? document.getElementById(options.countId) : null;
    if (countEl) {
        countEl.textContent = `${(list || []).length.toLocaleString()}건`;
    }
    if (!host) return;
    if (!Array.isArray(list) || list.length === 0) {
        host.innerHTML = `<div class="annual-money-empty-section">${options.emptyMessage || '표시할 데이터가 없습니다.'}</div>`;
        return;
    }

    host.innerHTML = `
        <table class="custom-table no_wrap annual-money-data-table">
            ${buildAnnualMoneyTableHead()}
            <tbody>
                ${list.map((project, index) => buildAnnualMoneyProjectRow(project, index)).join('')}
                ${buildAnnualMoneySummaryRow(list)}
            </tbody>
        </table>
    `;
}

function buildAnnualMoneyProjectRow(project, index) {
    const vatView = getAnnualMoneyVatView(project);
    const selectedYear = Number(window.selectedYear) || new Date().getFullYear();
    const rowClasses = [];
    if (isAnnualMoneyValidationGreenProject(project)) {
        rowClasses.push('validation-green-row');
    }
    if (project.project_status && project.project_status.includes('준공')) {
        rowClasses.push('completed-row');
    } else if (project.project_status === '용역중지') {
        rowClasses.push('stop-row');
    }
    if (isAnnualMoneyLongTermMarkedProject(project, selectedYear)) {
        rowClasses.push('long-term-row');
    }

    const hasOutsourcing =
        Math.abs(Number(project.actual_other || 0)) > 0
        || Math.abs(Number(project.outsourcing_paid_previous || 0)) > 0
        || Math.abs(Number(project.outsourcing_paid || 0)) > 0
        || Math.abs(Number(project.outsourcing_balance || 0)) > 0
        || (Array.isArray(project.outsourcing_payment_details) && project.outsourcing_payment_details.length > 0);

    const outsourcingCellsHtml = hasOutsourcing
        ? `
            <td style="font-weight: ${vatView.outsourcingPaidPrevious > 0 ? 'bold' : 'normal'};">${vatView.outsourcingPaidPrevious.toLocaleString()}</td>
            <td style="color: ${vatView.outsourcingPaid > 0 ? 'red' : 'black'}; font-weight: ${vatView.outsourcingPaid > 0 ? 'bold' : 'normal'};">${vatView.outsourcingPaid.toLocaleString()}</td>
            <td class="group-end" style="font-weight: ${vatView.outsourcingBalance > 0 ? 'bold' : 'normal'};">${vatView.outsourcingBalance.toLocaleString()}</td>
        `
        : `
            <td colspan="3" class="group-end" style="text-align:center;">-</td>
        `;

    return `
        <tr class="${rowClasses.join(' ')}">
            <td class="sticky-col-3" style="text-align: center;">${index + 1}</td>
            <td class="sticky-col" style="text-align: left;"><a href="/project_detail/${project.projectID}" target="_top">${project.ContractCode}</a></td>
            <td class="sticky-col-2 annual-money-project-name" style="text-align: left;" data-full="${project.ProjectName}"><a href="/project_detail/${project.projectID}" target="_top">${truncateText(project.ProjectName)}</a></td>
            <td style="text-align: left;" title="${project.orderPlace ? project.orderPlace : ''}">${project.orderPlace ? truncateOrderPlace(project.orderPlace) : '-'}</td>
            <td>${formatDate(project.StartDate)}</td>
            <td>${formatDate(project.EndDate)}</td>
            <td class="vat-col-include">${vatView.projectCostInclude.toLocaleString()}</td>
            <td class="vat-col-exclude">${vatView.projectCostExclude.toLocaleString()}</td>
            <td>${Number(project.ContributionRate || 0).toLocaleString()}%</td>
            <td class="vat-col-include">${vatView.shareInclude.toLocaleString()}</td>
            <td class="vat-col-exclude group-end">${vatView.shareExclude.toLocaleString()}</td>
            <td style="font-weight: ${vatView.advanceBeforeTotal > 0 ? 'bold' : 'normal'};">${vatView.advanceBeforeTotal.toLocaleString()}</td>
            <td style="color: ${vatView.advanceTotal > 0 ? 'red' : 'black'}; font-weight: ${vatView.advanceTotal > 0 ? 'bold' : 'normal'};">${vatView.advanceTotal.toLocaleString()}</td>
            <td style="font-weight: ${vatView.progressBeforeTotal > 0 ? 'bold' : 'normal'};">${vatView.progressBeforeTotal.toLocaleString()}</td>
            <td style="color: ${vatView.progressTotal > 0 ? 'red' : 'black'}; font-weight: ${vatView.progressTotal > 0 ? 'bold' : 'normal'};">${vatView.progressTotal.toLocaleString()}</td>
            <td style="color: ${vatView.completionTotal > 0 ? 'red' : 'black'}; font-weight: ${vatView.completionTotal > 0 ? 'bold' : 'normal'};">${vatView.completionTotal.toLocaleString()}</td>
            <td class="group-end" style="font-weight: ${vatView.receiptBalance !== 0 ? 'bold' : 'normal'}; color: ${vatView.receiptBalance < 0 ? 'red' : 'black'};">${vatView.receiptBalance.toLocaleString()}</td>
            ${outsourcingCellsHtml}
        </tr>
    `;
}

function buildAnnualMoneySummaryRow(list) {
    const summary = aggregateAnnualMoneyDisplaySummary(list);
    const totalHasCurrentYearAdvance = list.some(project => getAnnualMoneyVatView(project).advanceTotal > 0);
    const totalHasCurrentYearProgress = list.some(project => getAnnualMoneyVatView(project).progressTotal > 0);
    const totalHasCurrentYearCompletion = list.some(project => getAnnualMoneyVatView(project).completionTotal > 0);
    const totalHasCurrentYearOutsourcingPaid = list.some(project => getAnnualMoneyVatView(project).outsourcingPaid > 0);

    return `
        <tr class="summary-row">
            <td colspan="6" style="text-align:center;">합계</td>
            <td class="vat-col-include">${summary.ProjectCost.toLocaleString()}</td>
            <td class="vat-col-exclude">${summary.ProjectCost_NoVAT.toLocaleString()}</td>
            <td>-</td>
            <td class="vat-col-include">${summary.realCostShare_VAT.toLocaleString()}</td>
            <td class="vat-col-exclude group-end">${summary.realCostShare.toLocaleString()}</td>
            <td style="font-weight: bold;">${summary.advanceBeforeTotal.toLocaleString()}</td>
            <td style="color: ${totalHasCurrentYearAdvance ? 'red' : 'black'}; font-weight: bold;">${summary.advanceTotal.toLocaleString()}</td>
            <td style="font-weight: bold;">${summary.progressBeforeTotal.toLocaleString()}</td>
            <td style="color: ${totalHasCurrentYearProgress ? 'red' : 'black'}; font-weight: bold;">${summary.progressTotal.toLocaleString()}</td>
            <td style="color: ${totalHasCurrentYearCompletion ? 'red' : 'black'}; font-weight: bold;">${summary.completionTotal.toLocaleString()}</td>
            <td class="group-end" style="font-weight: bold; color: ${Number(summary.receiptBalance || 0) < 0 ? 'red' : 'black'};">${Number(summary.receiptBalance || 0).toLocaleString()}</td>
            <td style="font-weight: bold;">${(summary.outsourcingPaidPrevious || 0).toLocaleString()}</td>
            <td style="color: ${totalHasCurrentYearOutsourcingPaid ? 'red' : 'black'}; font-weight: bold;">${(summary.outsourcingPaid || 0).toLocaleString()}</td>
            <td class="group-end" style="font-weight: bold;">${(summary.outsourcingBalance || 0).toLocaleString()}</td>
        </tr>
    `;
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

const ANNUAL_MONEY_QUARTER_FILTER_DISABLED = true;
let quarterFilterState = 'all';

function getQuarterNumberFromState(state = quarterFilterState) {
    if (ANNUAL_MONEY_QUARTER_FILTER_DISABLED) return 0;
    if (state === 'q1') return 1;
    if (state === 'q2') return 2;
    if (state === 'q3') return 3;
    if (state === 'q4') return 4;
    return 0;
}

function initAnnualMoneyQuarterFilter() {
    const quarterSelect = document.getElementById('annualMoneyQuarter');
    const quarterLabel = document.querySelector('label[for="annualMoneyQuarter"]');

    if (ANNUAL_MONEY_QUARTER_FILTER_DISABLED) {
        quarterFilterState = 'all';
        if (quarterLabel) quarterLabel.style.display = 'none';
        if (quarterSelect) {
            quarterSelect.value = 'all';
            quarterSelect.disabled = true;
            quarterSelect.style.display = 'none';
        }
        return;
    }

    if (!quarterSelect) return;
    quarterSelect.value = quarterFilterState;
    quarterSelect.addEventListener('change', function () {
        quarterFilterState = this.value || 'all';
        renderAnnualProjectTable(getFilteredProjectsByQuarter(processedProjects));
    });
}

function getFilteredProjectsByQuarter(sourceList = processedProjects) {
    const list = Array.isArray(sourceList) ? sourceList : [];
    const q = getQuarterNumberFromState();
    if (!q) return list;

    return list.filter(project => {
        const receipt = Number(project.quarterReceiptTotal?.[q] || 0);
        const pay = Number(project.quarterPayment?.[q] || 0);
        return receipt > 0 || pay > 0;
    });
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
    const el = typeof divId === 'string' ? document.getElementById(divId) : divId;
    if (!el) return;
    enableHorizontalDragScrollElement(el);
}

function enableHorizontalDragScrollElement(el) {
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
    let idx = parts.indexOf('PMS_annualMoney');
    if (idx === -1) idx = parts.indexOf('PMS_annualMoney_v2');
    if (idx === -1) idx = parts.indexOf('PMS_annualProject');
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
    let base = getFilteredProjectsByQuarter(processedProjects);
    renderAnnualProjectTable(base);
}

function applySort(list) {
    // 초기 화면 순서 복귀
    if (!currentSort.key || currentSort.dir === 'default') return applyInitialOrder(list);
    const arr = [...list];
    const { key, type, dir } = currentSort;
    arr.sort((a, b) => compareValues(getSortableValue(a, key), getSortableValue(b, key), type, dir));
    return arr;
}

function getSortableValue(project, key) {
    const v = getAnnualMoneyVatView(project);
    switch (key) {
        case 'advanceBeforeTotal':
            return v.advanceBeforeTotal;
        case 'advanceTotal':
            return v.advanceTotal;
        case 'progressBeforeTotal':
            return v.progressBeforeTotal;
        case 'progressTotal':
            return v.progressTotal;
        case 'completionTotal':
            return v.completionTotal;
        case 'receiptBalance':
            return v.receiptBalance;
        case 'outsourcing_paid_previous':
            return v.outsourcingPaidPrevious;
        case 'outsourcing_paid':
            return v.outsourcingPaid;
        case 'outsourcing_balance':
            return v.outsourcingBalance;
        default:
            return project[key];
    }
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
