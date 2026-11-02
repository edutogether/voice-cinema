'use strict';
// 설치기 추가 단계(nsis/)가 electron-builder 템플릿 일부를 바꿔 끼운다 — 템플릿이 그대로일 때만 맞다. electron-builder 판을 올려 템플릿이
// 바뀌면 여기서 먼저 떨어진다. 그때는 바뀐 원래 내용을 보고 nsis/install-files.nsh · installer.nsh를 함께 다시 맞춘 뒤 이 검사를 고친다.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HERE = path.join(__dirname, '..');
const TEMPLATES = path.join(HERE, 'node_modules', 'app-builder-lib', 'templates', 'nsis');
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const macroBody = (text, name) => {
  const m = text.match(new RegExp(`^!macro ${name}(?: [^\\n]*)?\\n([\\s\\S]*?)^!macroend`, 'm'));
  assert.ok(m, `매크로 ${name} 없음`);
  return m[1];
};
const templateInstaller = read(path.join(TEMPLATES, 'include', 'installer.nsh'));
const ours = read(path.join(HERE, 'nsis', 'install-files.nsh'));
// 측정용 줄(vcT — VC_TIMING을 정의한 시험 빌드에서만 임시 파일에 시각을 적는다, 배포 판에는 없다)은 원래 내용과 견줄 때 뺀다
const withoutTiming = (text) => text.replace(/^\s*!insertmacro vcT "[^"]*"\n/gm, '');

test('electron-builder는 26.17.0으로 고정이다(템플릿을 바꿔 끼운 판)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
  assert.equal(pkg.devDependencies['electron-builder'], '26.17.0');
});

test('바꿔 끼운 installApplicationFiles의 원래 내용이 그대로다', () => {
  const hash = crypto.createHash('sha256').update(macroBody(templateInstaller, 'installApplicationFiles')).digest('hex');
  assert.equal(hash, 'c787b65e86bd4d90d5142950773f3babe06e59a4fbe4f38b52e30de9b67cc0e8');
});

test('바로가기 두 매크로는 템플릿 원래 내용 끝에 막대 한 걸음만 더한 것이다', () => {
  for (const [name, step] of [['addStartMenuLink', 905], ['addDesktopLink', 950]]) {
    assert.equal(withoutTiming(macroBody(ours, name)), `${macroBody(templateInstaller, name)}  !insertmacro vcSetBar ${step}\n`, name);
  }
});

test('제거기의 «모든 사용자» 매크로는 템플릿 원래 내용에 «작업 폴더 옮기기» 한 줄만 더한 것이다', () => {
  const body = (text) => {
    const m = text.match(/^\s*!macro setInstallModePerAllUsers\n([\s\S]*?)^\s*!macroend/m);
    assert.ok(m, 'setInstallModePerAllUsers 없음');
    return m[1];
  };
  const template = body(read(path.join(TEMPLATES, 'multiUser.nsh')).slice(read(path.join(TEMPLATES, 'multiUser.nsh')).indexOf('INSTALL_MODE_PER_ALL_USERS_REQUIRED')));
  const mine = body(read(path.join(HERE, 'nsis', 'un-pages.nsh')));
  assert.equal(mine.replace('        SetOutPath $TEMP\n', ''), template);
  assert.match(mine, /SetOutPath \$TEMP\n\s+!insertmacro UAC_RunElevated/);
});

