; Voice Cinema 설치기의 «예전 판 지우기 · 앱 파일 설치» — electron-builder 템플릿의 uninstallOldVersion(include/installUtil.nsh) ·
; installApplicationFiles(include/installer.nsh) 매크로를 바꿔 끼운다.
; installer.nsh의 customCheckAppRunning 안에서 들인다: 그 자리는 템플릿이 두 매크로를 정의한 뒤 · 쓰기 전이다(installSection.nsh).
; 그 자리는 설치 단계(Section) 안이라 함수를 정의할 수 없다 — 이 매크로들이 부르는 함수는 installer.nsh(vcExtractProgress · vcCountOut ·
; vcCopyOne · vcCopyTree)와 old-version.nsh(vcRemoveOldVersions)에 있다.
; electron-builder는 26.17.0으로 고정했다(desktop/package.json). 판을 올리면 desktop/test/nsis-template.test.js가 바꿔 끼운 원래 내용이
; 그대로인지 먼저 확인한다 — 원래 내용이 바뀌었으면 이 파일도 함께 다시 본다.
;
; 템플릿과 다른 점(기준 7 — 진행 화면, 10/28 Bumm님):
;   - 압축 풀기: Nsis7z::Extract(막대를 제 기준 0→100%로 옮겨 NSIS의 막대 위치와 번갈아 앞뒤로 튀었다) 대신 ExtractWithCallback으로 푼 바이트를 받아
;     이 설치기의 막대(installer.nsh vcBar)만 움직인다.
;   - 옮기기: 임시 폴더에 푼 파일을 «CopyFiles /SILENT 한 번»(그동안 막대도 글도 멈췄다) 대신 파일마다 하나씩 복사하며 «설치: <설치 위치>\…»를 적는다.
;     임시 폴더 경로(…\Temp\nsg….tmp)와 .7z 이름은 화면에 나오지 않는다.
;   - 자기 사본 남기기를 뺀다: 템플릿은 설치기 자신(230MB)을 %LOCALAPPDATA%\voice-cinema-desktop-updater\installer.exe로 복사해 둔다
;     (electron-updater 차등 업데이트용). 이 앱은 자동 업데이트를 쓰지 않고, 템플릿 제거기는 그 파일을 지우지 않아 제거 뒤에도 남았다(10/28 확인).
;   - 원래처럼 지킨 것: 패키지 고르기 · 넣기(identify_package · compute_files_for_current_arch, 압축 끄기 포함), customFiles 훅, 제거 프로그램 넣기.
;   - 바로가기 두 개(addStartMenuLink · addDesktopLink)는 템플릿 원래 내용 끝에 막대 한 걸음씩만 더했다(아래).
;
; 막대 나눔(0~1000, 이 PC에서 잰 단계별 시간에 맞춤): 앞 단계 0~40, 압축 풀기 40~460(푼 바이트), 옮기기 460~840(파일 크기 + 파일 하나당 몫),
; 제거 프로그램 860, 시작 메뉴 바로가기 905, 바탕화면 바로가기 950, 마무리(customInstall) 1000.
; 예전 판을 먼저 지우면 그 제거가 막대 앞 몫(0~250)을 쓰고, 위 나눔은 남은 몫(250~1000)에 줄여 담긴다(installer.nsh vcSetBar).

!ifndef VC_INSTALL_FILES_INCLUDED
!define VC_INSTALL_FILES_INCLUDED

; 예전 판 지우기(기준 10): 화면이 있는 설치는 old-version.nsh의 vcRemoveOldVersions가 두 범위(모든 사용자 · 나만)를 한 번에 지운다 —
; 템플릿은 이 매크로를 «지금 범위»(SHELL_CONTEXT)로 한 번, «모든 사용자» 설치면 «나만»(HKEY_CURRENT_USER)으로 한 번 더 부른다.
; 첫 번째에서 다 지우고 두 번째는 할 일이 없다. 뒤따르는 결과 검사(handleUninstallResult)는 $R0 = 0 · 오류 없음을 받는다.
; 조용한 설치(/S)는 템플릿 원래 내용(installUtil.nsh) 그대로다. 원래 내용이 그대로인지는 desktop/test/nsis-template.test.js가 본다.
!macroundef uninstallOldVersion
!macro uninstallOldVersion ROOT_KEY
  ${If} ${Silent}
    Push "${ROOT_KEY}"
    Call uninstallOldVersion
  ${Else}
    !if "${ROOT_KEY}" == "SHELL_CONTEXT"
      ; 설치 단계의 맨 앞(켜진 앱 찾기 다음) — 진행 화면을 다 그렸으니 «한 번에 그리기»를 끈다(installer.nsh vcComposited)
      !insertmacro vcCompositedOff
      Call vcRemoveOldVersions
    !endif
    StrCpy $R0 0
    ClearErrors
  ${EndIf}
!macroend

