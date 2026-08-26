/**
 * 잉키 보이스 시네마 - 구글 드라이브 저장용 Apps Script
 *
 * [배포 방법]
 * 1) https://script.google.com 접속 → 새 프로젝트
 * 2) 아래 코드 전체 붙여넣기
 * 3) FOLDER_ID 에 영상을 저장할 구글 드라이브 폴더 ID 입력
 *    (폴더 URL 의 .../folders/여기부분 이 ID 입니다)
 * 4) 우측 상단 [배포] → [새 배포] → 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 5) 생성된 웹 앱 URL(.../exec)을 복사해 config.json 의 appsScriptUrl 에 붙여넣기
 *
 * [보관기간 자동삭제 설정 — 1회만 하면 됨]
 * 6) 위 상단 함수 선택 드롭다운에서 installDailyCleanupTrigger 선택 → ▶ 실행
 *    (처음 실행 시 권한 승인 창이 뜨면 허용)
 * 7) 이후 매일 새벽 자동으로 cleanupAfterCutoff가 실행되어, CUTOFF_DATE가 지나면
 *    이 폴더 안의 영상을 전부 자동 삭제한다. 재배포해도 이 트리거는 계속 유지된다.
 */

const FOLDER_ID = '여기에_폴더_ID_입력';

// 이 시각 이후로는 폴더 안의 영상을 전부 삭제한다 — "11월 안에만 다운로드 가능" 정책.
const CUTOFF_DATE = new Date('2026-12-01T00:00:00+09:00');

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const bytes = Utilities.base64Decode(data.dataBase64);
    const blob = Utilities.newBlob(bytes, data.mimeType || 'video/mp4', data.filename || 'dub.mp4');
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const id = file.getId();
    const url = 'https://drive.google.com/file/d/' + id + '/view';
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, id: id, url: url }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('INKY Voice Cinema uploader is running.');
}

/**
 * CUTOFF_DATE가 지났으면 FOLDER_ID 폴더 안의 파일을 전부 휴지통으로 보낸다(30일 뒤 구글이 완전삭제).
 * installDailyCleanupTrigger()로 설치한 매일 트리거가 이 함수를 자동 호출한다.
 */
function cleanupAfterCutoff() {
  if (new Date() < CUTOFF_DATE) return;
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}

/** 1회만 실행하는 설치용 함수 — 매일 새벽 3시에 cleanupAfterCutoff를 자동 실행하는 트리거를 건다. */
function installDailyCleanupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'cleanupAfterCutoff')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cleanupAfterCutoff').timeBased().everyDays(1).atHour(3).create();
}
