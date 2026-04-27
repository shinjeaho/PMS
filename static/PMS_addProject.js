document.addEventListener('DOMContentLoaded', () => {
    var today = new Date().toISOString().substring(0, 10);
    // document.getElementById('startDate').value = today;
    console.log(isEditMode ? '[DEBUG] 수정 모드' : '[DEBUG] 신규 모드');
    const formElement = document.getElementById('addProjectForm');
    if (!formElement) {
        console.error("[ERROR] Form with ID 'addProjectForm' not found!");
    } else {
        console.log("[DEBUG] Form element found:", formElement);

        // 엔터로 폼 제출 방지
        formElement.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                // textarea 등에서는 허용
                if (event.target.tagName !== 'TEXTAREA') {
                    event.preventDefault();
                    return false;
                }
            }
        });

        formElement.addEventListener('submit', function (event) {
            event.preventDefault();
            const formData = collectFormData();

            // 프론트 계약형식 조합 검증: 단일+연차 불가, 단일+이월=3, 연차+이월=4
            const typesSet = new Set(Array.isArray(formData.projectType) ? formData.projectType : []);
            const hasSingle = typesSet.has('단일사업') || typesSet.has('신규사업');
            const hasYear = typesSet.has('연차사업');
            const hasCarry = typesSet.has('이월사업');
            if (hasSingle && hasYear) {
                alert('계약형식 선택 오류: 단일사업과 연차사업은 함께 선택할 수 없습니다.');
                return; // 제출 중단
            }
            // 참고: 백엔드에서 yearProject 값을 최종 결정
            let yr = 0;
            if (hasYear && hasCarry) yr = 4;
            else if (hasSingle && hasCarry) yr = 3;
            else if (hasYear) yr = 1;
            else if (hasCarry) yr = 2;
            else yr = 0;
            console.log('[DEBUG] yearProject preview (client):', yr, 'from', Array.from(typesSet));
            const isCloneMode = document.getElementById('isCloneMode')?.value === '1';
            // 복제(수행사업 전환) 모드일 때 처리
            if (isCloneMode) {
                delete formData.projectID;
                formData.action = 'clone';
            }

            console.log("[DEBUG] FormData collected:", formData); // 디버깅 출력
            fetch('/addproject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
                .then(res => res.json().then(data => ({ status: res.status, body: data })))
                .then(({ status, body }) => {
                    if (status === 201) {
                        alert('프로젝트 추가 성공');
                        if(body.mode === 'new'){
                            if(body.type === true){
                                location.replace(`/project_detail/${body.projectID}`);
                            }
                            else if (body.type === false) {
                                location.replace(`/project_examine/${body.projectID}`);
                            }
                        }
                        else if (body.mode === 'clone') {
                            location.replace(`/project_detail/${body.projectID}`);
                        }
                    } else if (status === 200) {
                        alert('수정 성공');
                        if( body.mode === 'detail'){
                            location.replace(`/project_detail/${formData.projectID}`);
                        }
                        else if (body.mode === 'examine') {
                            location.replace(`/project_examine/${formData.projectID}`);
                        }
                    } else if (status === 400 && body.exists) {
                        alert(`"${formData.contractCode}" 이미 존재`);
                    } else {
                        alert('실패');
                    }
                })
                .catch(err => {
                    console.error(err);
                    alert('서버 오류');
                });
        });
    }

    // 파일 업로드 및 초기 렌더링
    initFileUpload();
    renderInitialFileList();
    initContributionRateInput();
    initReferenceProjectTags();
});



function formatCurrency(input) {
    var value = input.value.replace(/[^0-9]/g, ''); // 숫자 이외 제거
    value = parseInt(value, 10); // 정수로 변환 (앞의 불필요한 0 제거)
    if (!isNaN(value)) { // 숫자인 경우에만 실행
        input.value = value.toLocaleString(); // 로캘에 맞는 숫자 포매팅
    }
}

//사업비
document.getElementById('projectCost').addEventListener('input', function () {
    formatCurrency(this);
});

document.getElementById('projectCost').addEventListener('blur', function () {
    var value = parseFloat(this.value.replace(/,/g, '')); // 쉼표 제거 후 숫자 변환
    var noVATValue = Math.round(value / 1.1); // VAT 제외 계산
    var flooredValue = Math.round(noVATValue); // 소수점 버림
    document.getElementById('ProjectCost_NoVAT').value = flooredValue.toLocaleString(); // 결과 포매팅하여 입력
});

