# app.py 페이지(템플릿) 기준 분류표

> 목적: `app.py`의 라우트/헬퍼/배치 로직을 **HTML 템플릿(페이지) 기준**으로 묶어서, 이후 파일 분리(블루프린트화)할 때 기준점으로 사용합니다.

---

## 0) 공통(페이지와 무관) / 인프라

- Flask 앱/설정
  - `app = Flask(...)`, `secret_key`, `UPLOAD_FOLDER`, JSON 설정
- 공통 미들웨어/후처리
  - `inject_address_lock(response)` : HTML 응답에 주소 강제 스크립트 삽입
  - `require_login_for_every_route()` : 로그인 강제(허용 라우트 제외)
  - `extend_session_if_active()` : 세션 영속
  - `log_request_info()`, `log_response_info()` : 요청/응답 로깅
- DB/백업/스케줄
  - `create_connection()`
  - `backup_all_tables()`
  - D-Day 일괄 계산/자정 스케줄
    - `calculate_d_day_value()`
    - `_compute_d_day_set_based()`
    - `_seconds_until_next_midnight()`, `_daily_midnight_worker()`
    - `_init_d_day_once()`
    - `_auto_insert_risk_for_contract()` (D-40 자동 리스크)
- 진행률 계산(여러 페이지에서 공용)
  - `calc_progress()`
  - `calc_progress_bulk()`
- 파일 유틸(공용)
  - `allowed_file()`, `custom_secure_filename()`
  - `format_file_size()`

---

## 1) 로그인/세션 페이지 (templates/login.html)

- 페이지/라우트
  - `/` → 로그인 여부에 따라 연도 페이지로 redirect
  - `/login` (GET/POST)
- API
  - `/change_password` (POST)
  - `/logout` (POST)
- DB
  - `users`
- 유틸
  - `hash_password()`

---

## 2) 사업 목록/연도별 메인 (templates/PMS_Business_Year.html)

> “목록용” 메인 화면.

- 페이지/라우트
  - `/PMS_Business/<int:year>` → `PMS_Business_Year.html`
- 목록/검색/진행률 관련 API
  - `/api/get_projects/` : 연도별 목록(페이지네이션) + 진행률 + 리스크 여부
  - `/api/search_projects` : 연도/차수/검토 포함 검색(페이지네이션)
  - `/api/yearly_projects` : 모아보기(차수사업/검토사업)
  - `/api/project_progress/<contract_code>` : 단일 사업 진행률
  - `/api/check_contract_code/<contract_code>` : 계약코드 중복 확인
- 사용자/권한(이 페이지에서 함께 다루는 것으로 보임)
  - `/save_staff` : 사용자 목록 갱신(비밀번호/권한 유지 규칙 포함)
  - `/reset_password` : 사용자 비밀번호 초기화
  - `/api/users_dataauth` (GET) : 자료권한 조회
  - `/api/save_users_dataauth` (POST) : 자료권한 저장

- DB
  - `Projects` (목록/검색/모아보기)
  - `users` (사용자/권한)
  - `project_risks` (리스크 표시)
  - 진행률 계산 연관: `TaskQuantity`, `project_depbohal`, `outsourcing`

---

## 3) 사업 추가/수정/복제 (templates/PMS_addProject.html)

- 페이지/라우트
  - `/addproject` (GET) → `PMS_addProject.html`
  - `/addproject` (POST) : 추가/수정/복제(수행사업 전환)
- 이 페이지에 강하게 결합된 기능
  - D-Day 계산/동결 규칙 반영(`calculate_d_day_value`, `_auto_insert_risk_for_contract`)
  - 프로젝트 연관 테이블 contractCode 동기화(수정 시)
- 프로젝트 삭제
  - `/api/delete_project/<contract_code>` (DELETE)
- 파일 업로드(추가/수정 화면과 결합)
  - `/temp_upload_files` (POST) : 임시 업로드
  - (주의) `/upload_files` (POST) : DB(ProjectFiles) 저장 업로드

- DB
  - 프로젝트: `projects`
  - 연도별 비율: `CompanyExpenses`
  - 변경이력/리스크: `BusinessChangeHistory`, `project_risks`
  - 첨부파일: `ProjectFiles`
  - 수정 시 contractCode 동기화 대상(코드에 명시됨):
    `businesschangehistory`, `businessreceiptdetails`, `exmanager`, `expenserecords`, `outsourcing`,
    `performanceevaluationfee`, `projectfiles`, `project_depbohal`, `quantity_log`, `state`, `clone_state`,
    `taskassignment`, `taskquantity`, `usemoney`, `usemoney_log`, `project_engineers`, `project_comment`,
    `external_labor_rates`, `examine_exmanager`, `examine_expenserecords`, `examine_note`, `examine_outsourcing`

