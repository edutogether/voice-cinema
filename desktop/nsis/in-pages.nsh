; Voice Cinema 설치기의 위치 화면 — installer.nsh의 customWelcomePage 안에서 들인다. 그 자리는 MUI2가 화면 매크로를 정의한 뒤 · 설치 범위 화면과
; 위치 화면을 넣기 전이다(assistedInstaller.nsh). 설치기에는 첫 화면(환영)이 없어 이 훅에서 화면을 넣지는 않는다.
;   - MUI_PAGE_DIRECTORY를 바꿔 끼워 위치 화면을 nsDialogs로 그린다 — MUI 위치 화면(NSIS modern.exe IDD_DIR)과 같은 칸 · 같은 자리(대화 단위)다.
; 왜 다시 그리나(10/28 팀장 검토): MUI 위치 화면은 폴더 칸이 처음부터 파랗게 전체 선택되어 있고, «나만» 위치처럼 긴 경로는 칸에서 앞이 잘려
; «\AppData\Local\…»부터 보였다. 칸이 좁으면 폴더 이름 단위로 줄인 모양(«C:\Users\817be\AppData\…\Voice Cinema»)을 보이고, 칸을 누르거나
; «찾아보기»로 고르면 그때 전체 경로를 보인다. MUI 화면의 칸은 누름을 알릴 길이 없어(NSIS가 직접 다룬다) 같은 모양을 nsDialogs로 만든다.
; 설치 위치는 늘 폴더 칸(전체 경로)에서 읽는다 — 줄인 모양은 그 위에 겹쳐 보여 주는 칸일 뿐이다.
; 왜 위치 화면을 떠날 때 묻나: 다음 화면이 곧바로 설치를 시작하는 진행 화면이다. 거기서 묻고 «취소»를 받으면 돌아갈 화면이 없다 — 위치 화면을
; 떠날 때 물어야 «취소»가 «아무것도 바꾸지 않고 그 화면에 남는다»가 된다(기준 9 · 10).

!ifndef VC_IN_PAGES_INCLUDED
!define VC_IN_PAGES_INCLUDED

!include nsDialogs.nsh
!ifndef WS_BORDER
  !define WS_BORDER 0x00800000   ; MUI 위치 화면의 폴더 칸과 같은 테두리(NSIS 머리 파일에는 없다)
!endif

; 설치 범위 화면(템플릿 PAGE_INSTALL_MODE — customWelcomePage 바로 뒤에 들어간다)이 뜨기 직전(SHOW): 아래 안내 칸을 단추 바로 아래로 올리고 늘린다.
; 템플릿은 그 칸을 0u 110u 280u 50u로 만드는데 화면 아래 끝이 140u쯤이라 세 줄만 보인다 — 줄 사이에 빈 줄을 두니(굴림이 맞닿아서)
; «…이미 설치되어 있습니다. / (위치) / 예전 것을 지우고 새로 설치합니다.»의 마지막 줄이 잘렸다(10/28 캡처). 단추(30u · 50u, 높이 20u) 아래 75u부터 쓴다.
; 함수 몸은 그 화면의 변수($MultiUser.InstallModePage)가 생긴 뒤인 installer.nsh customFinishPage에 있다.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW vcModeShow

