function submitPasswordChange(event) {
    event.preventDefault(); // 폼의 기본 제출 막기

    const formData = new FormData(event.target);

    fetch('/change_password', {
        method: 'POST',
        body: formData
    }).then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('비밀번호가 변경되었습니다.');
                closeChangePasswordModal();
            } else {
                alert(data.message);
            }
        });
}

function openChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'block';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}

function selectMenu(menuId) {
    // 메뉴명 출력
    const nameMap = {
        staff: '직원관리',
        add_staff: '직원추가',
        add_dept: '부서추가',
        auth: '권한관리'
    };
    document.getElementById('currentMenuName').innerText = nameMap[menuId];

    // 그리드 전환
    document.querySelectorAll('.grid').forEach(div => div.style.display = 'none');
    document.getElementById(menuId).style.display = 'block';
}

function closeAdmin() {
    document.querySelector('.admin-container').style.display = 'none';
}

function openAdminModal() {
    document.getElementById('adminModal').style.display = 'flex'; // 또는 block
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

function addStaffRow() {
    const tbody = document.querySelector("#staffGrid tbody");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td><button onclick="deleteRow(this)">삭제</button></td>
    `;
    tbody.appendChild(row);
    enableTdEditing("staffGrid");
}

function deleteRow(btn) {
    const row = btn.closest("tr");
    row.remove();
}

function enableTdEditing(tableId) {
    const tableBody = document.querySelector(`#${tableId} tbody`);
    const rows = tableBody.querySelectorAll("tr");

    rows.forEach(row => {
        const cells = row.querySelectorAll("td");

        cells.forEach((td, idx) => {
            if (idx === cells.length - 1) return; // 마지막 열(삭제 버튼)은 제외

            td.onclick = function () {
                if (td.querySelector("input")) return;

                const original = td.textContent.trim();
                td.textContent = "";

                const input = document.createElement("input");
                input.type = "text";
                input.value = original;

                // 👇 스타일 핵심 정리
                input.style.width = "100%";
                input.style.height = "100%";
                input.style.boxSizing = "border-box";
                
                input.style.padding = "0";
                input.style.margin = "0";
                input.style.border = "none";
                input.style.borderRadius = "0";  // ✅ 테두리 둥글게 막기
                input.style.background = "transparent";
                
                input.style.fontSize = "inherit";
                input.style.lineHeight = "normal"; // 또는 "1"
                input.style.textAlign = "center";
                input.style.display = "block"; // ✅ inline-block이면 세로 밀림 가능성
                input.addEventListener("blur", () => {
                    td.textContent = input.value.trim();
                });

                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") input.blur();
                });

                td.appendChild(input);
                input.focus();
            };
        });
    });
}

// 초기 실행
enableTdEditing("staffGrid");