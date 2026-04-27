# Synology Container Manager 배포 가이드

이 프로젝트는 Synology DSM 7.3의 Container Manager 프로젝트 기능 기준으로 바로 배포할 수 있게 구성했습니다.

## 포함 파일

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`

## 배포 전 준비

1. 프로젝트 전체를 NAS의 공유 폴더로 업로드합니다.
   - 예시 경로: `/docker/flask_project`
2. `.env.example`를 복사해 `.env` 파일을 만듭니다.
3. 아래 항목을 실제 환경값으로 수정합니다.
   - `PMS_SECRET_KEY`
   - `PMS_DB_HOST`
   - `PMS_DB_USER`
   - `PMS_DB_PASSWORD`
   - `PMS_DB_NAME`

## Container Manager 실행

1. DSM에서 Container Manager를 엽니다.
2. `프로젝트` 탭에서 `생성`을 누릅니다.
3. 프로젝트 경로를 업로드한 폴더로 지정합니다.
4. 소스는 `docker-compose.yml 사용`을 선택합니다.
5. 빌드와 실행이 완료되면 `http://NAS_IP:5000`으로 접속합니다.

## 역방향 프록시 권장 설정

- 소스
  - 프로토콜: HTTPS
  - 호스트: `flask.mydomain.com`
  - 포트: `443`
- 대상
  - 프로토콜: HTTP
  - 호스트: `localhost`
  - 포트: `5000`

## 볼륨 구성

운영 중 생성되는 데이터는 아래 경로에 유지됩니다.

- `./uploads`
- `./Logs`
- `./backups`
- `./static/uploads`

## 참고

- 이 구성은 Flask 앱만 컨테이너로 실행합니다.
- DB는 같은 NAS의 MariaDB, 별도 DB 서버, 또는 다른 컨테이너를 사용할 수 있습니다.
- `PMS_DAILY_BACKUP`은 기본값을 `0`으로 두었습니다. 필요할 때만 활성화하세요.