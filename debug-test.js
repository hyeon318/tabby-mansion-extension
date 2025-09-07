// TabbyMansion 현재 상태 진단 스크립트
// Chrome Extension 콘솔에서 실행하세요

console.log("🔍 TabbyMansion 현재 상태 진단 시작...");

// 1. 현재 저장된 모든 데이터 확인
chrome.storage.local.get(null, async result => {
  console.log("📊 전체 저장 데이터:", result);

  // 2. 탭 트래커 상태 확인
  console.log("\n🎯 탭 트래커 활성화 상태:", result.isTabTrackerEnabled);

  // 3. tabLogs 구조 확인
  console.log("\n📝 tabLogs 구조 분석:");
  if (!result.tabLogs) {
    console.log("❌ tabLogs가 존재하지 않습니다!");
  } else if (
    typeof result.tabLogs === "object" &&
    !Array.isArray(result.tabLogs)
  ) {
    console.log("✅ 새로운 구조 (객체) 감지");
    console.log("📅 저장된 날짜:", Object.keys(result.tabLogs));

    let totalLogs = 0;
    Object.entries(result.tabLogs).forEach(([date, logs]) => {
      console.log(`  ${date}: ${logs.length}개 로그`);
      totalLogs += logs.length;
    });
    console.log(`📝 총 로그 수: ${totalLogs}개`);

    // 최근 로그 확인
    if (totalLogs > 0) {
      const allLogs = [];
      Object.values(result.tabLogs).forEach(logs => allLogs.push(...logs));
      allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      console.log("\n📋 최근 3개 로그:");
      allLogs.slice(-3).forEach((log, index) => {
        console.log(
          `  ${index + 1}. ${log.domain} - ${log.title.substring(0, 30)} (${
            log.timestamp
          })`
        );
      });
    }
  } else if (Array.isArray(result.tabLogs)) {
    console.log("⚠️ 이전 구조 (배열) 감지 - 마이그레이션 필요");
    console.log(`📝 로그 수: ${result.tabLogs.length}개`);

    // 배열 구조를 객체 구조로 변환
    console.log("\n🔄 tabLogs 구조를 객체로 변환 중...");
    const newTabLogs = {};
    result.tabLogs.forEach(log => {
      const date = new Date(log.timestamp);
      const dayKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      if (!newTabLogs[dayKey]) {
        newTabLogs[dayKey] = [];
      }
      newTabLogs[dayKey].push(log);
    });

    chrome.storage.local.set({ tabLogs: newTabLogs }, () => {
      console.log("✅ tabLogs 구조 변환 완료");
      console.log("📅 변환된 날짜:", Object.keys(newTabLogs));
    });
  } else {
    console.log("❓ 알 수 없는 tabLogs 구조:", typeof result.tabLogs);
  }

  // 4. 백그라운드 스크립트와 통신 테스트
  console.log("\n🔗 백그라운드 스크립트 통신 테스트:");
  try {
    const response = await chrome.runtime.sendMessage({
      action: "TIMER_GET",
    });
    console.log("✅ 백그라운드 통신 성공:", response);
  } catch (error) {
    console.log("❌ 백그라운드 통신 실패:", error);
  }

  // 5. tabLogs 구조 초기화 (문제 해결용)
  console.log("\n🛠️ 문제 해결 도구:");
  console.log("다음 코드를 실행하여 tabLogs 구조를 초기화할 수 있습니다:");
  console.log(`
// tabLogs를 올바른 객체 구조로 초기화
chrome.storage.local.set({ tabLogs: {} }, () => {
  console.log("✅ tabLogs 구조 초기화 완료");
});
  `);
});