!macroundef installApplicationFiles
!macro installApplicationFiles
  ; «모든 사용자»는 관리자 권한으로 다시 뜬 설치기가 설치한다 — 템플릿은 그 설치기에서 켜진 앱 찾기를 건너뛰어 여기서 한다
  ${If} ${UAC_IsInnerInstance}
    !insertmacro vcCloseRunningAppOrQuit
  ${EndIf}
  !insertmacro vcSetBar 20
  !insertmacro vcStage "프로그램 파일을 설치하는 중입니다 …"

  !ifdef COMPRESS
    SetCompress off
  !endif
  Var /GLOBAL packageArch
  !insertmacro identify_package
  !insertmacro compute_files_for_current_arch
  !ifdef COMPRESS
    SetCompress "${COMPRESS}"
  !endif
  !insertmacro vcSetBar ${VC_BAR_EXTRACT_FROM}

  CreateDirectory "$PLUGINSDIR\7z-out"
  SetOutPath "$PLUGINSDIR\7z-out"
  GetFunctionAddress $R9 vcExtractProgress
  Nsis7z::ExtractWithCallback "$PLUGINSDIR\app-$packageArch.7z" $R9
  SetOutPath $INSTDIR
  !insertmacro vcSetBar ${VC_BAR_EXTRACT_TO}
  ${IfNot} ${FileExists} "$PLUGINSDIR\7z-out\${APP_EXECUTABLE_FILENAME}"
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $vcCopyTotal 0
  StrCpy $vcCopyDone 0
  Push ""
  Call vcCountOut
  ; 앱 실행 파일(247MB)을 맨 먼저 복사한다. 새로 쓴 큰 실행 파일은 백신이 검사하고, 바로가기를 만들 때(아이콘을 읽을 때) 그 검사가 끝나기를
  ; 기다린다 — 이름 순서대로 맨 나중에 복사하면 시작 메뉴 바로가기 하나가 1.8초 걸려 막대가 86%에서 멈췄다(10/28 덮어 설치 녹화).
  ; 먼저 복사하면 나머지 160여 개 파일을 옮기는 동안 검사가 끝난다.
  Push "\${APP_EXECUTABLE_FILENAME}"
  Call vcCopyOne
  Push ""
  Call vcCopyTree
  !insertmacro custom_files_post_decompression

  File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"
  !insertmacro vcFileLine "설치: " "$INSTDIR\${UNINSTALL_FILENAME}"
  !insertmacro vcSetBar 860
!macroend

; 바로가기 두 개(시작 메뉴 · 바탕화면)는 하나에 0.3초쯤 걸린다(10/28 실측 — 그동안 막대가 멈췄다). 템플릿 원래 내용(include/installer.nsh)
; 그대로 두고 끝에 막대 한 걸음씩만 더한다. 원래 내용이 그대로인지는 desktop/test/nsis-template.test.js가 본다.
!macroundef addStartMenuLink
!macro addStartMenuLink keepShortcuts
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    # The keepShortcuts mechanism is NOT enabled.
    # Menu shortcut will be recreated.
    ${if} $keepShortcuts  == "false"
      !insertmacro cleanupOldMenuDirectory
      !insertmacro createMenuDirectory

      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      # clear error (if shortcut already exists)
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    # The keepShortcuts mechanism IS enabled.
    # The menu shortcut could either not exist (it shouldn't be recreated) or exist in an obsolete location.
    ${elseif} $oldStartMenuLink != $newStartMenuLink
    ${andIf} ${FileExists} "$oldStartMenuLink"
      !insertmacro createMenuDirectory

      Rename $oldStartMenuLink $newStartMenuLink
      WinShell::UninstShortcut "$oldStartMenuLink"
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

      !insertmacro cleanupOldMenuDirectory
    ${endIf}
  !endif
  !insertmacro vcSetBar 905
!macroend

!macroundef addDesktopLink
!macro addDesktopLink keepShortcuts
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    # https://github.com/electron-userland/electron-builder/pull/1432
    ${ifNot} ${isNoDesktopShortcut}
      # The keepShortcuts mechanism is NOT enabled.
      # Shortcuts will be recreated.
      ${if} $keepShortcuts == "false"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      # The keepShortcuts mechanism IS enabled.
      # The desktop shortcut could exist in an obsolete location (due to name change).
      ${elseif} $oldDesktopLink != $newDesktopLink
      ${andIf} ${FileExists} "$oldDesktopLink"
        Rename $oldDesktopLink $newDesktopLink
        WinShell::UninstShortcut "$oldDesktopLink"
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"

      !ifdef RECREATE_DESKTOP_SHORTCUT
      ${elseif} $oldDesktopLink != $newDesktopLink
      ${orIfNot} ${FileExists} "$oldDesktopLink"
        ${ifNot} ${isUpdated}
          CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          ClearErrors
          WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ${endIf}
      !endif
      ${endIf}
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endIf}
  !endif
  !insertmacro vcSetBar 950
!macroend

!endif
