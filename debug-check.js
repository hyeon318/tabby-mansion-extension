// TabbyMansion 디버깅 도구
// 개발자 도구 콘솔에서 실행하세요

console.log("🔍 TabbyMansion 디버깅 시작...");

// 현재 저장된 모든 데이터 확인
chrome.storage.local.get(null, result => {
  console.log("📊 전체 저장 데이터:", result);

  console.log("\n🎯 탭 트래커 상태:", result.isTabTrackerEnabled);
  console.log("⏱️ 스톱워치 상태:", result.isStopwatchEnabled);

  if (result.tabLogs) {
    console.log(`📝 총 로그 수: ${result.tabLogs.length}`);

    if (result.tabLogs.length > 0) {
      console.log("📋 최근 5개 로그:");
      result.tabLogs.slice(-5).forEach((log, index) => {
        console.log(
          `  ${index + 1}. ${log.domain} - ${log.title.substring(0, 30)} (${
            log.timeFormatted
          })`
        );
      });

      console.log("\n📈 도메인별 로그 수:");
      const domainCounts = {};
      result.tabLogs.forEach(log => {
        domainCounts[log.domain] = (domainCounts[log.domain] || 0) + 1;
      });
      Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([domain, count]) => {
          console.log(`  ${domain}: ${count}개`);
        });

      // 실제 사용 시간 분석
      console.log("\n⏰ 실제 사용 시간 분석:");
      const timeAnalysis = result.tabLogs.filter(
        log => log.actualTime !== null && log.actualTime !== undefined
      );
      if (timeAnalysis.length > 0) {
        const totalActualTime = timeAnalysis.reduce(
          (sum, log) => sum + (log.actualTime || 0),
          0
        );
        const avgActualTime = totalActualTime / timeAnalysis.length;
        console.log(
          `  총 실제 사용 시간: ${Math.round(totalActualTime / 1000)}초`
        );
        console.log(
          `  평균 실제 사용 시간: ${Math.round(avgActualTime / 1000)}초`
        );
        console.log(`  실제 시간이 기록된 로그: ${timeAnalysis.length}개`);

        // 비정상적으로 긴 시간 로그 확인
        const longTimeLogs = timeAnalysis.filter(
          log => log.actualTime > 60 * 60 * 1000
        ); // 1시간 이상
        if (longTimeLogs.length > 0) {
          console.log(`  ⚠️ 1시간 이상 사용된 로그: ${longTimeLogs.length}개`);
          longTimeLogs.slice(0, 3).forEach(log => {
            console.log(
              `    - ${log.domain}: ${Math.round(log.actualTime / 1000)}초`
            );
          });
        }
      } else {
        console.log("  ❌ 실제 사용 시간이 기록된 로그가 없습니다!");
      }
    } else {
      console.log("❌ 저장된 로그가 없습니다!");
    }
  } else {
    console.log("❌ tabLogs 데이터가 없습니다!");
  }

  console.log("\n💡 디버깅 팁:");
  console.log("1. 탭 트래커가 활성화되어 있는지 확인하세요");
  console.log(
    "2. 브라우저 개발자 도구 > Application > Storage > Extension에서 데이터 확인"
  );
  console.log(
    "3. Background 콘솔에서 로그 메시지 확인 (chrome://extensions > 개발자 모드 > 백그라운드 페이지)"
  );
  console.log("4. 다른 탭으로 이동해보고 다시 확인");
  console.log("5. 데이터 복구가 필요한 경우: TabbyMansion.recoverData() 실행");
});

// 데이터 복구 함수
window.TabbyMansion = window.TabbyMansion || {};

// 데이터 복구 기능
window.TabbyMansion.recoverData = async function () {
  console.log("🔄 데이터 복구 시작...");

  try {
    // 현재 데이터 백업
    const currentData = await chrome.storage.local.get(null);
    console.log("📦 현재 데이터 백업 완료");

    // 탭 트래커 재활성화
    await chrome.storage.local.set({ isTabTrackerEnabled: true });
    console.log("✅ 탭 트래커 재활성화");

    // 타이머 상태 초기화
    await chrome.storage.local.set({
      timerState: {
        status: "paused",
        startedAt: null,
        accumulatedMs: 0,
        label: "",
        lastSaveTime: null,
      },
    });
    console.log("✅ 타이머 상태 초기화");

    // 백그라운드에 탭 트래커 상태 업데이트 요청
    await chrome.runtime.sendMessage({
      action: "updateTabTracker",
      enabled: true,
    });
    console.log("✅ 백그라운드 탭 트래커 상태 업데이트");

    console.log("🎉 데이터 복구 완료!");
    console.log(
      "💡 이제 탭을 이동해보고 데이터가 정상적으로 기록되는지 확인하세요."
    );

    return true;
  } catch (error) {
    console.error("❌ 데이터 복구 실패:", error);
    return false;
  }
};

// 데이터 진단 기능
window.TabbyMansion.diagnoseData = async function () {
  console.log("🔍 데이터 진단 시작...");

  try {
    const data = await chrome.storage.local.get(null);

    const issues = [];

    // 탭 트래커 상태 확인
    if (!data.isTabTrackerEnabled) {
      issues.push("탭 트래커가 비활성화되어 있습니다");
    }

    // 로그 데이터 확인
    if (!data.tabLogs || data.tabLogs.length === 0) {
      issues.push("탭 로그 데이터가 없습니다");
    } else {
      // 실제 사용 시간이 없는 로그 확인
      const logsWithoutActualTime = data.tabLogs.filter(
        log => log.actualTime === null || log.actualTime === undefined
      );
      if (logsWithoutActualTime.length > 0) {
        issues.push(
          `${logsWithoutActualTime.length}개의 로그에 실제 사용 시간이 기록되지 않았습니다`
        );
      }

      // 비정상적으로 긴 시간 로그 확인
      const longTimeLogs = data.tabLogs.filter(
        log => log.actualTime && log.actualTime > 60 * 60 * 1000
      );
      if (longTimeLogs.length > 0) {
        issues.push(
          `${longTimeLogs.length}개의 로그가 1시간 이상으로 비정상적으로 긴 시간을 기록했습니다`
        );
      }
    }

    if (issues.length === 0) {
      console.log("✅ 데이터 상태가 정상입니다!");
    } else {
      console.log("⚠️ 발견된 문제들:");
      issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
      console.log("\n💡 해결 방법: TabbyMansion.recoverData() 실행");
    }

    return issues;
  } catch (error) {
    console.error("❌ 데이터 진단 실패:", error);
    return ["진단 중 오류 발생"];
  }
};

// 실시간 상태 모니터링
setInterval(() => {
  chrome.storage.local.get(["isTabTrackerEnabled", "tabLogs"], result => {
    const logCount = result.tabLogs ? result.tabLogs.length : 0;
    console.log(
      `📊 실시간 상태 - 트래커: ${result.isTabTrackerEnabled}, 로그: ${logCount}개`
    );
  });
}, 30000); // 30초마다

console.log("\n🚀 추가 기능:");
console.log("- TabbyMansion.recoverData(): 데이터 복구");
console.log("- TabbyMansion.diagnoseData(): 데이터 진단");