// 6. 실시간 테스트 함수
window.TabbyMansionTest = {
  // tabLogs 상태 조회
  async getTabLogsStatus() {
    console.log("\n🔍 tabLogs 상태 조회 중...");
    try {
      const response = await chrome.runtime.sendMessage({
        action: "DEBUG_GET_TABLOGS",
      });

      if (response.success) {
        console.log("✅ tabLogs 상태:", response.stats);
        console.log("📊 전체 tabLogs 데이터:", response.tabLogs);
        return response;
      } else {
        console.log("❌ tabLogs 조회 실패:", response.error);
        return null;
      }
    } catch (error) {
      console.log("❌ 백그라운드 통신 실패:", error);
      return null;
    }
  },

  // 현재 탭 강제 로그 추가
  async forceLogCurrentTab() {
    console.log("\n🔧 현재 탭 강제 로그 추가 중...");
    try {
      const response = await chrome.runtime.sendMessage({
        action: "DEBUG_FORCE_LOG_CURRENT_TAB",
      });

      if (response.success) {
        console.log("✅", response.message);
        // 바로 상태 조회해서 결과 확인
        setTimeout(() => this.getTabLogsStatus(), 500);
        return true;
      } else {
        console.log("❌ 강제 로그 실패:", response.message || response.error);
        return false;
      }
    } catch (error) {
      console.log("❌ 백그라운드 통신 실패:", error);
      return false;
    }
  },

  // tabLogs 구조 초기화
  async resetTabLogs() {
    console.log("\n🔄 tabLogs 구조 초기화 중...");
    try {
      await chrome.storage.local.set({ tabLogs: {} });
      console.log("✅ tabLogs 초기화 완료");
      return true;
    } catch (error) {
      console.log("❌ tabLogs 초기화 실패:", error);
      return false;
    }
  },

  // 전체 테스트 실행
  async runFullTest() {
    console.log("\n🧪 TabbyMansion tabLogs 전체 테스트 시작");
    console.log("=".repeat(50));

    // 1. 현재 상태 확인
    const currentStatus = await this.getTabLogsStatus();

    // 2. 현재 탭 강제 로그 추가
    await this.forceLogCurrentTab();

    // 3. 다시 상태 확인
    await new Promise(resolve => setTimeout(resolve, 1000));
    const afterStatus = await this.getTabLogsStatus();

    // 결과 비교
    if (currentStatus && afterStatus) {
      const logCountBefore = currentStatus.stats.totalLogs;
      const logCountAfter = afterStatus.stats.totalLogs;

      console.log("\n📊 테스트 결과:");
      console.log(`로그 수 변화: ${logCountBefore} → ${logCountAfter}`);

      if (logCountAfter > logCountBefore) {
        console.log("✅ tabLogs 저장이 정상적으로 작동합니다!");
      } else {
        console.log("❌ tabLogs 저장에 문제가 있을 수 있습니다.");
        console.log("💡 다음을 확인해보세요:");
        console.log("   1. 탭 트래커가 활성화되어 있는지");
        console.log("   2. 현재 탭이 추적 가능한 URL인지 (chrome:// 등 제외)");
        console.log("   3. Service Worker가 정상 작동하는지");
      }
    }

    console.log("=".repeat(50));
    console.log("🧪 전체 테스트 완료");
  },

  // 미완료 로그 강제 완료
  async completeAllLogs() {
    console.log("\n🔧 미완료 로그 강제 완료 중...");
    try {
      const response = await chrome.runtime.sendMessage({
        action: "DEBUG_COMPLETE_ALL_LOGS",
      });

      if (response.success) {
        console.log("✅", response.message);
        // 완료 후 상태 조회
        setTimeout(() => this.getTabLogsStatus(), 500);
        return true;
      } else {
        console.log("❌ 강제 완료 실패:", response.message || response.error);
        return false;
      }
    } catch (error) {
      console.log("❌ 백그라운드 통신 실패:", error);
      return false;
    }
  },
};

// 자동 실행 메뉴
console.log("\n🛠️ TabbyMansion Debug Tools");
console.log("다음 명령어들을 사용할 수 있습니다:");
console.log("• TabbyMansionTest.getTabLogsStatus() - 현재 상태 조회");
console.log("• TabbyMansionTest.forceLogCurrentTab() - 현재 탭 강제 로그");
console.log("• TabbyMansionTest.resetTabLogs() - tabLogs 초기화");
console.log("• TabbyMansionTest.completeAllLogs() - 미완료 로그 강제 완료");
console.log("• TabbyMansionTest.runFullTest() - 전체 테스트 실행");
console.log("\n💡 추천 워크플로우:");
console.log("1. TabbyMansionTest.getTabLogsStatus() - 현재 상태 확인");
console.log("2. 다른 탭으로 전환해보기 (네이버 → 구글 → 유튜브 등)");
console.log("3. TabbyMansionTest.getTabLogsStatus() - 로그 추가 확인");
console.log("4. actualTime이 null이면 TabbyMansionTest.completeAllLogs() 실행");
console.log("\n예시: TabbyMansionTest.runFullTest() 을 실행해보세요!");
