document.addEventListener('DOMContentLoaded', async function () {
    try {

         // 저장 버튼 새로고침 여부 확인
        const isButtonReload = sessionStorage.getItem('isButtonReload');
        if (isButtonReload === 'true') {
            const savedTab = sessionStorage.getItem('activeTab');
            if (savedTab) {
                // onclick 이벤트 기반 탭 복원
                const tabButton = document.querySelector(`[onclick*="${savedTab}"]`);
                if (tabButton) tabButton.click();
                else {
                    // fallback: 직접 표시
                    document.querySelectorAll('.tabcontent').forEach(tab => tab.style.display = 'none');
                    const tabEl = document.getElementById(savedTab);
                    if (tabEl) tabEl.style.display = 'block';
                }
                console.log(`[INFO] 탭 복원 완료 → ${savedTab}`);
            }
            sessionStorage.removeItem('isButtonReload');
        }
        
        setupEvent();  // 이벤트 먼저 연결
        await loadLayoutFromServer(); // 상태 적용 (div 표시/숨김까지 완료)
        // examine, outsource 등 첫 번째 탭 강제로 열기
        const defaultMainTab = document.querySelector('.tablinks');
        if (defaultMainTab) defaultMainTab.click();
        calculateAllTotals();
        updateFeetable();
        out_updateFeetable();
        renderBudgetTable(firstBudget, secondBudget, 'budget_result_tbody');
        renderRecordTable(firstRecords, secondRecords, 'record_result_tbody');

        renderBudgetTable(out_first_Budget, out_second_Budget, 'out_budget_result_tbody');
        renderRecordTable(out_first_records, out_second_records, 'out_record_result_tbody');
        setupFileUploadListener();
        initFileUpload({
            dropZoneId: 'drop-zone',
            inputId: 'file-input',
            outputId: 'uploaded-files'
        });
        updateFileList();
    } catch (error) {
        console.error('[ERROR] Error during initialization:', error);
    }

    const sessionDep = document.getElementById('sessionDep').value;
    if (sessionDep === '공공사업부' || sessionDep === '개발') {
        document.getElementById('department_BTN').style.display = 'block';
    } else {
        document.getElementById('every_BTN').style.display = 'block';
    }

    setAddBTN(); // 초기 상태에 따라 +, - 버튼 설정
});

function setAddBTN() {
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

    if (secondRecords.length === 0) {
        document.getElementById('EXrecordsModal_sec').style.display = 'none';
        document.getElementById('sec_addRecordRow').style.visibility = 'visible';
        document.getElementById('sec_removeRecordRow').style.visibility = 'visible';
    } else {
        document.getElementById('sec_addRecordRow').style.visibility = 'hidden';
        document.getElementById('sec_removeRecordRow').style.visibility = 'hidden';
        document.getElementById('EXrecordsModal_sec').style.display = 'block';
    }

    if (out_first_records.length === 0) {
        document.getElementById('out_EXrecordsModal_fir').style.display = 'none';
        document.getElementById('out_addRecordRow').style.visibility = 'visible';
        document.getElementById('out_removeRecordRow').style.visibility = 'visible';
    }
    else {
        document.getElementById('out_addRecordRow').style.visibility = 'hidden';
        document.getElementById('out_removeRecordRow').style.visibility = 'hidden';
        document.getElementById('out_EXrecordsModal_fir').style.display = 'block';
    }

    if (out_second_records.length === 0) {
        document.getElementById('out_EXrecordsModal_sec').style.display = 'none';
        document.getElementById('out_addRecordRow_sec').style.visibility = 'visible';
        document.getElementById('out_removeRecordRow_sec').style.visibility = 'visible';
    }
    else {
        document.getElementById('out_addRecordRow_sec').style.visibility = 'hidden';
        document.getElementById('out_removeRecordRow_sec').style.visibility = 'hidden';
        document.getElementById('out_EXrecordsModal_sec').style.display = 'block';
    }
}


function setupEvent() {
    const projectName = document.getElementById('headerName').value;
    document.getElementById('projectName').textContent = truncateText(projectName, 30)
    const tablinks = document.querySelectorAll('.tablinks');

    document.querySelectorAll('.addRowBTN').forEach(button => {
        button.addEventListener('click', () => {
            const targetID = button.dataset.target;
            if (targetID) {
                addRows(targetID, 1);
            }
        });
    });

    // 이벤트 연결 예시
    document.querySelectorAll('.removeRowBTN').forEach(button => {
        button.addEventListener('click', () => {
            const targetID = button.dataset.target;
            if (targetID) {
                removeLastRow(targetID);
            }
        });
    });

    // 검토사항
    document.getElementById('addNoteRow')?.addEventListener('click', () => {
        addRows('note_tbody', 1);
    });

    document.getElementById('removeNoteRow')?.addEventListener('click', () => {
        removeLastRow('note_tbody');
    });

}

// 직영 검토 상태
const examineState = {
    activeLayouts: 2,
    firstActive: true,
    secondActive: true,
    firstDeptName: '',
    secondDeptName: ''
};

// 외주 검토 상태
const outsourceState = {
    activeLayouts: 2,
    firstActive: true,
    secondActive: true,
    firstDeptName: '',
    secondDeptName: ''
};

// 상태 보정 함수
function fixLayoutState(state, firstDivId, secondDivId) {
    const first = document.getElementById(firstDivId);
    const second = document.getElementById(secondDivId);

    state.firstActive = !!(first && first.classList.contains('div_active'));
    state.secondActive = !!(second && second.classList.contains('div_active'));
    state.activeLayouts = (state.firstActive ? 1 : 0) + (state.secondActive ? 1 : 0);
}

// 레이아웃 표시/숨김 적용 함수
function applyLayoutState() {
    // 직영
    const first = document.getElementById('Department_first');
    const second = document.getElementById('Department_second');
    const firstHeader = document.getElementById('Dep_fir_header_text');
    const secondHeader = document.getElementById('Dep_sec_header_text');

    if (first) {
        if (examineState.firstActive) {
            first.classList.add('div_active');
            first.style.display = 'block';
            if (firstHeader) firstHeader.textContent = examineState.firstDeptName;
        } else {
            first.classList.remove('div_active');
            first.style.display = 'none';
        }
    }

    if (second) {
        if (examineState.secondActive) {
            second.classList.add('div_active');
            second.style.display = 'block';
            if (secondHeader) secondHeader.textContent = examineState.secondDeptName;
        } else {
            second.classList.remove('div_active');
            second.style.display = 'none';
        }
    }

    // 외주
    const outFirst = document.getElementById('out_Department_first');
    const outSecond = document.getElementById('out_Department_second');
    const outFirstHeader = document.getElementById('out_Dep_fir_header_text');
    const outSecondHeader = document.getElementById('out_Dep_sec_header_text');

    if (outFirst) {
        if (outsourceState.firstActive) {
            outFirst.classList.add('div_active');
            outFirst.style.display = 'block';
            if (outFirstHeader) outFirstHeader.textContent = outsourceState.firstDeptName;
        } else {
            outFirst.classList.remove('div_active');
            outFirst.style.display = 'none';
        }
    }

    if (outSecond) {
        if (outsourceState.secondActive) {
            outSecond.classList.add('div_active');
            outSecond.style.display = 'block';
            if (outSecondHeader) outSecondHeader.textContent = outsourceState.secondDeptName;
        } else {
            outSecond.classList.remove('div_active');
            outSecond.style.display = 'none';
        }
    }

    // 상태 재보정
    fixLayoutState(examineState, 'Department_first', 'Department_second');
    fixLayoutState(outsourceState, 'out_Department_first', 'out_Department_second');
}

