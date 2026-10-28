; Voice Cinema 설치기 · 제거기에 더하는 단계 — electron-builder가 설치기 맨 앞에 넣는다(desktop/electron-builder.yml nsis.include).
; 기준은 10/27 · 10/28 Bumm님 지시(팀장 전달, «Poster Studio 설치판과 똑같이»)다. 자세한 근거는 _docs/intents/2026-10-27-desktop-installer/intent.md.
;   1. 설치 범위 «나만 / 모든 사용자» 화면을 둔다. 위치는 둘 다 «InKY Film Festival\Voice Cinema» 모양이고 바꿀 수 있다.
;        모든 사용자: C:\Program Files\InKY Film Festival\Voice Cinema — electron-builder가 menuCategory를 붙여 만든다(관리자 권한으로 다시 뜬다).
;        나만:       %LOCALAPPDATA%\Programs\InKY Film Festival\Voice Cinema — electron-builder는 이 위치에 menuCategory를 붙이지 않아 아래에서 정한다.
;   2. 바탕화면 «Voice Cinema», 시작 메뉴 «InKY Film Festival»에 «Voice Cinema» · «Uninstall Voice Cinema». 지우면 바로가기 · 빈 폴더까지 남지 않는다.
;   5. 설치 완료 화면, 제거 첫 화면 · 완료 화면 왼쪽은 모두 같은 Voice Cinema 대표 그림이다(desktop/tools/make-icons.py가 배율마다 그려 둔다).
;      설치기에는 첫 화면(환영)을 두지 않는다 — Poster Studio와 같은 차례(설치 범위 → 위치 → 진행 → 완료, 10/28 팀장 결정).
;   6. 안내문은 한 줄에 한 문장, 칸 안에서 낱말 중간에 끊기지 않게, «(을)를» 같은 조사 표기와 번역투 없이.
;   7. 진행 화면은 깜빡이지 않고, 막대는 한 방향으로 고르게 차고, 100%를 1초 보인 뒤 완료 화면으로 넘어간다.
;      안내 상자는 처음부터 보이고, 맨 위 단계 문장 아래로 «설치: …» · «삭제: …»가 실제 파일마다 한 줄씩 흐른다.
;   9. 앱이 켜져 있으면 «켜져 있습니다 / 끄고 계속할까요?»를 묻는다. 취소하면 아무것도 바꾸지 않고 그 화면에 남는다.
;  10. 이미 설치되어 있으면(나만 · 모든 사용자 어느 쪽이든) «지우고 새로 설치할까요?»를 묻고, 확인하면 예전 판을 지우는 줄부터 보인 뒤 설치한다.
;  11. 설치 · 제거 중에 명령 창(PowerShell · cmd)을 띄우지 않는다 — 켜진 앱은 실행 파일 이름으로 바로 찾고(nsProcess), 예전 판 제거기는 창 없이 돌린다.

!include LogicLib.nsh
; 아래 .onGUIEnd가 쓰는 등록 키 이름 — electron-builder multiUser.nsh와 같은 정의다(그쪽도 /ifndef라 한 값으로 맞는다). 그 파일은 이 파일보다 뒤에 들어온다.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
; 창 메시지 값 — WinMessages.nsh(MUI2가 들인다)에도 같은 이름이 있지만 그 파일은 이 파일보다 뒤에 들어오고 /ifndef가 없어, 여기서는 따로 이름을 붙인다
!define VC_PBM_SETRANGE32 0x0406
!define VC_PBM_SETPOS 0x0402
!define VC_LVM_SETEXTENDEDLISTVIEWSTYLE 0x1036
!define VC_LVS_EX_DOUBLEBUFFER 0x00010000
!define VC_LVM_GETCOLUMNWIDTH 0x101D
!define VC_WM_GETFONT 0x0031
; 이 파일이 있는 폴더 — 아래 훅 안에서 함께 넣는 파일(install-files.nsh · un-pages.nsh)을 찾는다
!define VC_NSIS_DIR "${__FILEDIR__}"

; ── 안내 상자는 처음부터 보인다(기준 7) ──
; electron-builder 템플릿(common.nsh)은 «nevershow»로 상자를 숨긴다. 진행 중에 «SetDetailsView show»로 켜면 화면이 열린 뒤에 상자가 튀어나와 깜빡인다.
; 그래서 속성 자체를 «show»로 바꾼다 — 같은 속성은 나중 값이 이기고, 이 줄들은 템플릿보다 뒤인 customHeader에서 다시 정한다(아래).
!macro vcShowDetailsFromStart
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend

; ── 화면 안내문(기준 6) ──
; 칸 글꼴은 굴림 9pt, 칸 폭은 100%에서 위치 안내 · 설치 범위 위 안내 525px, 설치 범위 단추 · 아래 안내 490px, 머리 설명 368px,
; 첫 화면 · 완료 화면 글 341px다(10/28 desktop/tools/installer-probe.ps1로 잼 — 이 도구가 줄마다 폭을 재 넘치면 알린다).
; 첫 화면 · 완료 화면 글은 MUI 정식 설정으로, 나머지는 언어 문구가 다 정해진 뒤(customHeader) 같은 이름으로 다시 정한다 — 나중 값이 이긴다.
; 여러 줄 안내문은 줄 사이에 빈 줄을 둔다 — 설치 창 글꼴(굴림 9pt)은 줄 간격이 글자 높이와 같아 위아래 줄의 글자가 맞닿았다(10/28 팀장 검토).
; 묻는 창(MessageBox)은 Windows 글꼴이라 줄 간격이 있어 빈 줄을 두지 않는다.
!ifndef BUILD_UNINSTALLER
  ; 위치 화면은 in-pages.nsh가 MUI 위치 화면과 같은 모양으로 그린다 — 이 안내문을 그 화면 맨 위 칸에 쓴다
  !define MUI_DIRECTORYPAGE_TEXT_TOP "${PRODUCT_NAME}를 아래 폴더에 설치합니다.$\r$\n$\r$\n다른 폴더에 설치하려면 '찾아보기'를 눌러 폴더를 골라 주세요.$\r$\n$\r$\n$(^ClickInstall)"
  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} 설치 완료"
  !define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME}를 설치했습니다.$\r$\n$\r$\n'마침'을 누르면 설치 프로그램이 닫힙니다."
!else
  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} 제거 완료"
  !define MUI_FINISHPAGE_TEXT "이 컴퓨터에서 ${PRODUCT_NAME}를 제거했습니다.$\r$\n$\r$\n'마침'을 누르면 창이 닫힙니다."
