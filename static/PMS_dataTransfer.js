
const dataSelect = document.getElementById('dataSelect');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('dataText');
const filealert = document.getElementById('dataText2');
const modal = document.getElementById('modal');
const modalTableBody = document.getElementById('modalTableBody');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const engineerDataSelect = document.getElementById('engineerDataSelect');
const engineerFileInput = document.getElementById('engineerFileInput');
const engineerDataText = document.getElementById('engineerDataText');
const engineerDataText2 = document.getElementById('engineerDataText2');
const engineerPickFileBtn = document.getElementById('engineerPickFileBtn');
const engineerExtractModal = document.getElementById('engineerExtractModal');
const engineerContractList = document.getElementById('engineerContractList');
let transferDataLoaded = false;
let extractedEngineerItems = [];

document.addEventListener("DOMContentLoaded", function () {
    initTransferMenu();

    document.getElementById('modalCloseButton').addEventListener('click', closeTransfer)
});

function isExcelFile(file) {
    if (!file || !file.name) return false;
    return file.name.toLowerCase().endsWith('.xlsx');
}

function isXlsxFile(file) {
    if (!file || !file.name) return false;
    return file.name.toLowerCase().endsWith('.xlsx');
}

function setLoading(isVisible, message = '파일 처리 중...') {
    if (!loading) return;
    if (loadingText) {
        loadingText.textContent = message;
    }
    loading.style.display = isVisible ? 'flex' : 'none';
}

function initTransferMenu() {
    const menuButtons = document.querySelectorAll('.transfer-menu-button');
    const panels = document.querySelectorAll('.transfer-panel');

    menuButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            if (!targetId) return;

            menuButtons.forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');

            panels.forEach((panel) => {
                if (panel.id === targetId) {
                    panel.classList.add('is-active');
                } else {
                    panel.classList.remove('is-active');
                }
            });

            if (targetId === 'projectTransferSection' && !transferDataLoaded) {
                fetchTransferData();
                transferDataLoaded = true;
            }
        });
    });
}

function fetchTransferData(page = 1) {
    fetch(`/api/get_transfer_data/?page=${page}`)
        .then(response => response.json())
        .then(data => {
            renderTransferTable(data.projects);
            renderPagination(data.current_page, data.total_pages);
        })
        .catch(error => console.error("Error fetching transfer data:", error));
}

