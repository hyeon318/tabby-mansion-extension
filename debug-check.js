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
});

// 실시간 상태 모니터링
setInterval(() => {
  chrome.storage.local.get(["tabLogs"], result => {
    if (result.tabLogs) {
      console.log(
        `🔄 [${new Date().toLocaleTimeString()}] 현재 로그 수: ${
          result.tabLogs.length
        }`
      );
    }
  });
}, 5000); // 5초마다 확인

console.log("✅ 디버깅 도구 실행 완료. 위의 로그를 확인하세요!");