!endif
; 같은 이름을 두 번 정하면 NSIS가 «자리 낭비» 경고(6030)를 내고 electron-builder는 경고를 오류로 다룬다(-WX) — 이 몇 줄에서만 그 경고를 끈다.
; «설치 범위» 아래 안내는 설치기가 «$(…Exists)(경로)$\r$\n$(reinstallUpgrade)»로 잇는다 — 앞 문장 끝에 줄바꿈을 넣어 경로가 제 줄에 오게 한다.
!macro customHeader
  !insertmacro vcShowDetailsFromStart
  ; «확인 중» 대화 상자(IDD_VERIFY)를 글 없는 0×0 상자로 — NSIS의 «verifying installer: N%»와 UAC 플러그인의 «Please wait while Setup is loading...»(영어,
  ; «모든 사용자»로 관리자 권한 설치기를 띄우는 동안 주 모니터 가운데에 1초쯤)가 쓰던 상자다(기준 14). 확인 자체는 그대로 한다. 만드는 법은 desktop/tools/make-ui.ps1.
  ChangeUI IDD_VERIFY "${VC_NSIS_DIR}\vc-ui.exe"
  !pragma warning push
  !pragma warning disable 6030
  !ifndef BUILD_UNINSTALLER
    ; 설치 범위 화면은 쉬운 말로(10/28 팀장 검토 — Poster Studio와 같은 문구)
    LangString whoShouldThisApplicationBeInstalledFor ${LANG_KOREAN} "${PRODUCT_NAME}를 쓸 사람을 골라 주세요."
    LangString selectUserMode ${LANG_KOREAN} "이 컴퓨터에서 누가 ${PRODUCT_NAME}를 쓸지 골라 주세요."
    LangString freshInstallForAll ${LANG_KOREAN} "모든 사용자가 쓸 수 있게 설치합니다.$\r$\n$\r$\n다음 단계에서 관리자 허락을 묻는 창이 뜹니다."
    LangString freshInstallForCurrent ${LANG_KOREAN} "나만 쓸 수 있게 설치합니다."
    ; 템플릿이 «$(…Exists)(설치 위치)$\r$\n$(reinstallUpgrade)»로 잇는다 — 세 줄 사이에 빈 줄이 오게 앞뒤 문구에 줄바꿈을 하나씩 더 둔다
    LangString perUserInstallExists ${LANG_KOREAN} "나만 쓰는 ${PRODUCT_NAME}가 이미 설치되어 있습니다.$\r$\n$\r$\n"
    LangString perMachineInstallExists ${LANG_KOREAN} "모든 사용자용 ${PRODUCT_NAME}가 이미 설치되어 있습니다.$\r$\n$\r$\n"
    LangString reinstallUpgrade ${LANG_KOREAN} "$\r$\n예전 것을 지우고 새로 설치합니다."
    LangString vcDirTitle ${LANG_KOREAN} "설치 위치 선택"
    LangString MUI_TEXT_DIRECTORY_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 설치할 폴더를 골라 주세요."
    LangString MUI_TEXT_INSTALLING_TITLE ${LANG_KOREAN} "설치 중"
    LangString MUI_TEXT_INSTALLING_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 설치하는 동안 잠시 기다려 주세요."
    LangString MUI_TEXT_FINISH_SUBTITLE ${LANG_KOREAN} "설치가 끝났습니다."
    LangString uninstallFailed ${LANG_KOREAN} "예전 ${PRODUCT_NAME}를 지우지 못했습니다.$\r$\n설치 프로그램을 다시 실행해 주세요."
    LangString decompressionFailed ${LANG_KOREAN} "프로그램 파일을 풀지 못했습니다.$\r$\n설치 프로그램을 다시 실행해 주세요."
    ; 이미 설치되어 있을 때(기준 10 — 팀장 전달 문구 그대로) · 예전 판 제거가 안 됐을 때(관리자 권한을 거절한 경우 포함)
    LangString vcAlreadyInstalled ${LANG_KOREAN} "${PRODUCT_NAME}가 이미 설치되어 있습니다.$\r$\n지우고 새로 설치할까요?"
    LangString vcOldRemoveFailed ${LANG_KOREAN} "예전 ${PRODUCT_NAME}를 지우지 못했습니다.$\r$\n다시 시도할까요?"
  !else
    LangString whichInstallationShouldBeRemoved ${LANG_KOREAN} "제거할 설치를 골라 주세요."
    ; 제거 범위 화면(두 범위가 함께 깔렸을 때만 뜸) — 기본 번역의 «\n»은 줄바꿈이 아니라 글자 그대로 찍힌다
    ; 이 칸은 두 줄 높이(20u)라 빈 줄을 둘 수 없다 — 한 문장 한 줄로
    LangString whichInstallationRemove ${LANG_KOREAN} "모든 사용자용과 나만 쓰는 ${PRODUCT_NAME} 가운데 어느 것을 제거할지 골라 주세요."
    LangString perUserInstall ${LANG_KOREAN} "나만 쓰는 ${PRODUCT_NAME}가 설치되어 있습니다.$\r$\n$\r$\n"
    LangString perMachineInstall ${LANG_KOREAN} "모든 사용자용 ${PRODUCT_NAME}가 설치되어 있습니다.$\r$\n$\r$\n"
    LangString uninstall ${LANG_KOREAN} "$\r$\n이것을 제거합니다."
    LangString MUI_UNTEXT_UNINSTALLING_TITLE ${LANG_KOREAN} "제거 중"
    LangString MUI_UNTEXT_UNINSTALLING_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 제거하는 동안 잠시 기다려 주세요."
    LangString MUI_UNTEXT_FINISH_TITLE ${LANG_KOREAN} "제거 완료"
    LangString MUI_UNTEXT_FINISH_SUBTITLE ${LANG_KOREAN} "제거가 끝났습니다."
  !endif
  ; 설치 범위 단추 — 기본 번역 «&me 전용» · «이 컴퓨터를 사용하는 모든 사람(&모든 사용자)»은 단축키 글자가 그대로 보였다(«me 전용»).
  ; 기준 1의 말 그대로 «모든 사용자» · «나만»으로 쓰고 단축키는 두지 않는다(화살표 키로 고른다). «나만» 뒤에는 템플릿이 «(사용자 이름)»을 붙인다.
  LangString onlyForMe ${LANG_KOREAN} "나만"
  LangString forAll ${LANG_KOREAN} "모든 사용자"
  LangString loginWithAdminAccount ${LANG_KOREAN} "계속하려면 관리자 계정으로 로그인해 주세요."
  ; 앱이 켜져 있을 때 뜨는 알림(기준 9 — 팀장 전달 문구 그대로) — 한국어 Windows에서 단추 이름은 «확인» · «취소» · «다시 시도»다
  LangString appRunning ${LANG_KOREAN} "${PRODUCT_NAME}가 켜져 있습니다.$\r$\n끄고 계속할까요?"
  LangString appCannotBeClosed ${LANG_KOREAN} "${PRODUCT_NAME}를 끄지 못했습니다.$\r$\n직접 끈 뒤 '다시 시도'를 눌러 주세요."
  !pragma warning pop
!macroend

; ── 설치 화면 그림을 칸에 맞는 판으로(기준 3 · 5) ──
; 그림 칸 크기는 한글 Windows 글꼴과 화면 배율로 정해진다 — 100%에서 머리 로고 칸 175×53, 첫 화면 · 완료 화면 왼쪽 칸 191×290.
; electron-builder가 넣는 그림은 한 장이라 칸에 맞게 비율 없이 늘어난다. make-icons.py가 배율 100~300%마다 칸 크기 그대로 그려 둔 판
; (desktop/build/installer-art) 가운데 칸의 실제 너비에 가장 가까운 것을 끼운다 — 칸과 몇 화소 다르면 그만큼만 맞춰 늘인다.
!define VC_HEADER_W 175
!define VC_SIDEBAR_W 191

; $R9 = 칸 너비(화소) → $R8 = 고를 배율(100 · 125 · 150 · 175 · 200 · 225 · 250 · 300)
!macro vcPickScale BASE
  IntOp $R8 $R9 * 100
  IntOp $R8 $R8 / ${BASE}
  ${If} $R8 < 113
    StrCpy $R8 100
  ${ElseIf} $R8 < 138
    StrCpy $R8 125
  ${ElseIf} $R8 < 163
    StrCpy $R8 150
  ${ElseIf} $R8 < 188
    StrCpy $R8 175
  ${ElseIf} $R8 < 213
    StrCpy $R8 200
  ${ElseIf} $R8 < 238
    StrCpy $R8 225
  ${ElseIf} $R8 < 275
    StrCpy $R8 250
  ${Else}
    StrCpy $R8 300
  ${EndIf}
!macroend

; 고른 배율($R8)의 판을 $PLUGINSDIR\vc-<NAME>.bmp로 푼다(설치기 안에는 여덟 판이 다 들어 있고, 고른 것 하나만 푼다)
!macro vcExtractArt NAME
  ${If} $R8 == 100
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-100.bmp"
  ${ElseIf} $R8 == 125
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-125.bmp"
  ${ElseIf} $R8 == 150
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-150.bmp"
  ${ElseIf} $R8 == 175
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-175.bmp"
  ${ElseIf} $R8 == 200
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-200.bmp"
  ${ElseIf} $R8 == 225
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-225.bmp"
  ${ElseIf} $R8 == 250
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-250.bmp"
  ${Else}
    File "/oname=$PLUGINSDIR\vc-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-300.bmp"
  ${EndIf}
!macroend

; 창(컨트롤) HWND의 안쪽 너비 → $R9
!macro vcClientWidth HWND
  System::Call "*(i 0, i 0, i 0, i 0) p.R7"
  System::Call "user32::GetClientRect(p ${HWND}, p R7)"
  System::Call "*$R7(i, i, i .R9, i)"
  System::Free $R7
!macroend