document.getElementById('ProjectCost_NoVAT').addEventListener('input', function () {
    formatCurrency(this);
});


// 투찰금액
document.getElementById('BidPrice').addEventListener('input', function () {
    formatCurrency(this);
});

document.getElementById('BidPrice').addEventListener('blur', function () {
    var value = parseFloat(this.value.replace(/,/g, '')); // 쉼표 제거 후 숫자 변환
    var noVATValue = Math.round(value / 1.1); // VAT 제외 계산
    var flooredValue = Math.round(noVATValue); // 소수점 버림
    document.getElementById('BidPrice_NoVAT').value = flooredValue.toLocaleString(); // 결과 포매팅하여 입력
});

document.getElementById('BidPrice_NoVAT').addEventListener('input', function () {
    formatCurrency(this);
});


document.getElementById('contractCode').addEventListener('blur', function () {
    var contractCodeValue = this.value.trim();
    // "검토" 포함 여부 확인 (대소문자 무관)
    var bidPriceInput = document.getElementById('BidPrice');
    if (contractCodeValue.includes('검토')) {
        bidPriceInput.removeAttribute('readonly');
    } else {
        bidPriceInput.setAttribute('readonly', true);
    }
});

// 테이블 내 td 클릭 시 textbox로 변경하는 함수
function TextChange(td, isText = false) {
    // 이미 input이 있는 경우 return
    if (td.querySelector('input')) return;

    // input 생성 및 설정
    const input = document.createElement('input');
    input.type = 'text';
    input.value = td.innerText;  // 기존 값을 초기값으로 설정
    input.classList.add('editable-input');

    // td 크기와 동일하게 input 크기 설정
    const tdWidth = td.offsetWidth;
    const tdHeight = td.offsetHeight;
    const savetd = td.innerText;  // 기존 값을 저장

    // 스타일 설정
    input.style.width = (tdWidth - 2) + 'px';  // 테두리 고려하여 2px 감소
    input.style.height = (tdHeight - 2) + 'px';  // 테두리 고려하여 2px 감소
    input.style.border = '1px solid #cbd5e0';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';  // 좌우 패딩 추가
    input.style.margin = '0';
    input.style.boxSizing = 'border-box';
    input.style.fontSize = '14px';
    input.style.backgroundColor = '#ffffff';

    // td 내용 교체
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    // 입력 이벤트
    input.addEventListener('input', () => {
        let value = input.value.replace(/,/g, '');  // 콤마 제거

        // 숫자 유효성 검사
        if (value && isNumeric(value)) {
            input.value = formatWithCommas(value);  // 콤마 추가
        } else if (!isText) {
            console.log('Invalid input');
        }
    });

    // blur 이벤트
    input.addEventListener('blur', () => {
        const value = input.value.replace(/,/g, '');

        // 숫자 유효성 검사 (isText가 false일 때만)
        if (!isText && value !== '' && !isNumeric(value)) {
            alert('숫자만 입력할 수 있습니다.');
            td.innerText = '0';
        } else {
            // 유효한 값이면 포맷팅하여 표시
            const formattedValue = isText ? value : formatWithCommas(value);
            td.innerText = formattedValue;
        }

        // 숫자인 경우 합계 업데이트
        if (!isText) {
            updateRecordsSum(td.parentElement);
        }
    });

    // Enter 키 이벤트
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            input.blur();
        }
    });
}