!macroundef MUI_PAGE_DIRECTORY
!macro MUI_PAGE_DIRECTORY
  ; 템플릿이 이 화면 앞에 건 «업데이트면 건너뛰기»(skipPageIfUpdated — MUI_PAGE_CUSTOMFUNCTION_PRE)를 이 화면을 만들 때 그대로 부른다
  !ifdef MUI_PAGE_CUSTOMFUNCTION_PRE
    !define VC_DIR_PRE "${MUI_PAGE_CUSTOMFUNCTION_PRE}"
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !endif
  Page custom vcDirShow vcDirLeave

  Var vcDirEdit       ; 폴더 칸(전체 경로 — 설치 위치는 늘 여기서 읽는다)
  Var vcDirShort      ; 그 위에 겹친 줄인 모양 칸(누르면 사라진다)
  Var vcDirShortText  ; 줄인 모양을 만든 전체 경로 — 칸의 글이 이것과 달라지면(찾아보기 · 직접 고침) 줄인 모양을 치운다
  Var vcDirNeed       ; 필요한 디스크 공간 칸
  Var vcDirFree       ; 남은 디스크 공간 칸
  Var vcDirNeedKB     ; 필요한 공간(KB)
  Var vcInstalledString

  ; 크기(KB) → «498.2 MB» · «1259.0 GB»(NSIS 위치 화면과 같은 모양) — 스택: KB → 글
  Function vcSizeText
    Exch $R0
    Push $R1
    Push $R2
    ${If} $R0 < 1048576
      IntOp $R1 $R0 / 1024
      IntOp $R2 $R0 * 10
      IntOp $R2 $R2 / 1024
      IntOp $R2 $R2 % 10
      StrCpy $R0 "$R1.$R2$(^Mega)$(^Byte)"
    ${Else}
      IntOp $R0 $R0 / 1024
      IntOp $R1 $R0 / 1024
      IntOp $R2 $R0 * 10
      IntOp $R2 $R2 / 1024
      IntOp $R2 $R2 % 10
      StrCpy $R0 "$R1.$R2$(^Giga)$(^Byte)"
    ${EndIf}
    Pop $R2
    Pop $R1
    Exch $R0
  FunctionEnd

  ; 폴더 칸의 글로 남은 공간을 다시 적고, 경로가 맞고 공간이 넉넉할 때만 «설치»를 누를 수 있게 한다(NSIS 위치 화면과 같은 규칙:
  ; «X:\…» 또는 «\\서버\…» 꼴, 드라이브 맨 위는 안 됨, 쓸 수 없는 글자 없음). 남은 공간은 경로에서 가장 가까운 있는 폴더로 잰다.
  Function vcDirUpdate
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    ${NSD_GetText} $vcDirEdit $R0
    StrCpy $R3 1
    StrCpy $R1 $R0 2 1
    StrCpy $R2 $R0 2
    ${If} $R1 != ":\"
    ${AndIf} $R2 != "\\"
      StrCpy $R3 0
    ${EndIf}
    StrLen $R1 $R0
    ${If} $R1 <= 3
      StrCpy $R3 0
    ${EndIf}
    StrCpy $R1 3
    ${Do}
      StrCpy $R2 $R0 1 $R1
      ${If} $R2 == ""
        ${ExitDo}
      ${EndIf}
      ${If} $R2 == ":"
      ${OrIf} $R2 == "*"
      ${OrIf} $R2 == "?"
      ${OrIf} $R2 == '"'
      ${OrIf} $R2 == "<"
      ${OrIf} $R2 == ">"
      ${OrIf} $R2 == "|"
        StrCpy $R3 0
      ${EndIf}
      IntOp $R1 $R1 + 1
    ${Loop}
    ; 남은 공간(MB 단위로 받아 KB로 — 2TB가 넘는 드라이브도 32비트 정수 안에서)
    StrCpy $R1 $R0
    StrCpy $R2 ""
    ${Do}
      System::Call "kernel32::GetDiskFreeSpaceExW(w R1, *l .R2, *l, *l) i .s"
      Pop $R0
      ${If} $R0 != 0
        ${ExitDo}
      ${EndIf}
      StrCpy $R2 ""
      ${GetParent} $R1 $R0
      ${If} $R0 == ""
      ${OrIf} $R0 == $R1
        ${ExitDo}
      ${EndIf}
      StrCpy $R1 $R0
    ${Loop}
    ${If} $R2 != ""
      System::Int64Op $R2 / 1048576
      Pop $R2
      IntOp $R1 $vcDirNeedKB / 1024
      ${If} $R2 <= $R1
        StrCpy $R3 0
      ${EndIf}
      ${If} $R2 < 1024
        IntOp $R2 $R2 * 1024
        Push $R2
        Call vcSizeText
        Pop $R0
      ${Else}
        IntOp $R0 $R2 / 1024
        IntOp $R1 $R2 * 10
        IntOp $R1 $R1 / 1024
        IntOp $R1 $R1 % 10
        StrCpy $R0 "$R0.$R1$(^Giga)$(^Byte)"
      ${EndIf}
      ${NSD_SetText} $vcDirFree "$(^SpaceAvailable)$R0"
    ${Else}
      ${NSD_SetText} $vcDirFree ""
      StrCpy $R3 0
    ${EndIf}
    GetDlgItem $R0 $HWNDPARENT 1
    EnableWindow $R0 $R3
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 폴더 칸이 바뀌면(찾아보기 · 직접 고침) 줄인 모양을 치우고 공간 · 단추를 다시 본다
  Function vcDirChanged
    Pop $R9
    ${NSD_GetText} $vcDirEdit $R9
    ${If} $R9 != $vcDirShortText
      ShowWindow $vcDirShort ${SW_HIDE}
    ${EndIf}
    Call vcDirUpdate
  FunctionEnd

  ; 줄인 모양을 누르면: 그것을 치우고 폴더 칸(전체 경로)에 들어간다 — 선택 없이 앞부터 보인다(글자 자리는 화면을 띄울 때 둔 맨 앞 그대로)
  Function vcDirReveal
    Pop $R9
    ShowWindow $vcDirShort ${SW_HIDE}
    ${NSD_SetFocus} $vcDirEdit
    SendMessage $vcDirEdit ${EM_SETSEL} -1 -1
  FunctionEnd

  ; 찾아보기: 고른 폴더 아래에 앱 이름 폴더를 붙인다(NSIS 위치 화면과 같다 — 이미 그 이름으로 끝나면 그대로)
  Function vcDirBrowse
    Pop $R9
    ${NSD_GetText} $vcDirEdit $R8
    nsDialogs::SelectFolderDialog "${PRODUCT_NAME}를 설치할 폴더를 골라 주세요." "$R8"
    Pop $R8
    ${If} $R8 != "error"
    ${AndIf} $R8 != ""
      ${GetFileName} $R8 $R7
      ${If} $R7 != "${APP_FILENAME}"
        StrCpy $R7 $R8 1 -1
        ${If} $R7 == "\"
          StrCpy $R8 $R8 -1
        ${EndIf}
        StrCpy $R8 "$R8\${APP_FILENAME}"
      ${EndIf}
      ${NSD_SetText} $vcDirEdit $R8
      ShowWindow $vcDirShort ${SW_HIDE}
    ${EndIf}
  FunctionEnd

  Function vcDirShow
    !ifdef VC_DIR_PRE
      Call ${VC_DIR_PRE}
    !endif
    !insertmacro MUI_HEADER_TEXT "$(vcDirTitle)" "$(MUI_TEXT_DIRECTORY_SUBTITLE)"
    nsDialogs::Create 1018
    Pop $R0
    ${If} $R0 == error
      Abort
    ${EndIf}
    ; MUI 위치 화면(IDD_DIR)과 같은 자리: 안내 0,0 300×60 · «설치 폴더» 묶음 0,70 300×35 · 폴더 칸 10,85 210×12 · 찾아보기 228,83 60×15 ·
    ; 필요한 공간 0,115 150×8 · 남은 공간 0,125 150×8(대화 단위)
    ${NSD_CreateLabel} 0 0 300u 60u "${MUI_DIRECTORYPAGE_TEXT_TOP}"
    ${NSD_CreateGroupBox} 0 70u 300u 35u "$(^DirSubText)"
    ; WS_CLIPSIBLINGS: 그 위에 겹치는 줄인 모양 칸을 폴더 칸이 다시 그리며 덮지 않게
    nsDialogs::CreateControl EDIT ${WS_CHILD}|${WS_VISIBLE}|${WS_BORDER}|${WS_TABSTOP}|${ES_AUTOHSCROLL}|${WS_CLIPSIBLINGS} 0 10u 85u 210u 12u "$INSTDIR"
    Pop $vcDirEdit
    ${NSD_CreateButton} 228u 83u 60u 15u "$(^BrowseBtn)"
    Pop $R1
    ${NSD_OnClick} $R1 vcDirBrowse
    ${NSD_CreateLabel} 0 115u 150u 8u ""
    Pop $vcDirNeed
    ${NSD_CreateLabel} 0 125u 150u 8u ""
    Pop $vcDirFree

    ; 필요한 공간: 모든 설치 단계 크기의 합(NSIS 위치 화면과 같은 값)
    StrCpy $vcDirNeedKB 0
    StrCpy $R2 0
    ${Do}
      ClearErrors
      SectionGetSize $R2 $R3
      ${If} ${Errors}
        ${ExitDo}
      ${EndIf}
      IntOp $vcDirNeedKB $vcDirNeedKB + $R3
      IntOp $R2 $R2 + 1
    ${Loop}
    Push $vcDirNeedKB
    Call vcSizeText
    Pop $R3
    ${NSD_SetText} $vcDirNeed "$(^SpaceRequired)$R3"

    ; 칸이 좁으면 줄인 모양을 폴더 칸의 글 자리 위에 겹친다(칸 테두리는 폴더 칸 것이 그대로 보인다)
    StrCpy $vcDirShortText ""
    System::Call "*(i, i, i, i) p .R4"
    System::Call "user32::GetClientRect(p $vcDirEdit, p R4)"
    System::Call "user32::MapWindowPoints(p $vcDirEdit, p $R0, p R4, i 2)"
    System::Call "*$R4(i .R5, i .R6, i .R7, i .R8)"
    System::Free $R4
    SendMessage $vcDirEdit ${EM_GETMARGINS} 0 0 $R4
    IntOp $R4 $R4 & 0xFFFF
    IntOp $R5 $R5 + $R4
    IntOp $R7 $R7 - $R5
    IntOp $R7 $R7 - $R4
    IntOp $R8 $R8 - $R6
    StrCpy $vcMeasure $vcDirEdit
    Push $INSTDIR
    Call vcTextWidth
    Pop $R3
    ${If} $R3 > $R7
      Push $INSTDIR
      Push 1
      Push $R7
      Call vcShortenPath
      Pop $R3
      nsDialogs::CreateControl STATIC ${WS_CHILD}|${WS_VISIBLE}|${SS_NOTIFY}|${SS_CENTERIMAGE} 0 $R5 $R6 $R7 $R8 "$R3"
      Pop $vcDirShort
      ; 나중에 만든 칸은 쌓임 순서의 맨 아래라 폴더 칸 뒤에 숨는다(10/28 캡처) — 맨 위로 올린다(HWND_TOP, 자리 · 크기 그대로, 활성화하지 않음)
      System::Call "user32::SetWindowPos(p $vcDirShort, p 0, i 0, i 0, i 0, i 0, i 0x13)"
      SetCtlColors $vcDirShort SYSCLR:8 SYSCLR:5
      ${NSD_OnClick} $vcDirShort vcDirReveal
      StrCpy $vcDirShortText $INSTDIR
    ${EndIf}
    ${NSD_OnChange} $vcDirEdit vcDirChanged
    Call vcDirUpdate

    ; 처음 초점은 «설치» 단추 — 폴더 칸이 파랗게 전체 선택되어 보이지 않게
    GetDlgItem $R1 $HWNDPARENT 1
    ${NSD_SetFocus} $R1
    SendMessage $vcDirEdit ${EM_SETSEL} 0 0
    nsDialogs::Show
  FunctionEnd

  ; «설치»를 누르면: 폴더 칸의 전체 경로를 설치 위치로 하고, 이미 설치되어 있으면(나만 · 모든 사용자 어느 쪽이든 — 고른 범위와 다른 쪽도)
  ; 지우고 새로 설치할지 묻고, 그다음 켜진 앱을 끌지 묻는다. 둘 중 하나라도 «취소»면 이 화면에 남는다(아무것도 지우거나 끄지 않았다).
  ; 실제로 지우는 것은 진행 화면에서다(old-version.nsh — 지우는 줄 «삭제: …»부터 보인다).
  Function vcDirLeave
    ${NSD_GetText} $vcDirEdit $R0
    StrCpy $R1 $R0 1 -1
    ${If} $R1 == "\"
      StrCpy $R0 $R0 -1
    ${EndIf}
    StrCpy $INSTDIR $R0
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