; ── 화면을 바꿀 때 반쯤 그린 장이 보이지 않게(기준 7 · 11) ──
; NSIS는 다음 화면으로 넘어갈 때 앞 화면을 먼저 없애고 새 화면을 만든다. 그 사이 창 전체가 회색인 장 · 머리만 그린 장이 한두 장(0.07초) 보였다
; (10/28 «설치 범위 → 설치 위치» 녹화). 창 전체를 한 번에 그려 다 그린 장만 보이게 한다(WS_EX_COMPOSITED — 창과 그 안의 칸을 함께 두 번 그려 바꿈).
; 진행 화면 동안에는 끈다 — 켜 두면 막대 · 상자가 스스로 다시 그리는 사이에 빈 장이 끼었다(같은 날 녹화: 막대 빈 장 2 · 상자 빈 장 5).
; 끄는 때는 진행 화면을 한 번 다 그린 뒤(설치 · 제거 단계의 맨 앞 — vcCompositedOff)다. 화면이 뜨기 직전(SHOW)에 끄면 넘어가는 그 그림이
; 나뉘어 그려져 반쯤 그린 장 2장이 다시 끼었다. 진행 화면을 떠날 때(LEAVE — 완료 화면으로 넘어가기 직전) 다시 켠다.
!macro vcComposited STATE
  Push $0
  System::Call "user32::GetWindowLongW(p $HWNDPARENT, i -20) i .r0"
  !if "${STATE}" == "on"
    IntOp $0 $0 | 0x02000000
  !else
    IntOp $0 $0 & 0xFDFFFFFF
  !endif
  System::Call "user32::SetWindowLongW(p $HWNDPARENT, i -20, i r0)"
  Pop $0
!macroend
; 설치 · 제거 단계(따로 도는 스레드)의 맨 앞: 화면 스레드가 진행 화면의 첫 그림을 마치게 한 뒤(RDW_UPDATENOW | RDW_ALLCHILDREN) 끈다
!macro vcCompositedOff
  ${IfNot} ${Silent}
    System::Call "user32::RedrawWindow(p $HWNDPARENT, p 0, p 0, i 0x180)"
    !insertmacro vcComposited off
  ${EndIf}
!macroend

; 머리 로고(설치 · 제거의 가운데 화면 공통 — 칸 1046): MUI가 기본 그림을 넣은 뒤(.onGUIInit 끝) 칸에 맞는 판으로 바꾼다. 첫 화면이 뜨기 전이라 깜빡이지 않는다.
; «한 번에 그리기»는 형제 칸을 쌓인 차례(z-order)대로 그린다 — 창 머리의 흰 바탕(1034)과 아래 글의 바탕(1256)이 그 위의 제목(1037) · 설명(1038) ·
; 머리 그림(1046) · 아래 글(1028)보다 위에 쌓여 있어 글 · 그림이 바탕에 덮였다(10/28 캡처 — 평소 그리기에서는 나중에 그려 보였다).
; 바탕 둘을 맨 아래로, 그 위 글 · 그림을 맨 위로 둔다. SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
!macro vcHeaderOrder
  Push $R6
  !insertmacro vcZ 1034 1
  !insertmacro vcZ 1256 1
  !insertmacro vcZ 1037 0
  !insertmacro vcZ 1038 0
  !insertmacro vcZ 1046 0
  !insertmacro vcZ 1028 0
  Pop $R6
!macroend
!macro vcZ ID AFTER
  GetDlgItem $R6 $HWNDPARENT ${ID}
  ${If} $R6 != 0
    System::Call "user32::SetWindowPos(p R6, p ${AFTER}, i 0, i 0, i 0, i 0, i 0x13)"
  ${EndIf}
!macroend

!macro vcHeaderArt
  !insertmacro vcComposited on
  !insertmacro vcHeaderOrder
  Push $R6
  Push $R7
  Push $R8
  Push $R9
  InitPluginsDir
  GetDlgItem $R6 $HWNDPARENT 1046
  !insertmacro vcClientWidth $R6
  ${If} $R9 > 0
    !insertmacro vcPickScale ${VC_HEADER_W}
    !insertmacro vcExtractArt header
    SetBrandingImage /IMGID=1046 /RESIZETOFIT "$PLUGINSDIR\vc-header.bmp"
  ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
!macroend

; 첫 화면 · 완료 화면 왼쪽 그림: 그림 칸은 화면이 만들어질 때 생기므로, 그 화면을 띄우기 직전(SHOW)에 칸을 재서 판을 바꾼다.
; 그림 손잡이는 MUI가 화면을 떠날 때 푼다(NSD_FreeImage).
!macro vcSidebarArt IMAGE BITMAP
  Push $R7
  Push $R8
  Push $R9
  ; 전체 창 화면(그림이 든 화면)을 창 머리의 흰 바탕 칸보다 위로 올린다 — «한 번에 그리기»(vcComposited)는 형제 칸을 쌓인 차례대로 그려,
  ; 머리 바탕이 화면 위쪽 100px(제목 · 그림 윗부분)을 덮었다(10/28 녹화). SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE, 맨 위(HWND_TOP)
  System::Call "user32::GetParent(p ${IMAGE}) p .R7"
  System::Call "user32::SetWindowPos(p R7, p 0, i 0, i 0, i 0, i 0, i 0x13)"
  !insertmacro vcClientWidth ${IMAGE}
  ${If} $R9 > 0
    !insertmacro vcPickScale ${VC_SIDEBAR_W}
    !insertmacro vcExtractArt sidebar
    ${NSD_FreeImage} ${BITMAP}
    ${NSD_SetStretchedImage} ${IMAGE} "$PLUGINSDIR\vc-sidebar.bmp" ${BITMAP}
  ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
!macroend

; 설치 범위 화면의 아래 안내 칸(템플릿 multiUserUi.nsh의 $RadioButtonLabel1)을 75u부터 화면 아래까지 — in-pages.nsh · 제거기 첫 화면 다음에 쓴다
!macro vcModeLabel
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  System::Call "*(i 0, i 75, i 280, i 160) p .r0"
  System::Call "user32::MapDialogRect(p $MultiUser.InstallModePage, p r0)"
  System::Call "*$0(i .r1, i .r2, i .r3, i .r4)"
  System::Free $0
  IntOp $3 $3 - $1
  IntOp $4 $4 - $2
  System::Call "user32::SetWindowPos(p $RadioButtonLabel1, p 0, i r1, i r2, i r3, i r4, i 0x14)"
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

; ── 진행 막대(기준 7) ──
; NSIS는 명령 하나를 마칠 때마다 제 막대(1004)를 «명령 수 기준» 위치로 다시 옮긴다. 압축 풀기 플러그인도 같은 막대를 제 기준(0→100%)으로 옮긴다.
; 둘이 번갈아 막대를 잡아 막대가 앞뒤로 튀었다. 그래서 진행 화면이 뜨기 직전(SHOW) 같은 자리 · 같은 모양의 막대를 하나 더 만들어
; 이 파일만 그 막대를 움직이고(0~1000), 원래 막대는 숨긴다. 원래 막대는 NSIS가 계속 움직여도 보이지 않는다.
Var vcBar
!macro vcMakeBar
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  ; 상자는 처음부터 보이고, 줄이 빠르게 늘어도 깜빡이지 않게 두 번 그려 바꾸는 방식(이중 버퍼)을 켠다
  SendMessage $mui.InstFilesPage.Log ${VC_LVM_SETEXTENDEDLISTVIEWSTYLE} ${VC_LVS_EX_DOUBLEBUFFER} ${VC_LVS_EX_DOUBLEBUFFER}
  System::Call "*(i 0, i 0, i 0, i 0) p.r1"
  System::Call "user32::GetWindowRect(p $mui.InstFilesPage.ProgressBar, p r1)"
  System::Call "user32::MapWindowPoints(p 0, p $mui.InstFilesPage, p r1, i 2)"
  System::Call "*$1(i .r2, i .r3, i .r4, i .r5)"
  System::Free $1
  IntOp $4 $4 - $2
  IntOp $5 $5 - $3
  System::Call "user32::GetWindowLongW(p $mui.InstFilesPage.ProgressBar, i -16) i .r6"
  System::Call "user32::CreateWindowExW(i 0, w 'msctls_progress32', w '', i r6, i r2, i r3, i r4, i r5, p $mui.InstFilesPage, p 1099, p 0, p 0) p .r0"
  StrCpy $vcBar $0
  ; 경로 칸 폭 = 상자 줄 폭 − 앞말(«설치: » · «삭제: » — 굴림에서 같은 폭) − 줄 앞뒤 여백
  StrCpy $vcLog $mui.InstFilesPage.Log
  StrCpy $vcMeasure $vcLog
  SendMessage $vcLog ${VC_LVM_GETCOLUMNWIDTH} 0 0 $1
  SendMessage $vcLog ${VC_WM_GETFONT} 0 0 $2
  System::Call "user32::GetDC(p $vcLog) p .r3"
  System::Call "gdi32::SelectObject(p r3, p r2) p .r4"
  System::Call "*(i 0, i 0) p .r5"
  System::Call "gdi32::GetTextExtentPoint32W(p r3, w '설치: ', i 4, p r5)"
  System::Call "*$5(i .r6, i)"
  System::Free $5
  System::Call "gdi32::SelectObject(p r3, p r4)"
  System::Call "user32::ReleaseDC(p $vcLog, p r3)"
  IntOp $vcPathWidth $1 - $6
  IntOp $vcPathWidth $vcPathWidth - 16
  SendMessage $vcBar ${VC_PBM_SETRANGE32} 0 1001   ; 끝 1000에도 «한 칸 앞»이 있게(vcSetBarRaw)
  SendMessage $vcBar ${VC_PBM_SETPOS} 0 0
  StrCpy $vcBarBase 0
  StrCpy $vcBarSpan 1000
  ShowWindow $mui.InstFilesPage.ProgressBar ${SW_HIDE}
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
; 막대를 POS(0~1000)로 — 앞으로만 간다(뒤 값이 오면 그대로 둔다).
; 설치기가 예전 판을 먼저 지우면(기준 10) 막대 앞 몫(0~250)을 그 제거가 쓰고, 설치 단계의 0~1000은 남은 몫(250~1000)에 줄여 담는다 —
; 막대는 처음부터 끝까지 한 방향이다. 그 몫은 vcBarBase · vcBarSpan이 정하고(진행 화면이 뜰 때 0 · 1000), vcSetBarRaw는 줄이지 않고 그대로 옮긴다.
Var vcBarPos
Var vcBarBase
Var vcBarSpan
Var vcBarRaw
Var vcBarNext
; Windows 막대는 앞으로 갈 때 새 자리까지 미끄러지듯 따라가 늦게 보인다. 뒤로 갈 때는 바로 그리므로, 한 칸 앞에 놓았다가 제자리로 되돌려
; 그 자리를 바로 그리게 한다. 그래서 막대 범위는 0~1001이다 — 끝 1000에서도 «한 칸 앞»(1001)이 있다. 마지막에 1001로 한 칸(1화소 안) 더 채운다.
; 처음에는 끝에서만 범위를 늘렸다 되돌렸는데, 범위가 바뀌면 막대 칸을 지웠다 다시 그려 100%에서 막대가 한 장(0.03초) 사라졌다(10/28 녹화 05회차).
!macro vcSetBarRaw POS
  ${If} ${POS} > $vcBarPos
    StrCpy $vcBarPos ${POS}
    ${If} $vcBar != ""
      IntOp $vcBarNext $vcBarPos + 1
      SendMessage $vcBar ${VC_PBM_SETPOS} $vcBarNext 0
      SendMessage $vcBar ${VC_PBM_SETPOS} $vcBarPos 0
      ${If} $vcBarPos >= 1000
        SendMessage $vcBar ${VC_PBM_SETPOS} 1001 0
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
!macro vcSetBar POS
  IntOp $vcBarRaw ${POS} * $vcBarSpan
  IntOp $vcBarRaw $vcBarRaw / 1000
  IntOp $vcBarRaw $vcBarRaw + $vcBarBase
  !insertmacro vcSetBarRaw $vcBarRaw
