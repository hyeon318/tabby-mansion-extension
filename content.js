// TabbyMansion Content Script - 공유 타이머 오버레이
// Debug 유틸리티 import
import { debug } from "./debug.js";
import { formatTimerTime } from "./utils/string-util.js";
let stopwatchElement = null;
let timerDisplayInterval = null;

// 타이머 상태 (백그라운드에서 받은 상태만 저장)
let timerState = {
  status: "paused",
  startedAt: null,
  accumulatedMs: 0,
  label: "",
  currentElapsedMs: 0,
};

// 스톱워치 UI 생성
function createStopwatch() {
  if (stopwatchElement) return;

  stopwatchElement = document.createElement("div");
  stopwatchElement.id = "tabby-mansion-stopwatch";
  stopwatchElement.innerHTML = `
    <div class="timer-header">
      <span class="timer-title">⏱️ TabbyMansion</span>
      <button class="timer-close" id="timer-close">×</button>
    </div>
    <div class="current-time" id="current-time">00:00:00</div>
    <div class="timer-display" id="timer-display">00:00:00</div>
    <div class="timer-label" id="timer-label"></div>
    <div class="timer-controls">
      <button class="timer-btn timer-start" id="timer-start">Start</button>
      <button class="timer-btn timer-pause" id="timer-pause" style="display: none;">Stop</button>
      <button class="timer-btn timer-reset" id="timer-reset">Reset</button>
    </div>
  `;

  document.body.appendChild(stopwatchElement);
  setupEventListeners();
  makeDraggable();

  // 언어 설정에 따라 버튼 텍스트 업데이트
  updateButtonTexts();
}

// 언어 설정에 따라 버튼 텍스트 업데이트
async function updateButtonTexts() {
  try {
    const result = await chrome.storage.local.get(["language"]);
    const language = result.language || "en";

    const startBtn = document.getElementById("timer-start");
    const pauseBtn = document.getElementById("timer-pause");
    const resetBtn = document.getElementById("timer-reset");

    if (language === "ko") {
      if (startBtn) startBtn.textContent = "시작";
      if (pauseBtn) pauseBtn.textContent = "일시정지";
      if (resetBtn) resetBtn.textContent = "리셋";
    } else if (language === "ja") {
      if (startBtn) startBtn.textContent = "開始";
      if (pauseBtn) pauseBtn.textContent = "一時停止";
      if (resetBtn) resetBtn.textContent = "リセット";
    } else {
      // 영어 (기본값)
      if (startBtn) startBtn.textContent = "Start";
      if (pauseBtn) pauseBtn.textContent = "Stop";
      if (resetBtn) resetBtn.textContent = "Reset";
    }
  } catch (error) {
    console.error("언어 설정 로드 실패:", error);
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  const startBtn = document.getElementById("timer-start");
  const pauseBtn = document.getElementById("timer-pause");
  const resetBtn = document.getElementById("timer-reset");
  const closeBtn = document.getElementById("timer-close");

  startBtn.addEventListener("click", startTimer);
  pauseBtn.addEventListener("click", pauseTimer);
  resetBtn.addEventListener("click", resetTimer);
  closeBtn.addEventListener("click", hideStopwatch);
}

// 드래그 가능하게 만들기
function makeDraggable() {
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  // 전체 타이머 요소에 드래그 이벤트 추가
  stopwatchElement.addEventListener("mousedown", dragStart);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", dragEnd);

  function dragStart(e) {
    // 버튼들(시작, 일시정지, 리셋, 닫기)은 드래그 영역에서 제외
    if (
      e.target.classList.contains("timer-close") ||
      e.target.classList.contains("timer-start") ||
      e.target.classList.contains("timer-pause") ||
      e.target.classList.contains("timer-reset")
    ) {
      return;
    }

    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    isDragging = true;
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, stopwatchElement);
    }
  }

  function dragEnd() {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }
}

// 타이머 시작
async function startTimer() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "TIMER_START",
    });

    if (response.success) {
      timerState = response.state;
      updateTimerDisplay();
      updateTimerControls();
      startTimerDisplay();
    }
  } catch (error) {
    console.error("타이머 시작 실패:", error);
  }
}

// 타이머 일시정지
async function pauseTimer() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "TIMER_PAUSE",
    });

    if (response.success) {
      timerState = response.state;
      updateTimerDisplay();
      updateTimerControls();
      startTimerDisplay();
    }
  } catch (error) {
    console.error("타이머 일시정지 실패:", error);
  }
}

