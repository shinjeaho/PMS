-- 월간보고 기능 적용을 위한 최소 스키마 보강 SQL
-- 실행 대상: MySQL

-- 1) meeting_files에 월간보고 구분 컬럼 보강
ALTER TABLE meeting_files
    ADD COLUMN IF NOT EXISTS meeting_category VARCHAR(30) NULL DEFAULT '사업관련' AFTER agenda_title;

-- 2) meeting_files 조회수 컬럼 보강(없을 때만)
ALTER TABLE meeting_files
    ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0 AFTER file_size;

-- 3) meeting 첨부파일 테이블 보강(없으면 생성)
CREATE TABLE IF NOT EXISTS meeting_file_attachments (
    id BIGINT NOT NULL AUTO_INCREMENT,
    meeting_id BIGINT NOT NULL,
    file_path VARCHAR(1024) NOT NULL,
    original_name VARCHAR(255) NULL,
    file_size BIGINT NULL DEFAULT 0,
    create_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_meeting_file_attachments_meeting_id (meeting_id),
    CONSTRAINT fk_meeting_file_attachments_meeting_id
        FOREIGN KEY (meeting_id) REFERENCES meeting_files(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) 카테고리 검색 성능 개선 인덱스(선택)
-- 이미 존재하지 않을 때만 수동 실행:
-- CREATE INDEX idx_meeting_files_category_createat ON meeting_files (meeting_category, create_at);