!macroend

; 상자에 한 줄 — 단계 문장은 막대 위 글줄과 상자에 함께, 파일 줄은 상자에만(막대 위 글줄은 단계 문장으로 남는다)
; 파일 줄은 «설치: <경로>» · «삭제: <경로>»다. 칸보다 긴 경로는 폴더 이름 단위로만 줄여 가운데 폴더들을 «…» 하나로 바꾼다 — 낱말 중간에서
; 끊지 않는다(기준 6). 처음에는 Windows PathCompactPath로 줄였는데 글자 단위로 잘라 줄마다 «InK…» · «InKY Fil…» · «Microsof…»처럼
; 다른 곳이 잘렸다(10/28 팀장 검토). 칸 폭은 진행 화면이 뜰 때 잰다(vcMakeBar).
;   - 지금 설치하거나 지우는 위치($vcBase) 아래 파일: 줄마다 같은 모양이 되게, 위치가 칸의 45%보다 길면 그 위치를 한 번 줄여(앞 폴더들 + «…» +
;     마지막 폴더) 모든 줄에 같이 쓴다 — 예: «C:\Users\817be\AppData\Local\…\Voice Cinema\vulkan-1.dll».
;   - 그 밖의 경로(바로가기 · 앱 데이터): 끝(상위 폴더\파일 이름)을 남기고 앞 폴더를 칸에 드는 만큼 남긴다.
Var vcLog
Var vcPathWidth
Var vcMeasure    ; 글 폭을 잴 칸(그 칸의 글꼴로 잰다) — 진행 화면은 상자(vcMakeBar), 위치 화면은 폴더 칸(in-pages.nsh)
Var vcBase      ; 지금 줄을 적는 위치(설치 · 제거하는 폴더) — 비어 있으면 «그 밖의 경로» 규칙만 쓴다
Var vcBaseFor    ; $vcBaseShow를 계산한 위치
Var vcBaseShow   ; 줄에 쓸 위치의 모양
!macro vcFitPathFunction UN
  ; 글 폭($vcMeasure 칸의 글꼴, 화소) — 스택: 글 → 폭
  Function ${UN}vcTextWidth
    Exch $R0
    Push $R1
    Push $R2
    Push $R3
    Push $R4
    System::Call "user32::GetDC(p $vcMeasure) p .R1"
    SendMessage $vcMeasure ${VC_WM_GETFONT} 0 0 $R2
    System::Call "gdi32::SelectObject(p R1, p R2) p .R3"
    StrLen $R4 $R0
    System::Call "*(i 0, i 0) p .R2"
    System::Call "gdi32::GetTextExtentPoint32W(p R1, w R0, i R4, p R2)"
    System::Call "*$R2(i .R4, i)"
    System::Free $R2
    System::Call "gdi32::SelectObject(p R1, p R3)"
    System::Call "user32::ReleaseDC(p $vcMeasure, p R1)"
    StrCpy $R0 $R4
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
  FunctionEnd

  ; 앞 폴더들 + «\…» + 끝 TAIL개(폴더 · 파일 이름)로 줄인다 — 스택: 경로, 끝 개수, 폭 → 줄인 경로.
  ; 앞은 드라이브(«C:»)부터 폴더 하나씩 늘려 폭 안에 드는 데까지. 끝 TAIL개로도 넘치면 끝을 하나로 줄여 본다.
  Function ${UN}vcShortenPath
    Exch $R2   ; 폭
    Exch
    Exch $R1   ; 끝 개수
    Exch 2
    Exch $R0   ; 경로
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    Push $R7
    Push $R8
    ${Do}
      ; 끝 $R1개가 시작하는 «\»의 자리 → $R4(없으면 줄일 수 없어 그대로)
      StrLen $R3 $R0
      StrCpy $R5 0
      StrCpy $R4 -1
      ${Do}
        IntOp $R3 $R3 - 1
        ${If} $R3 < 0
          ${ExitDo}
        ${EndIf}
        StrCpy $R6 $R0 1 $R3
        ${If} $R6 == "\"
          IntOp $R5 $R5 + 1
          ${If} $R5 == $R1
            StrCpy $R4 $R3
            ${ExitDo}
          ${EndIf}
        ${EndIf}
      ${Loop}
      ${If} $R4 < 0
        ${ExitDo}
      ${EndIf}
      StrCpy $R7 $R0 "" $R4   ; 끝(«\»부터)
      ; 앞: 첫 «\» 앞(드라이브)부터, 끝이 시작하기 전까지 폴더를 하나씩 늘린다
      StrCpy $R3 0
      StrCpy $R8 ""
      ${Do}
        StrCpy $R6 $R0 1 $R3
        ${If} $R3 >= $R4
          ${ExitDo}
        ${EndIf}
        ${If} $R6 == "\"
          StrCpy $R5 $R0 $R3
          Push "$R5\…$R7"
          Call ${UN}vcTextWidth
          Pop $R6
          ${If} $R8 == ""
          ${OrIf} $R6 <= $R2
            StrCpy $R8 "$R5\…$R7"
          ${EndIf}
          ${If} $R6 > $R2
            ${ExitDo}
          ${EndIf}
        ${EndIf}
        IntOp $R3 $R3 + 1
      ${Loop}
      ${If} $R8 == ""
        ${ExitDo}
      ${EndIf}
      Push $R8
      Call ${UN}vcTextWidth
      Pop $R6
      ${If} $R6 <= $R2
      ${OrIf} $R1 <= 1
        StrCpy $R0 $R8
        ${ExitDo}
      ${EndIf}
      IntOp $R1 $R1 - 1
    ${Loop}
    Pop $R8
    Pop $R7
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    ; 스택: 원래 $R0, 원래 $R2, 원래 $R1 → 둘을 되돌리고 결과를 남긴다
    Exch
    Pop $R2
    Exch
    Pop $R1
    Exch $R0
  FunctionEnd

  Function ${UN}vcFitPath
    Exch $R0
    Push $R1
    Push $R2
    Push $R3
    ${If} $vcLog != ""
    ${AndIf} $vcPathWidth > 0
      ; 줄을 적는 위치의 모양을 한 번 정한다(위치가 바뀔 때만)
      ${If} $vcBase != $vcBaseFor
        StrCpy $vcBaseFor $vcBase
        StrCpy $vcBaseShow $vcBase
        ${If} $vcBase != ""
          IntOp $R2 $vcPathWidth * 45
          IntOp $R2 $R2 / 100
          Push $vcBase
          Call ${UN}vcTextWidth
          Pop $R1
          ${If} $R1 > $R2
            Push $vcBase
            Push 1
            Push $R2
            Call ${UN}vcShortenPath
            Pop $vcBaseShow
          ${EndIf}
        ${EndIf}
      ${EndIf}
      StrCpy $R3 $R0
      ${If} $vcBase != ""
        StrLen $R1 "$vcBase\"
        StrCpy $R2 $R0 $R1
        ${If} $R2 == "$vcBase\"
          StrCpy $R2 $R0 "" $R1
          StrCpy $R3 "$vcBaseShow\$R2"
        ${EndIf}
      ${EndIf}
      Push $R3
      Call ${UN}vcTextWidth
      Pop $R1
      ${If} $R1 <= $vcPathWidth
        StrCpy $R0 $R3
      ${Else}
        Push $R0
        Push 2
        Push $vcPathWidth
        Call ${UN}vcShortenPath
        Pop $R0
      ${EndIf}
    ${EndIf}
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
  FunctionEnd
