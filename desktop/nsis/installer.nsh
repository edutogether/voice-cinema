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
!define VC_WM_SETREDRAW 0x000B
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
  ; 화면 문구는 Poster Studio 설치판과 같다(10/28 팀장 전달 — 앱 이름만 다르다). 단추는 «버튼»이 아니라 «단추»로 쓴다.
  !define MUI_DIRECTORYPAGE_TEXT_TOP "${PRODUCT_NAME}를 아래 폴더에 설치합니다.$\r$\n$\r$\n다른 폴더에 설치하려면 '찾아보기' 단추를 눌러 폴더를 골라 주세요.$\r$\n$\r$\n설치를 시작하려면 '설치' 단추를 눌러 주세요."
  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} 설치 완료"
  !define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME}를 설치했습니다.$\r$\n$\r$\n마치려면 '마침' 단추를 눌러 주세요."
!else
  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} 제거 완료"
  !define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME}를 지웠습니다.$\r$\n$\r$\n마치려면 '마침' 단추를 눌러 주세요."
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
    LangString whoShouldThisApplicationBeInstalledFor ${LANG_KOREAN} "이 프로그램의 사용자는 누구인가요?"
    LangString selectUserMode ${LANG_KOREAN} "이 컴퓨터에서 누가 ${PRODUCT_NAME}를 쓸지 골라 주세요."
    LangString freshInstallForAll ${LANG_KOREAN} "모든 사용자가 쓸 수 있게 설치합니다.$\r$\n$\r$\n'다음' 단추를 누르면 관리자 허락을 묻는 창이 뜹니다."
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
  LangString forAll ${LANG_KOREAN} "모든 사용자 (이 컴퓨터를 쓰는 모든 사람)"
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

; ── 화면을 바꿀 때 덜 그린 장이 보이지 않게(기준 7 · 11 — 11/2 대표님 «Poster Studio 설치판에서 문제 됐던 것들을 똑같이», 팀장 전달) ──
; NSIS는 다음 화면으로 넘어갈 때 앞 화면을 먼저 없애고 새 화면을 만든다. Windows가 지운 자리를 바로 바탕색으로 칠해, 새 화면이 다 차기 전의
; 빈 화면 · 머리만 그린 장이 한두 장(0.07초) 보였다. Poster Studio 설치판(10/28 저녁 ~ 10/30)과 같은 방법으로 막는다:
;   - 멈춤(vcFreeze): 앞 화면을 떠날 때 바깥 창 그리기를 멈춘다(WM_SETREDRAW 0 — 그동안 앞 화면이 그대로 보인다). 바깥 창이 아직 안 보이면(첫 화면)
;     멈추지 않는다 — 다시 켜기가 숨은 창을 보이게 만든다. 멈추는 때: 설치 범위 · 완료 화면을 떠날 때, 위치 화면을 만들기 전,
;     설치 · 제거 단계 끝(100%를 1초 보인 뒤 — NSIS «닫음» → MUI «마침» 사이 한 장).
;   - 다시 켬(vcThaw): 새 화면을 칸 겹침 맨 위로 올리고, 창 전체를 합성(WS_EX_COMPOSITED — 창과 그 안의 칸을 함께 두 번 그려 바꿈)으로 한 장에 그린 뒤
;     그리기를 멈춘 채로 합성을 끄고 다시 켠다 — 합성을 그냥 끄면 Windows가 창을 보통 방식(바탕부터 칸마다)으로 다시 그려 그 사이가 녹화에 잡혔다.
;     nsDialogs 화면(설치 범위 · 위치 · 완료)은 nsDialogs가 새 화면을 띄운 뒤 첫 타이머에서 켠다(vcFreezeUntilShown).
;   - 진행 화면으로 갈 때(위치 · 제거 첫 화면 · 제거 범위를 떠날 때)는 멈추지 않고 합성을 켜 둔다(vcCompOn) — 진행 화면에는 SHOW 뒤에 다시 켤 자리가
;     없고(제거기는 SHOW 자리를 템플릿 제거 범위 화면이 가져간다), MUI가 첫 화면을 닫으며 LockWindow off로 멈춤을 푼다.
;     진행 화면을 한 번 다 그리면 끈다(설치 · 제거 단계의 맨 앞 — vcCompositedOff). 켜 둔 채면 막대가 스스로 다시 그리는 사이에 막대가 통째로
;     빠진 장이 끼었다(10/28 창 캡처: 막대 2 · 상자 5, 11/2 화면 녹화: 설치 한 번에 2~7장 — Poster Studio 2fabd75처럼 진행 화면 내내 켜 둔 판).
;     단계 끝(100%를 1초 보인 뒤)에 그리기를 멈춘 다음 다시 켠다(vcFinishProgress) — MUI가 완료 화면을 열며 LockWindow off로 그 멈춤을 풀고
;     다시 그리는 동안 한 장에 그리게(11/2 화면 녹화: 진행 → 완료 넘김의 덜 그린 장이 줄었다 — 위 판과 견줌).
; 10/28에는 그리기 멈춤을 넣지 않았다 — MUI LockWindow와 부딪혀 회색 장 · «실행하기» 상자가 «안 보임»으로 남는 일이 있었다(A/B 8회). Poster Studio가
; 그 뒤 푼 방법을 옮겼다: 멈춤은 보일 때마다 다시 걸고(LockWindow off가 푼 것), 합성은 그리기를 멈춘 채로 끄고, 새 화면은 겹침 맨 위로 올린다.
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