// 페이지 로드시 서버에서 레이아웃 상태 불러오기
async function loadLayoutFromServer() {
    const contractCode = document.getElementById('project-contractCode').value;

    try {
        const res = await fetch(`/get_layout_state/${contractCode}`);
        const data = await res.json();

        const examine = data.examine || {};
        const expenses = data.expenses || {};

        // 직영 상태 초기화
        examineState.firstActive = examine.first_layout_active === 1;
        examineState.secondActive = examine.second_layout_active === 1;
        examineState.firstDeptName = examine.first_dept || '';
        examineState.secondDeptName = examine.second_dept || '';
        examineState.activeLayouts = (examineState.firstActive ? 1 : 0) + (examineState.secondActive ? 1 : 0);

        // 외주 상태 초기화
        outsourceState.firstActive = expenses.first_layout_active === 1;
        outsourceState.secondActive = expenses.second_layout_active === 1;
        outsourceState.firstDeptName = expenses.first_dept || '';
        outsourceState.secondDeptName = expenses.second_dept || '';
        outsourceState.activeLayouts = (outsourceState.firstActive ? 1 : 0) + (outsourceState.secondActive ? 1 : 0);

        applyLayoutState(); // ← div 표시/숨김 적용
    } catch (error) {
        console.error('[ERROR] 레이아웃 초기화 실패:', error);
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

function openTab(evt, tabName) {
    let i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
}

function EX_openTab(evt, tabName) {
    // 예외 처리: 사업부 수정 중이면 이동 차단
    const isEditing = document.getElementById('add_dept').style.display === 'block';
    if (isEditing) {
        alert('수정을 완료하거나 취소해 주세요.');
        return;
    }

    // 기존 로직 유지
    let tabContents = document.getElementsByClassName("ex_tabcontent");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }

    let tabLinks = document.getElementsByClassName("ex_tablinks");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }

    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
}

// 1. 레이아웃 편집 모드 전환 함수
function toggleLayout() {
    // 기본 버튼 토글
    document.getElementById("class_edit").style.display = "none";
    document.getElementById("layout_save").style.display = "none";

    // 편집 모드 버튼 토글
    document.getElementById("add_dept").style.display = "block";
    document.getElementById("save_dept").style.display = "block";

    //  현재 활성화된 탭을 확인하여 `clone_`인지 `Dep_`인지 구분
    let activeTab = document.querySelector(".ex_tablinks.active"); // 현재 active된 버튼 찾기
    let isClone = activeTab && activeTab.getAttribute("onclick").includes("'expenses'"); // `examine`이면 clone


    // 각 부서별 요소 토글 (clone 또는 Dep 버전 선택)
    ['fir', 'sec'].forEach(prefix => {
        let headerText = document.getElementById(`${isClone ? 'clone_Dep' : 'Dep'}_${prefix}_header_text`);
        let select = document.getElementById(`${isClone ? 'clone_Dep' : 'Dep'}_${prefix}_select`);
        let deleteBtn = document.querySelector(`#${isClone ? 'clone_Dep' : 'Dep'}_${prefix}_header .delete-btn`);
        let cancelBtn = document.getElementById('cancel_dept');

        if (headerText && select && deleteBtn && cancelBtn) {
            headerText.style.display = "none";
            select.style.display = "block";
            select.value = headerText.textContent.trim(); // 현재 부서명을 select에 설정
            deleteBtn.style.display = "block";
            cancelBtn.style.display = "block";
        }
    });

    // 'clone_Data' 버튼은 clone 모드일 경우 숨김 처리
    const cloneDataBtn_fir = document.getElementById('clone_Data_fir');
    const cloneDataBtn_sec = document.getElementById('clone_Data_sec');
    if (cloneDataBtn_fir && isClone) {
        cloneDataBtn_fir.style.display = "none";
        cloneDataBtn_sec.style.display = "none";
    }
    if (cloneDataBtn_sec && isClone) {
        cloneDataBtn_sec.style.display = "none";
    }
}

function toggleLayout() {
    // 기본 버튼 토글
    document.getElementById("class_edit").style.display = "none";
    document.getElementById("layout_save").style.display = "none";

    // 편집 모드 버튼 토글
    document.getElementById("add_dept").style.display = "block";
    document.getElementById("save_dept").style.display = "block";

    // 현재 활성화된 탭 확인
    const activeTab = document.querySelector(".ex_tablinks.active");
    const isOutsource = activeTab && activeTab.getAttribute("onclick").includes("'outsouce_examine'");

    // 직영: Dep_ / 외주: out_Dep_
    ['fir', 'sec'].forEach(prefix => {
        const idPrefix = isOutsource ? 'out_Dep' : 'Dep';

        const headerText = document.getElementById(`${idPrefix}_${prefix}_header_text`);
        const select = document.getElementById(`${idPrefix}_${prefix}_select`);
        const deleteBtn = document.querySelector(`#${idPrefix}_${prefix}_header .delete-btn`);
        const cancelBtn = document.getElementById('cancel_dept');

        if (headerText && select && deleteBtn && cancelBtn) {
            headerText.style.display = "none";
            select.style.display = "block";
            select.value = headerText.textContent.trim();
            deleteBtn.style.display = "block";
            cancelBtn.style.display = "block";
        }
    });

    // 외주라면 clone_Data 버튼 숨김 (직영에서는 해당 없음)
    if (isOutsource) {
        const cloneDataBtn_fir = document.getElementById('clone_Data_fir');
        const cloneDataBtn_sec = document.getElementById('clone_Data_sec');
        if (cloneDataBtn_fir) cloneDataBtn_fir.style.display = "none";
        if (cloneDataBtn_sec) cloneDataBtn_sec.style.display = "none";
    }
}

function cancelEdit() {
    // 원래 버튼 복원
    document.getElementById("class_edit").style.display = "block";
    document.getElementById("layout_save").style.display = "block";

    // 편집 모드 버튼 숨김
    document.getElementById("add_dept").style.display = "none";
    document.getElementById("save_dept").style.display = "none";
    document.getElementById("cancel_dept").style.display = "none";

    // 현재 활성화된 하위 탭
    const activeTab = document.querySelector(".ex_tablinks.active");
    const isOutsource = activeTab && activeTab.getAttribute("onclick").includes("'outsouce_examine'");
    const idPrefix = isOutsource ? 'out_Dep' : 'Dep';

    ['fir', 'sec'].forEach(prefix => {
        const headerText = document.getElementById(`${idPrefix}_${prefix}_header_text`);
        const select = document.getElementById(`${idPrefix}_${prefix}_select`);
        const deleteBtn = document.querySelector(`#${idPrefix}_${prefix}_header .delete-btn`);

        if (headerText && select && deleteBtn) {
            headerText.style.display = "block";
            select.style.display = "none";
            deleteBtn.style.display = "none";
        }
    });
}

//부서 저장 함수 
function saveDepartmentLayout() {
    const contractCode = document.getElementById('project-contractCode').value;

    const activeTab = document.querySelector(".ex_tablinks.active");
    const isOutsource = activeTab && activeTab.getAttribute("onclick").includes("'outsouce_examine'");

    const typeState = isOutsource ? outsourceState : examineState;
    const idPrefix = isOutsource ? 'out_Dep' : 'Dep';

    // 첫 번째 부서명
    const firstSelect = document.getElementById(`${idPrefix}_fir_select`);
    const firstHeader = document.getElementById(`${idPrefix}_fir_header_text`);
    typeState.firstDeptName = firstSelect && firstSelect.style.display !== 'none'
        ? firstSelect.value
        : firstHeader?.textContent.trim() || '';

    // 두 번째 부서명
    const secondSelect = document.getElementById(`${idPrefix}_sec_select`);
    const secondHeader = document.getElementById(`${idPrefix}_sec_header_text`);
    typeState.secondDeptName = secondSelect && secondSelect.style.display !== 'none'
        ? secondSelect.value
        : secondHeader?.textContent.trim() || '';

    const layoutData = {
        contract_code: contractCode,
        first_dept: typeState.firstDeptName,
        second_dept: typeState.secondDeptName,
        first_layout_active: typeState.firstActive ? 1 : 0,
        second_layout_active: typeState.secondActive ? 1 : 0,
        active_Layout_count: typeState.activeLayouts,
        isClone: isOutsource
    };
    console.log(layoutData)
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
                reloadWithCurrentState();
            } else {
                alert('저장 중 오류가 발생했습니다: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('저장 중 오류가 발생했습니다.');
        });
}

function reloadWithCurrentState() {
    // 현재 활성 탭 찾기
    const activeTab = document.querySelector('.tabcontent[style*="display: block"]');
    if (activeTab) {
        sessionStorage.setItem('isButtonReload', 'true');
        sessionStorage.setItem('activeTab', activeTab.id);
    }

    // 현재 projectId 가져오기
    const projectId = document.getElementById('project-id')?.value;
    if (!projectId) {
        console.warn('[WARN] projectId 없음 → 일반 새로고침 실행');
        window.location.reload();
        return;
    }

    // 같은 프로젝트 페이지로 다시 로드
    const url = `/project_examine/${projectId}`;
    console.log(`[INFO] reloadWithCurrentState → ${url}`);
    window.location.href = url;
}