!macroend
!ifndef BUILD_UNINSTALLER
  !insertmacro vcFitPathFunction ""
  !define VC_FIT_PATH vcFitPath
!else
  !insertmacro vcFitPathFunction "un."
  !define VC_FIT_PATH un.vcFitPath
!endif
; 파일 한 줄: 앞말(«설치: » 또는 «삭제: ») + 칸에 맞춘 경로
!macro vcFileLine PREFIX PATH
  Push "${PATH}"
  Call ${VC_FIT_PATH}
  Exch $R0
  !insertmacro vcLine "${PREFIX}$R0"
  Pop $R0
!macroend

; 측정용 — VC_TIMING을 정의한 시험 빌드에서만 단계마다 시각(ms)을 임시 폴더의 vc-timing.txt에 적는다. 화면에는 아무것도 나오지 않고,
; 배포 판에는 들어가지 않는다(막대 몫을 단계 시간에 맞출 때 쓴다).
!macro vcT LABEL
  !ifdef VC_TIMING
    Push $9
    Push $8
    System::Call "kernel32::GetTickCount() i .r9"
    FileOpen $8 "$TEMP\vc-timing.txt" a
    FileSeek $8 0 END
    FileWrite $8 "$9 ${LABEL}$\r$\n"
    FileClose $8
    Pop $8
    Pop $9
  !endif
!macroend

!macro vcStage TEXT
  SetDetailsPrint both
  DetailPrint "${TEXT}"
  SetDetailsPrint none
!macroend
!macro vcLine TEXT
  SetDetailsPrint listonly
  DetailPrint "${TEXT}"
  SetDetailsPrint none
!macroend

; 끝: 마지막 줄을 적고 막대를 100%로 채운 뒤 1초 보여 준다(막대는 바로 그린다 — vcSetBarRaw). 그다음 진행 화면은 저절로 완료 화면으로 넘어간다.
; NSIS가 끝에 붙이는 «완료» 줄은 이 뒤 «SetDetailsPrint none» 상태라 찍히지 않는다.
!macro vcFinishProgress TEXT
  !insertmacro vcSetBar 1000
  !insertmacro vcStage "${TEXT}"
  ${IfNot} ${Silent}
    Sleep 1000
  ${EndIf}
!macroend

; ── «마침»을 누르면 창을 먼저 숨긴다(기준 7) ──
; NSIS는 «마침» 뒤 완료 화면을 지운 빈 창을 3장쯤(0.1초) 보인 뒤 닫았다(10/28 녹화). 누르는 순간 창을 먼저 숨긴다
; (템플릿도 앱을 띄우기 전에 창을 숨긴다 — doStartApp). 화면 사이의 바꿈은 MUI 그대로 둔다 — 창 그리기를 멈췄다가 한 번에 그리는 방법을 시험했으나
; MUI가 화면을 바꾸며 스스로 그리기를 다시 켜(LockWindow) 오히려 창 전체가 회색인 장이 생기거나, 완료 화면의 «실행하기» 상자가
; Windows상 «안 보임»으로 남는 일이 있어(같은 날 A/B 8회) 넣지 않았다.

; ── 켜져 있는 Voice Cinema 찾기 · 끄기(기준 9 · 11) ──
; 템플릿은 PowerShell을 세 번 띄워 찾는다(4초쯤 — 그동안 막대가 멈췄다). 실행 파일 이름으로 바로 찾는다(nsProcess — 창을 띄우지 않고 즉시).
; 켜져 있으면 «끄고 계속할까요?»를 묻는다. «확인»이면 창을 닫으라고 알리고(앱이 스스로 끝난다), 2초 안에 안 끝나면 강제로 끝낸다.
; 그래도 남으면 «끄지 못했습니다»를 묻고 «다시 시도»를 받는다. 결과는 $vcAppAnswer(ok · cancel) — «취소»일 때 할 일은 부르는 쪽이 정한다
; (화면을 떠나는 자리에서는 그 화면에 남고, 설치 · 제거 단계 안에서는 아무것도 바꾸기 전에 끝낸다).
Var vcAppAnswer
!macro vcCloseRunningApp
  StrCpy $vcAppAnswer "ok"
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK +2
    StrCpy $vcAppAnswer "cancel"
    ${If} $vcAppAnswer == "ok"
      ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      StrCpy $R1 0
      ${Do}
        Sleep 500
        ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
        ${If} $R0 != 0
          ${ExitDo}
        ${EndIf}
        IntOp $R1 $R1 + 1
        ${If} $R1 == 4
          ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
        ${ElseIf} $R1 > 10
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY +2
          StrCpy $vcAppAnswer "cancel"
          ${If} $vcAppAnswer == "cancel"
            ${ExitDo}
          ${EndIf}
          StrCpy $R1 0
        ${EndIf}
      ${Loop}
    ${EndIf}
  ${EndIf}
  ${nsProcess::Unload}
!macroend
; 설치 · 제거 단계 안에서: 화면에서 이미 물었지만 그 뒤에 앱을 다시 켰을 때 — «취소»면 아무것도 바꾸기 전이라 그대로 끝낸다
!macro vcCloseRunningAppOrQuit
  !insertmacro vcCloseRunningApp
  ${If} $vcAppAnswer == "cancel"
    Quit
  ${EndIf}
!macroend

; 템플릿(allowOnlyOneInstallerInstance.nsh)은 customCheckAppRunning이 있으면 기본 검사가 쓰는 getProcessInfo.nsh · $pid를 들이지 않는다 —
; 이 파일은 그 검사를 쓰지 않으므로 들이지 않는다.
!macro customCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    ; 설치 단계(installSection.nsh) 안 — 템플릿의 «앱 파일 풀기»(installApplicationFiles) · «예전 판 지우기»(uninstallOldVersion)를
    ; 이 설치기 것으로 바꿔 끼운다(install-files.nsh)
    !include "${VC_NSIS_DIR}\install-files.nsh"
  !endif
  !insertmacro vcCloseRunningAppOrQuit
!macroend

; 템플릿(installUtil.nsh handleUninstallResult)과 같은 검사 — 예전 판 지우기를 마친 뒤 = 앱 파일을 풀기 직전.
; 화면이 있는 설치(기준 10)에서는 vcRemoveOldVersions가 실패를 직접 묻고 끝내므로 여기 닿는 것은 조용한 설치(/S)뿐이다.
!macro customUnInstallCheck
  ${If} ${Errors}
    ClearErrors
    !insertmacro vcStage "예전 ${PRODUCT_NAME}를 지우지 못해 그 위에 새로 설치합니다."
  ${ElseIf} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend

