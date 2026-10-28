; Voice Cinema 설치기의 «예전 판 지우기»(기준 10) — installer.nsh의 customFinishPage 안에서 들인다. 그 자리는 템플릿 변수($installMode 등)가
; 정해진 뒤 · 설치 단계(Section)보다 앞이라 함수를 정의할 수 있다. 템플릿의 uninstallOldVersion 매크로를 화면이 있는 설치에서 이 함수로
; 바꿔 끼우는 것은 install-files.nsh다(조용한 설치 /S는 템플릿 그대로).
;
; 템플릿과 다른 점:
;   - 범위: 템플릿은 고른 범위의 예전 판만 지운다(«모든 사용자»면 «나만» 것도). «나만»을 골랐을 때 «모든 사용자»용 예전 판이 남아
;     시작 메뉴 · 바탕화면에 Voice Cinema가 둘이 됐다. 두 범위를 다 지운다 — 관리자 권한이 필요한 «모든 사용자» 쪽을 먼저(권한을 거절하면
;     아무것도 지우기 전에 멈출 수 있게). 이 설치기가 관리자 권한이 아니면 그 제거기만 권한을 받아 돌린다(Windows가 묻는다).
;   - 화면: 템플릿은 예전 제거기를 돌리는 동안(1~3초) 막대도 글도 멈춘다. 지워질 파일을 미리 적어 두고, 제거기가 도는 동안 0.05초마다
;     사라진 파일을 «삭제: …»로 적는다. 막대는 앞 몫(0~250)을 고르게 채운다 — 설치 단계는 그 뒤(250~1000)를 쓴다(installer.nsh vcSetBar).
;   - 실패: 템플릿은 제거기가 실패해도 그 위에 설치하거나 번호를 붙인 영어 · 숫자 섞인 알림을 낸다. «예전 Voice Cinema를 지우지 못했습니다.
;     다시 시도할까요?»를 묻고, «취소»면 새 판을 설치하지 않고 끝낸다. 지웠는지는 제거기의 끝 값이 아니라 등록이 사라졌는지로 본다.
;   - 넘기는 값: «--updated»(앱 데이터 남기기)를 넘기지 않는다. 그 값을 받은 제거기는 파일을 지우는 대신 임시 폴더로 옮기는데(atomicRMDir),
;     설치 위치가 다른 드라이브(D: 등)면 옮기지 못해 제거가 늘 실패한다. 사용자가 «지우고 새로 설치»를 고른 것이라 앱 데이터(창 상태 · 캐시 —
;     학생 녹음은 남지 않는다)까지 지운다. 나머지(/S · 범위 · _?=설치 위치 · 임시 폴더로 옮겨 돌리기)는 템플릿과 같다.

!ifndef VC_OLD_VERSION_INCLUDED
!define VC_OLD_VERSION_INCLUDED

!define VC_BAR_OLD 250       ; 예전 판 지우기가 쓰는 막대 몫(0~1000 가운데) — 이 PC에서 지우기 1.5초 · 설치 6초쯤(10/28)
!define VC_BAR_OLD_STEP 10   ; 0.05초마다 막대가 따라갈 수 있는 최대 걸음 — 파일이 한꺼번에 사라져도 막대는 고르게 찬다

Var vcOldRoots      ; 지울 판 수(0 · 1 · 2)
Var vcOldIndex      ; 지금 지우는 판의 차례
Var vcOldRoot       ; HKLM(모든 사용자) · HKCU(나만)
Var vcOldString     ; 등록된 제거 명령
Var vcOldUninstaller
Var vcOldDir
Var vcOldArgs
Var vcOldList       ; 지워질 파일 목록(파일 손잡이)
Var vcOldTotal
Var vcOldDone
Var vcOldPending    ; 목록에서 다음에 사라지기를 기다리는 파일
Var vcOldProc
Var vcOldExited
Var vcOldFrom
Var vcOldTo
Var vcOldShown
Var vcOldTarget

; $vcOldRoot의 등록에서 제거기 경로($vcOldUninstaller)와 설치 위치($vcOldDir)를 읽는다 — 없으면 $vcOldUninstaller = ""
; (읽는 법은 템플릿 uninstallOldVersion과 같다: 제거 명령의 따옴표 안, 설치 위치가 없으면 제거기가 있는 폴더)
Function vcReadOld
  ${If} $vcOldRoot == "HKLM"
    ReadRegStr $vcOldString HKLM "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ReadRegStr $vcOldDir HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${Else}
    ReadRegStr $vcOldString HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ReadRegStr $vcOldDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  StrCpy $vcOldUninstaller ""
  ${If} $vcOldString != ""
    Push $vcOldString
    Call GetInQuotes
    Pop $vcOldUninstaller
    ${If} $vcOldDir == ""
    ${AndIf} $vcOldUninstaller != ""
      Push $vcOldUninstaller
      Call GetFileParent
      Pop $vcOldDir
    ${EndIf}
  ${EndIf}