test('예전 판 지우기는 조용한 설치(/S)에서 템플릿 원래 내용 그대로다 — 화면이 있는 설치만 old-version.nsh로 간다', () => {
  const util = read(path.join(TEMPLATES, 'include', 'installUtil.nsh'));
  // 템플릿의 함수(넘기는 값 · 임시 폴더로 옮겨 돌리기 — old-version.nsh가 같은 방식을 따른다)가 그대로인지
  const fn = util.match(/^Function uninstallOldVersion\n([\s\S]*?)^FunctionEnd/m);
  assert.ok(fn, 'uninstallOldVersion 함수 없음');
  assert.equal(crypto.createHash('sha256').update(fn[1]).digest('hex'), 'afc2e4487e72e663e166edc2fc331ee8823c7d4f20af3f45b39873fd924615d4');
  const template = macroBody(util, 'uninstallOldVersion');
  const mine = macroBody(ours, 'uninstallOldVersion');
  const silent = mine.match(/\$\{If\} \$\{Silent\}\n([\s\S]*?)\s+\$\{Else\}/);
  assert.ok(silent, '조용한 설치 갈래 없음');
  assert.equal(silent[1].replace(/^ {4}/gm, '  ') + '\n', template);
  assert.match(mine, /!if "\$\{ROOT_KEY\}" == "SHELL_CONTEXT"\n[\s\S]*?Call vcRemoveOldVersions\n\s+!endif/);
});

test('설치기에는 첫 화면(환영)이 없고, 위치 화면을 떠날 때 묻는다(기준 5 · 9 · 10)', () => {
  const installer = read(path.join(HERE, 'nsis', 'installer.nsh'));
  assert.doesNotMatch(macroBody(installer.replace(/^ {2}/gm, ''), 'customWelcomePage'), /MUI_PAGE_WELCOME/);
  const dir = read(path.join(HERE, 'nsis', 'in-pages.nsh'));
  // 위치 화면은 nsDialogs로 MUI 위치 화면과 같은 자리에 그린다 — 템플릿의 «업데이트면 건너뛰기»(PRE)를 넘겨받아 그대로 부른다
  const page = macroBody(dir, 'MUI_PAGE_DIRECTORY');
  assert.match(page, /!define VC_DIR_PRE "\$\{MUI_PAGE_CUSTOMFUNCTION_PRE\}"\n\s+!undef MUI_PAGE_CUSTOMFUNCTION_PRE/);
  assert.match(page, /Page custom vcDirShow vcDirLeave/);
  assert.match(page.match(/Function vcDirShow\n([\s\S]*?)FunctionEnd/)[1], /^\s+Call \$\{VC_DIR_PRE\}/m);
  const leave = page.match(/Function vcDirLeave\n([\s\S]*?)FunctionEnd/)[1];
  // 설치 위치는 폴더 칸의 전체 경로 → 이미 설치(두 범위) → 켜진 앱 순서, «취소»는 그 화면에 남는다(Abort)
  assert.ok(leave.indexOf('StrCpy $INSTDIR') < leave.indexOf('vcAlreadyInstalled'));
  assert.ok(leave.indexOf('HKCU') < leave.indexOf('vcAlreadyInstalled') && leave.indexOf('HKLM') < leave.indexOf('vcAlreadyInstalled'));
  assert.ok(leave.indexOf('vcAlreadyInstalled') < leave.indexOf('vcCloseRunningApp'));
  assert.equal((leave.match(/Abort/g) ?? []).length, 2);
});