function renderTransferTable(data) {
    const tbody = document.getElementById("transferList_tbody");
    tbody.innerHTML = ""; // 기존 내용 초기화

    data.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.ContractCode}</td>
            <td>${row.ProjectName}</td>
        `;
        
        tr.onclick = () => transferModal(row); // 클릭 시 모달 열기
        
        tbody.appendChild(tr);
    });
}

function renderPagination(currentPage, totalPages) {
    const paginationContainer = document.getElementById("pagination");
    paginationContainer.innerHTML = "";

    if (currentPage > 1) {
        paginationContainer.appendChild(createPageButton("<", currentPage - 1));
    }

    for (let i = 1; i <= totalPages; i++) {
        paginationContainer.appendChild(createPageButton(i, i, currentPage));
    }

    if (currentPage < totalPages) {
        paginationContainer.appendChild(createPageButton(">", currentPage + 1));
    }
}

function createPageButton(label, page, currentPage) {
    const pageButton = document.createElement("button");
    pageButton.innerText = label;
    pageButton.classList.add("pagination-button");

    if (page === currentPage) {
        pageButton.classList.add("active");
    }

    pageButton.onclick = () => {
        fetchTransferData(page);
    };

    return pageButton;
}

dataSelect.addEventListener('click', () => fileInput.click());

dataSelect.addEventListener('dragover', (e) => {
    e.preventDefault();
    dataSelect.classList.add('dragover');
});

dataSelect.addEventListener('dragleave', () => {
    dataSelect.classList.remove('dragover');
});

dataSelect.addEventListener('drop', (e) => {
    e.preventDefault();
    dataSelect.classList.remove('dragover');
    handleFileUpload(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
    handleFileUpload(e.target.files[0]);
});

if (engineerDataSelect && engineerFileInput) {
    engineerDataSelect.addEventListener('click', () => engineerFileInput.click());

    engineerDataSelect.addEventListener('dragover', (e) => {
        e.preventDefault();
        engineerDataSelect.classList.add('dragover');
    });

    engineerDataSelect.addEventListener('dragleave', () => {
        engineerDataSelect.classList.remove('dragover');
    });

    engineerDataSelect.addEventListener('drop', (e) => {
        e.preventDefault();
        engineerDataSelect.classList.remove('dragover');
        handleEngineerFileUpload(e.dataTransfer.files[0]);
    });

    engineerFileInput.addEventListener('change', (e) => {
        handleEngineerFileUpload(e.target.files[0]);
    });
}

if (engineerPickFileBtn && engineerFileInput) {
    engineerPickFileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        engineerFileInput.click();
    });
}

function handleFileUpload(file) {
    if (!isExcelFile(file)) {
        alert('.xlsx 파일만 업로드 가능합니다.');
        return;
    }
    fileName.textContent = `업로드된 파일: ${file.name}`;
    fileName.style.color = "black";
    filealert.textContent = " ";
    sendFileToServer(file);
}

function handleEngineerFileUpload(file) {
    if (!isXlsxFile(file)) {
        alert('참여기술자 추출은 .xlsx 파일만 업로드 가능합니다.');
        return;
    }
    if (engineerDataText) {
        engineerDataText.textContent = `업로드된 파일: ${file.name}`;
        engineerDataText.style.color = 'black';
    }
    if (engineerDataText2) {
        engineerDataText2.textContent = '파일이 선택되었습니다.';
        engineerDataText2.style.color = '#6b7280';
    }

    extractEngineerTransferData(file);
}

function extractEngineerTransferData(file) {
    setLoading(true, '계약번호 비교/제외 처리 중...');
    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/engineer_transfer/extract', {
        method: 'POST',
        body: formData,
    })
        .then((response) => response.json())
        .then((result) => {
            if (!result.success) {
                throw new Error(result.message || '참여기술자 추출 실패');
            }

            const items = Array.isArray(result.items) ? result.items : [];
            if (items.length === 0) {
                alert('삽입 가능한 참여기술자 데이터가 없습니다.');
                return;
            }

            extractedEngineerItems = items.map((item) => ({
                contractcode: item.contractcode,
                project_name: item.project_name,
                rows: Array.isArray(item.rows) ? item.rows : [],
                checked: true,
                expanded: false,
            }));

            renderEngineerContractList();
            openEngineerExtractModal();
        })
        .catch((error) => {
            console.error('[engineer_transfer] extract failed:', error);
            alert(error.message || '참여기술자 추출 중 오류가 발생했습니다.');
        })
        .finally(() => {
            setLoading(false);
        });
}

function renderEngineerContractList() {
    if (!engineerContractList) return;
    engineerContractList.innerHTML = '';

    extractedEngineerItems.forEach((item, index) => {
        const header = document.createElement('tr');
        header.className = 'engineer-contract-row';
        header.addEventListener('click', () => toggleEngineerItemExpand(index));

        const checkboxWrap = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!item.checked;
        checkbox.addEventListener('click', (event) => {
            event.stopPropagation();
            updateEngineerItemChecked(index, checkbox.checked);
        });
        checkboxWrap.appendChild(checkbox);

        const contractCell = document.createElement('td');
        contractCell.textContent = item.contractcode || '-';

        const projectCell = document.createElement('td');
        projectCell.style.textAlign = 'left';
        projectCell.textContent = item.project_name || '-';

        const arrowCell = document.createElement('td');
        arrowCell.className = 'engineer-contract-arrow';
        arrowCell.textContent = item.expanded ? '▲' : '▼';

        header.appendChild(checkboxWrap);
        header.appendChild(contractCell);
        header.appendChild(projectCell);
        header.appendChild(arrowCell);

        const detailRow = document.createElement('tr');
        detailRow.className = `engineer-contract-detail-row ${item.expanded ? 'is-open' : ''}`;

        const detailCell = document.createElement('td');
        detailCell.colSpan = 4;
        detailCell.className = 'engineer-contract-detail-cell';
        detailCell.innerHTML = buildEngineerDetailTable(item.rows);
        detailRow.appendChild(detailCell);

        engineerContractList.appendChild(header);
        engineerContractList.appendChild(detailRow);
    });
}

function buildEngineerDetailTable(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (safeRows.length === 0) {
        return '<div style="padding:8px; color:#6b7280;">추출된 담당업무 데이터가 없습니다.</div>';
    }

    const trs = safeRows
        .map(
            (row) => `
            <tr>
                <td>${escapeHtml(row.work_position || '-')}</td>
                <td>${escapeHtml(row.name || '-')}</td>
            </tr>
        `
        )
        .join('');

    return `
        <table class="engineer-detail-table">
            <thead>
                <tr>
                    <th style="width:40%;">담당업무</th>
                    <th style="width:60%;">이름</th>
                </tr>
            </thead>
            <tbody>${trs}</tbody>
        </table>
    `;
}

function updateEngineerItemChecked(index, checked) {
    if (!extractedEngineerItems[index]) return;
    extractedEngineerItems[index].checked = checked;
}

function toggleEngineerItemExpand(index) {
    if (!extractedEngineerItems[index]) return;
    extractedEngineerItems[index].expanded = !extractedEngineerItems[index].expanded;
    renderEngineerContractList();
}

function openEngineerExtractModal() {
    if (!engineerExtractModal) return;
    engineerExtractModal.style.display = 'flex';
}

function closeEngineerExtractModal() {
    if (!engineerExtractModal) return;
    engineerExtractModal.style.display = 'none';
}

function insertEngineerTransferData() {
    const selectedItems = extractedEngineerItems
        .filter((item) => item.checked)
        .map((item) => ({
            contractcode: item.contractcode,
            rows: item.rows,
        }));

    if (selectedItems.length === 0) {
        alert('삽입할 데이터를 선택해 주세요.');
        return;
    }

    setLoading(true, '데이터 삽입 중...');
    fetch('/api/engineer_transfer/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedItems }),
    })
        .then((response) => response.json())
        .then((result) => {
            if (!result.success) {
                throw new Error(result.message || '삽입 실패');
            }
            alert(result.message || '참여기술자 데이터 삽입이 완료되었습니다.');
            closeEngineerExtractModal();
        })
        .catch((error) => {
            console.error('[engineer_transfer] insert failed:', error);
            alert(error.message || '참여기술자 데이터 삽입 중 오류가 발생했습니다.');
        })
        .finally(() => {
            setLoading(false);
        });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

let extractedData = []; // 추출 데이터 저장 배열

function sendFileToServer(file) {
    setLoading(true, '파일 처리 중...');
    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        extractedData = data;
        setLoading(false);
        displayDataInModal(data);
    })
    .catch(error => {
        setLoading(false);
        console.error('Error:', error);
    });
}

function displayDataInModal(data) {
    modalTableBody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${row.B}</td><td>${row.H}</td>`;
        
        modalTableBody.appendChild(tr);
    });
    modal.style.display = 'flex';
}