FunctionEnd

; 목록에 한 줄(있는 파일만) — 스택: 경로
Function vcListFile
  Exch $R0
  ${If} ${FileExists} "$R0"
    FileWriteUTF16LE $vcOldList "$R0$\r$\n"
    IntOp $vcOldTotal $vcOldTotal + 1
  ${EndIf}
  Pop $R0
FunctionEnd

; 폴더 아래 파일을 목록에 적는다 — 스택: 절대 경로. 순서는 제거기가 지우는 순서와 같다(둘 다 FindFirst 순서로 내려간다).
Function vcListTree
  Exch $R0
  Push $R1
  Push $R2
  FindFirst $R1 $R2 "$R0\*.*"
  ${DoUntil} $R2 == ""
    ${If} $R2 != "."
    ${AndIf} $R2 != ".."
      ${If} ${FileExists} "$R0\$R2\*.*"
        Push "$R0\$R2"
        Call vcListTree
      ${Else}
        FileWriteUTF16LE $vcOldList "$R0\$R2$\r$\n"
        IntOp $vcOldTotal $vcOldTotal + 1
      ${EndIf}
    ${EndIf}
    FindNext $R1 $R2
  ${Loop}
  FindClose $R1
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

; 지워질 것: 설치 폴더의 파일, 그 판의 바탕화면 · 시작 메뉴 바로가기(템플릿 setLinkVars와 같은 이름 규칙)
Function vcListOld
  Push $R1
  Push $R2
  FileOpen $vcOldList "$PLUGINSDIR\vc-old.txt" w
  StrCpy $vcOldTotal 0
  ${If} ${FileExists} "$vcOldDir\*.*"
    Push $vcOldDir
    Call vcListTree
  ${EndIf}
  ${If} $vcOldRoot == "HKLM"
    SetShellVarContext all
    ReadRegStr $R1 HKLM "${INSTALL_REGISTRY_KEY}" ShortcutName
    ReadRegStr $R2 HKLM "${INSTALL_REGISTRY_KEY}" MenuDirectory
  ${Else}
    SetShellVarContext current
    ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" ShortcutName
    ReadRegStr $R2 HKCU "${INSTALL_REGISTRY_KEY}" MenuDirectory
  ${EndIf}
  ${If} $R1 == ""
    StrCpy $R1 "${PRODUCT_FILENAME}"
  ${EndIf}
  Push "$DESKTOP\$R1.lnk"
  Call vcListFile
  ${If} $R2 == ""
    Push "$SMPROGRAMS\$R1.lnk"
    Call vcListFile
  ${Else}
    Push "$SMPROGRAMS\$R2\$R1.lnk"
    Call vcListFile
    Push "$SMPROGRAMS\$R2\Uninstall ${PRODUCT_NAME}.lnk"
    Call vcListFile
  ${EndIf}
  ${If} $installMode == "all"
    SetShellVarContext all
  ${Else}
    SetShellVarContext current
  ${EndIf}
  FileClose $vcOldList
  Pop $R2
  Pop $R1
FunctionEnd

; 목록에서 사라진 파일을 앞에서부터 «삭제: …»로 적는다. 제거기가 끝난 뒤($vcOldExited = 1)에는 남은 목록을 끝까지 본다
; (사라진 것만 적는다 — 남은 파일은 적지 않는다).
Function vcOldReport
  Push $R1
  ${Do}
    ${If} $vcOldPending == ""
      ClearErrors
      FileReadUTF16LE $vcOldList $vcOldPending
      ${If} ${Errors}
        StrCpy $vcOldPending ""
        ${ExitDo}
      ${EndIf}
      StrCpy $R1 $vcOldPending 1 -1
      ${If} $R1 == "$\n"
        StrCpy $vcOldPending $vcOldPending -1
      ${EndIf}
      StrCpy $R1 $vcOldPending 1 -1
      ${If} $R1 == "$\r"
        StrCpy $vcOldPending $vcOldPending -1
      ${EndIf}
      ${If} $vcOldPending == ""
        ${Continue}
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$vcOldPending"
      ${If} $vcOldExited == 0
        ${ExitDo}
      ${EndIf}
    ${Else}
      !insertmacro vcFileLine "삭제: " "$vcOldPending"
      IntOp $vcOldDone $vcOldDone + 1
      ; 줄을 하나 적을 때마다 막대도 함께 간다(몫의 90%까지 — 나머지는 제거기가 끝난 뒤). 예전 제거기는 1초도 안 돼 끝나고 줄 적기가 3초쯤 걸려
      ; (한 줄 17ms쯤 — 상자를 다시 그린다), 줄을 다 적은 뒤에만 막대를 옮기면 그동안 막대가 멈춰 있었다(10/28 녹화).
      ${If} $vcOldTotal > 0
        IntOp $R1 $vcOldTo - $vcOldFrom
        IntOp $R1 $R1 * 9
        IntOp $R1 $R1 / 10
        IntOp $R1 $R1 * $vcOldDone
        IntOp $R1 $R1 / $vcOldTotal
        IntOp $R1 $R1 + $vcOldFrom
        ${If} $R1 > $vcOldShown
          StrCpy $vcOldShown $R1
          !insertmacro vcSetBarRaw $vcOldShown
        ${EndIf}
      ${EndIf}
    ${EndIf}
    StrCpy $vcOldPending ""
  ${Loop}
  Pop $R1