// 폼 데이터 수집 함수
function collectFormData() {

    const projectID = window.projectId;
    const contractCode = document.getElementById('contractCode').value;
    const projectName = document.getElementById('projectName').value;
    const projectMode = document.getElementById('mode').value;

    const projectCost = parseFloat(document.getElementById('projectCost').value.replace(/,/g, '')) || 0;
    const ProjectCost_NoVAT = parseFloat(document.getElementById('ProjectCost_NoVAT').value.replace(/,/g, '')) || 0;

    //BidPrice & BidPrice_NoVAT 추가
    const BidPrice = parseFloat(document.getElementById('BidPrice').value.replace(/,/g, '')) || 0;
    const BidPrice_NoVAT = parseFloat(document.getElementById('BidPrice_NoVAT').value.replace(/,/g, '')) || 0;
    const contributionRateInput = document.getElementById('contributionRate');
    const normalizedContributionRate = normalizeContributionRateValue(contributionRateInput?.value);
    if (contributionRateInput && normalizedContributionRate !== null) {
        contributionRateInput.value = formatContributionRateValue(normalizedContributionRate);
    }

    // 계약형식(다중 체크박스) 수집
    const projectTypes = Array.from(document.querySelectorAll('input[name="projectType[]"]:checked'))
        .map(el => el.value);
    // 발주방식(셀렉트) 수집
    const procurementType = document.getElementById('procurementType')?.value || null;

    const formData = {
        projectID: projectID || null,
        contractCode: contractCode,
        projectName: projectName,
        projectCost: projectCost,
        ProjectCost_NoVAT: ProjectCost_NoVAT,

        //신규 추가된 값
        BidPrice: BidPrice,
        BidPrice_NoVAT: BidPrice_NoVAT,

        projectMode: projectMode,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value || null,
        orderPlace: document.getElementById('orderPlace').value,
        manager: document.getElementById('manager').value,
        contributionRate: normalizedContributionRate !== null ? normalizedContributionRate : (contributionRateInput?.value || ''),
        safetyRate: parseFloat(document.getElementById('safetyRate').value) || 0,
        projectDetails: document.getElementById('projectDetails').value.replace(/\n/g, '\r\n'),
        academicResearchRate: parseFloat(document.getElementById('academicResearchRate').value) || 0,
        operationalRate: parseFloat(document.getElementById('operationalRate').value) || 0,
        equipmentRate: parseFloat(document.getElementById('equipmentRate').value) || 0,
        // 계약형식은 백엔드에서 yearProject로 매핑 (0/1/2/3/4)
        projectType: projectTypes,
        // 발주방식 신규 컬럼 전달
        procurementType: procurementType,
        referenceProjects: collectReferenceProjects(),
        files: uploadedFileList
    };
    return formData;
}

function normalizeContributionRateValue(rawValue) {
    const cleaned = String(rawValue ?? '').trim().replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const firstDot = cleaned.indexOf('.');
    const normalized = firstDot === -1
        ? cleaned
        : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    const num = Number(normalized);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100) / 100;
}

