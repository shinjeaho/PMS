document.addEventListener('DOMContentLoaded', function() {
    // 테이블의 모든 셀 선택
    var table = document.getElementById('expense_table');
    var rows = table.getElementsByTagName('tr');

    for (var i = 1; i < rows.length; i++) { // 헤더를 건너뛰고 데이터 행부터 시작
        var cells = rows[i].getElementsByTagName('td');

        for (var j = 1; j < cells.length; j++) { // 첫 번째 셀(직급)은 건너뛰고 숫자 셀만 포맷팅
            var cellValue = cells[j].textContent.trim();
            if (!isNaN(cellValue) && cellValue !== "") {
                var numberValue = parseFloat(cellValue);
                cells[j].textContent = numberValue.toLocaleString(); // 자릿수 포맷팅
            }
        }
    }
});

function toggleEdit(tabId) {
    var viewDiv = document.getElementById(tabId).getElementsByClassName("view-mode")[0];
    var editDiv = document.getElementById(tabId).getElementsByClassName("edit-mode")[0];
    viewDiv.style.display = (viewDiv.style.display === "none") ? "block" : "none";
    editDiv.style.display = (editDiv.style.display === "none") ? "block" : "none";
}

function formatCurrency(input) {
    var value = input.value.replace(/[^0-9]/g, '');
    value = parseInt(value, 10);
    if (!isNaN(value)) {
        input.value = value.toLocaleString();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const editDetailsForm = document.getElementById('editDetailsForm');
    if (editDetailsForm) {
        editDetailsForm.addEventListener('submit', function(event) {
            event.preventDefault(); // 기본 폼 제출 방지
            submitEditForm(event);
        });
    }
});

function submitEditForm(event) {
    event.preventDefault(); // 기본 폼 제출 방지
    const form = event.target;
    const formData = new FormData(form);
    const jsonData = {};

    formData.forEach((value, key) => {
        jsonData[key] = value;
    });

    fetch(form.action, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.message === 'Update successful') {
            alert('수정이 완료되었습니다.');
            location.href = '/project_detail/' + data.project_id; // 프로젝트 상세 페이지로 리디렉션
        } else {
            alert('수정에 실패했습니다. 다시 시도하세요.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('수정에 실패했습니다. 다시 시도하세요.');
    });
}