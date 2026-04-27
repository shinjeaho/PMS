# PMS 개발 프로젝트

Flask 기반 PMS(프로젝트 관리) 웹앱입니다.

## 빠른 실행(Windows)

1) 가상환경 생성

```powershell
python -m venv .venv
```

2) 가상환경 활성화

```powershell
.\.venv\Scripts\Activate.ps1
```

3) 의존성 설치

```powershell
pip install -r requirements.txt
```

4) 실행

```powershell
python run.py
```

## Git/레포 관리 원칙

- `venv/`, `.venv/` 같은 가상환경 폴더는 Git에 올리지 않습니다.
- 실행 중 생성되는 `Logs/`, `backups/`, `uploads/`, `static/uploads/` 등도 레포에서 제외합니다.
- 필요한 의존성은 `requirements.txt`로 재현합니다.

## Docker 배포

- Synology Container Manager 기준 배포 파일을 루트에 추가했습니다.
- 사용 파일: `Dockerfile`, `docker-compose.yml`, `.env.example`
- 상세 절차는 `deploy/synology/README.md`를 참고합니다.

## 개발용 도구

- 블루프린트/엔드포인트 헬스체크: `python tools/healthcheck_blueprints.py`
- SQL 테이블/컬럼 스캔(리포트 생성): `python tools/table_scan.py`