!ifndef BUILD_UNINSTALLER
  ; ── 설치 범위 · 위치 · 진행 · 완료 화면 ──
  ; 첫 화면(환영)은 두지 않는다(위 5). 이 훅은 설치 범위 · 위치 화면보다 앞이라, 위치 화면을 넣는 MUI 매크로를
  ; «떠날 때 할 일(LEAVE) + 원래 내용»으로 바꿔 두는 데만 쓴다(in-pages.nsh — 기준 9 · 10을 거기서 묻는다).
  !define MUI_CUSTOMFUNCTION_GUIINIT vcGuiInit
  !macro customWelcomePage
    !include "${VC_NSIS_DIR}\in-pages.nsh"
  !macroend

  ; 진행 화면이 뜨기 직전에 막대를 바꿔 끼운다(함수 몸은 진행 화면을 정의한 뒤 — customFinishPage)
  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW vcInstFilesShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE vcInstFilesLeave
  !macroend

  ; 완료 화면: electron-builder 기본 완료 화면(템플릿 assistedInstaller.nsh와 같은 «실행하기» 상자)에 왼쪽 그림 바꾸기만 더한다
  !macro customFinishPage
    ; 함수 몸은 MUI가 화면(머리 그림 칸 포함)을 정의한 뒤에 컴파일돼야 한다 — 마지막 화면을 넣는 이 자리에서 정의한다
    Function vcGuiInit
      !insertmacro vcHeaderArt
    FunctionEnd
    Function vcModeShow
      !insertmacro vcModeLabel
    FunctionEnd
    Function vcInstFilesShow
      !insertmacro vcT "page-show"
      !insertmacro vcMakeBar
    FunctionEnd
    Function vcInstFilesLeave
      !insertmacro vcComposited on
    FunctionEnd
    ; 예전 판 지우기(기준 10) — 템플릿 변수($installMode 등)를 쓰므로 그 변수가 정해진 뒤인 이 자리에서 정의한다
    !include "${VC_NSIS_DIR}\old-version.nsh"

    !ifndef HIDE_RUN_AFTER_FINISH
      Function StartApp
        ${if} ${isUpdated}
          StrCpy $1 "--updated"
        ${else}
          StrCpy $1 ""
        ${endif}
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
      FunctionEnd

      !define MUI_FINISHPAGE_RUN
      !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !endif
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW vcFinishShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE vcFinishLeave
    !insertmacro MUI_PAGE_FINISH

    Function vcFinishShow
      !insertmacro vcSidebarArt $mui.FinishPage.Image $mui.FinishPage.Image.Bitmap
    FunctionEnd
    Function vcFinishLeave
      HideWindow
    FunctionEnd
  !macroend

  ; ── «나만» 위치도 «InKY Film Festival» 아래로(기준 1) ──
  ; «나만»을 고르면 설치기는 HKCU InstallLocation(이전 설치 위치)을 기본 위치로 쓴다. 이전 설치가 없을 때만 그 값을 미리 적어 두고,
  ; «나만»으로 끝까지 설치하지 않으면(취소 · 모든 사용자) 창이 닫힐 때 지운다. 적는 때는 설치 범위 화면이 열릴 때다 — 설치기 시작(.onInit)에서
  ; 이전 설치를 다 살펴본 뒤라 «이미 설치되어 있습니다»가 잘못 뜨지 않는다(Poster Studio 10/27 실측과 같은 방식).
  ; $LOCALAPPDATA는 셸 범위를 따르므로(«모든 사용자»면 C:\ProgramData) «현재 사용자»로 잠깐 바꿔 읽고 지금 범위로 되돌린다.
  Var vcUserDefaultWritten
  !macro customInstallMode
    Push $0
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 == ""
      SetShellVarContext current
      WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\${MENU_FILENAME}\${APP_FILENAME}"
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
      StrCpy $vcUserDefaultWritten "1"
    ${EndIf}
    Pop $0
  !macroend

  Function .onGUIEnd
    ${If} $vcUserDefaultWritten == "1"
      ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
      ${If} $0 == ""
        DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
        DeleteRegKey /ifempty HKCU "${INSTALL_REGISTRY_KEY}"
      ${EndIf}
    ${EndIf}
  FunctionEnd

  ; ── 앱 파일 설치(install-files.nsh가 바꿔 끼운 installApplicationFiles)가 부르는 함수 ──
  ; 그 매크로는 설치 단계(Section) 안에서 펼쳐져 거기서는 함수를 정의할 수 없다 — 그래서 여기 둔다.
  ; 막대 몫(0~1000)은 이 PC에서 잰 단계별 시간에 맞춘다(10/28: 압축 풀기 2.8초 · 복사 2.4초 · 그 뒤 바로가기 · 등록 1.1초) — 막대가 고르게 찬다.
  ; 앱 내용(영상 등)이 바뀌어도 그대로 맞게, 파일 목록 · 개수 · 크기는 하나도 박지 않고 그때 설치기에 든 파일로 센다(10/28 대표님 «영상은 나중에 갈아끼운다»):
  ;   - 압축 풀기는 푼 바이트 비율, 복사는 «파일 크기 + 파일 하나당 몫»의 비율로 찬다. 복사 시간은 파일 수(열고 닫기 · 줄 적기)와 크기를 함께 따른다 —
  ;     10/28 이 PC에서 파일 170여 개 2.4초 가운데 실행 파일 247MB가 0.3초쯤이라, 파일 하나의 몫을 9MB 복사와 같게 잡는다(VC_COPY_FILE_KB).
  ;     영상이 몇 배 커지면 그 파일들이 막대를 크기만큼 더 차지한다(파일 수로만 세면 큰 영상 하나를 복사하는 동안 막대가 멈춘다).
  ;   - 크기는 KB로 센다(2GB가 넘는 파일 · 합계도 32비트 정수 안에서 계산되게).
  !define VC_BAR_EXTRACT_FROM 40
  !define VC_BAR_EXTRACT_TO 460
  !define VC_BAR_COPY_TO 840
  !define VC_COPY_FILE_KB 9216
  !define /math VC_BAR_EXTRACT_SPAN ${VC_BAR_EXTRACT_TO} - ${VC_BAR_EXTRACT_FROM}
  !define /math VC_BAR_COPY_SPAN ${VC_BAR_COPY_TO} - ${VC_BAR_EXTRACT_TO}
  Var vcCopyTotal   ; 옮길 몫 합계(KB)
  Var vcCopyDone    ; 옮긴 몫(KB)

  ; 몫(0~1000)의 비율: 스택 위 전체, 그 아래 지금까지 → 스택: 0~1000. 큰 수를 곱하지 않게 전체를 1000으로 먼저 나눈다.
  Function vcPerMille
    Exch $R0   ; 전체
    Exch
    Exch $R1   ; 지금까지
    ${If} $R0 >= 1000
      IntOp $R0 $R0 / 1000
      IntOp $R1 $R1 / $R0
    ${ElseIf} $R0 > 0
      IntOp $R1 $R1 * 1000
      IntOp $R1 $R1 / $R0
    ${Else}
      StrCpy $R1 0
    ${EndIf}
    ${If} $R1 > 1000
      StrCpy $R1 1000
    ${EndIf}
    ; 스택: 원래 $R0, 원래 $R1 → 결과만 남기고 둘을 되돌린다
    Exch $R1
    Exch
    Pop $R0
  FunctionEnd

  ; 압축 풀기 콜백 — 스택: 지금까지 푼 바이트, 전체 바이트(Nsis7z 순서). 막대 40 → 460(푼 바이트 비율)
  ; 바이트 수는 2GB를 넘을 수 있어 끝 세 자리를 떼어(천 바이트 단위) 32비트 정수로 셈한다.
  Function vcExtractProgress
    Exch $R8
    Exch
    Exch $R9
    Push $R7
    StrLen $R7 $R8
    ${If} $R7 > 3
      StrCpy $R8 $R8 -3
    ${Else}
      StrCpy $R8 0
    ${EndIf}
    StrLen $R7 $R9
    ${If} $R7 > 3
      StrCpy $R9 $R9 -3
    ${Else}
      StrCpy $R9 0
    ${EndIf}
    ; 순서가 바뀌어 와도(푼 바이트가 전체보다 크게 보이면) 맞게 읽는다
    ${If} $R8 > $R9
      StrCpy $R7 $R8
      StrCpy $R8 $R9
      StrCpy $R9 $R7
    ${EndIf}
    ${If} $R9 > 0
      Push $R8
      Push $R9
      Call vcPerMille
      Pop $R7
      IntOp $R7 $R7 * ${VC_BAR_EXTRACT_SPAN}
      IntOp $R7 $R7 / 1000
      IntOp $R7 $R7 + ${VC_BAR_EXTRACT_FROM}
      !insertmacro vcSetBar $R7
    ${EndIf}
    Pop $R7
    Pop $R9
    Pop $R8
  FunctionEnd

  ; 파일 하나의 복사 몫(KB) — 스택: 경로 → 스택: 크기(KB) + 파일 하나당 몫. 크기는 GetFileAttributesEx의 위 · 아래 32비트로(2GB가 넘어도 맞다).
  Function vcCopyWeight
    Exch $R0
    Push $R1
    Push $R2
    System::Call '*(i, i, i, i, i, i, i, i, i) p .R1'   ; WIN32_FILE_ATTRIBUTE_DATA(속성 · 시각 셋 · 크기 위 · 아래)
    System::Call 'kernel32::GetFileAttributesExW(w R0, i 0, p R1) i .R2'
    StrCpy $R0 0
    ${If} $R2 != 0
      System::Call '*$R1(i, i, i, i, i, i, i, i .R2, i .R0)'
      IntOp $R0 $R0 >>> 10
      IntOp $R2 $R2 << 22
      IntOp $R0 $R0 + $R2
    ${EndIf}
    System::Free $R1
    IntOp $R0 $R0 + ${VC_COPY_FILE_KB}
    Pop $R2
    Pop $R1
    Exch $R0
  FunctionEnd

  ; 임시 폴더에 푼 파일의 복사 몫을 더한다(복사 막대의 분모) — 스택: 상대 경로(""부터)
  Function vcCountOut
    Exch $R0
    Push $R1
    Push $R2
    FindFirst $R1 $R2 "$PLUGINSDIR\7z-out$R0\*.*"
    ${DoUntil} $R2 == ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
        ${If} ${FileExists} "$PLUGINSDIR\7z-out$R0\$R2\*.*"
          Push "$R0\$R2"
          Call vcCountOut
        ${Else}
          Push "$PLUGINSDIR\7z-out$R0\$R2"
          Call vcCopyWeight
          Exch $R0
          IntOp $vcCopyTotal $vcCopyTotal + $R0
          Pop $R0
        ${EndIf}
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 파일 하나를 임시 폴더에서 설치 위치로 복사하고 «설치: …»를 적는다 — 스택: 상대 경로(«\locales\ko.pak» 모양). 막대 460 → 840(복사 몫 비율)
  Function vcCopyOne
    Exch $R0
    Push $R3
    Push $R4
    ; 덮어쓰기가 막히면(켜진 앱이 파일을 잡고 있으면) 1초 간격으로 다섯 번 다시 해 보고, 그래도 안 되면 묻는다
    StrCpy $R4 0
    ${Do}
      System::Call "kernel32::CopyFileW(w '$PLUGINSDIR\7z-out$R0', w '$INSTDIR$R0', i 0) i .R3"
      ${If} $R3 != 0
        ${ExitDo}
      ${EndIf}
      IntOp $R4 $R4 + 1
      ${If} $R4 > 5
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY +2
        Quit
        StrCpy $R4 0
      ${EndIf}
      Sleep 1000
    ${Loop}
    !insertmacro vcFileLine "설치: " "$INSTDIR$R0"
    !insertmacro vcT "copy $R0"
    Push "$INSTDIR$R0"
    Call vcCopyWeight
    Pop $R3
    IntOp $vcCopyDone $vcCopyDone + $R3
    Push $vcCopyDone
    Push $vcCopyTotal
    Call vcPerMille
    Pop $R3
    IntOp $R3 $R3 * ${VC_BAR_COPY_SPAN}
    IntOp $R3 $R3 / 1000
    IntOp $R3 $R3 + ${VC_BAR_EXTRACT_TO}
    !insertmacro vcSetBar $R3
    ; 마지막 파일을 옮긴 그 순간 «확인» 단계로 — 복사가 끝난 직후 첫 파일 작업이 Windows(백신)의 새 파일 검사를 기다려 지금 내용 0.34초,
    ; 영상을 키운 내용 1.8초 동안 막대가 섰는데, 그동안 단계 문장이 아직 «설치하는 중»이었다(10/28 측정). 기다림이 시작되기 전에 문장을 바꾼다.
    ${If} $vcCopyDone >= $vcCopyTotal
      Call vcCheckStage
    ${EndIf}
    Pop $R4
    Pop $R3
    Pop $R0
  FunctionEnd

  ; «설치한 파일을 확인하는 중입니다 …» 단계 문장을 한 번만 적는다(마지막 파일을 옮긴 때 — 그때를 못 만나면 복사를 다 마친 뒤 install-files.nsh에서)
  Var vcChecking
  Function vcCheckStage
    ${If} $vcChecking != "1"
      StrCpy $vcChecking "1"
      !insertmacro vcStage "설치한 파일을 확인하는 중입니다 …"
    ${EndIf}
  FunctionEnd

  ; 임시 폴더에 푼 것을 설치 위치로 하나씩 복사한다 — 스택: 상대 경로(""부터).
  ; 앱 실행 파일(247MB)은 installApplicationFiles가 맨 먼저 따로 복사하므로 여기서는 건너뛴다(install-files.nsh에 이유).
  Function vcCopyTree
    Exch $R0
    Push $R1
    Push $R2
    CreateDirectory "$INSTDIR$R0"
    FindFirst $R1 $R2 "$PLUGINSDIR\7z-out$R0\*.*"
    ${DoUntil} $R2 == ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
        ${If} ${FileExists} "$PLUGINSDIR\7z-out$R0\$R2\*.*"
          Push "$R0\$R2"
          Call vcCopyTree
        ${ElseIf} "$R0\$R2" != "\${PRODUCT_FILENAME}.exe"
          Push "$R0\$R2"
          Call vcCopyOne
        ${EndIf}
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 파일 · 등록 · 바로가기를 마친 뒤: 시작 메뉴에 «Uninstall Voice Cinema»를 더하고, 만든 바로가기를 상자에 적고 끝낸다
  !macro customInstall
    !insertmacro vcT "custom-install"
    CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
    ${If} $installMode == "all"
      DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      DeleteRegKey /ifempty HKCU "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
    ${If} ${FileExists} "$newStartMenuLink"
      !insertmacro vcFileLine "설치: " "$newStartMenuLink"
    ${EndIf}
    ${If} ${FileExists} "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk"
      !insertmacro vcFileLine "설치: " "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk"
    ${EndIf}
    ${If} ${FileExists} "$newDesktopLink"
      !insertmacro vcFileLine "설치: " "$newDesktopLink"
    ${EndIf}
    !insertmacro vcT "install-finish"
    !insertmacro vcFinishProgress "설치가 끝났습니다."
  !macroend

