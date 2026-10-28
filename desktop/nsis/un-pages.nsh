; Voice Cinema 제거기에서 바꿔 끼우는 매크로 셋 — installer.nsh의 customUnWelcomePage 안에서 들인다. 그 자리는 템플릿 · MUI2가 이 매크로들을
; 정의한 뒤 · 쓰기 전이다(assistedInstaller.nsh — 제거기 시작 un.onInit도 이 뒤 uninstaller.nsh에서 컴파일된다).
;   - setInstallModePerAllUsers(템플릿 multiUser.nsh): 관리자 권한으로 넘기기 직전 작업 폴더 옮기기 한 줄(아래에 이유).
;   - MUI_UNPAGE_INSTFILES · MUI_UNPAGE_FINISH(MUI2 Pages/InstallFiles.nsh · Finish.nsh, NSIS 3.0.4.1 — electron-builder 26.17.0이 받는 판):
;     «화면이 뜨기 직전에 할 일»(SHOW — 막대 · 그림)과 «떠날 때 할 일»(LEAVE — 진행 화면은 «한 번에 그리기» 다시 켜기, 완료 화면은 창 먼저 숨기기)만
;     더한다. 나머지는 원래 내용 그대로다.
; 진행 · 완료 화면을 왜 바꿔 끼우나:
;   - 진행 화면: 템플릿은 첫 화면과 진행 화면 사이에 설치 범위 화면(PAGE_INSTALL_MODE)을 넣고, 그 화면의 함수가 MUI의 «SHOW» 설정을 먼저 가져간다.
;   - 완료 화면: 템플릿이 완료 화면 앞에 열어 둔 자리(customUninstallPage)에서는 그 화면의 변수($mui.FinishPage.Image)가 아직 없어 함수를 만들 수 없다.
; 그래서 설정과 함수를 화면을 넣는 바로 그 자리에서 한다.

!ifndef VC_UN_PAGES_INCLUDED
!define VC_UN_PAGES_INCLUDED

; «모든 사용자» 제거: 템플릿(multiUser.nsh)은 제거기 시작(un.onInit) 때 작업 폴더를 설치 폴더로 둔 채(SetOutPath $INSTDIR) 관리자 권한 제거기를 띄우고
; 끝날 때까지 기다린다. 그 바깥 제거기가 설치 폴더를 붙잡고 있어 안쪽 제거기가 파일은 다 지워도 폴더 자체는 지우지 못해
; «C:\Program Files\InKY Film Festival\Voice Cinema» 빈 폴더가 남았다(10/28 확인). 원래 내용 그대로 두고, 관리자 권한으로 넘기기 직전에
; 작업 폴더를 임시 폴더로 옮기는 한 줄만 더한다. 원래 내용이 그대로인지는 desktop/test/nsis-template.test.js가 본다.
!macroundef setInstallModePerAllUsers
!macro setInstallModePerAllUsers
    StrCpy $installMode all
    SetShellVarContext all

    !ifdef BUILD_UNINSTALLER
      ${IfNot} ${UAC_IsAdmin}
        ShowWindow $HWNDPARENT ${SW_HIDE}
        SetOutPath $TEMP
        !insertmacro UAC_RunElevated
        Quit
      ${endif}
    !endif

    # сheck registry for previous installation path
    ReadRegStr $perMachineInstallationFolder HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $perMachineInstallationFolder != ""
      StrCpy $INSTDIR $perMachineInstallationFolder
    ${else}
      StrCpy $0 "$PROGRAMFILES"
      !ifdef APP_64
        ${if} ${RunningX64}
          StrCpy $0 "$PROGRAMFILES64"
        ${endif}
      !endif

      !ifdef MENU_FILENAME
        StrCpy $0 "$0\${MENU_FILENAME}"
      !endif

      StrCpy $INSTDIR "$0\${APP_FILENAME}"
    ${endif}

    # allow /D switch to override installation path https://github.com/electron-userland/electron-builder/issues/1551
    !insertmacro GetDParameter $R0
    ${If} $R0 != ""
      StrCpy $INSTDIR $R0
    ${endif}

!macroend

!macroundef MUI_UNPAGE_INSTFILES
!macro MUI_UNPAGE_INSTFILES
  !verbose push
  !verbose ${MUI_VERBOSE}
  !insertmacro MUI_UNPAGE_INIT
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.vcInstFilesShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.vcInstFilesLeave
  !insertmacro MUI_PAGEDECLARATION_INSTFILES
  !verbose pop

  Function un.vcInstFilesShow
    !insertmacro vcMakeBar
  FunctionEnd
  Function un.vcInstFilesLeave
    !insertmacro vcComposited on
  FunctionEnd
!macroend

!macroundef MUI_UNPAGE_FINISH
!macro MUI_UNPAGE_FINISH
  !verbose push
  !verbose ${MUI_VERBOSE}
  !insertmacro MUI_UNPAGE_INIT
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.vcFinishShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.vcFinishLeave
  !insertmacro MUI_PAGEDECLARATION_FINISH
  !verbose pop

  Function un.vcFinishShow
    !insertmacro vcSidebarArt $mui.FinishPage.Image $mui.FinishPage.Image.Bitmap
  FunctionEnd
  Function un.vcFinishLeave
    HideWindow
  FunctionEnd
!macroend

!endif