; 바깥 창의 칸 하나가 겹침 위 칸 자리를 칠하지 않게(WS_CLIPSIBLINGS — vcZOrder). $0 · $1을 쓴다
!macro vcClipSiblings ID
  GetDlgItem $0 $HWNDPARENT ${ID}
  System::Call "user32::GetWindowLongW(p r0, i -16) i .r1"
  IntOp $1 $1 | 0x04000000
  System::Call "user32::SetWindowLongW(p r0, i -16, i r1)"
!macroend
; 바깥 창의 상표 글 칸(1256 · 1028)을 글 폭으로 줄인다(vcZOrder). 칸은 창 폭인데 글은 앞부분뿐이라, 칸이 아래 줄 선(1035)을 통째로 덮어
; 선이 칸 자리를 칠하지 않게 하자(WS_CLIPSIBLINGS) 선이 하나도 안 그려졌다(Poster Studio 2fabd75 · 이 판 82565fa — 11/2 Bumm님 «선을 되살린 판»).
; 칸은 글 뒤만 칠하므로(MUI SetCtlColors /BRANDING — 빈 붓) 줄여도 글은 그대로이고, 선은 예전처럼 글 바로 뒤부터 보인다(Poster Studio a39dafe와 같은 고침). $0 ~ $5를 쓴다
!macro vcFitBrand ID
  GetDlgItem $0 $HWNDPARENT ${ID}
  System::Call "user32::GetWindowTextW(p r0, w .r1, i ${NSIS_MAX_STRLEN}) i .r2"
  SendMessage $0 ${VC_WM_GETFONT} 0 0 $3
  System::Call "user32::GetDC(p r0) p .r4"
  System::Call "gdi32::SelectObject(p r4, p r3) p .r3"
  System::Call "*(i 0, i 0) p .r5"
  System::Call "gdi32::GetTextExtentPoint32W(p r4, w r1, i r2, p r5)"
  System::Call "gdi32::SelectObject(p r4, p r3)"
  System::Call "user32::ReleaseDC(p r0, p r4)"
  System::Call "*$5(i .r1)"
  System::Free $5
  System::Call "*(i 0, i 0, i 0, i 0) p .r5"
  System::Call "user32::GetWindowRect(p r0, p r5)"
  System::Call "*$5(i, i .r2, i, i .r3)"
  System::Free $5
  IntOp $3 $3 - $2
  System::Call "user32::SetWindowPos(p r0, p 0, i 0, i 0, i r1, i r3, i 0x16)"   ; NOMOVE | NOZORDER | NOACTIVATE — 폭만(높이 그대로)
!macroend