//예상진행비 부서 div삭제
function removeLayout(button) {
    const activeTab = document.querySelector(".ex_tablinks.active");
    const isOutsource = activeTab && activeTab.getAttribute("onclick").includes("'outsouce_examine'");

    const typeState = isOutsource ? outsourceState : examineState;
    const idPrefix = isOutsource ? 'out_Department' : 'Department';

    const parentDiv = button.closest(`#${idPrefix}_first`) || button.closest(`#${idPrefix}_second`);

    if (!parentDiv) {
        console.error("[removeLayout] Parent div not found");
        return;
    }

    if (typeState.activeLayouts > 1) {
        const confirmResult = confirm('해당 부서를 삭제하시겠습니까?');
        if (confirmResult) {
            parentDiv.classList.remove('div_active');
            parentDiv.style.display = 'none';

            if (parentDiv.id.includes('first')) {
                typeState.firstActive = false;
            } else {
                typeState.secondActive = false;
            }

            typeState.activeLayouts = (typeState.firstActive ? 1 : 0) + (typeState.secondActive ? 1 : 0);
        }
    } else {
        alert("1개 이상의 Layout이 존재해야 합니다.");
    }
}

//예상진행비 부서추가
function addLayout() {
    const activeTab = document.querySelector(".ex_tablinks.active");
    const isOutsource = activeTab && activeTab.getAttribute("onclick").includes("'outsouce_examine'");

    const typeState = isOutsource ? outsourceState : examineState;
    const idPrefix = isOutsource ? 'out_Department' : 'Department';

    // 현재 활성화된 부서 수 확인
    if (typeState.activeLayouts >= 2) {
        alert('부서는 최대 2개까지만 추가할 수 있습니다.');
        return;
    }

    // 첫 번째 부서가 비활성화 상태면
    const firstDiv = document.getElementById(`${idPrefix}_first`);
    const secondDiv = document.getElementById(`${idPrefix}_second`);

    if (!typeState.firstActive && firstDiv) {
        firstDiv.classList.add('div_active');
        firstDiv.style.display = 'block';
        typeState.firstActive = true;
    } else if (!typeState.secondActive && secondDiv) {
        secondDiv.classList.add('div_active');
        secondDiv.style.display = 'block';
        typeState.secondActive = true;
    }

    // 총 activeLayouts 다시 계산
    typeState.activeLayouts = (typeState.firstActive ? 1 : 0) + (typeState.secondActive ? 1 : 0);
}

function inputText(td, type = '') {
    const originalText = td.textContent.trim().replace(/,/g, '');
    td.style.position = "relative";

    const input = document.createElement("input");
    input.type = "text";
    input.value = formatWithCommas(originalText);

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

    input.addEventListener("input", () => {
        const raw = input.value.replace(/,/g, '');

        //글자 입력 허용 예외 처리
        const isOutsourceTextCell = (() => {
            if (type !== 'outsourcing') return false;
            const row = td.parentElement;
            const hasCheckbox = !!(row && row.querySelector('input.row-check'));
            return hasCheckbox ? (td.cellIndex === 2 || td.cellIndex === 3) : (td.cellIndex === 1 || td.cellIndex === 2);
        })();

        if (
            isOutsourceTextCell ||
            (type === 'record' && td.cellIndex === 6) ||
            (type === 'note')
        ) {
            input.value = raw;
            return;
        }

        if (!isNumeric(raw)) {
            input.value = '';
            return;
        }

        input.value = formatWithCommas(raw);
    });
    if (type === 'textarea') {
        td.className = 'edit_cell';

        td.onclick = function () {
            const originalText = td.innerText.trim();  // textContent → innerText
            td.textContent = '';

            const textarea = document.createElement("textarea");
            textarea.value = originalText;

            textarea.style.width = "100%";
            textarea.style.height = "60px";
            textarea.style.boxSizing = "border-box";
            textarea.style.border = "none";
            textarea.style.fontSize = "inherit";
            textarea.style.resize = "none";
            textarea.style.background = "transparent";

            textarea.addEventListener("blur", () => {
                td.innerText = textarea.value.trim();  // ← 핵심 수정
                td.classList.add('multiline');
            });

            td.appendChild(textarea);
            textarea.focus();
        };
        return
    }
    input.addEventListener("blur", () => {
        const raw = input.value.replace(/,/g, '');
        const isOutsourceTextCell = (() => {
            if (type !== 'outsourcing') return false;
            const row = td.parentElement;
            const hasCheckbox = !!(row && row.querySelector('input.row-check'));
            return hasCheckbox ? (td.cellIndex === 2 || td.cellIndex === 3) : (td.cellIndex === 1 || td.cellIndex === 2);
        })();

        if (
            isOutsourceTextCell ||
            (type === 'record' && td.cellIndex === 6) || type === 'note'
        ) {
            td.textContent = input.value;
        } else {
            td.textContent = isNumeric(raw) ? formatWithCommas(raw) : '';
        }

        //타입별 후처리
        const table = td.closest("table");
        if (!table) return;

        switch (table.dataset.type) {
            case 'budget':
                updateAmount(td.parentElement, table.id.startsWith('clone_'));
                break;
            case 'record':
                if (table.id.startsWith('out_')) {
                    recordCal(null, 'out');
                } else if (table.id === 'LeftRecords_table' || table.id === 'SecondRecords_table') {
                    recordCal(null, false);
                } else {
                    recordCal(td.parentElement);
                }
                break;
            case 'outsourcing': {
                const row = td.closest('tr');
                const cells = row.children;
                const offset = row && row.querySelector('input.row-check') ? 1 : 0;
                const amountIndex = 4 + offset;
                const noVatIndex = 3 + offset;

                if (td.cellIndex === amountIndex) { // 금액 입력란
                    const raw = td.textContent.replace(/,/g, '');
                    const fullAmount = parseFloat(raw) || 0;
                    const noVAT = Math.round(fullAmount / 1.1);

                    // VAT 제외 금액 칸에 반영
                    if (!isNaN(noVAT) && cells[noVatIndex]) {
                        cells[noVatIndex].textContent = noVAT.toLocaleString();
                    }

                    // 총계 갱신
                    let total = 0;
                    let totalNoVAT = 0;
                    const rows = document.querySelectorAll('#outsource_tbody tr:not(:first-child)');

                    rows.forEach(r => {
                        const c = r.children;
                        const rowOffset = r.querySelector('input.row-check') ? 1 : 0;
                        const rowNoVatIndex = 3 + rowOffset;
                        const rowAmountIndex = 4 + rowOffset;
                        if (c.length >= rowAmountIndex + 1) {
                            const noVatVal = parseInt(c[rowNoVatIndex].textContent.replace(/,/g, '')) || 0;
                            const fullVal = parseInt(c[rowAmountIndex].textContent.replace(/,/g, '')) || 0;
                            totalNoVAT += noVatVal;
                            total += fullVal;
                        }
                    });

                    document.getElementById('outsourceSum_NoVAT').textContent = totalNoVAT.toLocaleString();
                    document.getElementById('outsourceSum').textContent = total.toLocaleString();
                }

                break;
            }
            case 'addRecord': {
                // 인원(1), 횟수(2), 일수(3), 단가(4) 중 하나가 수정된 경우만 처리
                if ([1, 2, 3, 4].includes(td.cellIndex)) {
                    const row = td.parentElement;
                    const cells = row.children;
                    const people = parseFloat(cells[1].textContent.replace(/,/g, '')) || 0;
                    const freq = parseFloat(cells[2].textContent.replace(/,/g, '')) || 0;
                    const days = parseFloat(cells[3].textContent.replace(/,/g, '')) || 0;
                    const unit = parseFloat(cells[4].textContent.replace(/,/g, '')) || 0;
                    const amount = people * freq * days * unit;
                    cells[5].textContent = isNaN(amount) ? '' : amount.toLocaleString();
                }
                break;
            }
        }
    });

    input.addEventListener("keydown", e => {
        if (e.key === "Enter") input.blur();
    });

    td.textContent = '';
    td.appendChild(input);
    input.focus();
}

