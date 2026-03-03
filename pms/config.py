from __future__ import annotations

import os


ADDRESS_LOCK_SNIPPET = r"""
<script>
(function () {
  if (window.top !== window.self) return; // iframe 내부 실행 방지

  // --- 세션 플래그 검사: 임시 비활성화용 (reload 등에서 사용 가능) ---
  try {
    if (sessionStorage.getItem && sessionStorage.getItem('addressLockDisabled') === 'true') {
      sessionStorage.removeItem('addressLockDisabled');
      return;
    }
  } catch (_) {}

  // --- 주소 강제 통일 ---
  var ROOT = '/', locking = false;

  function forceRoot() {
    if (locking) return; locking = true;
    try {
      // 현재 경로에 / 이외의 내용(쿼리·해시 포함)이 있으면 즉시 제거
      var current = location.pathname + location.search + location.hash;
      if (current !== ROOT) {
        history.replaceState({}, '', ROOT);
      }
    } finally {
      locking = false;
    }
  }

  // --- 즉시 실행 + 이벤트 감시 ---
  try { forceRoot(); } catch (_) {}

  // pushState / replaceState 재정의 → 새 주소 시도 시도 자동 복구
  var _ps = history.pushState, _rs = history.replaceState;
  history.pushState = function () { _ps.apply(history, arguments); forceRoot(); };
  history.replaceState = function () { _rs.apply(history, arguments); forceRoot(); };

  // 뒤로가기, 해시변경, 페이지로드, 팝상태 모두 감시
  window.addEventListener('popstate', forceRoot);
  window.addEventListener('hashchange', forceRoot);
  window.addEventListener('load', forceRoot);
})();
</script>
"""


def get_base_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__ + os.sep + ".."))


def get_upload_folder() -> str:
    # root(app.py) 기준 uploads 폴더
    base_dir = os.path.dirname(os.path.abspath(__file__))
    # pms/.. 로 올라가서 root
    root_dir = os.path.abspath(os.path.join(base_dir, os.pardir))
    return os.path.join(root_dir, 'uploads')