---

## 4) 사업 상세(수행) 페이지 (templates/PMS_Business_Detail.html)

> “detail페이지 용 - PMS_Business_Detail”

- 페이지/라우트
  - `/project_detail/<int:project_id>` (GET) → `PMS_Business_Detail.html`
  - `/project_detail/<int:project_id>` (POST) : 기본 정보 업데이트(과거/레거시 성격)

- DB(상세 화면 전반)
  - 프로젝트: `projects`
  - 화면 레이아웃/부서 선택: `state`, `clone_state`
  - 예상 인건비: `exmanager`, `clone_exmanager`
  - 예상 경비: `expenserecords`, `clone_expenserecords` (및 조회용 `ExpenseRecords`)
  - 공종/진행물량: `TaskQuantity` / `taskquantity`
  - 투입시간: `TaskAssignment` / `taskassignment`
  - 투입시간 로그: `quantity_log`
  - 실제 경비: `useMoney` / `usemoney`
  - 실제 경비 로그: `usemoney_log`
  - 부서 보할: `project_depbohal`
  - 기준 단가/일수: `RecordsPrice`, `EXPENSES`, `external_labor_rates`
  - 외주/지급: `outsourcing`, `outSourcing_MoneyPayment`
  - 파일: `ProjectFiles`
  - 부가 데이터: `BusinessChangeHistory`, `BusinessReceiptDetails`, `PerformanceEvaluationFee`, `project_engineers`, `project_risks`, `Project_comment`

### 4-1) 상세 페이지 내부 탭/데이터 API(대부분 여기로 묶는 게 자연스러움)

- 인건비/경비 저장
  - `/api/save_personnel_budget`
  - `/api/save_expense_records`
- 작업물량/투입시간/경비(실제) 저장
  - `/api/save_task_quantity`
  - `/api/save_budget_data` (TaskAssignment + SummaryQuantity + useMoney + 로그파일)
- 작업 로그/경비 로그
  - `/api/save_quantity_log`
  - `/api/get_quantity_logs`
  - `/api/get_available_months`
  - `/api/update_quantity_log`
  - `/api/get_expense_logs/<department>`
  - `/api/update_expense_log`
- 부서/화면 레이아웃
  - `/api/save_layout`
  - `/get_layout_state/<contract_code>`
- 상세 페이지 조회 보조
  - `/get_department_data/<department>`
  - `/get_department_Set_data/<department>`
  - `/get_expense_department_data/<department>`
  - `/get_account_data`
  - `/get_department_people`
  - `/get_worker_expense`
  - `/get_department_bohal`
- 사업 변경/성과심사/수령내역/기술자/리스크
  - `/api/get_project_changes/<contract_code>`
  - `/api/get_design_reviews/<contract_code>`
  - `/api/get_project_receipts/<contract_code>`
  - `/api/save_project_changes`
  - `/api/get_latest_change`
  - `/api/get_latest_review/<contract_code>`
  - `/api/get_latest_receipt/<contract_code>`
  - `/api/get_project_engineers`
  - `/api/get_project_risks/<contract_code>`
- 코멘트/외부인력/외주
  - `/api/save_comments`
  - `/api/save_external_labor`
  - `/save_outsourcing`
  - `/api/save_outsourcing_progress`
  - `/get_outsourcing`
  - `/update_outsourcing`
  - `/get_outsourcingCompanyList`
  - `/api/save_outsourcing_payments`
- 기준값 조회
  - `/get_price`
  - `/get_expenses`
- 실제진행비 조회
  - `/get_real_labor_cost`
  - `/get_real_expenses`
- 파일 관리(상세에도 사용)
  - `/get_files`
  - `/delete_file/<int:file_id>`
  - `/open_file/<int:file_id>`

---

## 5) 검토사업(Examine) 상세 (templates/PMS_Business_examine.html)

- 페이지/라우트
  - `/project_examine/<int:project_id>` (GET) → `PMS_Business_examine.html`
- 검토사업 데이터 저장(검토 화면과 결합)
  - `/api/save_estimated_budget` : examine_* 테이블에 저장
  - `/api/save_note` : examine_note 저장
  - `/api/save_examine_records` : examine_expenserecords 저장

- DB
  - `projects` (검토사업 기본 정보)
  - `ProjectFiles` (첨부파일)
  - `state`, `clone_state` (부서/레이아웃 상태)
  - 검토 인건비/경비/외주: `examine_exmanager`, `examine_expenserecords`, `examine_outsourcing`
  - 검토 메모: `examine_note`
  - 연도별 비율: `CompanyExpenses`