// 콤마 추가 함수
function formatWithCommas(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
// 숫자인지 확인
function isNumeric(value) {
    return !isNaN(value) && !isNaN(parseFloat(value));
}

//연도 추출 함수
function getCurrentYear() {
    const year = document.getElementById('project-year').value;
    return year;
}

// 테이블에 행 추가 함수
function addRows(tableID, rowCount = 1) {
    const tableBody = document.getElementById(tableID);
    if (!tableBody) return;

    const dataType = tableBody.closest("table")?.dataset?.type;
    if (tableID === 'note_tbody') {
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');

            for (let k = 0; k < 2; k++) {
                const td = document.createElement('td');
                td.style.height = '20px';
                if (k === 0) {
                    td.className = 'edit_cell';
                    td.onclick = function () {
                        inputText(this, 'note');
                    };
                } else if (k === 1) {
                    td.className = 'edit_cell';
                    td.onclick = function () {
                        inputText(this, 'note');
                    };
                }

                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    }
    if (dataType === "budget") {
        const hasExternalLaborData = document.getElementById('hasExternalLaborData')?.value === 'true';
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');

            for (let k = 0; k < 4; k++) {
                const td = document.createElement('td');

                if (k === 0) {
                    const select = document.createElement('select');
                    const options = hasExternalLaborData
                        ? ['선택하세요', '이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직', '외부인력']
                        : ['선택하세요', '이사', '부장', '차장', '과장', '대리', '주임', '사원', '계약직'];

                    options.forEach(optionText => {
                        const option = document.createElement('option');
                        option.value = optionText;
                        option.textContent = optionText;
                        select.appendChild(option);
                    });

                    td.appendChild(select);
                } else if (k === 1 || k === 2) {
                    td.className = 'edit_cell';
                    td.onclick = function () {
                        inputText(this, dataType);
                    };
                } else if (k === 3) {
                    td.className = 'amount-cell';
                    td.textContent = '0';
                }

                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    } else if (dataType === "record" || dataType === "addRecord") {
        const recordOptions = [
            '선택하세요',
            '복리후생비/식대', '복리후생비/음료 외',
            '여비교통비/(출장)숙박', '여비교통비/주차료', '여비교통비/대중교통',
            '소모품비/현장물품', '소모품비/기타소모품',
            '차량유지비/주유', '차량유지비/차량수리 외',
            '도서인쇄비/출력 및 제본',
            '운반비/등기우편 외', '지급수수료/증명서발급',
            '기타/그 외 기타'
        ];

        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');

            for (let k = 0; k < 7; k++) {
                const td = document.createElement('td');

                if (k === 0) {
                    const select = document.createElement('select');
                    recordOptions.forEach(optionText => {
                        const option = document.createElement('option');
                        option.value = optionText;
                        option.textContent = optionText;
                        select.appendChild(option);
                    });
                    select.onchange = function () {
                        getPrice(this);
                    };
                    td.appendChild(select);
                } else if (k >= 1 && k <= 3) {
                    td.className = 'edit_cell';
                    td.onclick = function () {
                        inputText(this, dataType);
                    };
                } else if (k === 4) {
                    td.className = 'Price-cell';
                    td.onclick = function () {
                        inputText(this, dataType);
                    };
                } else if (k === 5) {
                    td.className = 'amount-cell';
                } else if (k === 6) {
                    td.className = 'text-cell';
                    td.onclick = function () {
                        inputText(this, dataType);
                    };
                }

                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    } else if (dataType === "outsourcing") {
        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');

            for (let k = 0; k < 6; k++) {
                const td = document.createElement('td');

                if (k === 0) {
                    td.style.textAlign = 'center';
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'row-check';
                    td.appendChild(cb);
                } else if (k === 1) {
                    // 구분 - select
                    const select = document.createElement('select');
                    const options = ['외주없음', '전량외주', '부분외주'];
                    options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        select.appendChild(option);
                    });
                    select.value = '외주없음';
                    td.appendChild(select);
                } else if (k === 2) {
                    // 업체명
                    td.className = 'edit_cell';
                    td.onclick = function () {
                        inputText(this, dataType);
                    };
                } else if (k === 3) {
                    // 물량
                    td.className = 'edit_cell';
                    td.id = 'quantity_cell';
                    td.onclick = function () {
                        const originalText = td.innerText.trim();
                        td.textContent = '';

                        const textarea = document.createElement("textarea");
                        textarea.value = originalText;

                        textarea.style.width = "100%";
                        textarea.style.height = "60px";
                        textarea.style.boxSizing = "border-box";
                        textarea.style.border = "none";
                        textarea.style.fontSize = "inherit";
                        textarea.style.resize = "none";
                        textarea.style.background = "transparent";

                        textarea.addEventListener("blur", () => {
                            td.innerText = textarea.value.trim();
                            td.classList.add('multiline');
                        });

                        td.appendChild(textarea);
                        textarea.focus();
                    };
                } else if (k === 4) {
                    // 금액(VAT 제외)
                    td.id = 'cost_NoVAT';
                    td.textContent = '0';
                } else if (k === 5) {
                    // 금액
                    td.className = 'amount-cell';
                    td.onclick = function () {
                        inputText(this, dataType);
                    };
                }

                tr.appendChild(td);
            }

            tableBody.appendChild(tr);
        }
    }
}


// 테이블에서 마지막 일반 행 삭제 함수
function removeLastRow(tableID) {
    const tableBody = document.getElementById(tableID);
    if (!tableBody) return;

    const checked = Array.from(tableBody.querySelectorAll('input.row-check:checked'));
    if (checked.length > 0) {
        checked.forEach(chk => {
            const tr = chk.closest('tr');
            if (tr && tr.parentElement) tr.parentElement.removeChild(tr);
        });
        return;
    }

    const rows = Array.from(tableBody.querySelectorAll('tr'));
    if (rows.length <= 1) return; // 총계만 남으면 삭제 안 함

    const lastRow = rows[rows.length - 1];
    const isSummaryRow = lastRow.querySelector('td')?.textContent?.includes('총 계');
    if (isSummaryRow && rows.length > 1) {
        tableBody.removeChild(rows[rows.length - 2]);
    } else {
        tableBody.removeChild(lastRow);
    }
}

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

    position = position.replace(/\s+/g, '');
    const person = parseFloat(row.cells[1].innerText.replace(/,/g, '')) || 0;
    const md = parseFloat(row.cells[2].innerText.replace(/,/g, '')) || 0;

    if (position === '선택하세요') {
        alert('직급을 먼저 선택해 주세요.');
        row.cells[2].innerText = '';
        row.cells[3].innerText = '0';
        return;
    }

    //clone 여부 자동 감지
    const table = row.closest("table");
    const isClone = table?.id?.startsWith("clone_");

    if (md > 0) {
        fetch(`/get_expenses?position=${position}&year=${year}&contractcode=${contractCode}`)
            .then(response => response.json())
            .then(data => {
                if (data && data.Days !== undefined) {
                    const dailyWage = data.Days;
                    const amount = dailyWage * md * person;
                    row.cells[3].innerText = amount.toLocaleString();
                } else {
                    console.warn('서버에서 유효한 데이터를 받지 못했습니다.', data);
                    row.cells[3].innerText = '0';
                }
                updateSum(row);
            })
            .catch(error => {
                console.error('데이터 가져오기 실패:', error);
                row.cells[3].innerText = '0';
                updateSum(row);
            });
    } else {
        row.cells[3].innerText = '0';
        updateSum(row);
    }
}

// 인원 M/D 금액 총계 합산 함수
function updateSum(row) {
    const tbody = row.closest("tbody");
    if (!tbody || !tbody.id) return;

    let prefix = '';
    const id = tbody.id;

    // 더 구체적인 out_ 접두어부터 먼저 검사
    if (id.includes('out_Dep_fir')) prefix = 'out_fir';
    else if (id.includes('out_Dep_sec')) prefix = 'out_sec';
    else if (id.includes('Dep_fir')) prefix = 'fir';
    else if (id.includes('Dep_sec')) prefix = 'sec';
    else return;

    let sumPerson = 0, sumMD = 0, sumAmount = 0;

    const rows = Array.from(tbody.querySelectorAll('tr:not(:first-child)'));
    rows.forEach(row => {
        const cells = row.children;
        if (cells.length >= 4 && cells[0].innerText.trim() !== '선택하세요') {
            sumPerson += parseFloat(cells[1].innerText.replace(/,/g, '')) || 0;
            sumMD += parseFloat(cells[2].innerText.replace(/,/g, '')) || 0;
            sumAmount += parseFloat(cells[3].innerText.replace(/,/g, '')) || 0;
        }
    });

    const personEl = document.getElementById(`${prefix}_PersonSum`);
    const mdEl = document.getElementById(`${prefix}_MDsum`);
    const amountEl = document.getElementById(`${prefix}_budgetSum`);
    if (personEl) personEl.innerText = sumPerson.toLocaleString();
    if (mdEl) mdEl.innerText = sumMD.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (amountEl) amountEl.innerText = sumAmount.toLocaleString();
}

