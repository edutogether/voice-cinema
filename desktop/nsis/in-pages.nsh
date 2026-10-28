; Voice Cinema 설치기의 위치 화면 — installer.nsh의 customWelcomePage 안에서 들인다. 그 자리는 MUI2가 화면 매크로를 정의한 뒤 · 설치 범위 화면과
; 위치 화면을 넣기 전이다(assistedInstaller.nsh). 설치기에는 첫 화면(환영)이 없어 이 훅에서 화면을 넣지는 않는다.
;   - MUI_PAGE_DIRECTORY(MUI2 Pages/Directory.nsh, NSIS 3.0.4.1 — electron-builder 26.17.0이 받는 판): «떠날 때 할 일»(LEAVE)만 더하고 나머지는 원래 내용 그대로다.
; 왜 위치 화면을 떠날 때인가: 다음 화면이 곧바로 설치를 시작하는 진행 화면이다. 거기서 묻고 «취소»를 받으면 돌아갈 화면이 없다 — 위치 화면을
; 떠날 때 물어야 «취소»가 «아무것도 바꾸지 않고 그 화면에 남는다»가 된다(기준 9 · 10). 템플릿은 위치 화면 바로 앞에서 «PRE» 설정을 쓰고
; (skipPageIfUpdated) 화면 사이에 훅을 두지 않아, 화면을 넣는 매크로를 바꿔 끼운다.

!ifndef VC_IN_PAGES_INCLUDED
!define VC_IN_PAGES_INCLUDED

; 설치 범위 화면(템플릿 PAGE_INSTALL_MODE — customWelcomePage 바로 뒤에 들어간다)이 뜨기 직전(SHOW): 아래 안내 칸을 단추 바로 아래로 올리고 늘린다.
; 템플릿은 그 칸을 0u 110u 280u 50u로 만드는데 화면 아래 끝이 140u쯤이라 세 줄만 보인다 — 줄 사이에 빈 줄을 두니(굴림이 맞닿아서)
; «…이미 설치되어 있습니다. / (위치) / 예전 것을 지우고 새로 설치합니다.»의 마지막 줄이 잘렸다(10/28 캡처). 단추(30u · 50u, 높이 20u) 아래 75u부터 쓴다.
; 함수 몸은 그 화면의 변수($MultiUser.InstallModePage)가 생긴 뒤인 installer.nsh customFinishPage에 있다.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW vcModeShow

!macroundef MUI_PAGE_DIRECTORY
!macro MUI_PAGE_DIRECTORY
  !verbose push
  !verbose ${MUI_VERBOSE}
  !insertmacro MUI_PAGE_INIT
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE vcDirectoryLeave
  !insertmacro MUI_PAGEDECLARATION_DIRECTORY
  !verbose pop

  ; «설치»를 누르면: 이미 설치되어 있으면(나만 · 모든 사용자 어느 쪽이든 — 고른 범위와 다른 쪽도) 지우고 새로 설치할지 묻고,
  ; 그다음 켜진 앱을 끌지 묻는다. 둘 중 하나라도 «취소»면 이 화면에 남는다(아무것도 지우거나 끄지 않았다).
  ; 실제로 지우는 것은 진행 화면에서다(old-version.nsh — 지우는 줄 «삭제: …»부터 보인다).
  Var vcInstalledString
  Function vcDirectoryLeave
    ReadRegStr $vcInstalledString HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${If} $vcInstalledString == ""
      ReadRegStr $vcInstalledString HKLM "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${EndIf}
    ${If} $vcInstalledString != ""
      MessageBox MB_OKCANCEL|MB_ICONQUESTION "$(vcAlreadyInstalled)" /SD IDOK IDOK +2
      Abort
    ${EndIf}
    !insertmacro vcCloseRunningApp
    ${If} $vcAppAnswer == "cancel"
      Abort
    ${EndIf}
  FunctionEnd
!macroend

!endif
