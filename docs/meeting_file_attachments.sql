-- 회의록 첨부파일 테이블
-- 전제: meeting_files.id(PK)가 존재해야 합니다.

CREATE TABLE IF NOT EXISTS meeting_file_attachments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    meeting_id BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_size BIGINT UNSIGNED NULL,
    create_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_mfa_meeting_id (meeting_id),
    KEY idx_mfa_create_at (create_at),
    CONSTRAINT fk_mfa_meeting
        FOREIGN KEY (meeting_id)
        REFERENCES meeting_files(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