FunctionEnd

; 제거기를 띄운다 — 스택: 실행 파일 → $vcOldProc(손잡이, 못 띄우면 0), $R6 = Windows 오류 번호(1223 = 관리자 권한을 거절함)
; 창은 띄우지 않는다(조용한 제거 /S — 기준 11). «모든 사용자» 판인데 이 설치기가 관리자 권한이 아니면 그 제거기만 권한을 받아 돌린다.
Function vcStartOld
  Exch $R0
  Push $R3
  Push $R4
  Push $R5
  ${If} $vcOldRoot == "HKLM"
  ${AndIfNot} ${UAC_IsAdmin}
    StrCpy $R3 "runas"
  ${Else}
    StrCpy $R3 "open"
  ${EndIf}
  ; SHELLEXECUTEINFOW: 크기, SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC(설치 단계는 따로 도는 스레드다), 창, 동작, 파일, 인자,
  ; 작업 폴더(설치 폴더를 붙잡지 않게 임시 폴더), SW_HIDE, … , hProcess
  System::Call '*(&l4, i 0x140, p $HWNDPARENT, w R3, w R0, w "/S /KEEP_APP_DATA $vcOldArgs _?=$vcOldDir", w "$TEMP", i 0, p 0, p 0, p 0, p 0, i 0, p 0, p 0) p .R4'
  System::Call 'shell32::ShellExecuteExW(p R4) i .R5 ?e'
  Pop $R6
  StrCpy $vcOldProc 0
  ${If} $R5 != 0
    System::Call '*$R4(i, i, p, p, p, p, p, i, p, p, p, p, i, p, p .R5)'
    StrCpy $vcOldProc $R5
  ${EndIf}
  System::Free $R4
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R0
FunctionEnd