// 화면 · 묻는 창 · 진행 상자에는 한국어 문장과 «설치: / 삭제: 경로» 줄만 나온다(기준 6 · 14) — 기록용 영어 · 숫자(10/28 «[t] old uninstalled»)가 다시 들어오지 않게
// 묻는 창(MessageBox)에 쓰는 문구 — 설치 창 안내문과 달리 Windows 글꼴로 그려 줄 간격이 있다
const BOXES = new Set(['appRunning', 'appCannotBeClosed', 'vcAlreadyInstalled', 'vcOldRemoveFailed', 'uninstallFailed', 'decompressionFailed', 'loginWithAdminAccount']);
test('설치기 화면 글은 한국어 문장과 «설치: / 삭제: » 줄뿐이다', () => {
  const dir = path.join(HERE, 'nsis');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.nsh'));
  const hangul = /[가-힣]/;
  for (const file of files) {
    const text = read(path.join(dir, file));
    const lines = text.split('\n').filter((l) => !/^\s*;/.test(l));
    for (const line of lines) {
      // NSIS 기록 줄은 단계 문장 · 파일 줄 두 매크로 안에서만 찍는다
      if (/\bDetailPrint\b/.test(line)) assert.match(line, /DetailPrint "\$\{TEXT\}"/, `${file}: ${line.trim()}`);
      // 묻는 창은 언어 문구($(…))만 띄운다 — 뒤에 번호 · 값을 붙이지 않는다
      if (/\bMessageBox\b/.test(line)) assert.match(line, /MessageBox [A-Z_|]+ "\$\([A-Za-z]+\)"( \/SD ID[A-Z]+)?( ID[A-Z]+ \+\d)?\s*$/, `${file}: ${line.trim()}`);
      const stage = line.match(/!insertmacro (?:vcStage|vcFinishProgress) "([^"]*)"/);
      if (stage && stage[1] !== '${TEXT}') {
        assert.match(stage[1], hangul, `${file}: ${line.trim()}`);
        assert.match(stage[1], /(\.|…)$/, `${file}: ${line.trim()}`);
      }
      const fileLine = line.match(/!insertmacro vcFileLine "([^"]*)"/);
      if (fileLine) assert.ok(['설치: ', '삭제: '].includes(fileLine[1]), `${file}: ${line.trim()}`);
      // 상자 한 줄(vcLine)은 파일 줄 매크로 안 · 큰 파일을 푸는 동안의 «설치 중: 경로 (NN%)»뿐이다
      const plainLine = line.match(/!insertmacro vcLine "([^"]*)"/);
      if (plainLine && plainLine[1] !== '${PREFIX}$R0') assert.equal(plainLine[1], '설치 중: $R0 ($R6%)', `${file}: ${line.trim()}`);
      const lang = line.match(/LangString (\w+) \$\{LANG_KOREAN\} "([^"]*)"/);
      const page = line.match(/!define (MUI_\w+_TEXT\w*) "([^"]*)"/);
      for (const [, name, text] of [lang, page].filter(Boolean)) {
        assert.match(text, hangul, `${file}: ${line.trim()}`);
        assert.doesNotMatch(text, /\((을|를|이|가|은|는|과|와|으로|로)\)/, `${file}: 조사 표기 — ${line.trim()}`);
        assert.doesNotMatch(text, /(?<!\$)\\n/, `${file}: 글자 그대로 찍히는 \\n — ${line.trim()}`);
        // 번역투(10/28 팀장 검토): «~주시기 바랍니다 · 성공적으로 · ~하였습니다 · ~하십시오 · ~됨»
        assert.doesNotMatch(text, /주시기 바랍니다|성공적으로|하였습니다|하십시오|됨(\.|$)/, `${file}: 번역투 — ${line.trim()}`);
        // 단추는 «단추»로(Poster Studio 설치판과 같은 말 — 10/28 팀장 전달)
        assert.doesNotMatch(text, /버튼/, `${file}: «버튼» — ${line.trim()}`);
        // 설치 창 안내문(굴림 9pt)은 줄 사이에 빈 줄을 둔다 — 글자가 맞닿는다. 묻는 창(MessageBox) 문구는 Windows 글꼴이라 뺀다.
        if (!BOXES.has(name)) {
          const parts = text.split('$\\r$\\n');
          parts.forEach((part, i) => {
            if (i > 0) assert.ok(!(part && parts[i - 1]), `${file}: 줄 사이 빈 줄 없음 — ${name}`);
          });
        }
      }
      assert.doesNotMatch(line, /\[t\]/, `${file}: 시간 재기 기록 — ${line.trim()}`);
      // NSIS 기본 «누르세요» 문구($_CLICK · $(^Click…))는 «'다음' 버튼을 눌러»라 쓰지 않는다 — 문장을 직접 적는다
      assert.doesNotMatch(line, /\$_CLICK|\$\(\^Click/, `${file}: NSIS 기본 «누르세요» 문구 — ${line.trim()}`);
    }
    // 시각(GetTickCount)은 막대를 시간으로 밀 때와 측정용 vcT(VC_TIMING 빌드에서 임시 파일에만)에서만 읽는다 — 화면 글에 붙이지 않는다
    for (const m of text.matchAll(/GetTickCount\(\) i \.(\w+)"\n((?:.*\n){0,3})/g)) {
      assert.doesNotMatch(m[2], /DetailPrint|vcStage|vcLine|NSD_SetText|SendMessage/, `${file}: 시각을 화면에 적음`);
    }
  }
  const timing = read(path.join(dir, 'installer.nsh')).match(/!macro vcT LABEL\n([\s\S]*?)!macroend/)[1];
  assert.match(timing, /^\s*!ifdef VC_TIMING\n[\s\S]*FileWrite \$8[\s\S]*!endif\n$/);
});