// 경비 Select 옵션 변경시 단가 데이터 습득 함수
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
                        inputText(this, 'record');
                    };
                    priceTd.classList.add('edit_cell');

                } else {
                    priceTd.textContent = '0';
                    priceTd.onclick = function () {
                        inputText(this, 'record');
                    };
                    priceTd.classList.add('edit_cell');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                priceTd.textContent = '오류 발생';
            });
    } else {
        priceTd.textContent = '0';
        priceTd.onclick = function () {
            inputText(this, 'record');
        };
        priceTd.classList.add('edit_cell');
    }
}

function recordCal(targetRow = null, check = false) {
    const departments = ['fir', 'sec'];

    if (targetRow) {
        const cells = targetRow.children;
        if (cells.length > 0 && cells[0].innerText.trim() !== '선택하세요.') {
            const personnel = parseFloat(cells[1].innerText.replace(/,/g, '')) || 0;
            const times = parseFloat(cells[2].innerText.replace(/,/g, '')) || 0;
            const days = parseFloat(cells[3].innerText.replace(/,/g, '')) || 0;
            const unitPrice = parseFloat(cells[4].innerText.replace(/,/g, '')) || 0;

            const totalCost = unitPrice * personnel * times * days;
            cells[5].innerText = isNaN(totalCost) ? '' : totalCost.toLocaleString();
        }
        return;
    }

    departments.forEach(dep => {
        const prefix = check === 'out' ? `out_Dep_${dep}` : `Dep_${dep}`;
        const rows = document.querySelectorAll(`#${prefix}_Record_tbody tr:not(:first-child)`);
        let totalSum = 0;

        rows.forEach(row => {
            const cells = row.children;
            if (cells.length > 5 && cells[0].innerText.trim() !== '선택하세요.') {
                const personnel = parseFloat(cells[1].innerText.replace(/,/g, '')) || 0;
                const times = parseFloat(cells[2].innerText.replace(/,/g, '')) || 0;
                const days = parseFloat(cells[3].innerText.replace(/,/g, '')) || 0;
                const unitPrice = parseFloat(cells[4].innerText.replace(/,/g, '')) || 0;

                const totalCost = unitPrice * personnel * times * days;
                cells[5].innerText = isNaN(totalCost) ? '' : totalCost.toLocaleString();
                totalSum += totalCost;
            }
        });

        const sumId = check === 'out' ? `out_${dep}_recordSum` : `${dep}_recordSum`;
        const recordSumEl = document.getElementById(sumId);
        if (recordSumEl) {
            recordSumEl.innerText = totalSum.toLocaleString();
        }
    });
}

function collectEstimateData() {
    const contractCode = document.getElementById('project-contractCode').value;
    const projectId = parseInt(document.getElementById('project-id').value);
    const exmanager = [];
    const expenserecords = [];
    const outsourcing = [];

    function parseNumber(text) {
        return parseFloat((text || '').replace(/,/g, '')) || 0;
    }

    function getCellValue(cell) {
        const inputEl = cell.querySelector('input, textarea, select');
        return inputEl ? inputEl.value.trim() : (cell.innerText || '').trim();
    }

    function isValidDepartment(sectionId) {
        const h2 = document.querySelector(`#${sectionId} h2`);
        if (!h2) return false;
        const title = h2.textContent.trim();
        return title && title !== '예상 인건비 및 경비';
    }

    function collectTableRows(tbodyId, type, mode, department) {
        const rows = document.querySelectorAll(`#${tbodyId} tr`);

        // 경비 테이블 예외처리: 서버에서 이미 받아온 경비가 있으면 무시
        if (
            type === 'expenserecords' &&
            (
                (tbodyId.includes('Dep_fir') && firstRecords.length > 0) ||
                (tbodyId.includes('Dep_sec') && secondRecords.length > 0) ||
                (tbodyId.includes('out_Dep_fir') && out_first_records.length > 0) ||
                (tbodyId.includes('out_Dep_sec') && out_second_records.length > 0)
            )
        ) {
            return;
        }

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return;

            const isTotalRow = getCellValue(cells[0]) === '총 계';
            if (isTotalRow) return;

            if (type === 'exmanager') {
                const position = getCellValue(cells[0]);
                if (position === '선택하세요') return;

                exmanager.push({
                    ContractCode: contractCode,
                    Position: position,
                    department: department,
                    M_D: parseNumber(cells[2].innerText),
                    person: parseNumber(cells[1].innerText),
                    amount: parseNumber(cells[3].innerText),
                    ProjectID: projectId,
                    mode: mode
                });
            } else if (type === 'expenserecords') {
                const account = getCellValue(cells[0]);
                if (account === '선택하세요') return;

                const noteInput = cells[6]?.querySelector('input, textarea, select');
                const note = noteInput ? noteInput.value.trim() : (cells[6]?.innerText.trim() || '');

                expenserecords.push({
                    ProjectID: projectId,
                    ContractCode: contractCode,
                    department: department,
                    account: account,
                    people_count: parseNumber(cells[1].innerText),
                    frequency: parseNumber(cells[2].innerText),
                    days: parseNumber(cells[3].innerText),
                    unit_price: parseNumber(cells[4].innerText),
                    amount: parseNumber(cells[5].innerText),
                    note,
                    mode
                });
            }
        });
    }

    // 직영 인건비 + 경비
    if (examineState.firstActive && isValidDepartment("Department_first")) {
        collectTableRows('Dep_fir_Budget_tbody', 'exmanager', 0, examineState.firstDeptName);
        collectTableRows('Dep_fir_Record_tbody', 'expenserecords', 0, examineState.firstDeptName);
    }
    if (examineState.secondActive && isValidDepartment("Department_second")) {
        collectTableRows('Dep_sec_Budget_tbody', 'exmanager', 0, examineState.secondDeptName);
        collectTableRows('Dep_sec_Record_tbody', 'expenserecords', 0, examineState.secondDeptName);
    }

    // 외주 인건비 + 경비
    if (outsourceState.firstActive && isValidDepartment("out_Department_first")) {
        collectTableRows('out_Dep_fir_Budget_tbody', 'exmanager', 1, outsourceState.firstDeptName);
        collectTableRows('out_Dep_fir_Record_tbody', 'expenserecords', 1, outsourceState.firstDeptName);
    }
    if (outsourceState.secondActive && isValidDepartment("out_Department_second")) {
        collectTableRows('out_Dep_sec_Budget_tbody', 'exmanager', 1, outsourceState.secondDeptName);
        collectTableRows('out_Dep_sec_Record_tbody', 'expenserecords', 1, outsourceState.secondDeptName);
    }

    // 외주 예상비 테이블
    const outRows = document.querySelectorAll('#outsource_tbody tr');
    outRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;

        const isTotalRow = getCellValue(cells[0]) === '총 계';
        if (isTotalRow) return;

        const offset = row.querySelector('input.row-check') ? 1 : 0;
        const outsourcing_type = getCellValue(cells[0 + offset]);
        if (outsourcing_type === '삭제') return;

        const outsourcing_company = getCellValue(cells[1 + offset]);
        const outsourcing_quantity = cells[2 + offset].innerText.trim();
        const outsourcing_cost_NoVAT = parseNumber(cells[3 + offset].innerText);
        const outsourcing_cost = parseNumber(cells[4 + offset].innerText);

        const isBlankRow =
            (!outsourcing_type || outsourcing_type === '외주없음') &&
            !outsourcing_company &&
            (!outsourcing_quantity || outsourcing_quantity === '-') &&
            outsourcing_cost_NoVAT === 0 &&
            outsourcing_cost === 0;
        if (isBlankRow) return;

        outsourcing.push({
            outsourcing_type: outsourcing_type,
            outsourcing_company: outsourcing_company,
            outsourcing_quantity: outsourcing_quantity,
            outsourcing_cost_NoVAT: outsourcing_cost_NoVAT,
            outsourcing_cost: outsourcing_cost,
            contract_code: contractCode
        });
    });

    return {
        contractCode,
        projectId,
        exmanager,
        expenserecords,
        outsourcing
    };
}

// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 외주 물량 저장 안댐 확인 필요
// 금액 cell 텍스트 입력 불가
// 구분 select 추가 필요

