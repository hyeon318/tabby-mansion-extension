# 최종 dist 폴더 구조 예시

```
dist/
├── popup.js              # 번들된 popup 스크립트 (압축됨)
├── stats.js              # 번들된 stats 스크립트 (압축됨)
├── background.js         # 번들된 background 스크립트 (압축됨)
├── content.js            # 번들된 content 스크립트 (압축됨)
├── vendors.js            # 공통 라이브러리 (date-fns, chart.js 등)
├── popup.html            # popup HTML (vendor 스크립트 참조 제거됨)
├── stats.html            # stats HTML (vendor 스크립트 참조 제거됨)
├── manifest.json         # 매니페스트 파일
├── popup.css             # popup 스타일
├── stats.css             # stats 스타일
├── common.css            # 공통 스타일
└── images/               # 아이콘 이미지들
    ├── icon16.png
    ├── icon48.png
    ├── icon128.png
    ├── normal.png
    └── wink.png
```

## 파일 크기 예상 (최적화 후)

- `popup.js`: ~50-80KB (기존 977줄 → 압축 + 트리셰이킹)
- `stats.js`: ~100-150KB (기존 1921줄 → 압축 + 트리셰이킹)
- `vendors.js`: ~200-300KB (date-fns + chart.js 부분 import)
- 전체 크기: ~360-550KB (기존 62.9MB 대비 99%+ 감소)

## 제외된 파일들

- `node_modules/` (전체 제외)
- `vendor/` (UMD 번들 제거)
- `src/` (번들 소스 제거)
- `test-*.html` (개발용 파일)
- `*.backup` (백업 파일)
- `webpack.config.js` (빌드 설정)
- `package.json` (개발 의존성)
- `README.md` (문서)