// 11/2 대표님 «Poster Studio 설치판에서 문제 됐던 것들을 똑같이»(팀장 전달) — 화면 넘김은 그쪽(2fabd75)과 같은 자리에서 멈추고 · 다시 켜고 · 합성한다
const fnBody = (text, name) => {
  const m = text.match(new RegExp(`Function ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n([\\s\\S]*?)FunctionEnd`));
  assert.ok(m, `함수 ${name} 없음`);
  return m[1];
};
test('화면 넘김은 그리기 멈춤 · 다시 켬 · 합성으로 — Poster Studio 설치판과 같은 자리다', () => {
  const installer = read(path.join(HERE, 'nsis', 'installer.nsh'));
  const dir = read(path.join(HERE, 'nsis', 'in-pages.nsh'));
  const un = read(path.join(HERE, 'nsis', 'un-pages.nsh'));
  // 다시 켤 때는 새 화면을 맨 위로 올리고, 합성으로 한 장에 그린 뒤 그리기를 멈춘 채로 합성을 끈다(그냥 끄면 보통 방식으로 다시 그린다)
  const thaw = fnBody(installer, '${UN}vcThaw').replace(/\s*;[^\n]*/g, '');
  const steps = ['ShowWindow $0 8', 'SetWindowPos(p r0, p 0', 'SetWindowLongW(p $HWNDPARENT, i -20, i r2)', '${VC_WM_SETREDRAW} 1 0', 'RedrawWindow',
    '${VC_WM_SETREDRAW} 0 0', 'SetWindowLongW(p $HWNDPARENT, i -20, i r1)', '${VC_WM_SETREDRAW} 1 0'];
  let at = -1;
  for (const s of steps) { const i = thaw.indexOf(s, at + 1); assert.ok(i > at, `vcThaw 차례: ${s}`); at = i; }
  // 멈춤은 창이 보일 때만(첫 화면은 멈추지 않는다)
  assert.match(fnBody(installer, '${UN}vcFreeze'), /IsWindowVisible\(p \$HWNDPARENT\)[\s\S]*\$\{If\} \$0 <> 0\n\s+SendMessage \$HWNDPARENT \$\{VC_WM_SETREDRAW\} 0 0/);
  // 창이 뜰 때 칸 겹침 순서(머리 바탕 · 선 맨 아래 + WS_CLIPSIBLINGS)
  for (const f of ['vcGuiInit', 'un.vcGuiInit']) assert.match(fnBody(installer, f), new RegExp(`vcHeaderArt\\n\\s+Call ${f.startsWith('un.') ? 'un\\.' : ''}vcZOrder`));
  // 설치기: 설치 범위(뜬 뒤 다시 켬 · 떠날 때 멈춤) → 위치(만들기 전 멈춤 · nsDialogs::Show 바로 앞에서 다시 켜기 · 떠날 때 합성) → 진행 → 완료(뜬 뒤 다시 켬 · 떠날 때 멈춤)
  assert.match(dir, /!define MUI_PAGE_CUSTOMFUNCTION_SHOW vcModeShow\n!define MUI_PAGE_CUSTOMFUNCTION_LEAVE vcFreeze\n/);
  assert.match(fnBody(installer, 'vcModeShow'), /Push \$MultiUser\.InstallModePage\n\s+Call vcFreezeUntilShown/);
  const dirShow = fnBody(dir, 'vcDirShow');
  assert.ok(dirShow.indexOf('Call vcFreeze\n') > dirShow.indexOf('Call ${VC_DIR_PRE}') && dirShow.indexOf('Call vcFreeze\n') < dirShow.indexOf('nsDialogs::Create'));
  assert.match(dirShow, /Push \$R0\n\s+Call vcFreezeUntilShown\n\s+nsDialogs::Show/);
  assert.match(fnBody(dir, 'vcDirLeave'), /Call vcCompOn\n\s*$/);
  assert.match(installer, /!define MUI_PAGE_CUSTOMFUNCTION_LEAVE vcFreeze\n\s+!insertmacro MUI_PAGE_FINISH/);
  assert.match(fnBody(installer, 'vcFinishShow'), /Push \$mui\.FinishPage\n\s+Call vcFreezeUntilShown/);
  // 제거기: 첫 화면 · 제거 범위를 떠날 때 합성(다음이 진행 화면) → 완료(뜬 뒤 다시 켬 · 떠날 때 멈춤)
  assert.match(fnBody(installer, 'un.vcWelcomeLeave'), /Call un\.vcCompOn\n\s*$/);
  assert.match(installer, /!define MUI_PAGE_CUSTOMFUNCTION_SHOW un\.vcModeShow\n\s+!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un\.vcCompOn\n/);
  assert.match(fnBody(installer, 'un.vcModeShow'), /Push \$MultiUser\.InstallModePage\n\s+Call un\.vcFreezeUntilShown/);
  assert.match(un, /!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un\.vcFreeze\n/);
  assert.match(fnBody(un, 'un.vcFinishShow'), /Push \$mui\.FinishPage\n\s+Call un\.vcFreezeUntilShown/);
  // 설치 · 제거 단계 끝: 100%를 1초 보인 뒤 멈춘다(«닫음» → «마침» 사이 한 장)
  assert.match(macroBody(installer, 'vcFinishProgress'), /Sleep 1000\n\s+Call \$\{VC_FN\}vcFreeze\n/);
  // «마침»은 창을 숨기지 않고 완료 화면 그대로 닫는다
  assert.doesNotMatch(installer + un, /\bHideWindow\b/);
});