function saveExamine() {
    const data = collectEstimateData();

    fetch('/api/save_estimated_budget', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(result => {
            alert(result.message || '저장 완료');
            reloadWithCurrentState();
        })
        .catch(error => {
            console.error('[ERROR] 저장 실패:', error);
            alert('저장 중 오류 발생');
        });
}

function recordsDetail(button, dep) {
    const row = button.closest("tr");
    const account = row.dataset.account;
    const nextRow = row.nextElementSibling;
    let details = [];

    // 상세 행이 이미 있으면 제거
    if (nextRow && nextRow.classList.contains("detail-row")) {
        nextRow.remove();
        button.textContent = "▼";
        return;
    }

    // 부서에 따라 상세 데이터 선택
    if (dep === 'fir') {
        details = firstRecords.filter(record => record.account === account);
    } else if (dep === 'sec') {
        details = secondRecords.filter(record => record.account === account);
    } else if (dep === 'out_fir') {
        details = out_first_records.filter(record => record.account === account);
    } else if (dep === 'out_sec') {
        details = out_second_records.filter(record => record.account === account);
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
                    <td>${detail.account}</td>
                    <td>${detail.people_count}</td>
                    <td>${detail.frequency}</td>
                    <td>${detail.days}</td>
                    <td>${parseInt(detail.unit_price).toLocaleString()}</td>
                    <td>${parseInt(detail.amount).toLocaleString()}</td>
                    <td>${detail.note || ''}</td>
                </tr>
            `;
        });

        detailHtml += `</tbody></table></td></tr>`;
        row.insertAdjacentHTML("afterend", detailHtml);
        button.textContent = "▲";
    }
}

function calculateAllTotals() {
    // 인건비 총계
    calculateBudgetTotals('Dep_fir_table', 'fir_PersonSum', 'fir_MDsum', 'fir_budgetSum');
    calculateBudgetTotals('Dep_sec_table', 'sec_PersonSum', 'sec_MDsum', 'sec_budgetSum');
    calculateBudgetTotals('out_Dep_fir_table', 'out_fir_PersonSum', 'out_fir_MDsum', 'out_fir_budgetSum');
    calculateBudgetTotals('out_Dep_sec_table', 'out_sec_PersonSum', 'out_sec_MDsum', 'out_sec_budgetSum');

    // 경비 총계
    calculateExpenseTotals('Dep_fir_Record_tbody', 'fir_recordSum');
    calculateExpenseTotals('Dep_sec_Record_tbody', 'sec_recordSum');
    calculateExpenseTotals('out_Dep_fir_Record_tbody', 'out_fir_recordSum');
    calculateExpenseTotals('out_Dep_sec_Record_tbody', 'out_sec_recordSum');

    // 외주 총계
    calculateOutsourceTotals('outsource_tbody', 'outsourceSum_NoVAT', 'outsourceSum');
}

function calculateBudgetTotals(tableId, personId, mdId, amountId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    let personSum = 0;
    let mdSum = 0;
    let amountSum = 0;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        if (row.cells[0].textContent.trim() === '총 계') return;

        const person = parseFloat(row.cells[1].textContent.replace(/,/g, '')) || 0;
        const md = parseFloat(row.cells[2].textContent.replace(/,/g, '')) || 0;
        const amount = parseFloat(row.cells[3].textContent.replace(/,/g, '')) || 0;

        personSum += person;
        mdSum += md;
        amountSum += amount;
    });

    document.getElementById(personId).textContent = personSum;
    document.getElementById(mdId).textContent = mdSum.toFixed(2);
    document.getElementById(amountId).textContent = amountSum.toLocaleString();
}


function calculateExpenseTotals(tbodyId, totalId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    let total = 0;
    const rows = tbody.querySelectorAll('tr.expense-row');

    rows.forEach(row => {
        const span = row.querySelector('span');
        if (!span) return;

        const amount = parseFloat(span.textContent.replace(/[^\d.-]/g, '')) || 0;
        total += amount;
    });

    document.getElementById(totalId).textContent = total.toLocaleString();
}

function calculateOutsourceTotals(tbodyId, noVatId, vatId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    let noVatTotal = 0;
    let vatTotal = 0;

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length < 5) return;
        const isSummary = Array.from(tds).some(td => td.textContent.trim().includes('총 계'));
        if (isSummary) return;

        const offset = row.querySelector('input.row-check') ? 1 : 0;
        const noVatIndex = 3 + offset;
        const vatIndex = 4 + offset;
        if (tds.length <= vatIndex) return;

        const noVat = parseFloat(tds[noVatIndex].textContent.replace(/,/g, '')) || 0;
        const vat = parseFloat(tds[vatIndex].textContent.replace(/,/g, '')) || 0;

        noVatTotal += noVat;
        vatTotal += vat;
    });

    document.getElementById(noVatId).textContent = noVatTotal.toLocaleString();
    document.getElementById(vatId).textContent = vatTotal.toLocaleString();
}

//직영 예상진행비 현황
async function updateFeetable() {

    const table = document.getElementById('EX_fee_table');
    if (!table) {
        console.warn("Element 'EX_fee_table' not found.");
        return;
    }

    // 부가세 제외 투찰금액 계산
    let ProjectCost_NoVAT = parseFloat(
        document.getElementById('BidPrice_NoVAT')?.value.replace(/[^0-9.-]/g, '') || 0
    );
    console.log("ProjectCost_NoVAT:", ProjectCost_NoVAT);
    console.log("bidPrice:", document.getElementById('BidPrice_NoVAT')?.value);
    if (ProjectCost_NoVAT === 0) {
        // 사업비 → 투찰금액(VAT포함) → 투찰금액(VAT제외)
        console.log("test")
        const projectBaseCost = parseFloat(
            document.getElementById('projectBaseCost')?.value.replace(/[^0-9.-]/g, '') || 0
        );
        const bidCostWithVAT = Math.round(projectBaseCost * 0.8); // 투찰금액(VAT포함)
        ProjectCost_NoVAT = Math.round(bidCostWithVAT / 1.1);     // 투찰금액(VAT제외)
    }
    // 지분율 (백분율을 소수점으로 변환)
    const ContributionRate = parseFloat(document.getElementById('ContributionRate')?.textContent.replace(/[^0-9.-]/g, '') || 0) / 100;
    console.log("ContributionRate:", ContributionRate);
    console.log(ProjectCost_NoVAT)
    // 사업비(A) = ProjectCost_NoVAT * ContributionRate
    const BusinessCost_A = Math.round(ProjectCost_NoVAT * ContributionRate);
    console.log("BusinessCost_A:", BusinessCost_A);
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
            <td style="background-color: #bae4ea;">${company_Money_Per}%</td>
            <td style="background-color: #bae4ea;">${company_Money.toLocaleString()}원</td>
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

        <tr class="total">
            <td colspan="2" style="background-color: #ebf7d3;">합 계(S2 = B + C)</td>
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

    //DOM 요소들
    const totalSum = document.getElementById('totalSum');
    const totalPer = document.getElementById('totalPer');
    const profitSum = document.getElementById('profitSum');
    const profitPer = document.getElementById('profitPer');

    //계산
    const execution_sum = company_Money + EX_execution_money;
    const execution_per_sum = company_Money_Per + EX_execution_per;

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
}


//외주 예상진행비 현황
async function out_updateFeetable() {

    const table = document.getElementById('out_fee_table');
    if (!table) {
        console.warn("Element 'out_fee_table' not found.");
        return;
    }

    // 부가세 제외 투찰금액 계산
    let ProjectCost_NoVAT = parseFloat(
        document.getElementById('BidPrice_NoVAT')?.value.replace(/[^0-9.-]/g, '') || 0
    );
    console.log("ProjectCost_NoVAT:", ProjectCost_NoVAT);
    if (ProjectCost_NoVAT === 0) {
        // 사업비 → 투찰금액(VAT포함) → 투찰금액(VAT제외)
        console.log("test")
        const projectBaseCost = parseFloat(
            document.getElementById('projectBaseCost')?.value.replace(/[^0-9.-]/g, '') || 0
        );
        const bidCostWithVAT = Math.round(projectBaseCost * 0.8); // 투찰금액(VAT포함)
        ProjectCost_NoVAT = Math.round(bidCostWithVAT / 1.1);     // 투찰금액(VAT제외)
    }

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
    const EX_fir_budget_money = Number(document.getElementById('out_fir_budgetSum').textContent.replace(/[^0-9.-]/g, '') || 0);
    const EX_sec_budget_money = Number(document.getElementById('out_sec_budgetSum').textContent.replace(/[^0-9.-]/g, '') || 0);

    //검토 예상 자체 경비
    const EX_fir_record = Number(document.getElementById('out_fir_recordSum').textContent.replace(/[^0-9.-]/g, '') || 0);
    const EX_sec_record = Number(document.getElementById('out_sec_recordSum').textContent.replace(/[^0-9.-]/g, '') || 0);


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
            <td style="background-color: #bae4ea;">${company_Money_Per}%</td>
            <td style="background-color: #bae4ea;">${company_Money.toLocaleString()}원</td>
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
            <td id = "out_totalPer" style="background-color: #ebf7d3;"></td>
            <td id = "out_totalSum" style="background-color: #ebf7d3;"></td>
        </tr>

        <tr class="profit">
            <td colspan="2" style="background-color: #ebf7d3;">영업이익(A - S2)</td>
            <td id = "out_profitPer" style="background-color: #ebf7d3;"></td>
            <td id = "out_profitSum" style="background-color: #ebf7d3;"></td>
        </tr>
    </tbody>
`;
    const outsourcing = JSON.parse(document.getElementById('outsourcing-data').textContent);
    insertOutsourcingDetails(outsourcing, BusinessCost_A);
    await new Promise(requestAnimationFrame); // <-- DOM 삽입 후 flush 보장

    // 외주 합계 (D)
    const outsourcingTotalCost = Number(document.getElementById('outsourceTotalCost')?.textContent.replace(/[^0-9.-]/g, '') || 0);
    const outsourcingTotalPer = parseFloat(document.getElementById('outsourceTotalPer')?.textContent.replace(/[^0-9.-]/g, '') || 0);

    // DOM 요소
    const totalSum = document.getElementById('out_totalSum');
    const totalPer = document.getElementById('out_totalPer');
    const profitSum = document.getElementById('out_profitSum');
    const profitPer = document.getElementById('out_profitPer');

    //합계 (S2 = B + C + D)
    const execution_sum = company_Money + EX_execution_money + outsourcingTotalCost;
    const execution_per_sum = company_Money_Per + EX_execution_per + outsourcingTotalPer;

    //영업이익 (A - S2)
    const profit_money = BusinessCost_A - execution_sum;
    const profit_per = (profit_money / BusinessCost_A) * 100;
    const profit_color = profit_money > 0 ? "red" : "blue";

    console.log(outsourcingTotalCost)
    console.log(outsourcingTotalPer)
    // DOM 출력
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
}

function insertOutsourcingDetails(outsourcing, businessCostA) {
    const insertPoint = document.getElementById('outsourcing-insert-point');
    if (!insertPoint || !Array.isArray(outsourcing)) return;

    const tbody = insertPoint.parentElement;
    let totalCost = 0;
    let rowsHtml = '';

    if (outsourcing.length === 0) {
        rowsHtml += `
            <tr>
                <td rowspan="2">외주 사업수행비(D)</td>
                <td colspan="3" style="text-align:center;">외주 없음</td>
            </tr>
            <tr class="sub-total">
                <td id = "outsourcingTotal"style="background-color: #bae4ea;">소계</td>
                <td style="background-color: #bae4ea;">0.000%</td>
                <td style="background-color: #bae4ea;">0원</td>
            </tr>
        `;
    } else {
        outsourcing.forEach((item, idx) => {
            const cost = parseFloat(item.outsourcing_cost || 0);
            const percent = businessCostA ? ((cost / businessCostA) * 100).toFixed(3) : '0.000';
            totalCost += cost;

            rowsHtml += `
                <tr>
                    ${idx === 0 ? `<td rowspan="${outsourcing.length + 1}">외주 사업수행비(D)</td>` : ''}
                    <td>${item.outsourcing_company || '-'}</td>
                    <td>${percent}%</td>
                    <td>${cost.toLocaleString()}원</td>
                </tr>
            `;
        });

        const totalPercent = businessCostA ? ((totalCost / businessCostA) * 100).toFixed(3) : '0.000';

        rowsHtml += `
            <tr class="sub-total">
                <td style="background-color: #bae4ea;">소계</td>
                <td id="outsourceTotalPer" style="background-color: #bae4ea;">${totalPercent}%</td>
                <td id="outsourceTotalCost" style="background-color: #bae4ea;">${totalCost.toLocaleString()}원</td>
            </tr>
        `;
    }

    const temp = document.createElement('tbody');
    temp.innerHTML = rowsHtml;
    [...temp.children].forEach(row => tbody.insertBefore(row, insertPoint));
    insertPoint.remove();
}

function renderRecordTable(firstRecords, secondRecords, tbodyId) {
    const merged = [...firstRecords, ...secondRecords];
    const grouped = {};
    let totalAmount = 0;

    merged.forEach(record => {
        const rawAccount = record.account || '';
        const account = rawAccount.split('/')[0].trim();  // 복리후생비/식대 → 복리후생비

        const rawAmount = record.amount || record.money || '0';
        const amount = parseInt(rawAmount.toString().replace(/[^0-9.-]/g, '')) || 0;

        if (!grouped[account]) grouped[account] = 0;
        grouped[account] += amount;
    });

    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';

    Object.entries(grouped).forEach(([account, amount]) => {
        totalAmount += amount;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${account}</td>
            <td>${amount.toLocaleString()}원</td>
        `;
        tbody.appendChild(row);
    });

    // 총계 행 추가
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
        <td style="background-color: #e6f4d9; font-weight: bold;">총계</td>
        <td style="background-color: #e6f4d9; font-weight: bold;">${totalAmount.toLocaleString()}원</td>
    `;
    tbody.appendChild(totalRow);
}



function renderBudgetTable(firstBudget, secondBudget, tableId) {
    const merged = [...firstBudget, ...secondBudget];
    const grouped = {};

    merged.forEach(row => {
        const position = row.position || row.Position || '기타'; // 대소문자 대응
        const person = parseFloat(row.person || row.Person || 0);
        const md = parseFloat(row.md || row.M_D || 0);
        const money = parseFloat(row.money || row.amount || 0);

        if (!grouped[position]) {
            grouped[position] = { person: 0, md: 0, money: 0, inputMan: 0 };
        }

        grouped[position].person += person;
        grouped[position].md += md;
        grouped[position].money += money;
        grouped[position].inputMan += person * md; // 요구 방식: 누적합
    });

    const tbody = document.getElementById(tableId);
    tbody.innerHTML = '';

    let totalPerson = 0, totalMD = 0, totalMoney = 0, totalInputMan = 0;

    Object.entries(grouped).forEach(([position, { person, md, money, inputMan }]) => {
        totalPerson += person;
        totalMD += md;
        totalMoney += money;
        totalInputMan += inputMan;

        tbody.innerHTML += `
            <tr>
                <td>${position}</td>
                <td>${person}</td>
                <td>${md.toFixed(2)}</td>
                <td>${inputMan.toFixed(2)}</td>
                <td>${money.toLocaleString()}원</td>
            </tr>
        `;
    });

    tbody.innerHTML += `
        <tr style="font-weight:bold; background-color: #e6f4d9;">
            <td style="background-color: #e6f4d9;">총계</td>
            <td style="background-color: #e6f4d9;">${totalPerson}</td>
            <td style="background-color: #e6f4d9;">${totalMD.toFixed(2)}</td>
            <td style="background-color: #e6f4d9;">${totalInputMan.toFixed(2)}</td>
            <td style="background-color: #e6f4d9;">${totalMoney.toLocaleString()}원</td>
        </tr>
    `;
}

function saveNote() {
    const rows = document.querySelectorAll('#note_tbody tr');
    const data = [];

    const contractCode = document.getElementById('project-contractCode').value;

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
            const department = cells[0].textContent.trim();
            const note = cells[1].textContent.trim();

            const isValid = value =>
                value && value.toLowerCase() !== 'null' && value.toLowerCase() !== 'none';

            if (isValid(department) || isValid(note)) {
                data.push({
                    department,
                    note,
                    contractcode: contractCode
                });
            }
        }
    });

    // 서버에 전송
    fetch('/api/save_note', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: data })
    })
        .then(response => {
            if (!response.ok) throw new Error('저장 실패');
            return response.json();
        })
        .then(result => {
            alert('검토사항이 저장되었습니다.');
        })
        .catch(error => {
            console.error('저장 중 오류 발생:', error);
            alert('저장에 실패했습니다.');
        });
}

