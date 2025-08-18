# TabbyMansion - Chrome Extension

집중 작업을 위한 공유 타이머 & 탭 활동 추적기

🌍 **다국어 지원**: 영어, 한국어, 일본어

## 주요 기능

### ⏱️ 공유 타이머

- **단일 인스턴스**: 백그라운드 서비스 워커에서 하나의 타이머만 실행
- **실시간 동기화**: 모든 확장 프로그램 컨텍스트(팝업, 콘텐츠 스크립트 등)에서 동일한 타이머 상태 공유
- **지속성**: 탭 새로고침, 팝업 닫기/열기, 브라우저 재시작 후에도 타이머 상태 유지
- **라벨 지원**: 타이머에 사용자 정의 라벨 추가 가능

### 📊 탭 활동 추적

- 실시간 탭 전환 기록
- 사이트별 사용 시간 통계
- 일별/시간별 사용 패턴 분석
- 차트 및 로그 뷰 제공

### 🎯 플로팅 타이머

- 웹페이지에 드래그 가능한 타이머 오버레이
- 현재 시간 및 타이머 시간 동시 표시
- 모든 탭에서 동일한 타이머 상태 공유

## 기술적 특징

### 아키텍처

- **Manifest V3** 호환
- **Service Worker** 기반 백그라운드 처리
- **chrome.storage.local**을 통한 상태 지속성
- **chrome.runtime.onMessage**를 통한 컨텍스트 간 통신

### 성능 최적화

- 백그라운드에서 지속적인 setInterval 사용하지 않음
- UI 컨텍스트에서만 250ms 주기로 렌더링 업데이트
- 스토리지 쓰기는 상태 변경 시에만 수행
- 디바운싱을 통한 불필요한 렌더링 방지

### 타이머 상태 구조

```javascript
{
  status: 'running' | 'paused',  // 타이머 상태
  startedAt: number,             // 시작 시간 (Date.now())
  accumulatedMs: number,         // 누적 경과 시간 (밀리초)
  label: string,                 // 타이머 라벨 (선택사항)
  currentElapsedMs: number       // 현재 총 경과 시간 (계산값)
}
```

## 메시지 API

### 백그라운드 서비스 워커

- `TIMER_START` → 타이머 시작 (라벨 선택사항)
- `TIMER_PAUSE` → 타이머 일시정지
- `TIMER_RESET` → 타이머 리셋
- `TIMER_GET` → 현재 타이머 상태 반환

### 응답 형식

```javascript
{
  success: boolean,
  state: {
    status: 'running' | 'paused',
    startedAt: number,
    accumulatedMs: number,
    label: string,
    currentElapsedMs: number
  }
}
```

## 다국어 지원

이 확장 프로그램은 다음 언어를 지원합니다:

- 🇺🇸 **English** (기본)
- 🇰🇷 **한국어**
- 🇯🇵 **日本語**

언어는 브라우저의 언어 설정에 따라 자동으로 선택됩니다. Chrome의 언어 설정을 변경하면 확장 프로그램의 언어도 자동으로 변경됩니다.

### 지원되는 언어별 특징

- **영어**: 기본 언어, 모든 기능 완전 지원
- **한국어**: 한국 사용자를 위한 완전한 현지화
- **일본어**: 일본 사용자를 위한 완전한 현지화

## 설치 및 사용

### 1. 확장 프로그램 설치

1. Chrome 브라우저에서 `chrome://extensions/` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. 프로젝트 폴더 선택

### 2. 타이머 사용

1. 확장 프로그램 아이콘 클릭
2. "공유 타이머" 섹션에서 시작/일시정지/리셋 버튼 사용
3. 선택적으로 타이머 라벨 입력
4. 여러 탭에서 동일한 타이머 상태 확인

### 3. 플로팅 타이머 활성화

1. 팝업에서 "스톱워치 타이머" 토글 활성화
2. 웹페이지에 드래그 가능한 타이머 오버레이 표시
3. 헤더를 드래그하여 위치 이동 가능

### 4. 탭 활동 추적

1. 팝업에서 "탭 활동 추적" 토글 활성화
2. 사이트별 사용 통계 차트 확인
3. 상세보기 버튼으로 전체 통계 페이지 열기

## 테스트

`test-timer.html` 파일을 사용하여 타이머 기능을 테스트할 수 있습니다:

1. 확장 프로그램 설치 후 `test-timer.html` 파일 열기
2. 백그라운드 메시지 테스트
3. 스토리지 읽기/쓰기 테스트
4. 실시간 업데이트 테스트

## 의존성

- **Chart.js** - 차트 시각화
- **date-fns** - 날짜 유틸리티 함수
- **date-fns-tz** - date-fns의 시간대 지원

## UMD 번들

외부 라이브러리 의존성을 피하기 위해 UMD 번들이 포함되어 있습니다:

### 생성된 UMD 파일

- `vendor/date-fns.umd.js` (71KB) - date-fns 라이브러리
- `vendor/date-fns-tz.umd.js` (28KB) - date-fns-tz 라이브러리
- `vendor/chart.umd.js` (200KB) - Chart.js 라이브러리

### 사용법

```html
<!-- UMD 번들 로드 -->
<script src="vendor/date-fns.umd.js"></script>
<script src="vendor/date-fns-tz.umd.js"></script>
<script src="vendor/chart.umd.js"></script>

<script>
  // 전역 객체를 통해 라이브러리 접근
  const formatted = window.dateFns.format(new Date(), "yyyy-MM-dd");
  const zonedDate = window.dateFnsTz.formatInTimeZone(
    new Date(),
    "Asia/Seoul",
    "yyyy-MM-dd HH:mm:ss zzz"
  );
  const chart = new window.Chart(ctx, config);
</script>
```

### UMD 번들 빌드

```bash
# 모든 번들 빌드
npm run build

# 특정 번들 빌드
npm run build:date-fns
npm run build:date-fns-tz
```

### 번들 설정

- **타겟**: ES2017 호환
- **형식**: UMD (Universal Module Definition)
- **전역 객체**:
  - `window.dateFns` for date-fns
  - `window.dateFnsTz` for date-fns-tz
  - `window.Chart` for Chart.js
- **최소화**: 프로덕션 최소화
- **의존성**: 자체 포함 (외부 의존성 없음)

## 개발

```bash
# 의존성 설치
npm install

# UMD 번들 빌드
npm run build
```

## 라이선스

MIT