test('앱 파일은 설치 위치에 바로 풀며 «설치: …» 줄을 적는다 — 표는 빌드 때 그 7z에서 만든다', () => {
  // 임시 폴더에 풀어 옮기지 않는다(그동안 줄이 없었다)
  const body = macroBody(ours, 'installApplicationFiles');
  assert.doesNotMatch(ours.replace(/^\s*;.*$/gm, ''), /7z-out|CopyFiles|CopyFileW/);
  assert.match(body, /File "\/oname=\$PLUGINSDIR\\vc-7z-list\.txt" "\$\{APP_64\}\.vc-list\.txt"/);
  assert.match(body, /SetOutPath \$INSTDIR\n\s+Call vcExtractBegin\n\s+GetFunctionAddress \$R9 vcExtractProgress\n\s+Nsis7z::ExtractWithCallback "\$PLUGINSDIR\\app-\$packageArch\.7z" \$R9\n\s+Call vcExtractEnd/);
  // 표 만들기가 실패하면 빌드가 멈춘다(!system … = 0)
  assert.match(ours, /!system 'node "\$\{VC_NSIS_DIR\}\\vc-7z-list\.mjs" "\$\{APP_64\}" "\$\{APP_64\}\.vc-list\.txt"' = 0/);
  assert.ok(fs.existsSync(path.join(HERE, 'nsis', 'vc-7z-list.mjs')));
  // 영상도 7z에 든다 — 기본값(이미 압축된 파일은 7z에서 빼 따로 씀)이면 영상을 쓰는 동안 줄 · 막대가 서 있다
  assert.match(read(path.join(HERE, 'electron-builder.yml')), /^ {2}preCompressedFileExtensions: \[\]$/m);
  // 줄은 표의 «끝»을 지난 파일만(앞질러 나오지 않음) · 줄 없이 오래 풀리는 큰 파일은 «설치 중: … (NN%)»
  const installer = read(path.join(HERE, 'nsis', 'installer.nsh'));
  assert.match(fnBody(installer, 'vcExtractFlush'), /\$\{OrIf\} \$vcExEnd > \$R8\n\s+\$\{ExitDo\}[\s\S]*vcFileLine "설치: " "\$INSTDIR\\\$vcExPath"/);
  assert.match(fnBody(installer, 'vcExtractProgress'), /\$\{AndIf\} \$vcExSize >= \$\{VC_EX_PART_KB\}[\s\S]*Call vcExtractPartLine/);
});