function openModal(forExecution = false) {
    // 모드 저장 (수정 or 수행사업 전환)
    window.isExecutionMode = forExecution;

    // 모달 열기
    document.getElementById("editModal").style.display = "block";
    document.body.classList.add("modal-open"); // 스크롤 막기
}

function openRecordModal(button) {
    document.body.classList.add('modal-open');  // body 스크롤 막기
    btnID = button.id;

    // data-department 읽어서 저장 버튼에 세팅
    const department = button.getAttribute("data-department");
    const modifySaveButton = document.getElementById("modifySave_BTN");
    if (modifySaveButton) {
        modifySaveButton.setAttribute("data-department", department);
    }

    if (btnID == 'EXrecordsModal_fir' || btnID == 'EXrecordsModal_sec' || btnID == 'clone_EXrecordsModal_fir' || btnID == 'clone_EXrecordsModal_sec') {
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
        else if (department === 'out_fir') {
            data = out_first_records;
        }
        else if (department === 'out_sec') {
            data = out_second_records;
        }
        console.log('department', department);
        console.log('data', data);
        updateRecordTable(data);

        document.getElementById('modal_EXrecordsModal').style.display = 'block';
    }
}

// 모달 닫기
function closeQuantityModal() {
    document.body.classList.remove('modal-open');  // body 스크롤 다시 활성화
    document.getElementById('modal_EXrecordsModal').style.display = 'none';
}