function formatContributionRateValue(value) {
    if (!Number.isFinite(value)) return '';
    return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function sanitizeContributionRateInput(rawValue) {
    const cleaned = String(rawValue ?? '').replace(/[^0-9.]/g, '');
    if (!cleaned) return '';

    const firstDot = cleaned.indexOf('.');
    if (firstDot === -1) {
        return cleaned;
    }

    const integerPart = cleaned.slice(0, firstDot);
    const decimalPart = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    return `${integerPart}.${decimalPart}`;
}

function initContributionRateInput() {
    const input = document.getElementById('contributionRate');
    if (!input) return;

    input.addEventListener('input', function () {
        this.value = sanitizeContributionRateInput(this.value);
    });

    input.addEventListener('blur', function () {
        const normalized = normalizeContributionRateValue(this.value);
        this.value = normalized === null ? '' : formatContributionRateValue(normalized);
    });
}

// 참조사업 데이터 수집 (saveBudget와 유사한 방식 적용)
function normalizeReferenceCode(value) {
    const normalized = (value || '').trim();
    if (!normalized) return '';

    const lowerValue = normalized.toLowerCase();
    if (['none', 'null', 'undefined', '-'].includes(lowerValue)) {
        return '';
    }

    return normalized;
}

function collectReferenceProjects() {
    const referenceProjects = [];
    const rows = document.querySelectorAll('#referenceProjectTbody tr');

    rows.forEach((row, index) => {
        // <input> 태그에서 value 값을 읽어옴
        const input = row.cells[1].querySelector('input');
        const value = normalizeReferenceCode(input?.value); // input이 있을 경우 value를 가져옴
        console.log(`[DEBUG] Row ${index + 1}, Input Value:`, value); // 디버깅 출력

        // 값이 비어있지 않으면 배열에 추가
        if (value) {
            referenceProjects.push({
                referenceCode: value
            });
        }
    });

    console.log("Collected Reference Projects:", referenceProjects);
    return referenceProjects;
}
/// 폼 제출 이벤트 핸들러
// document.getElementById('addProjectForm').addEventListener('submit', function (event) {
//     event.preventDefault();
//     // 폼 데이터 수집
//     const formData = collectFormData();
//     console.log("[DEBUG] FormData collected:", formData);
//     // API 호출
//     fetch('/addproject', {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json'
//         },
//         body: JSON.stringify(formData)
//     })
//         .then(({ status, body }) => {
//             if (status === 201) {
//                 alert('프로젝트 추가 성공');
//                 window.location.href = `/`;
//             } else if (status === 200) {
//                 alert('프로젝트 수정 성공');
//                 window.location.href = `/project_detail/${formData.projectID}`;
//             } else if (status === 400 && body.exists) {
//                 alert(`"${formData.contractCode}" 이미 존재하는 사업입니다.`);
//             } else {
//                 alert('프로젝트 처리 실패. 다시 시도하세요.');
//             }
//         })
//         .catch((error) => {
//             console.error('Error:', error);
//             alert('프로젝트 처리 실패. 다시 시도하세요.');
//         });
// });

function checkDuplicateCode() {
    const contractCode = document.getElementById('contractCode').value;
    if (!contractCode) {
        alert('계약코드를 입력해주세요.');
        return;
    }

    // API 호출하여 중복 확인
    fetch(`/api/check_contract_code/${contractCode}`)
        .then(response => response.json())
        .then(data => {
            if (data.exists) {
                alert('이미 존재하는 계약코드입니다.');
            } else {
                alert('사용 가능한 계약코드입니다.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('중복 확인 중 오류가 발생했습니다.');
        });
}


// 전역 변수로 현재 선택된 td를 저장
var selectedReferenceCell = null; // 'var' 사용으로 선언을 호이스팅(hoisting)

// 모달 열기
function openSearchModal(td) {
    const modal = document.getElementById('searchProjectModal');
    modal.style.display = 'block';
    document.body.classList.add('modal-open');

    // 클릭된 td 저장
    selectedReferenceCell = td;
    console.log("DEBUG: Opened modal. Selected td:", selectedReferenceCell); // 디버깅 로그

    // 검색 입력창 초기화 및 포커스
    const searchInput = document.getElementById('searchProjectInput');
    searchInput.value = '';
    searchInput.focus();

    // 검색 결과 초기화
    const resultsContainer = document.getElementById('searchResultsContainer');
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 16px;">검색 결과가 없습니다.</div>';
}

// 모달 닫기
function closeSearchModal() {
    const modal = document.getElementById('searchProjectModal');
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');

    // 검색 결과 초기화 및 선택된 td 초기화
    document.getElementById('searchResultsContainer').innerHTML = '<div style="text-align: center; padding: 16px;">검색 결과가 없습니다.</div>';
    document.getElementById('searchProjectInput').value = '';
    selectedReferenceCell = null;

    console.log("DEBUG: Modal closed and selectedReferenceCell reset."); // 디버깅 로그
}

// 검색 수행
function searchProject() {
    const searchTerm = document.getElementById('searchProjectInput').value.trim();
    const resultsContainer = document.getElementById('searchResultsContainer');

    if (!searchTerm) {
        alert('검색어를 입력해주세요.');
        return;
    }

    resultsContainer.innerHTML = '<div style="text-align: center;">검색 중...</div>';

    const url = `/api/search_projects?term=${encodeURIComponent(searchTerm)}`;
    fetch(url)
        .then(res => res.json().then(body => ({ ok: res.ok, body })))
        .then(({ ok, body }) => {
            if (!ok) throw new Error('응답 코드 오류');
            renderSearchProjectResults(resultsContainer, body, searchTerm);
        })
        .catch(err => {
            console.error('[DEBUG] Error during search:', err);
            resultsContainer.innerHTML = '<div style="text-align: center; color: red; padding:16px;">검색 중 오류가 발생했습니다.</div>';
        });
}

// 페이지 이동 검색 (재사용)
function searchProjectPage(term, page) {
    const resultsContainer = document.getElementById('searchResultsContainer');
    resultsContainer.innerHTML = '<div style="text-align: center;">검색 중...</div>';
    const url = `/api/search_projects?term=${encodeURIComponent(term)}&page=${page}`;
    fetch(url)
        .then(res => res.json().then(body => ({ ok: res.ok, body })))
        .then(({ ok, body }) => {
            if (!ok) throw new Error('응답 코드 오류');
            renderSearchProjectResults(resultsContainer, body, term);
        })
        .catch(err => {
            console.error('[DEBUG] Error during paged search:', err);
            resultsContainer.innerHTML = '<div style="text-align: center; color: red; padding:16px;">검색 중 오류가 발생했습니다.</div>';
        });
}

function escapeHtmlValue(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSearchProjectResults(resultsContainer, body, term) {
    const projects = Array.isArray(body.projects) ? body.projects : (Array.isArray(body) ? body : []);
    if (projects.length === 0) {
        resultsContainer.innerHTML = '<div style="text-align: center; padding:16px;">검색 결과가 없습니다.</div>';
        return;
    }

    const rowsHtml = projects.map((p) => {
        const code = p.ContractCode || p.contractCode || '';
        const name = p.ProjectName || p.projectName || '';
        return `
            <tr class="search-result-row" data-code="${escapeHtmlValue(code)}" data-name="${escapeHtmlValue(name)}">
                <td class="contract-code">${escapeHtmlValue(code)}</td>
                <td class="project-name">${escapeHtmlValue(name)}</td>
            </tr>`;
    }).join('');

    const currentPage = Number(body.current_page || 1);
    const totalPages = Number(body.total_pages || 1);
    const prevPage = Math.max(1, currentPage - 1);
    const nextPage = Math.min(totalPages, currentPage + 1);

    const pagerHtml = totalPages > 1 ? `
        <div class="search-pager sticky-pager">
            <button type="button" class="search-pager-btn" data-page="${prevPage}" ${currentPage <= 1 ? 'disabled' : ''}>◀</button>
            <span style="margin:0 6px;">${currentPage} / ${totalPages}</span>
            <button type="button" class="search-pager-btn" data-page="${nextPage}" ${currentPage >= totalPages ? 'disabled' : ''}>▶</button>
        </div>` : '';

    resultsContainer.innerHTML = `
        <div class="search-results-scroll">
            <table class="search-result-table">
                <thead>
                    <tr>
                        <th>계약코드</th>
                        <th>사업명</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
        ${pagerHtml}
    `;

    resultsContainer.querySelectorAll('.search-result-row').forEach((row) => {
        row.addEventListener('click', function () {
            selectProject(this.dataset.code || '', this.dataset.name || '');
        });
    });

    resultsContainer.querySelectorAll('.search-pager-btn').forEach((button) => {
        button.addEventListener('click', function () {
            const page = Number(this.dataset.page || 1);
            searchProjectPage(term, page);
        });
    });
}

// 검색 결과 선택
function selectProject(contractCode, projectName = '') {
    if (!selectedReferenceCell) {
        console.error("DEBUG: No selectedReferenceCell to update."); // 디버깅 로그
        return;
    }

    // 선택된 td에 계약코드 업데이트
    const inputField = selectedReferenceCell.querySelector('input');
    if (inputField) {
        inputField.value = contractCode;
        if (projectName) {
            inputField.dataset.projectName = projectName;
        }
        console.log("DEBUG: Updated input field in td with contractCode:", contractCode); // 디버깅 로그
    } else {
        selectedReferenceCell.textContent = contractCode;
        console.log("DEBUG: Updated td textContent with contractCode:", contractCode); // 디버깅 로그
    }

    renderReferenceProjectChip(selectedReferenceCell);

    // 선택된 td 초기화 및 모달 닫기
    selectedReferenceCell = null;
    closeSearchModal();
}

function initReferenceProjectTags() {
    document.querySelectorAll('#referenceProjectTbody td[onclick]').forEach((td) => {
        renderReferenceProjectChip(td);
    });
}

function renderReferenceProjectChip(td) {
    if (!td) return;
    const input = td.querySelector('input');
    if (!input) return;

    input.style.display = 'none';
    td.querySelectorAll('.reference-chip').forEach((chip) => chip.remove());

    const code = normalizeReferenceCode(input.value);
    if (input.value !== code) {
        input.value = code;
    }
    if (!code) return;

    const projectName = (input.dataset.projectName || '').trim();
    const labelText = projectName || code;

    const chip = document.createElement('span');
    chip.className = 'reference-chip';
    chip.innerHTML = `<span class="reference-chip-label">${escapeHtmlValue(labelText)}</span><button type="button" class="reference-chip-remove" aria-label="참조사업 삭제">×</button>`;

    const removeBtn = chip.querySelector('.reference-chip-remove');
    if (removeBtn) {
        removeBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            input.value = '';
            delete input.dataset.projectName;
            renderReferenceProjectChip(td);
        });
    }

    chip.addEventListener('click', function (event) {
        event.stopPropagation();
    });

    td.appendChild(chip);
}

//함수명 중복 확인필요123
function collectFileFormData() {
    return {
        contractCode: document.getElementById('contractCode').value,
        files: uploadedFileList
        // 다른 필드도 추가 가능
    };
}

// 전역 플래그 (템플릿에서 설정해줘야 함)
let isEditMode = window.isEditMode || false;

// 신규 파일 목록
let uploadedFileList = [];

// 수정 모드 초기 파일 목록
let savedFileList = window.savedFileList || [];

function renderInitialFileList() {
    if (isEditMode) {
        if (Array.isArray(savedFileList) && savedFileList.length > 0) {
            renderFilePreview(savedFileList, true);
        }
        return;
    }

    renderFilePreview(uploadedFileList, false);
}

// 공통: 미리보기 렌더링
function renderFilePreview(files, isSaved = false) {
    const containerId = isEditMode ? 'uploaded-files' : 'temp-uploaded-files';
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('[WARN] 파일 목록 컨테이너가 없습니다:', containerId);
        return;
    }

    container.innerHTML = '';

    if (files.length > 0) {
        files.forEach((file, idx) => {
            const name = file.original || file.filename || file.name;
            const idAttr = isSaved
                ? `deleteFile('${file.id}')`
                : `removeUploadedFile(${idx})`;

            container.innerHTML += `
                <div class="file-item" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0;">
                    <div style="flex: 1; min-width: 0;">
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 90%;">
                            ${name}
                        </span>
                    </div>
                    <button onclick="${idAttr}" class="delete-file">삭제</button>
                </div>`;
        });
    } else {
        container.innerHTML = '<p style="text-align: center; color: #666;">업로드된 파일이 없습니다.</p>';
    }
}


async function uploadFilesToServer(files) {
    const formData = new FormData();

    // 파일 유효성 체크
    if (!(files instanceof FileList || Array.isArray(files))) {
        console.error("올바르지 않은 파일 목록입니다:", files);
        return;
    }

    // 파일 append
    Array.from(files).forEach(file => formData.append('files', file));

    //contractCode 입력값 가져오기 (중요!)
    const contractCode = document.getElementById('base_ContractCode')?.value || '';
    formData.append('contractCode', contractCode);

    // 로딩 표시
    document.getElementById('file-upload-loading').style.display = 'block';

    const url = isEditMode ? '/upload_files' : '/temp_upload_files';
    let result;

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        result = await response.json();
    } catch (err) {
        console.error('[ERROR] 업로드 요청 실패:', err);
        alert('파일 업로드 중 오류 발생');
        document.getElementById('file-upload-loading').style.display = 'none';
        return;
    }

    // 로딩 숨김
    document.getElementById('file-upload-loading').style.display = 'none';

    if (result.success) {
        if (isEditMode) {
            alert('파일이 업로드되었습니다.');
            window.location.reload(); // 수정 모드는 즉시 DB 저장 → 새로고침
        } else {
            uploadedFileList.push(...result.files);
            console.log('[DEBUG] 업로드된 파일 목록:', uploadedFileList);
            renderFilePreview(uploadedFileList, false); // 신규 모드 → 임시 목록 렌더링
        }
    } else {
        alert(result.message || '파일 업로드 실패');
    }
}