test('조용한 설치(/S)도 «나만» 위치가 «InKY Film Festival» 아래다(예전 위치 · /D가 없을 때)', () => {
  const installer = read(path.join(HERE, 'nsis', 'installer.nsh'));
  const init = macroBody(installer.replace(/^ {2}/gm, ''), 'customInit');
  assert.match(init, /\$\{If\} \$\{Silent\}\n\s+\$\{AndIf\} \$installMode == "CurrentUser"/);
  assert.match(init, /\$\{If\} \$0 == ""\n\s+\$\{AndIf\} \$1 == ""\n\s+\$\{GetParent\} "\$INSTDIR" \$0\n\s+StrCpy \$INSTDIR "\$0\\\$\{MENU_FILENAME\}\\\$\{APP_FILENAME\}"/);
});

test('바꿔 끼운 매크로가 부르는 템플릿 매크로가 있다', () => {
  const extract = read(path.join(TEMPLATES, 'include', 'extractAppPackage.nsh'));
  for (const name of ['identify_package', 'compute_files_for_current_arch', 'custom_files_post_decompression']) macroBody(extract, name);
});

test('끼우는 자리의 순서가 그대로다 — 템플릿 정의 → 켜진 앱 찾기(customCheckAppRunning) → 예전 판 지우기 → 앱 파일 설치 → 바로가기', () => {
  const section = read(path.join(TEMPLATES, 'installSection.nsh'));
  const at = (s) => { const i = section.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = [at('!include installer.nsh'), at('!insertmacro CHECK_APP_RUNNING'), at('!insertmacro uninstallOldVersion SHELL_CONTEXT'),
    at('!insertmacro uninstallOldVersion HKEY_CURRENT_USER'), at('!insertmacro installApplicationFiles'),
    at('!insertmacro addStartMenuLink'), at('!insertmacro addDesktopLink'), at('!insertmacro customInstall')];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(read(path.join(TEMPLATES, 'include', 'allowOnlyOneInstallerInstance.nsh')), /!macro CHECK_APP_RUNNING[\s\S]*?!insertmacro customCheckAppRunning/);
});

test('화면 훅이 그대로 있다(첫 화면 · 위치 뒤 · 완료 · 제거 첫 화면 · 제거 완료 앞)', () => {
  const assisted = read(path.join(TEMPLATES, 'assistedInstaller.nsh'));
  for (const hook of ['customWelcomePage', 'customPageAfterChangeDir', 'customFinishPage', 'customUnWelcomePage', 'customUninstallPage']) {
    assert.match(assisted, new RegExp(`!insertmacro ${hook}\\b`), hook);
  }
  // 제거기는 첫 화면 → 설치 범위 화면 → 진행 화면 → (customUninstallPage) → 완료 화면 순서다(un-pages.nsh가 이 순서에 기댄다)
  const un = assisted.slice(assisted.indexOf('!insertmacro customUnWelcomePage'));
  const i = (s) => un.indexOf(s);
  assert.ok(i('PAGE_INSTALL_MODE') < i('MUI_UNPAGE_INSTFILES') && i('MUI_UNPAGE_INSTFILES') < i('MUI_UNPAGE_FINISH'));
});
