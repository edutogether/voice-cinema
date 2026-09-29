# Voice Cinema 마이크 이미지

2026-09-29 Bumm님 직접 지시: Windows의 마이크 이모지 대신 아이폰에서 보이는
마이크 그림을 사용한다. 스플래시와 파비콘이 같은 원본을 사용한다.

**PC 전용이 아니다.** 동일한 `index.html`의 이미지가 PC·아이폰·안드로이드에 공통 적용된다.
기기별 이모지 글꼴이나 모바일 전용 이모지 분기는 없다. 2026-09-30 라이브를 Pixel 7·iPhone 13
화면·UA·터치 설정으로 열어 동일 PNG 해시, 원본 160px·표시 48px를 확인했다(Chromium 에뮬레이션).
실제 안드로이드 기기나 Safari에서 수행한 검사라는 뜻은 아니다. 이 조건은 `e2e/mobile-splash.spec.js`로
추가했다. PC만 적용했다는 앞선 보고를 정정하며, 이를 위해 같은 이미지를 다시 배포할 필요는 없다.

- 파일: `public/icons/studio-microphone.png`
- 원본: [Apple iOS 26.4 스튜디오 마이크](https://emojipedia.org/apple/ios-26.4/studio-microphone)
- 이미지 주소: https://em-content.zobj.net/source/apple/453/studio-microphone_1f399-fe0f.png
- 크기: 160 × 160, 투명 PNG, 31,789바이트. 다운로드한 원본 그대로이며 확대 가공하지 않았다.
- SHA-256: `1a8e9751d4fcb5becd3a10209fdff19e2d21d2bae787943f727b3515add8728f`
- iOS 18.4 제공 파일도 해상도·바이트·해시가 동일했다. 확인한 제공 원본보다 큰 해상도는 확보하지 않았다.
- 화면에서는 기존 범위인 48~72 CSS 픽셀로 표시한다.
- `icons/`는 빌드가 자동으로 프리캐시에 포함하므로 오프라인에서도 사용할 수 있다.

그림 제작자는 Apple이며, 제공처는 Emojipedia다. 위 출처와 원본 해시를 유지한다.
