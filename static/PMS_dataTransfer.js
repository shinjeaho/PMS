
const dataSelect = document.getElementById('dataSelect');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('dataText');
const filealert = document.getElementById('dataText2');
const modal = document.getElementById('modal');
const modalTableBody = document.getElementById('modalTableBody');
const loading = document.getElementById('loading');
document.addEventListener("DOMContentLoaded", function () {
    fetchTransferData(); // 페이지 로드 시 데이터 불러오기

    document.getElementById('modalCloseButton').addEventListener('click', closeTransfer)
});

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

function handleFileUpload(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('엑셀 파일만 업로드 가능합니다.');
        return;
    }
    fileName.textContent = `업로드된 파일: ${file.name}`;
    fileName.style.color = "black";
    filealert.textContent = " ";
    sendFileToServer(file);
}

let extractedData = []; // 추출 데이터 저장 배열

function sendFileToServer(file) {
    loading.style.display = 'block'; // 로딩 표시 활성화
    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        extractedData = data;
        loading.style.display = 'none'; // 로딩 표시 숨김
        displayDataInModal(data);
    })
    .catch(error => {
        loading.style.display = 'none'; // 로딩 표시 숨김
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
    loading.style.display = 'block';
    
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
        loading.style.display = 'none';
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