; 예전 판 하나($vcOldRoot)를 지운다. 없으면 그냥 돌아온다. 못 지우면 다시 시도할지 묻고, «취소»면 새 판을 설치하지 않고 끝낸다.
Function vcRemoveOne
  Push $R1
  Push $R6
  Call vcReadOld
  ${If} $vcOldUninstaller != ""
    ; 이 판의 막대 몫(두 판을 지우면 반씩)
    IntOp $vcOldFrom ${VC_BAR_OLD} * $vcOldIndex
    IntOp $vcOldFrom $vcOldFrom / $vcOldRoots
    IntOp $vcOldIndex $vcOldIndex + 1
    IntOp $vcOldTo ${VC_BAR_OLD} * $vcOldIndex
    IntOp $vcOldTo $vcOldTo / $vcOldRoots
    ${If} $vcOldRoot == "HKLM"
      StrCpy $vcOldArgs "/allusers"
    ${Else}
      StrCpy $vcOldArgs "/currentuser"
    ${EndIf}
    ${Do}
      Call vcListOld
      ; 제거기는 설치 폴더와 함께 지워지므로 임시 폴더로 옮겨 돌리고, 막히면(그룹 정책 등) 제자리의 것을 돌린다 — 템플릿과 같다
      Delete "$PLUGINSDIR\old-uninstaller.exe"
      CopyFiles /SILENT "$vcOldUninstaller" "$PLUGINSDIR\old-uninstaller.exe"
      Push "$PLUGINSDIR\old-uninstaller.exe"
      Call vcStartOld
      ${If} $vcOldProc == 0
      ${AndIf} $R6 != 1223
        Push $vcOldUninstaller
        Call vcStartOld
      ${EndIf}

      ${If} $vcOldProc != 0
        FileOpen $vcOldList "$PLUGINSDIR\vc-old.txt" r
        StrCpy $vcOldPending ""
        StrCpy $vcOldDone 0
        StrCpy $vcOldExited 0
        StrCpy $vcOldShown $vcOldFrom
        ${Do}
          ${If} $vcOldExited == 0
            System::Call 'kernel32::WaitForSingleObject(p $vcOldProc, i 50) i .R1'
            ${If} $R1 == 0
              StrCpy $vcOldExited 1
              System::Call 'kernel32::CloseHandle(p $vcOldProc)'
            ${EndIf}
          ${Else}
            Sleep 50
          ${EndIf}
          Call vcOldReport
          ; 막대 목표: 사라진 파일 비율로 몫의 90%까지, 제거기가 끝나면 몫 끝까지. 보이는 막대는 한 번에 VC_BAR_OLD_STEP씩만 따라간다.
          ${If} $vcOldExited == 1
            StrCpy $vcOldTarget $vcOldTo
          ${Else}
            IntOp $vcOldTarget $vcOldTo - $vcOldFrom
            IntOp $vcOldTarget $vcOldTarget * 9
            IntOp $vcOldTarget $vcOldTarget / 10
            IntOp $vcOldTarget $vcOldTarget * $vcOldDone
            ${If} $vcOldTotal > 0
              IntOp $vcOldTarget $vcOldTarget / $vcOldTotal
            ${EndIf}
            IntOp $vcOldTarget $vcOldTarget + $vcOldFrom
            ; 첫 파일이 지워지기 전(제거기가 뜨는 동안 1~2초 — 관리자 권한이면 더)에는 0.05초마다 1씩, 몫의 10%까지만 민다.
            ; 그동안 막대가 0에 서 있었다(10/28 녹화 1.7초). 지운 줄이 나오면 줄 비율이 이 값을 넘을 때부터 그대로 따라간다.
            ${If} $vcOldDone == 0
              IntOp $vcOldTarget $vcOldTo - $vcOldFrom
              IntOp $vcOldTarget $vcOldTarget / 10
              IntOp $vcOldTarget $vcOldTarget + $vcOldFrom
              IntOp $R1 $vcOldShown + 1
              ${If} $R1 < $vcOldTarget
                StrCpy $vcOldTarget $R1
              ${EndIf}
            ${EndIf}
          ${EndIf}
          IntOp $R1 $vcOldShown + ${VC_BAR_OLD_STEP}
          ${If} $R1 > $vcOldTarget
            StrCpy $R1 $vcOldTarget
          ${EndIf}
          ${If} $R1 > $vcOldShown
            StrCpy $vcOldShown $R1
            !insertmacro vcSetBarRaw $vcOldShown
          ${EndIf}
          ${If} $vcOldExited == 1
          ${AndIf} $vcOldShown >= $vcOldTo
            ${ExitDo}
          ${EndIf}
        ${Loop}
        FileClose $vcOldList
      ${EndIf}

      ; 지웠는지는 등록이 사라졌는지로 본다
      Call vcReadOld
      ${If} $vcOldUninstaller == ""
        ${ExitDo}
      ${EndIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(vcOldRemoveFailed)" /SD IDCANCEL IDRETRY +2
      Quit
    ${Loop}
  ${EndIf}
  Pop $R6
  Pop $R1
FunctionEnd

; 화면이 있는 설치의 예전 판 지우기 — 두 범위를 다 본다(위 «범위»)
Function vcRemoveOldVersions
  ; «모든 사용자»를 관리자 권한으로 다시 뜬 설치기가 설치할 때는 템플릿이 켜진 앱 찾기를 건너뛴다 — 지우기 전에 여기서 본다
  ${If} ${UAC_IsInnerInstance}
    !insertmacro vcCloseRunningAppOrQuit
  ${EndIf}
  StrCpy $vcOldRoots 0
  StrCpy $vcOldRoot "HKLM"
  Call vcReadOld
  ${If} $vcOldUninstaller != ""
    IntOp $vcOldRoots $vcOldRoots + 1
  ${EndIf}
  StrCpy $vcOldRoot "HKCU"
  Call vcReadOld
  ${If} $vcOldUninstaller != ""
    IntOp $vcOldRoots $vcOldRoots + 1
  ${EndIf}
  ${If} $vcOldRoots > 0
    !insertmacro vcStage "예전 ${PRODUCT_NAME}를 지우는 중입니다 …"
    StrCpy $vcOldIndex 0
    StrCpy $vcOldRoot "HKLM"
    Call vcRemoveOne
    StrCpy $vcOldRoot "HKCU"
    Call vcRemoveOne
    ; 설치 단계의 막대(0~1000)는 남은 몫에 줄여 담는다
    !insertmacro vcSetBarRaw ${VC_BAR_OLD}
    StrCpy $vcBarBase ${VC_BAR_OLD}
    IntOp $vcBarSpan 1000 - ${VC_BAR_OLD}
  ${EndIf}
FunctionEnd

!endif
