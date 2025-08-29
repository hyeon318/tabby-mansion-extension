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

## 문제 해결

### 🔧 데이터가 갑자기 사라진 경우

**원인**:

- 30일 자동 정리 기능 (v1.0.1에서 비활성화됨)
- 로그 데이터 1000개 제한 (v1.0.1에서 5000개로 증가)

**해결 방법**:

1. **브라우저 개발자 도구에서 진단**:

   ```javascript
   // 개발자 도구 콘솔에서 실행
   // debug-check.js 파일을 열고 실행하거나 직접 입력
   chrome.storage.local.get(null, result => {
     console.log("현재 데이터:", result);
   });
   ```

2. **데이터 복구**:

   ```javascript
   // 개발자 도구 콘솔에서 실행
   TabbyMansion.recoverData();
   ```

3. **데이터 진단**:
   ```javascript
   // 개발자 도구 콘솔에서 실행
   TabbyMansion.diagnoseData();
   ```

### ⏰ 시간 합계가 부정확한 경우

**원인**:

- 탭이 활성화되지 않은 시간도 포함되어 계산되는 버그
- 비정상적으로 긴 시간 기록 (v1.0.1에서 24시간 제한 추가)

**해결 방법**:

1. **확장 프로그램 재시작**:

   - `chrome://extensions/`에서 확장 프로그램 비활성화 후 재활성화

2. **탭 트래커 재설정**:

   - 팝업에서 "탭 활동 추적" 토글을 끄고 다시 켜기

3. **데이터 초기화** (필요한 경우):
   - 통계 페이지에서 "전체 기록 삭제" 기능 사용

### 🐛 기타 문제 해결

**디버깅 도구 사용**:

1. `debug-check.js` 파일을 브라우저에서 열기
2. 개발자 도구 콘솔에서 실행
3. 실시간 상태 모니터링 확인

**백그라운드 로그 확인**:

1. `chrome://extensions/` 접속
2. 개발자 모드 활성화
3. TabbyMansion의 "백그라운드 페이지" 클릭
4. 콘솔에서 로그 메시지 확인

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

## 변경사항

### v1.0.13 (2024-01-15)

- **패치 노트 관리 방식 단순화**: 버전별 관리에서 단순 boolean 관리로 변경
  - `patchNotesSeen`을 단순 boolean 값으로 관리
  - 확장 프로그램 업데이트 시 자동으로 false로 초기화
  - "Got it" 버튼 클릭 시 true로 설정
  - 버전별 복잡한 객체 관리 제거로 성능 향상

### v1.0.12 (2024-01-15)

- **패치 노트 버그 수정**: JSON 키 값 노출 문제 해결
  - i18n.getMessage()가 키를 찾지 못할 때 키 값 자체를 반환하는 문제 수정
  - 패치 메시지가 없을 때 키 값이 화면에 노출되지 않도록 개선
  - 더 정확한 메시지 존재 여부 확인 로직

### v1.0.11 (2024-01-15)

- **패치 노트 로직 최적화**: 더 깔끔한 UI 처리
  - 해당 버전의 패치 메시지가 없으면 패치 노트 영역 전체 숨김
  - 이미 확인한 패치 노트도 영역 전체 숨김
  - 불필요한 빈 영역 완전 제거로 UI 개선

### v1.0.10 (2024-01-15)

- **패치 노트 기능 개선**: 더 스마트한 표시 로직
  - "Got it" 버튼 클릭 시 GA4 이벤트 추적 추가
  - 해당 버전의 패치 메시지가 없으면 패치 노트 영역 자동 숨김
  - 불필요한 빈 패치 노트 영역 제거로 UI 개선

### v1.0.9 (2024-01-15)

- **패치 노트 개선**: 줄바꿈 기능 추가
  - `<br>` 태그를 사용한 줄바꿈 지원
  - 더 읽기 쉬운 패치 노트 레이아웃
  - 모든 언어(한국어, 영어, 일본어)에서 줄바꿈 지원

### v1.0.8 (2024-01-15)

- **패치 노트 표시 기능**: 새로운 기능과 개선사항을 사용자에게 알림
  - 팝업에서 패치 내용을 1-2줄로 간단히 표시
  - 언어별로 패치 내용 제공 (한국어, 영어, 일본어)
  - 확인 버튼 클릭 시 더 이상 표시하지 않음
  - 버전별로 독립적인 패치 노트 관리
  - 애니메이션 효과로 부드러운 표시

### v1.0.7 (2024-01-15)

- **GA4 이벤트 상세화**: 더 구체적인 사용자 행동 추적
  - view_changed 이벤트에 view_type, view_description, view_granularity 추가
  - filter_applied 이벤트에 filter_type, filter_description 추가
  - data_refreshed 이벤트에 refresh_type, refresh_description 추가
  - data_exported 이벤트에 export_type, export_description 추가
  - data_deleted 이벤트에 delete_type, delete_description 추가
- GA4 대시보드에서 더 정확한 사용자 행동 분석 가능

### v1.0.6 (2024-01-15)

- **Google Analytics 4 통합**: 사용자 행동 추적 기능 추가
  - 확장 프로그램 설치/업데이트 추적
  - 타이머 사용 패턴 추적 (시작, 일시정지, 리셋)
  - 탭 추적 기능 토글 추적
  - 스톱워치 기능 토글 추적
  - 통계 페이지 사용 패턴 추적
  - 데이터 내보내기/삭제 액션 추적
- 개인정보 보호를 위한 클라이언트 ID 시스템 구현
- 모든 주요 사용자 액션에 대한 이벤트 추적

### v1.0.5 (2024-01-15)

- **기본 설정 변경**: 탭 활동 추적 기능을 기본적으로 활성화
  - 새로 설치하는 사용자는 자동으로 탭 추적 기능이 켜진 상태로 시작
  - 기존 사용자의 설정은 그대로 유지

### v1.0.4 (2024-01-15)

- **기본 설정 변경:** 탭 활동 추적 기능을 기본적으로 활성화
  - 새로 설치하는 사용자는 자동으로 탭 추적 기능이 켜진 상태로 시작
  - 기존 사용자의 설정은 그대로 유지

### v1.0.3 (2024-01-15)

- **중요:** 데이터 보존 문제 해결
  - Chrome 확장 프로그램 업데이트 시 설정과 데이터가 초기화되는 문제 수정
  - Service Worker 재시작 시 탭 트래커 상태가 리셋되는 문제 해결
  - 탭 추적 기능이 자동으로 꺼지는 문제 수정
- Service Worker 생명주기 개선
  - 확장 프로그램 업데이트와 새 설치를 구분하여 처리
  - 기존 사용자 데이터와 설정 보존
  - 시스템 재시작 후에도 설정 상태 유지

### 이전 버전에서 업그레이드하는 경우

만약 이전에 탭 추적 기능을 사용하고 있었는데 꺼져있다면, 확장 프로그램 팝업에서 다시 활성화해주세요. 이제 설정이 영구적으로 보존됩니다.

## 라이선스

MIT
