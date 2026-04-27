CREATE TABLE IF NOT EXISTS project_status_history (
    id BIGINT NOT NULL AUTO_INCREMENT,
    project_id INT NOT NULL,
    contract_code VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    effective_date DATE NOT NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by VARCHAR(100) NULL,
    note VARCHAR(255) NULL,
    PRIMARY KEY (id),
    KEY idx_project_status_history_project_date (project_id, effective_date, id),
    KEY idx_project_status_history_contract_date (contract_code, effective_date, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


START TRANSACTION;

-- 1) 모든 프로젝트에 진행중 기준 이력 1건 생성
-- contractCode 앞자리 연도를 기준으로 YYYY-01-01 로 넣습니다.
INSERT INTO project_status_history (
    project_id,
    contract_code,
    status,
    effective_date,
    changed_by,
    note
)
SELECT
    p.ProjectID,
    p.ContractCode,
    '진행중',
    STR_TO_DATE(
        CONCAT(
            CASE
                WHEN LENGTH(SUBSTRING_INDEX(p.ContractCode, '-', 1)) = 2
                    THEN CONCAT('20', SUBSTRING_INDEX(p.ContractCode, '-', 1))
                ELSE SUBSTRING_INDEX(p.ContractCode, '-', 1)
            END,
            '-01-01'
        ),
        '%Y-%m-%d'
    ) AS effective_date,
    'migration',
    'legacy progress bootstrap from contract code year'
FROM projects p
WHERE p.ContractCode REGEXP '^[0-9]{2,4}-'
  AND NOT EXISTS (
      SELECT 1
      FROM project_status_history h
      WHERE h.project_id = p.ProjectID
        AND h.status = '진행중'
  );


-- 2) 현재 용역중지인 프로젝트는 모두 2025-12-31 기준으로 용역중지 이력 생성
INSERT INTO project_status_history (
    project_id,
    contract_code,
    status,
    effective_date,
    changed_by,
    note
)
SELECT
    p.ProjectID,
    p.ContractCode,
    '용역중지',
    DATE('2025-12-31'),
    'migration',
    'legacy stop bootstrap fixed to 2025 year-end'
FROM projects p
WHERE p.project_status = '용역중지'
  AND NOT EXISTS (
      SELECT 1
      FROM project_status_history h
      WHERE h.project_id = p.ProjectID
        AND h.status = '용역중지'
        AND h.effective_date = DATE('2025-12-31')
  );


-- 3) 현재 준공인 프로젝트는 project_status 의 준공(연도) 값을 기준으로 YYYY-12-31 준공 이력 생성
INSERT INTO project_status_history (
    project_id,
    contract_code,
    status,
    effective_date,
    changed_by,
    note
)
SELECT
    p.ProjectID,
    p.ContractCode,
    '준공',
    STR_TO_DATE(
        CONCAT(
            CASE
                WHEN LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(p.project_status, ')', 1), '(', -1)) = 2
                    THEN CONCAT('20', SUBSTRING_INDEX(SUBSTRING_INDEX(p.project_status, ')', 1), '(', -1))
                ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(p.project_status, ')', 1), '(', -1)
            END,
            '-12-31'
        ),
        '%Y-%m-%d'
    ) AS effective_date,
    'migration',
    'legacy completion bootstrap from encoded completion year'
FROM projects p
WHERE p.project_status LIKE '준공(%'
  AND NOT EXISTS (
      SELECT 1
      FROM project_status_history h
      WHERE h.project_id = p.ProjectID
        AND h.status = '준공'
        AND h.effective_date = STR_TO_DATE(
            CONCAT(
                CASE
                    WHEN LENGTH(SUBSTRING_INDEX(SUBSTRING_INDEX(p.project_status, ')', 1), '(', -1)) = 2
                        THEN CONCAT('20', SUBSTRING_INDEX(SUBSTRING_INDEX(p.project_status, ')', 1), '(', -1))
                    ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(p.project_status, ')', 1), '(', -1)
                END,
                '-12-31'
            ),
            '%Y-%m-%d'
        )
  );

COMMIT;


-- 참고)
-- 이 스크립트는 여러 번 실행해도 중복 이력이 쌓이지 않도록 NOT EXISTS 조건을 넣었습니다.
-- project_status 가 '준공' 이지만 연도 표기가 없는 레거시 건은 자동 변환하지 않으므로 별도 보정이 필요합니다.