function closeModal() {
    fileName.textContent = `★PMS리스트 끌어오기 및 선택`;
    fileName.style.color = "#ccc";
    filealert.textContent = "★PMS리스트 파일을 추출하기 위한 페이지 입니다.";
    modal.style.display = 'none';
}

function saveExcelModal() {
    if (extractedData.length === 0) {
        alert('저장할 데이터가 없습니다.');
        return;
    }
    else{
        console.log('extractedData',extractedData)
    }
    setLoading(true, '데이터 저장 중...');
    
    fetch('/saveExcelData', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(extractedData)
    })
    .then(response => response.json())
    .then(result => {
        alert(result.message);
        closeModal();
    })
    .catch(error => console.error('Error:', error))
    .finally(() => {
        setLoading(false);
    });
}

function closeTransfer(){
    document.getElementById('transferModal').style.display = 'none'
}


function transferModal(row){
    fetch(`/api/get_transfer_detail?contractCode=${row.ContractCode}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert("데이터를 불러오는 중 오류가 발생했습니다.");
                return;
            }
            const cost = Number(data.ProjectCost);  // 숫자로 변환
            const cost_NoVAT = Math.round(cost/1.1);
            console.log(cost);  // 값 확인
            console.log(data)
            console.log("StartDate:", data.ContributionRate);

            document.getElementById("transferModal").style.display = "block";
            document.getElementById("contractCode").value = data.ContractCode;
            document.getElementById("projectName").value = data.ProjectName;
            document.getElementById("projectCost").value = cost.toLocaleString() || "";
            document.getElementById("projectCost_NoVAT").value = cost_NoVAT.toLocaleString() || "";
            document.getElementById("ContributionRate").value = data.ContributionRate;
            document.getElementById("startDate").value = data.StartDate || "";
            document.getElementById("endDate").value = data.EndDate || "";
            document.getElementById("orderPlace").value = data.OrderPlace || "";
            document.getElementById("manager").value = data.Manager || "";
            document.getElementById("projectDetails").value = data.ProjectDetails || "";
        })
        .catch(error => console.error("Error fetching transfer data:", error));
}

document.getElementById("transferForm").addEventListener("submit", async function (event) {
    event.preventDefault(); // 기본 제출 방지

    const formData = {
        B: document.getElementById("contractCode").value,  // 사업코드
        H: document.getElementById("projectName").value,  // 사업명
        J: document.getElementById("projectCost").value.replaceAll(",", ""),  // ✅ 쉼표 제거
        D: document.getElementById("startDate").value,  // 계약일
        G: document.getElementById("endDate").value,  // 종료일
        I: document.getElementById("orderPlace").value,  // 발주처
        L: document.getElementById("ContributionRate").value || null,  // 지분율
        manager: document.getElementById("manager").value || null,  // 담당자
        projectDetails: document.getElementById("projectDetails").value || null,  // 사업개요
    };

    try {
        const response = await fetch("/insertProject", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify([formData]) // 배열 형태로 전송
        });

        const result = await response.json();
        alert(result.message); // 성공 메시지 출력

        if (response.ok) {
            document.getElementById("transferForm").reset(); // 입력 폼 초기화
        }
    } catch (error) {
        console.error("Error:", error);
        alert("데이터 저장 중 오류가 발생했습니다.");
    }
});

function home() {
    window.location.href = '/';  
}