// 타이머 리셋
async function resetTimer() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "TIMER_RESET",
    });

    if (response.success) {
      timerState = response.state;
      updateTimerDisplay();
      updateTimerControls();
      startTimerDisplay();
    }
  } catch (error) {
    console.error("타이머 리셋 실패:", error);
  }
}

// 타이머 표시 업데이트 (백그라운드 상태에서 계산)
function updateTimerDisplay() {
  const now = Date.now();
  let currentElapsed = timerState.accumulatedMs;

  if (timerState.status === "running" && timerState.startedAt) {
    currentElapsed += now - timerState.startedAt;
  }

  const formattedTime = formatTimerTime(currentElapsed);

  const timerDisplayElement = document.getElementById("timer-display");
  if (timerDisplayElement) {
    timerDisplayElement.textContent = formattedTime;
  }

  // 라벨 표시
  const timerLabelElement = document.getElementById("timer-label");
  if (timerLabelElement) {
    if (timerState.label) {
      timerLabelElement.textContent = timerState.label;
      timerLabelElement.style.display = "block";
    } else {
      timerLabelElement.style.display = "none";
    }
  }
}

// 타이머 컨트롤 버튼 상태 업데이트
function updateTimerControls() {
  const startBtn = document.getElementById("timer-start");
  const pauseBtn = document.getElementById("timer-pause");

  if (timerState.status === "running") {
    if (startBtn) startBtn.style.display = "none";
    if (pauseBtn) pauseBtn.style.display = "inline-block";
  } else {
    if (startBtn) startBtn.style.display = "inline-block";
    if (pauseBtn) pauseBtn.style.display = "none";
  }
}

// 타이머 표시 업데이트 시작 (렌더링만 담당)
function startTimerDisplay() {
  if (timerDisplayInterval) {
    clearInterval(timerDisplayInterval);
  }

  // 다음 초 경계에 맞춰 업데이트 시작
  const now = Date.now();
  const nextSecond = Math.ceil(now / 1000) * 1000;
  const delay = nextSecond - now;

  setTimeout(() => {
    updateTimerDisplay();

    // 1초마다 업데이트 (시각적 일관성을 위해)
    timerDisplayInterval = setInterval(() => {
      updateTimerDisplay();
    }, 1000);
  }, delay);
}

// 현재 시간 업데이트
function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const currentTimeElement = document.getElementById("current-time");
  if (currentTimeElement) {
    currentTimeElement.textContent = timeString;
  }
}

// 현재 시간 업데이트 인터벌
let currentTimeInterval = null;

// 스톱워치 표시
async function showStopwatch() {
  if (!stopwatchElement) {
    createStopwatch();
  }
  stopwatchElement.style.display = "block";

  // 현재 시간 업데이트 시작
  updateCurrentTime();
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval);
  }
  currentTimeInterval = setInterval(updateCurrentTime, 1000);

  // 타이머 상태 초기화
  await initializeTimer();
}

// 타이머 초기화
async function initializeTimer() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "TIMER_GET" });
    if (response.success) {
      timerState = response.state;
      updateTimerDisplay();
      updateTimerControls();
      startTimerDisplay();
    }
  } catch (error) {
    console.error("타이머 초기화 실패:", error);
  }
}

// 스톱워치 숨기기
function hideStopwatch() {
  if (stopwatchElement) {
    stopwatchElement.style.display = "none";

    // 타이머 표시 업데이트 중지
    if (timerDisplayInterval) {
      clearInterval(timerDisplayInterval);
      timerDisplayInterval = null;
    }

    // 현재 시간 업데이트 중지
    if (currentTimeInterval) {
      clearInterval(currentTimeInterval);
      currentTimeInterval = null;
    }
  }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleStopwatch") {
    if (request.enabled) {
      showStopwatch();
    } else {
      hideStopwatch();
    }
    sendResponse({ success: true });
  } else if (request.action === "TIMER_STATE_UPDATE") {
    debug.timer("백그라운드에서 타이머 상태 업데이트 수신:", request.state);
    timerState = request.state;
    updateTimerDisplay();
    updateTimerControls();
    startTimerDisplay();
  } else if (request.action === "LANGUAGE_CHANGED") {
    // 언어 설정 변경 시 버튼 텍스트 업데이트
    updateButtonTexts();
    sendResponse({ success: true });
  }
});

// 스토리지 변경 리스너
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.timerState) {
    debug.timer("타이머 상태 변경 감지 (content script)");
    timerState = changes.timerState.newValue;
    updateTimerDisplay();
    updateTimerControls();
    startTimerDisplay();
  }
});

// 초기 상태 확인
chrome.storage.local.get(["isStopwatchEnabled"]).then(result => {
  if (result.isStopwatchEnabled) {
    showStopwatch();
  }
});
