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
 */

const FOLDER_ID = '여기에_폴더_ID_입력';

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