// 신규 모드: 삭제
function removeUploadedFile(index) {
    uploadedFileList.splice(index, 1);
    renderFilePreview(uploadedFileList, false);
}

// 수정 모드: 삭제
async function deleteFile(fileId) {
    if (!confirm('파일을 삭제하시겠습니까?')) return;

    try {
        const response = await fetch(`/delete_file/${fileId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            alert('파일이 삭제되었습니다.');
            window.location.reload();
        } else {
            throw new Error();
        }
    } catch (err) {
        alert('파일 삭제 중 오류가 발생했습니다.');
    }
}

function initFileUpload() {
    const dropZone = isEditMode
        ? document.getElementById('edit-upload-zone')
        : document.getElementById('temp-upload-zone');

    const fileInput = isEditMode
        ? document.getElementById('file-input')
        : document.getElementById('temp-file-input');

    if (!dropZone || !fileInput) {
        console.warn('[파일 업로드] dropZone 또는 fileInput이 없습니다.');
        return;
    }

    const handleFiles = files => uploadFilesToServer(files);

    fileInput.addEventListener('change', e => handleFiles(e.target.files));
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#007bff'; });
    dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.style.borderColor = '#ccc'; });
    dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.style.borderColor = '#ccc';
        handleFiles(e.dataTransfer.files);
    });
}