---

## 6) 기준정보/단가/회사제경비 (templates/PMS_Expenses.html)

- 페이지/라우트
  - `/PMS_Expenses/<int:year>` → `PMS_Expenses.html` (+ `?format=json` 지원)
- API
  - `/api/expenses/years`
  - `/api/expenses/save`
  - `/api/prices/<int:year>`
  - `/api/prices/save`
  - `/api/companyExpense/<int:year>` (GET/POST)

- DB
  - 인건비 기준표: `EXPENSES`
  - 경비 단가표: `RecordsPrice`
  - 회사 제경비 비율: `companyexpenses` (코드에서 테이블명 소문자 사용)

---

## 7) 데이터 이관(엑셀 업로드) (templates/PMS_dataTransfer.html, templates/test.html)

- 페이지/라우트
  - `/dataTransfer` → `PMS_dataTransfer.html`
  - `/testmove` → `test.html`
- API
  - `/api/get_transfer_data/` : transferData 목록(페이지네이션)
  - `/api/get_transfer_detail`
  - `/upload` : 엑셀 업로드(노란색 행 추출)
  - `/saveExcelData` : transferData 저장
  - `/insertProject` : projects로 이관 + transferData 삭제
  - `/api/data_copy` : 부서별 clone_* 복사
- 유틸
  - `extract_yellow_rows()`
  - `convert_date_format()`

- DB
  - 이관 스테이징: `transferData` / `transferdata`
  - 최종 반영: `projects`
  - 부서별 복제 데이터: `exmanager` → `clone_exmanager`, `expenserecords` → `clone_expenserecords`

---

## 8) 연도별 통합자료 (templates/PMS_annualProject.html)

- 페이지/라우트
  - `/PMS_annualProject/<mode>/<int:year>`
  - `/PMS_annualProject/status/<status>`
- API
  - `/api/complete_projects_years`
  - `/api/export_annual_project` : 엑셀 내보내기

- DB
  - 프로젝트: `projects`
  - 진행률/리스크: `TaskQuantity`, `project_depbohal`, `outsourcing`, `project_risks`
  - 예상(견적): `exmanager`, `expenserecords`
  - 실제(실적): `taskassignment`, `usemoney`, `outsourcing`
  - 기준(직급/외부인력): `expenses`, `external_labor_rates`
  - 외주 지급: `outSourcing_MoneyPayment`
  - 사업비 수령: `businessreceiptdetails`
  - 성과심사: `performanceevaluationfee`
  - 부서 필터용: `state`

---

## 9) 주간보고 (templates/weekly_detail.html)

- 페이지/라우트
  - `/weekly_report/<week_start>` → `weekly_detail.html`
- API
  - `/api/weekly_reports`
  - `/api/weekly_detail`
  - `/api/weekly/save`
  - `/api/weekly/submit`
- 유틸/서비스
  - `_compute_week_title`, `_compute_week_meta`, `_list_weekly_reports`, `_get_weekly_detail`
  - `_canon_dept`, `_merge_html`, `_compute_week_range`
  - `_ensure_weekly_report`, `_replace_weekly_entry`

- DB
  - `weekly_report` (주차/부서별 보고서 메타)
  - `weekly_entry` (주간보고 본문/세그먼트)

---

## 10) 파일 제공(정적 업로드 경로)

- 라우트
  - `/static/uploads/<year>/<filename>` : 업로드 파일 서빙

- DB
  - (정적 서빙 자체는 DB 미사용)
  - 파일 목록/삭제/열기/업로드 API는 `ProjectFiles` 사용 (상세 페이지 섹션 참고)

---

# DB 테이블/연관(텍스트 ERD)

> 주의:
> - 코드에서 `ContractCode`/`contractCode`/`contractcode`/`contract_code`가 혼용됩니다. 의미상 같은 “계약코드(프로젝트 식별자)”로 보고 아래에선 **ContractCode**로 통일해 적습니다.
> - 일부 쿼리에는 `weights`, `dept_raw` 같은 “서브쿼리 별칭(파생 테이블)”이 등장하는데, ERD에는 **실제 저장 테이블만** 포함했습니다.

## 핵심 연결 규칙(요약)

- **Projects.ContractCode**(= 계약코드) 를 중심으로 대부분의 업무 테이블이 1:N으로 붙습니다.
- **outsourcing.id → outSourcing_MoneyPayment.outsourcing_id** (외주 1건에 지급내역 N건)
- **weekly_report.id → weekly_entry.report_id** (주간보고 헤더 1건에 항목 N건)
- 검토/복제용 테이블은 원본 구조를 “mode/clone” 형태로 미러링합니다.