!else
  ; ── 제거기: 첫 화면 · 진행 화면 · 완료 화면 ──
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.vcGuiInit
  !macro customUnWelcomePage
    !define MUI_WELCOMEPAGE_TITLE "${PRODUCT_NAME} 제거를 시작합니다"
    !define MUI_WELCOMEPAGE_TEXT "이 컴퓨터에서 ${PRODUCT_NAME}를 제거합니다.$\r$\n$\r$\n$_CLICK"
    ; «모든 사용자» 설치를 지울 때 템플릿 제거기는 화면을 띄우기 전(un.onInit — multiUser.nsh setInstallModePerAllUsers)에 관리자 권한으로
    ; 다시 뜨므로, 첫 화면은 다시 뜬 제거기가 보인다 — 설치기와 달리 다시 뜬 쪽에서 첫 화면을 건너뛰지 않는다(10/28: 건너뛰었더니 첫 화면이 아예 안 보였다).
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.vcWelcomeShow
    ; 다음 화면은 곧바로 지우는 진행 화면이다 — 떠나기 전에 켜진 앱을 묻고(기준 9), «취소»면 이 화면에 남는다
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.vcWelcomeLeave
    !insertmacro MUI_UNPAGE_WELCOME
    ; 다음은 제거 범위 화면(두 범위가 함께 깔렸을 때만) — 설치기와 같이 아래 안내 칸을 올리고 늘린다(함수 몸은 customUninstallPage)
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.vcModeShow
    ; 진행 화면 · 완료 화면은 템플릿이 정한 자리에서 «SHOW» 설정과 함수를 붙일 수 없다 — 그 화면을 넣는 MUI 매크로를
    ; «SHOW 설정 + 원래 내용 + 함수»로 바꿔 둔다(un-pages.nsh에 이유)
    !include "${VC_NSIS_DIR}\un-pages.nsh"

    Function un.vcGuiInit
      !insertmacro vcHeaderArt
    FunctionEnd
    Function un.vcWelcomeShow
      !insertmacro vcSidebarArt $mui.WelcomePage.Image $mui.WelcomePage.Image.Bitmap
    FunctionEnd
    Function un.vcWelcomeLeave
      !insertmacro vcCloseRunningApp
      ${If} $vcAppAnswer == "cancel"
        Abort
      ${EndIf}
    FunctionEnd
  !macroend

  !macro customUninstallPage
    ; 제거가 끝난 뒤 설치 폴더 위 폴더(«InKY Film Festival»)가 비었으면 지운다. RMDir(/r 없음)는 빈 폴더만 지운다 — 다른 앱(Poster Studio 등)이
    ; 있으면 그대로 둔다. 제거 단계(섹션)를 하나 더 만들면 electron-builder가 «구성 요소 선택» 화면을 넣어 흐름이 바뀐다 — 그래서 제거 성공 콜백에서 한다.
    ; GetParent(FileFunc)는 템플릿이 이 파일보다 뒤에 들이므로 이 함수는 화면을 정의하는 이 자리에서 정의한다.
    ; 사용자가 고른 다른 위치(예: D:\Apps\Voice Cinema)의 위 폴더는 비었어도 그대로 둔다 — 이름이 «InKY Film Festival»일 때만 지운다.
    Function un.vcModeShow
      !insertmacro vcModeLabel
    FunctionEnd
    Function un.onUninstSuccess
      ${GetParent} "$INSTDIR" $R0
      ${GetFileName} "$R0" $R1
      ${If} $R1 == "${MENU_FILENAME}"
        RMDir $R0
      ${EndIf}
    FunctionEnd
  !macroend

  ; 제거기는 처음부터 NSIS 원래 기록(«파일 삭제: …» · «폴더 삭제: …»)을 끈다 — 이 파일이 적는 줄만 보인다
  !macro customUnInit
    SetDetailsPrint none
  !macroend
  ; $INSTDIR 아래 파일 수를 센다(진행 막대의 분모) — 스택: 상대 경로 → 스택: 파일 수
  Var vcFileCount
  Var vcFileDone
  Function un.vcCountTree
    Exch $R0
    Push $R1
    Push $R2
    FindFirst $R1 $R2 "$INSTDIR$R0\*.*"
    ${DoUntil} $R2 == ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
        ${If} ${FileExists} "$INSTDIR$R0\$R2\*.*"
          Push "$R0\$R2"
          Call un.vcCountTree
        ${Else}
          IntOp $vcFileCount $vcFileCount + 1
        ${EndIf}
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 파일을 하나씩 지우며 «삭제: …»를 적는다 — 폴더는 템플릿이 뒤에서 통째로 지운다(RMDir /r). 막대는 20 → 900
  Function un.vcDeleteTree
    Exch $R0
    Push $R1
    Push $R2
    Push $R3
    FindFirst $R1 $R2 "$INSTDIR$R0\*.*"
    ${DoUntil} $R2 == ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
        ${If} ${FileExists} "$INSTDIR$R0\$R2\*.*"
          Push "$R0\$R2"
          Call un.vcDeleteTree
        ${Else}
          Delete "$INSTDIR$R0\$R2"
          !insertmacro vcFileLine "삭제: " "$INSTDIR$R0\$R2"
          IntOp $vcFileDone $vcFileDone + 1
          ${If} $vcFileCount > 0
            IntOp $R3 $vcFileDone * 880
            IntOp $R3 $R3 / $vcFileCount
            IntOp $R3 $R3 + 20
            !insertmacro vcSetBar $R3
          ${EndIf}
        ${EndIf}
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 제거 단계(템플릿 uninstaller.nsh)의 맨 앞 — 이 뒤에 템플릿이 남은 폴더 · 바로가기 · 앱 데이터 · 등록을 지운다(이미 지운 것은 그냥 지나간다)
  !macro customUnInstall
    !insertmacro vcCompositedOff
    SetDetailsPrint none
    ${IfNot} ${isUpdated}
      !insertmacro vcT "un-start"
      !insertmacro vcStage "프로그램 파일을 제거하는 중입니다 …"
      StrCpy $vcBase $INSTDIR
      StrCpy $vcFileCount 0
      StrCpy $vcFileDone 0
      Push ""
      Call un.vcCountTree
      !insertmacro vcT "un-counted"
      Push ""
      Call un.vcDeleteTree
      !insertmacro vcT "un-deleted"

      ${IfNot} ${isKeepShortcuts}
        ; 템플릿과 같은 순서(바로가기 연결 정보를 지운 뒤 파일)로 지우고 줄을 적는다
        ${If} ${FileExists} "$oldDesktopLink"
          WinShell::UninstShortcut "$oldDesktopLink"
          Delete "$oldDesktopLink"
          !insertmacro vcFileLine "삭제: " "$oldDesktopLink"
        ${EndIf}
        ${If} ${FileExists} "$oldStartMenuLink"
          WinShell::UninstShortcut "$oldStartMenuLink"
          Delete "$oldStartMenuLink"
          !insertmacro vcFileLine "삭제: " "$oldStartMenuLink"
        ${EndIf}
        ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
        ${If} $R1 != ""
        ${AndIf} ${FileExists} "$SMPROGRAMS\$R1\Uninstall ${PRODUCT_NAME}.lnk"
          Delete "$SMPROGRAMS\$R1\Uninstall ${PRODUCT_NAME}.lnk"
          !insertmacro vcFileLine "삭제: " "$SMPROGRAMS\$R1\Uninstall ${PRODUCT_NAME}.lnk"
        ${EndIf}
      ${EndIf}
      !insertmacro vcT "un-shortcuts"
      !insertmacro vcSetBar 950

      ; 앱 데이터(%APPDATA%\Voice Cinema — 창 상태 · 캐시. 학생 녹음은 여기 남지 않는다)는 사용자별이다. 지우는 판단은 템플릿과 같다
      ; (--delete-app-data가 있거나 deleteAppDataOnUninstall이고 업데이트가 아닐 때). 10/27 시안에서 화면 제거 뒤 한 번 남았다 —
      ; 앱이 막 닫힌 직후 파일을 잡고 있던 것으로 보고, 남아 있으면 0.3초 간격으로 열 번까지 다시 지운다(Poster Studio와 같은 값 — 10/28 팀장 전달).
      StrCpy $R3 "0"
      !ifdef DELETE_APP_DATA_ON_UNINSTALL
        StrCpy $R3 "1"
      !endif
      ${If} ${isDeleteAppData}
        StrCpy $R3 "1"
      ${EndIf}
      ${If} $R3 == "1"
        ${If} $installMode == "all"
          SetShellVarContext current
        ${EndIf}
        ${If} ${FileExists} "$APPDATA\${APP_FILENAME}\*.*"
          StrCpy $R2 0
          ${Do}
            RMDir /r "$APPDATA\${APP_FILENAME}"
            ${IfNot} ${FileExists} "$APPDATA\${APP_FILENAME}\*.*"
            ${OrIf} $R2 >= 10
              ${ExitDo}
            ${EndIf}
            IntOp $R2 $R2 + 1
            Sleep 300
          ${Loop}
          !insertmacro vcFileLine "삭제: " "$APPDATA\${APP_FILENAME}"
        ${EndIf}
        ${If} $installMode == "all"
          SetShellVarContext all
        ${EndIf}
      ${EndIf}

      ; electron-builder 설치기(10/27 시안까지)는 자기 사본(%LOCALAPPDATA%\voice-cinema-desktop-updater\installer.exe, 230MB)을 남겼고
      ; 템플릿 제거기는 그것을 지우지 않는다. 지금 설치기는 사본을 만들지 않지만, 예전 판이 남긴 것까지 여기서 지운다.
      !ifdef APP_INSTALLER_STORE_FILE
        SetShellVarContext current
        ${If} ${FileExists} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
          Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
          !insertmacro vcFileLine "삭제: " "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
        ${EndIf}
        ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $R1
        RMDir $R1
        ${If} $installMode == "all"
          SetShellVarContext all
        ${EndIf}
      !endif
      !insertmacro vcT "un-finish"
      !insertmacro vcFinishProgress "제거가 끝났습니다."
    ${Else}
      ; 새 설치기가 이 판을 지울 때(--updated, 화면 없음): 파일 · 바로가기 · 등록은 템플릿이 지운다. 시작 메뉴의 «Uninstall Voice Cinema»는
      ; 이 설치기만 만드는 것이라 템플릿이 모른다 — 여기서 지워야 시작 메뉴 폴더도 비어 템플릿이 지운다. 같은 범위에 다시 깔면 새 설치기가 다시 만들고,
      ; 다른 범위(나만 ↔ 모든 사용자)로 옮겨 깔 때는 예전 범위의 시작 메뉴에 남지 않는다(기준 10).
      ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
      ${If} $R1 != ""
        Delete "$SMPROGRAMS\$R1\Uninstall ${PRODUCT_NAME}.lnk"
      ${EndIf}
    ${EndIf}
  !macroend
!endif