Var vcFrozen
Var vcThawPage
!macro vcRedrawFunctions UN
  ; 보이면 멈춘다(이미 멈췄으면 «안 보임»으로 읽혀 그대로). vcFrozen이 «1»이어도 다시 본다 — MUI가 창 전체 화면(제거 첫 화면 · 완료)을 열고 닫을 때
  ; LockWindow off로 그리기를 다시 켠다(완료 화면 PRE — 설치 · 제거 단계 끝에서 멈춘 것이 풀린다).
  Function ${UN}vcFreeze
    Push $0
    System::Call "user32::IsWindowVisible(p $HWNDPARENT) i .r0"
    ${If} $0 <> 0
      SendMessage $HWNDPARENT ${VC_WM_SETREDRAW} 0 0
      StrCpy $vcFrozen "1"
    ${EndIf}
    Pop $0
  FunctionEnd

  ; 스택: 새 화면 HWND. 새 화면을 칸 겹침 맨 위로 올리고(창 전체 화면이 머리 바탕 · 머리 선을 덮게 — vcZOrder) 창 전체를 합성으로 한 장에 그린 뒤,
  ; 그리기를 멈춘 채로 합성을 끄고 다시 켠다. vcCompOn으로 켜 둔 합성도 여기서 꺼진다.
  Function ${UN}vcThaw
    Exch $0
    ${If} $vcFrozen == "1"
      Push $1
      Push $2
      ShowWindow $0 8   ; SW_SHOWNA — NSIS가 뒤에 하는 것을 먼저(이미 보이면 그대로)
      System::Call "user32::SetWindowPos(p r0, p 0, i 0, i 0, i 0, i 0, i 0x13)"   ; HWND_TOP — NOSIZE | NOMOVE | NOACTIVATE
      System::Call "user32::GetWindowLongW(p $HWNDPARENT, i -20) i .r1"
      IntOp $1 $1 & 0xFDFFFFFF   ; 합성을 뺀 값
      IntOp $2 $1 | 0x02000000
      System::Call "user32::SetWindowLongW(p $HWNDPARENT, i -20, i r2)"
      SendMessage $HWNDPARENT ${VC_WM_SETREDRAW} 1 0
      System::Call "user32::RedrawWindow(p $HWNDPARENT, p 0, p 0, i 0x585)"   ; INVALIDATE | ERASE | ALLCHILDREN | UPDATENOW | FRAME
      SendMessage $HWNDPARENT ${VC_WM_SETREDRAW} 0 0
      System::Call "user32::SetWindowLongW(p $HWNDPARENT, i -20, i r1)"
      SendMessage $HWNDPARENT ${VC_WM_SETREDRAW} 1 0
      StrCpy $vcFrozen ""
      Pop $2
      Pop $1
    ${EndIf}
    Pop $0
  FunctionEnd

  ; 진행 화면으로 넘어갈 때(위치 · 제거 첫 화면 · 제거 범위 LEAVE): 진행 화면이 처음 그려질 때 한 장에 그려지게 한다(진행 화면을 다 그리면 vcCompositedOff가 끈다)
  Function ${UN}vcCompOn
    !insertmacro vcComposited on
  FunctionEnd

  ; ── 바깥 창 칸의 겹침 순서(창이 뜰 때 한 번 — 머리 그림을 바꿔 끼운 뒤) ──
  ; 겹치는 칸: 머리 바탕(1034) 위의 제목(1037) · 부제(1038) · 그림(1046), 아래 줄 선(1035) 위의 상표 글(1256 · 1028), 창 전체 화면(제거 첫 화면 · 완료) 아래의
  ; 머리 바탕 · 머리 선(1036). 보통 그리기는 겹침 위 칸부터 칠해 아래 칸이 이기고, 합성 그리기는 아래 칸부터 칠해 위 칸이 이긴다. NSIS 화면 틀은 바탕 · 선이
  ; 글 · 그림보다 위라 합성으로 그리면 머리가 비고 완료 화면 위가 흰 띠로 덮였다(Poster Studio 10/28). 그래서 보일 칸을 위에 두고, 가려질 칸(1034 · 1035 ·
  ; 1036 · 1256)은 위 칸 자리를 칠하지 않게 한다(WS_CLIPSIBLINGS) — 두 방식 모두 지금 보이는 모습과 같다. 새 화면은 vcThaw(제거 첫 화면은 vcSidebarArt)가 맨 위로 올린다.
  ; 상표 글 칸은 먼저 글 폭으로 줄인다(vcFitBrand) — 창 폭 그대로 두면 선이 통째로 가려진다. 선만 위로 올리면 합성으로 그릴 때 선이 글 아랫부분을 긋는다.
  Function ${UN}vcZOrder
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    !insertmacro vcFitBrand 1256
    !insertmacro vcFitBrand 1028
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    GetDlgItem $0 $HWNDPARENT 1035
    System::Call "user32::SetWindowPos(p r0, p 1, i 0, i 0, i 0, i 0, i 0x13)"   ; HWND_BOTTOM
    GetDlgItem $0 $HWNDPARENT 1034
    System::Call "user32::SetWindowPos(p r0, p 1, i 0, i 0, i 0, i 0, i 0x13)"   ; 그 아래 — 맨 아래
    GetDlgItem $0 $HWNDPARENT 1256
    GetDlgItem $1 $HWNDPARENT 1028
    System::Call "user32::SetWindowPos(p r0, p r1, i 0, i 0, i 0, i 0, i 0x13)"   ; 1256을 1028 바로 아래로 — 보통 그리기에서 보이던 것이 1028(회색 글)이다
    !insertmacro vcClipSiblings 1034
    !insertmacro vcClipSiblings 1035
    !insertmacro vcClipSiblings 1036
    !insertmacro vcClipSiblings 1256
    Pop $1
    Pop $0
  FunctionEnd

  ; nsDialogs 화면(설치 범위 · 위치 · 완료)은 SHOW 뒤에 nsDialogs가 앞 화면을 지우고 새 화면을 띄운다 — 그 뒤 첫 타이머에서 다시 켠다. 스택: 새 화면 HWND
  Function ${UN}vcFreezeUntilShown
    Exch $0
    StrCpy $vcThawPage $0
    Pop $0
    Call ${UN}vcFreeze
    Push $0
    GetFunctionAddress $0 ${UN}vcThawTimer
    nsDialogs::CreateTimer $0 1
    Pop $0
  FunctionEnd
  Function ${UN}vcThawTimer
    Push $0
    GetFunctionAddress $0 ${UN}vcThawTimer
    nsDialogs::KillTimer $0
    Pop $0
    Push $vcThawPage
    Call ${UN}vcThaw
  FunctionEnd
