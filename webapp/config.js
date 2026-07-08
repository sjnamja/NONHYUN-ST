// 스프레드시트 CSV 링크 기본값 (선택)
// 여기에 미리 넣어두면 배포 즉시 자동 로드됩니다.
// 비워두면 앱 화면의 ⚙ 설정에서 입력할 수 있습니다(브라우저에 저장됨).
//
// [운동 데이터 시트]
//   https://docs.google.com/spreadsheets/d/1BSek9O_KgbiVZgcS6ACtRC2bolwjo7s6LOyNFBcEOqM/edit?gid=1594439174
//   ※ 현재 비공개 → 구글 시트에서 "파일 → 공유 → 웹에 게시 → 해당 탭 → CSV" 로 게시한 뒤
//     생성된 pub?...output=csv 주소를 EXERCISE_CSV_URL 에 넣으세요.
//     (또는 공유를 "링크가 있는 모든 사용자 - 뷰어"로 바꾸면 아래 gviz 주소도 동작합니다.)
//     gviz 예: https://docs.google.com/spreadsheets/d/1BSek9O_KgbiVZgcS6ACtRC2bolwjo7s6LOyNFBcEOqM/gviz/tq?tqx=out:csv&gid=1594439174
window.APP_CONFIG = {
  EXERCISE_CSV_URL: "", // 운동로그 탭 CSV
  INBODY_CSV_URL:   "", // 인바디 탭 CSV
};