## 테이블별 설명

### Projects (projects/Projects)

- 역할: 프로젝트(사업) 마스터
- 주요 컬럼(코드에서 INSERT되는 항목 기준):
  - ContractCode, projectName, projectDetails, orderPlace
  - startDate, endDate, yearProject
  - ProjectCost, ProjectCost_NoVAT, BidPrice, BidPrice_NoVAT, ChangeProjectCost
  - D_Day, LinkProjectCheck, outsourcingCheck
  - OperationalRate, EquipmentRate, AcademicResearchRate, ContributionRate, safetyRate
  - procurementType, referenceProject1~5
- 연관:
  - (1:N) TaskAssignment / TaskQuantity / exmanager / ExpenseRecords / useMoney / outsourcing / ProjectFiles 등

### TaskAssignment (TaskAssignment/taskassignment)

- 역할: 부서/직급/업무항목별 “계획(배정)” 시간
- 주요 컬럼: ContractCode, department, position, work_item, day_time, night_time, holiday
- 연관:
  - (N:1) Projects.ContractCode
  - (느슨한 연결) TaskQuantity.item ↔ TaskAssignment.work_item (코드상 의미가 유사)

### TaskQuantity (TaskQuantity/taskquantity)

- 역할: 부서별 “실적(물량/투입)” 및 공정 보할 반영 데이터
- 주요 컬럼: ContractCode, department, item, quantity, unit, writingorder, SummaryQuantity, bohal, cal_bohal
- 연관:
  - (N:1) Projects.ContractCode
  - (보조) quantity_log (변경 로그)
  - (보조) project_depbohal (부서 보할)

### project_depbohal

- 역할: 프로젝트-부서별 보할(가중치)
- 주요 컬럼: contractcode, department, bohal
- 제약(코드 로직으로 추정): (contractcode, department) 유니크로 보이며 `ON DUPLICATE KEY UPDATE` 업서트를 사용
- 연관:
  - (N:1) Projects.ContractCode
  - 진행률 계산에 직접 사용

### quantity_log

- 역할: 작업물량 입력/수정 로그
- 주요 컬럼: contract_code, department, process, quantity, position, MT, MT_TYPE/mt_type, log_date, remarks, created_at, updated_at
- 연관:
  - (N:1) Projects.ContractCode
  - (N:1) department

### exmanager

- 역할: 인건비(계획/예산) 성격의 인력 편성/금액 데이터
- 코드에서 직접 INSERT 컬럼을 고정 문자열로 갖지 않지만, 복제/검토 테이블 구조로 유추 가능:
  - ContractCode, ProjectID, department, Position, M_D, person, amount
- 연관:
  - (N:1) Projects.ContractCode
  - (유사 구조) clone_exmanager, examine_exmanager

### ExpenseRecords (ExpenseRecords/expenserecords)

- 역할: 경비(계획/예산) 항목별 레코드
- (유사 구조: clone_expenserecords 기준) ContractCode, ProjectID, department, account, people_count, days, frequency, unit_price, amount, note
- 연관:
  - (N:1) Projects.ContractCode
  - (유사 구조) clone_expenserecords, examine_expenserecords

### useMoney (useMoney/usemoney)

- 역할: 경비(실적) 사용 내역
- 주요 컬럼: ContractCode, department, use_account, history, type, money, update_date
- 연관:
  - (N:1) Projects.ContractCode
  - (1:N) usemoney_log (변경/저장 로그)

### usemoney_log

- 역할: useMoney 저장/수정 로그
- 주요 컬럼: contractcode, department, use_account, history, type, money, log_date, remarks, createdate, updatedate
- 연관:
  - (N:1) Projects.ContractCode

### outsourcing

- 역할: 외주 계약/물량/금액(프로젝트 단위)
- 주요 컬럼: id, contract_code, outsourcing_company, outsourcing_type, outsourcing_quantity, outsourcing_cost, outsourcing_cost_NoVAT, change_Cost, change_Cost_NoVAT
- 연관:
  - (N:1) Projects.ContractCode
  - (1:N) outSourcing_MoneyPayment (지급내역)
  - (유사 구조) examine_outsourcing

### outSourcing_MoneyPayment

- 역할: 외주 지급내역(지급일/금액/비고)
- 주요 컬럼: outsourcing_id, CompanyName, Division, PaymentDate, Cost_NoVAT, Cost_VAT, Remark
- 연관:
  - (N:1) outsourcing.id

### ProjectFiles