!macroend
!ifndef BUILD_UNINSTALLER
  !insertmacro vcRedrawFunctions ""
  !define VC_FN ""
!else
  !insertmacro vcRedrawFunctions "un."
  !define VC_FN "un."
!endif

; 머리 로고(설치 · 제거의 가운데 화면 공통 — 칸 1046): MUI가 기본 그림을 넣은 뒤(.onGUIInit 끝) 칸에 맞는 판으로 바꾼다. 첫 화면이 뜨기 전이라 깜빡이지 않는다.
; 그 뒤 바깥 창 칸의 겹침 순서를 고친다(vcZOrder — 부르는 곳은 vcGuiInit · un.vcGuiInit).
!macro vcHeaderArt
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
  ; 전체 창 화면(그림이 든 화면)을 창 머리의 흰 바탕 칸보다 위로 올린다 — 합성 그리기는 형제 칸을 쌓인 차례대로 그려, 머리 바탕이 화면 위쪽
  ; 100px(제목 · 그림 윗부분)을 덮었다(10/28 녹화). 완료 화면은 vcThaw도 올리지만, 제거기 첫 화면은 창이 아직 안 보여 멈추지 않으므로 여기서 올린다
  ; (그 화면을 떠날 때 합성으로 그려도 머리 바탕 · 머리 선이 덮지 않게 — vcZOrder). SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE, 맨 위(HWND_TOP)
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
; 1초 뒤 그리기를 멈춘다 — 단계가 끝나면 NSIS가 가운데 단추를 «닫음»으로 바꾸고 MUI 완료 화면이 «마침»으로 바꾸는데, 그 사이 한 장이 녹화에
; 잡혔다(Poster Studio 10/28 · 10/30). 멈춘 다음 합성을 켠다 — 완료 화면을 여는 MUI의 LockWindow off가 멈춤을 풀어도 그 다시 그리기가 한 장에 된다.
; 완료 화면이 다 차면 vcThaw가 한 번에 그리고 합성을 끈다.
!macro vcFinishProgress TEXT
  !insertmacro vcSetBar 1000
  !insertmacro vcStage "${TEXT}"
  ${IfNot} ${Silent}
    Sleep 1000
    Call ${VC_FN}vcFreeze
    !insertmacro vcComposited on
  ${EndIf}