function closeModal() {
    document.getElementById("editModal").style.display = "none";
    document.body.classList.remove("modal-open"); // 스크롤 해제
}

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

//공통 파일 처리 함수
async function uploadFilesToServer(files) {
    try {
        const formData = new FormData();
        const contractCode = document.getElementById('project-contractCode').value;
        console.log('test')
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

// 사업개요 수정 페이지 전환 함수
function toggleEdit(tabId) {
    year = getCurrentYear();
    const projectId = document.getElementById('project-id').value;
    if (!projectId) {
        alert("수정할 프로젝트 ID를 찾을 수 없습니다.");
        return;
    }
    console.log(`Navigating to edit mode for projectId: ${projectId}`);
    window.location.href = `/addproject?projectId=${projectId}&year=${year}&mode=examine`;
}

function goToCloneProject() {
    year = getCurrentYear();
    const projectId = document.getElementById('project-id').value;
    if (projectId) {
        window.location.href = `/addproject?projectId=${projectId}&year=${year}&action=clone`;
    } else {
        alert('프로젝트 정보를 찾을 수 없습니다.');
    }
}

// function projectBidCostCal() {
//     // projectBaseCost 값 가져오기
//     const baseCostInput = document.getElementById('projectBaseCost');
//     if (!baseCostInput) return;

//     const baseCost = parseFloat(baseCostInput.value.replace(/,/g, '')) || 0;

//     // 투찰금액(80%)
//     const bidCost = Math.round(baseCost * 0.8);
//     // 투찰금액(VAT제외)
//     const bidCostNoVAT = Math.round(bidCost / 1.1);

//     // 각 td에 값 출력 (천단위 콤마 추가)
//     document.getElementById('ProjectBidCost').textContent = bidCost.toLocaleString() + ' 원';
//     document.getElementById('ProjectBidCost_NoVAT').textContent = bidCostNoVAT.toLocaleString() + ' 원';
// }

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

function updateRecordTable(data) {
    const tbody = document.getElementById('Dep_Modify_Record_tbody');
    tbody.innerHTML = '';

    if (!Array.isArray(data) || data.length === 0) {
        return;
    }

    data.forEach(record => {
        let row = `
            <tr>
                <td>
                    <select class="account-select" onchange="updateRecordsSum(this.parentElement.parentElement)">
                        <option value="복리후생비/식대" ${record.account === "복리후생비/식대" ? "selected" : ""}>복리후생비/식대</option>
                        <option value="복리후생비/음료 외" ${record.account === "복리후생비/음료 외" ? "selected" : ""}>복리후생비/음료 외</option>
                        <option value="여비교통비/(출장)숙박" ${record.account === "여비교통비/(출장)숙박" ? "selected" : ""}>여비교통비/(출장)숙박</option>
                        <option value="여비교통비/주차료" ${record.account === "여비교통비/주차료" ? "selected" : ""}>여비교통비/주차료</option>
                        <option value="여비교통비/대중교통" ${record.account === "여비교통비/대중교통" ? "selected" : ""}>여비교통비/대중교통</option>
                        <option value="소모품비/현장물품" ${record.account === "소모품비/현장물품" ? "selected" : ""}>소모품비/현장물품</option>
                        <option value="소모품비/기타소모품" ${record.account === "소모품비/기타소모품" ? "selected" : ""}>소모품비/기타소모품</option>
                        <option value="차량유지비/주유" ${record.account === "차량유지비/주유" ? "selected" : ""}>차량유지비/주유</option>
                        <option value="차량유지비/차량수리 외" ${record.account === "차량유지비/차량수리 외" ? "selected" : ""}>차량유지비/차량수리 외</option>
                        <option value="도서인쇄비/출력 및 제본" ${record.account === "도서인쇄비/출력 및 제본" ? "selected" : ""}>도서인쇄비/출력 및 제본</option>
                        <option value="운반비/등기우편 외" ${record.account === "운반비/등기우편 외" ? "selected" : ""}>운반비/등기우편 외</option>
                        <option value="지급수수료/증명서발급" ${record.account === "지급수수료/증명서발급" ? "selected" : ""}>지급수수료/증명서발급</option>
                        <option value="기타/그 외 기타" ${record.account === "기타/그 외 기타" ? "selected" : ""}>기타/그 외 기타</option>
                        <option value="삭제" ${record.account === "삭제" ? "selected" : ""}>삭제</option>
                    </select>
                </td>
                <td class="edit_cell" onclick=" inputText(this, 'addRecord')">${record.people_count ?? ''}</td>
                <td class="edit_cell" onclick=" inputText(this, 'addRecord')">${record.frequency ?? ''}</td>
                <td class="edit_cell" onclick=" inputText(this, 'addRecord')">${record.days ?? ''}</td>
                <td class="edit_cell" onclick=" inputText(this, 'addRecord')">${record.unit_price ?? ''}</td>
                <td class="amount-cell">${record.amount ? parseInt(record.amount).toLocaleString() : ''}</td>
                <td class="edit_cell" onclick="inputText(this, 'note')">${record.note || ''}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

function saveExpenseRecords() {
    const tbody = document.getElementById('Dep_Modify_Record_tbody');
    const rows = tbody.querySelectorAll('tr');
    const records = [];
    const updateDepartment = document.getElementById("modifySave_BTN").getAttribute("data-department");
    const contractcode = document.getElementById('project-contractCode').value;
    const projectID = document.getElementById('project-id').value;
    const mode = 0;
    let department = "";

    if (updateDepartment === "fir") {
        department = document.getElementById("Dep_fir_header_text").textContent.trim();
    } else if (updateDepartment === "sec") {
        department = document.getElementById("Dep_sec_header_text").textContent.trim();
    } else if (updateDepartment === "out_fir") {
        department = document.getElementById("out_Dep_fir_header_text").textContent.trim();
    } else if (updateDepartment === "out_sec") {
        department = document.getElementById("out_Dep_sec_header_text").textContent.trim();
    }


    if (updateDepartment.includes('out')) {
        mode = 1
    }
    rows.forEach(row => {
        const cells = row.children;
        // 빈 행 또는 총계 행은 제외
        if (cells.length < 7) return;
        // 항목, 인원, 횟수, 일수, 단가, 금액, 비고
        const account = cells[0].querySelector('select') ? cells[0].querySelector('select').value : '';
        const people = parseFloat(cells[1].textContent.replace(/,/g, '')) || 0;
        const freq = parseFloat(cells[2].textContent.replace(/,/g, '')) || 0;
        const days = parseFloat(cells[3].textContent.replace(/,/g, '')) || 0;
        const unit = parseFloat(cells[4].textContent.replace(/,/g, '')) || 0;
        const amount = parseFloat(cells[5].textContent.replace(/,/g, '')) || 0;
        const note = cells[6].textContent.trim();

        // 빈 행은 저장하지 않음
        if (!account) return;

        records.push({
            projectID: projectID,
            account: account,
            people_count: people,
            frequency: freq,
            days: days,
            unit_price: unit,
            amount: amount,
            note: note,
            contractcode: contractcode,
            department: department,
            mode: mode
        });
    });

    fetch('/api/save_examine_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            project_id: projectID,
            records: records
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('저장되었습니다.');
                // 모달 닫기 등 후처리
                //새로고침
                reloadWithCurrentState();
                // 필요시 테이블 새로고침 등
            } else {
                alert('저장 실패: ' + (data.message || '서버 오류'));
            }
        })
        .catch(err => {
            console.error(err);
            alert('서버 오류로 저장에 실패했습니다.');
        });
}