- 역할: 업로드 파일 메타데이터
- 주요 컬럼: ContractCode, FileName, OriginalFileName, FileType, FileSize, FilePath, UploadDate
- 연관:
  - (N:1) Projects.ContractCode

### Project_comment

- 역할: 프로젝트 코멘트(부서별)
- 주요 컬럼: contractcode, department, input_num, comment, Create_date
- 연관:
  - (N:1) Projects.ContractCode

### project_risks

- 역할: 리스크/이슈 기록(자동 삽입 로직 포함)
- 주요 컬럼: contractcode, department, content, writer, write_date
- 연관:
  - (N:1) Projects.ContractCode

### project_engineers

- 역할: 프로젝트 기술자/투입 인력 목록(상세페이지에서 조회)
- 연결 키(코드 사용 기준): contract_code, department
- 연관:
  - (N:1) Projects.ContractCode

### BusinessChangeHistory

- 역할: 계약/금액 변경 이력
- 주요 컬럼: ContractCode, ContractDate, Division, Description, Cost_NoVAT, Cost_VAT, Cost_ShareRate, UpdateDate
- 연관:
  - (N:1) Projects.ContractCode

### BusinessReceiptDetails

- 역할: 기성/수령(입금) 내역
- 주요 컬럼: ContractCode, ReceiptDate, Division, Description, Amount, Amount_NoVAT, Balance, saveNum, UpdateDate
- 연관:
  - (N:1) Projects.ContractCode

### PerformanceEvaluationFee

- 역할: 성과심사/수수료 관련 데이터
- 주요 컬럼: ContractCode, performanceReview, reviewDate, Amount, Description, Remark, UpdateDate
- 연관:
  - (N:1) Projects.ContractCode

### external_labor_rates

- 역할: 외부인력 단가(일/월 단가)
- 주요 컬럼: ContractCode, contract_date, position, daily_rate, monthly_rate
- 연관:
  - (N:1) Projects.ContractCode

### CompanyExpenses (companyexpenses/CompanyExpenses)

- 역할: 회사 제경비/요율(연도별)
- 주요 컬럼: year, OperationalRate, EquipmentRate, AcademicResearchRate
- 연관:
  - (N:1) year

### RecordsPrice

- 역할: 연도별 단가(아이템별)
- 주요 컬럼: YEAR, ITEM, price

### EXPENSES (expenses/EXPENSES)

- 역할: 직급별 기준 급여/근무시간(연도별)
- 주요 컬럼: Year, Position, MonthlyAverageSalary, Days, Hours

### state / clone_state

- 역할: 상세 페이지의 부서/레이아웃 UI 상태 저장
- (코드에서 확인되는 컬럼) ContractCode, first_dept, second_dept, first_layout_active, second_layout_active, active_Layout_count
- 제약(코드 로직으로 추정): ContractCode 단위로 1건(없으면 INSERT, 있으면 UPDATE)
- 연관:
  - (N:1) Projects.ContractCode
  - clone_state는 복제본 화면용

### transferData (transferData/transferdata)

- 역할: 엑셀 업로드 기반 “프로젝트 이관” 스테이징 테이블
- 주요 컬럼: ContractCode, ProjectName, ProjectDetails, OrderPlace, StartDate, EndDate, ProjectCost, ProjectCost_NoVAT, ContributionRate
- 연관:
  - (이관 시) transferData → Projects로 INSERT

### examine_* (examine_exmanager / examine_expenserecords / examine_outsourcing / examine_note)

- 역할: 검토사업 화면에서 사용하는 예산/외주/노트 데이터(원본과 별도 보관)
- 특징:
  - exmanager/ExpenseRecords/outsourcing의 구조를 대부분 공유
  - 일부 테이블은 `mode` 컬럼으로 화면 상태를 구분

### clone_* (clone_exmanager / clone_expenserecords)

- 역할: “복제본” 프로젝트용 예산 스냅샷(원본과 분리)
- 주요 컬럼(원본 유사):
  - clone_exmanager: ContractCode, ProjectID, department, Position, M_D, person, amount
  - clone_expenserecords: ContractCode, ProjectID, department, account, people_count, days, frequency, unit_price, amount, note

### weekly_report / weekly_entry

- weekly_report
  - 역할: 주간보고 헤더(주차/부서/상태)
  - 주요 컬럼: week_start, year, month, week_index, title, department, status, created_at, updated_at, created_by, crosses_next_month
- weekly_entry
  - 역할: 주간보고 본문 항목(세그먼트/태그 등)
  - 주요 컬럼: report_id, title, summary_segments, detail_segments, tags_text, priority, attachments_count, created_at, updated_at, created_by
- 연관:
  - (1:N) weekly_report.id → weekly_entry.report_id

---