!macroend

; ── «마침»을 누르면 완료 화면 그대로 닫는다(기준 7) ──
; «마침»을 누르면 nsDialogs가 완료 화면을 먼저 지워 창이 사라지기 전에 빈 창이 보였다(10/28 녹화 3장 · 0.1초). 완료 화면을 떠날 때 그리기를 멈춰
; 완료 화면 그대로 닫힌다(Poster Studio와 같다 — 10/28에는 창을 먼저 숨겼다. 템플릿은 앱을 띄우기 전에 창을 숨긴다 — doStartApp).

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
  !macroend

  ; 완료 화면: electron-builder 기본 완료 화면(템플릿 assistedInstaller.nsh와 같은 «실행하기» 상자)에 왼쪽 그림 바꾸기만 더한다
  !macro customFinishPage
    ; 함수 몸은 MUI가 화면(머리 그림 칸 포함)을 정의한 뒤에 컴파일돼야 한다 — 마지막 화면을 넣는 이 자리에서 정의한다
    Function vcGuiInit
      !insertmacro vcHeaderArt
      Call vcZOrder
    FunctionEnd
    Function vcModeShow
      !insertmacro vcModeLabel
      Push $MultiUser.InstallModePage
      Call vcFreezeUntilShown
    FunctionEnd
    Function vcInstFilesShow
      !insertmacro vcT "page-show"
      !insertmacro vcMakeBar
      ; «설치 중: <경로> (NN%)» 줄은 «설치: » 줄보다 « 중»과 « (NN%)»만큼 길다 — 그 몫만큼 경로 칸을 좁혀 잰다(vcExtractPartLine)
      Push " 중 (100%)"
      Call vcTextWidth
      Pop $vcPartExtra
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
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE vcFreeze
    !insertmacro MUI_PAGE_FINISH

    Function vcFinishShow
      !insertmacro vcSidebarArt $mui.FinishPage.Image $mui.FinishPage.Image.Bitmap
      Push $mui.FinishPage
      Call vcFreezeUntilShown
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

  ; 조용한 설치(/S)도 «나만» 기본 위치를 화면 설치와 같게(…\Programs\InKY Film Festival\Voice Cinema — Poster Studio 10/28 저녁과 같다).
  ; 위 기본 위치는 설치 범위 화면에서 정하는데 조용한 설치는 그 화면을 거치지 않아 템플릿 기본(…\Programs\Voice Cinema)에 깔렸다.
  ; 예전 설치 위치(등록 값)와 /D는 그대로 따른다. «모든 사용자»는 템플릿이 이미 같은 모양이다(menuCategory).
  !macro customInit
    ${If} ${Silent}
    ${AndIf} $installMode == "CurrentUser"
      Push $0
      Push $1
      ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      !insertmacro GetDParameter $1
      ${If} $0 == ""
      ${AndIf} $1 == ""
        ${GetParent} "$INSTDIR" $0
        StrCpy $INSTDIR "$0\${MENU_FILENAME}\${APP_FILENAME}"
      ${EndIf}
      Pop $1
      Pop $0
    ${EndIf}
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
  ; 설치 위치에 바로 풀며(Nsis7z::ExtractWithCallback) 푼 바이트가 파일 끝을 지날 때마다 «설치: <설치 위치>\…»를 적는다(11/2 — Poster Studio 설치판과 같다,
  ; 대표님 «설치 중입니다 하면 주르륵 떠야»). 예전(10/28)에는 임시 폴더에 푼 뒤(그동안 2.8초 줄 없이 «준비하는 중») 파일마다 복사하며 줄을 적었다.
  ; 예전 판은 이 앞에서 이미 지웠다(old-version.nsh · 템플릿 uninstallOldVersion) — 임시 폴더를 거쳐 «한 번에 바꾸기»를 할 까닭이 없다.
  ;   - 푸는 순서 · 크기 표는 빌드 때 실제 7z에서 만든다(vc-7z-list.mjs — «끝 KB · 크기 KB · 상대 경로»). 앱 내용(영상 등)이 바뀌어도 다시 빌드하면 맞는다 —
  ;     파일 목록 · 개수 · 크기는 하나도 박지 않는다(10/28 대표님 «영상은 나중에 갈아끼운다»).
  ;   - 줄은 그 파일이 다 풀린 뒤에만 나온다(표의 «끝»을 지났을 때 — 앞질러 나오지 않음). 큰 파일 하나를 푸는 동안(실행 파일 ≈ 2초) 줄이 멈추지 않게,
  ;     줄 없이 VC_EX_PART_KB만큼 풀리면 «설치 중: …\파일 (NN%)»을 적는다.
  ;   - 막대는 푼 바이트 비율로 40 → 840(그 뒤 «확인» 860 · 시작 메뉴 905 · 바탕화면 950 · 끝 1000).
  ;   - 크기는 KB(1000바이트)로 센다 — Nsis7z의 바이트 수에서 끝 세 자리를 떼어 견주므로 2GB가 넘는 파일 · 합계도 32비트 정수 안에서 계산된다.
  !define VC_BAR_EXTRACT_FROM 40
  !define VC_BAR_EXTRACT_TO 840
  !define /math VC_BAR_EXTRACT_SPAN ${VC_BAR_EXTRACT_TO} - ${VC_BAR_EXTRACT_FROM}
  !define VC_EX_PART_KB 50000
  Var vcExFile
  Var vcExEnd       ; 다음 파일이 다 풀리는 끝(KB) — 표가 끝나면 -1
  Var vcExSize
  Var vcExPath
  Var vcExStart     ; 다음 파일이 시작하는 자리(= 앞 파일의 끝)
  Var vcExLineKb    ; 마지막 줄을 적을 때 푼 양
  Var vcExLine
  Var vcExI
  Var vcExC
  Var vcPartExtra   ; «설치 중: … (NN%)» 줄이 «설치: …» 줄보다 긴 폭(vcInstFilesShow에서 잰다)

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

  Function vcExtractBegin
    FileOpen $vcExFile "$PLUGINSDIR\vc-7z-list.txt" r
    FileSeek $vcExFile 2   ; UTF-16LE BOM
    StrCpy $vcExEnd 0
    StrCpy $vcExLineKb 0
    Call vcExtractNext
  FunctionEnd

  ; 표의 다음 줄 → $vcExStart · $vcExEnd · $vcExSize · $vcExPath(없으면 $vcExEnd = -1)
  Function vcExtractNext
    StrCpy $vcExStart $vcExEnd
    ClearErrors
    FileReadUTF16LE $vcExFile $vcExLine
    ${If} ${Errors}
    ${OrIf} $vcExLine == ""
      StrCpy $vcExEnd -1
      Return
    ${EndIf}
    ; 줄 끝(\r\n)을 뗀다
    ${Do}
      StrCpy $vcExC $vcExLine 1 -1
      ${If} $vcExC == "$\r"
      ${OrIf} $vcExC == "$\n"
        StrCpy $vcExLine $vcExLine -1
      ${Else}
        ${ExitDo}
      ${EndIf}
    ${Loop}
    ; «끝 크기 경로» — 앞의 두 칸은 빈칸으로 가른다(경로에는 빈칸이 있을 수 있다 — «Voice Cinema.exe»)
    StrCpy $vcExI 0
    ${Do}
      StrCpy $vcExC $vcExLine 1 $vcExI
      ${If} $vcExC == " "
      ${OrIf} $vcExC == ""
        ${ExitDo}
      ${EndIf}
      IntOp $vcExI $vcExI + 1
    ${Loop}
    StrCpy $vcExEnd $vcExLine $vcExI
    IntOp $vcExI $vcExI + 1
    StrCpy $vcExLine $vcExLine "" $vcExI
    StrCpy $vcExI 0
    ${Do}
      StrCpy $vcExC $vcExLine 1 $vcExI
      ${If} $vcExC == " "
      ${OrIf} $vcExC == ""
        ${ExitDo}
      ${EndIf}
      IntOp $vcExI $vcExI + 1
    ${Loop}
    StrCpy $vcExSize $vcExLine $vcExI
    IntOp $vcExI $vcExI + 1
    StrCpy $vcExPath $vcExLine "" $vcExI
  FunctionEnd

  ; 표에서 푼 양($R8, KB)까지 다 풀린 파일의 줄을 적는다
  Function vcExtractFlush
    ${Do}
      ${If} $vcExEnd < 0
      ${OrIf} $vcExEnd > $R8
        ${ExitDo}
      ${EndIf}
      !insertmacro vcFileLine "설치: " "$INSTDIR\$vcExPath"
      !insertmacro vcT "file $vcExPath"
      StrCpy $vcExLineKb $R8
      Call vcExtractNext
    ${Loop}
  FunctionEnd

  ; «설치 중: <경로> (NN%)» — 스택: 퍼센트. 경로는 다른 줄과 같은 규칙으로 줄이되(vcFitPath) « 중» · « (NN%)» 몫만큼 칸을 좁혀 잰다
  Function vcExtractPartLine
    Exch $R6
    Push $R0
    IntOp $vcPathWidth $vcPathWidth - $vcPartExtra
    Push "$INSTDIR\$vcExPath"
    Call vcFitPath
    Pop $R0
    IntOp $vcPathWidth $vcPathWidth + $vcPartExtra
    !insertmacro vcLine "설치 중: $R0 ($R6%)"
    Pop $R0
    Pop $R6
  FunctionEnd

  ; 압축 풀기 콜백 — 스택: 지금까지 푼 바이트, 전체 바이트(Nsis7z 순서). 바이트 수는 2GB를 넘을 수 있어 끝 세 자리를 떼어(천 바이트 단위) 셈한다.
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
    ; 다 풀린 파일 줄 → 없으면 큰 파일을 푸는 중인 줄
    StrCpy $R7 $vcExLineKb
    Call vcExtractFlush
    ${If} $vcExLineKb == $R7
    ${AndIf} $vcExEnd > $R8
    ${AndIf} $vcExSize >= ${VC_EX_PART_KB}
      IntOp $R7 $R8 - $vcExLineKb
      ${If} $R7 >= ${VC_EX_PART_KB}
        IntOp $R7 $R8 - $vcExStart
        IntOp $R7 $R7 * 100
        IntOp $R7 $R7 / $vcExSize
        Push $R7
        Call vcExtractPartLine
        StrCpy $vcExLineKb $R8
      ${EndIf}
    ${EndIf}
    Pop $R7
    Pop $R9
    Pop $R8
  FunctionEnd

  ; 다 푼 뒤: 표에 남은 줄을 마저 적고(끝 세 자리를 떼어 견주므로 마지막 몇 개가 남을 수 있다) 표를 닫는다
  Function vcExtractEnd
    Push $R8
    StrCpy $R8 2147483647
    Call vcExtractFlush
    Pop $R8
    FileClose $vcExFile
    !insertmacro vcSetBar ${VC_BAR_EXTRACT_TO}
  FunctionEnd

  ; «설치한 파일을 확인하는 중입니다 …» 단계 문장(다 푼 뒤 — install-files.nsh). 다 푼 직후 첫 파일 작업이 Windows(백신)의 새 파일 검사를 기다려
  ; 막대가 선다(10/28 측정 — 지금 내용 0.34초, 영상을 키운 내용 1.8초). 그 기다림을 이름 붙인 단계로 치른다. 한 번만 적는다.
  Var vcChecking
  Function vcCheckStage
    ${If} $vcChecking != "1"
      StrCpy $vcChecking "1"
      !insertmacro vcStage "설치한 파일을 확인하는 중입니다 …"
    ${EndIf}
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
    !define MUI_WELCOMEPAGE_TITLE "${PRODUCT_NAME} 제거를 시작합니다."
    !define MUI_WELCOMEPAGE_TEXT "이 컴퓨터에서 ${PRODUCT_NAME}를 지웁니다.$\r$\n$\r$\n${PRODUCT_NAME}가 켜져 있으면 먼저 꺼 주세요.$\r$\n$\r$\n계속하려면 '다음' 단추를 눌러 주세요."
    ; «모든 사용자» 설치를 지울 때 템플릿 제거기는 화면을 띄우기 전(un.onInit — multiUser.nsh setInstallModePerAllUsers)에 관리자 권한으로
    ; 다시 뜨므로, 첫 화면은 다시 뜬 제거기가 보인다 — 설치기와 달리 다시 뜬 쪽에서 첫 화면을 건너뛰지 않는다(10/28: 건너뛰었더니 첫 화면이 아예 안 보였다).
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.vcWelcomeShow
    ; 다음 화면은 곧바로 지우는 진행 화면이다 — 떠나기 전에 켜진 앱을 묻고(기준 9), «취소»면 이 화면에 남는다
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.vcWelcomeLeave
    !insertmacro MUI_UNPAGE_WELCOME
    ; 다음은 제거 범위 화면(두 범위가 함께 깔렸을 때만) — 설치기와 같이 아래 안내 칸을 올리고 늘린다(함수 몸은 customUninstallPage).
    ; 떠날 때는 다음이 진행 화면이라 합성을 켠다(제거 첫 화면 LEAVE와 같다)
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.vcModeShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.vcCompOn
    ; 진행 화면 · 완료 화면은 템플릿이 정한 자리에서 «SHOW» 설정과 함수를 붙일 수 없다 — 그 화면을 넣는 MUI 매크로를
    ; «SHOW 설정 + 원래 내용 + 함수»로 바꿔 둔다(un-pages.nsh에 이유)
    !include "${VC_NSIS_DIR}\un-pages.nsh"

    Function un.vcGuiInit
      !insertmacro vcHeaderArt
      Call un.vcZOrder
    FunctionEnd
    Function un.vcWelcomeShow
      !insertmacro vcSidebarArt $mui.WelcomePage.Image $mui.WelcomePage.Image.Bitmap
    FunctionEnd
    Function un.vcWelcomeLeave
      !insertmacro vcCloseRunningApp
      ${If} $vcAppAnswer == "cancel"
        Abort
      ${EndIf}
      ; 다음은 진행 화면(또는 제거 범위 화면) — 처음 그려질 때 한 장에(vcCompOn). 멈춤은 안 된다 — MUI가 첫 화면을 닫으며 LockWindow off로 푼다
      Call un.vcCompOn
    FunctionEnd
  !macroend

  !macro customUninstallPage
    ; 제거가 끝난 뒤 설치 폴더 위 폴더(«InKY Film Festival»)가 비었으면 지운다. RMDir(/r 없음)는 빈 폴더만 지운다 — 다른 앱(Poster Studio 등)이
    ; 있으면 그대로 둔다. 제거 단계(섹션)를 하나 더 만들면 electron-builder가 «구성 요소 선택» 화면을 넣어 흐름이 바뀐다 — 그래서 제거 성공 콜백에서 한다.
    ; GetParent(FileFunc)는 템플릿이 이 파일보다 뒤에 들이므로 이 함수는 화면을 정의하는 이 자리에서 정의한다.
    ; 사용자가 고른 다른 위치(예: D:\Apps\Voice Cinema)의 위 폴더는 비었어도 그대로 둔다 — 이름이 «InKY Film Festival»일 때만 지운다.
    Function un.vcModeShow
      !insertmacro vcModeLabel
      Push $MultiUser.InstallModePage
      Call un.vcFreezeUntilShown
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
      !insertmacro vcStage "프로그램 파일을 지우는 중입니다 …"
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
