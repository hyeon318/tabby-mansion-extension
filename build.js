const fs = require("fs-extra");
const path = require("path");

// 환경 정보
const buildEnv = process.env.NODE_ENV || "development";
const buildTime = new Date().toISOString();

async function copyFiles() {
  const distPath = path.join(__dirname, "dist");

  try {
    // dist 폴더가 없으면 생성
    await fs.ensureDir(distPath);

    // HTML 파일들 복사
    await fs.copy("popup.html", path.join(distPath, "popup.html"));
    await fs.copy("stats.html", path.join(distPath, "stats.html"));

    // CSS 파일들 복사
    await fs.copy("common.css", path.join(distPath, "common.css"));
    await fs.copy("popup.css", path.join(distPath, "popup.css"));
    await fs.copy("stats.css", path.join(distPath, "stats.css"));
    await fs.copy("style.css", path.join(distPath, "style.css"));

    // 매니페스트 파일 복사
    await fs.copy("manifest.json", path.join(distPath, "manifest.json"));

    // 이미지 폴더 복사
    await fs.copy("public/images", path.join(distPath, "images"));

    // background.js와 content.js가 webpack으로 번들되지 않았다면 복사
    if (!fs.existsSync(path.join(distPath, "background.js"))) {
      await fs.copy("background.js", path.join(distPath, "background.js"));
    }
    if (!fs.existsSync(path.join(distPath, "content.js"))) {
      await fs.copy("content.js", path.join(distPath, "content.js"));
    }

    // 빌드 정보 파일 생성
    const buildInfo = {
      environment: buildEnv,
      buildTime: buildTime,
      version: require("./package.json").version,
      features: {
        logging: buildEnv === "test" || buildEnv === "development",
        sourceMap: buildEnv !== "production",
        minified: buildEnv === "production" || buildEnv === "test",
      },
    };

    await fs.writeJSON(path.join(distPath, "build-info.json"), buildInfo, {
      spaces: 2,
    });

    console.log(`✅ 빌드 완료! 환경: ${buildEnv}`);
    console.log(` 빌드 시간: ${buildTime}`);
    console.log(` 빌드 설정:`, buildInfo.features);

    // 파일 크기 정보 출력
    const files = await fs.readdir(distPath);
    let totalSize = 0;

    console.log("\n📁 빌드된 파일들:");
    for (const file of files) {
      const filePath = path.join(distPath, file);
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        const sizeKB = (stats.size / 1024).toFixed(2);
        console.log(`   ${file}: ${sizeKB}KB`);
        totalSize += stats.size;
      }
    }

    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`\n📊 총 크기: ${totalSizeMB}MB`);

    // 환경별 안내 메시지
    if (buildEnv === "test") {
      console.log("\n🧪 테스트 빌드 완료!");
      console.log("   - 로깅이 활성화되어 있습니다");
      console.log("   - Chrome 개발자 도구에서 로그를 확인할 수 있습니다");
      console.log("   - 디버깅에 적합한 빌드입니다");
    } else if (buildEnv === "production") {
      console.log("\n🚀 프로덕션 빌드 완료!");
      console.log("   - 로깅이 비활성화되어 있습니다");
      console.log("   - 최적화된 성능의 빌드입니다");
      console.log("   - 배포에 적합한 빌드입니다");
    }
  } catch (error) {
    console.error("❌ 파일 복사 중 오류:", error);
  }
}

// 스크립트 실행
copyFiles();
