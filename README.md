# mcp-crawler

뉴스/매거진 크롤러 (요즘IT, AI타임스, Rundown AI → Supabase)

## 실행 방법

### 1) 배치 파일로 실행 (권장)

- **`run-crawler.bat`** 더블클릭 또는 터미널에서 실행  
- Node.js가 설치된 PC에서 바로 사용 가능  
- 실행 전 `npm install` 한 번, `.env`에 Supabase URL/KEY 설정 필요  

### 2) 매일 한 번 자동 실행 (작업 스케줄러)

1. **`setup-daily-task.bat`**를 **관리자 권한**으로 실행  
2. 작업 스케줄러에 "MCP-Crawler-Daily"가 등록되고, **매일 오전 9시**에 `run-crawler-scheduled.bat`이 실행됨  
3. 실행 시간 변경: Windows **작업 스케줄러** → 해당 작업 더블클릭 → **트리거** 탭에서 시간 수정  

수동으로 작업 만들기:

- 프로그램: `D:\workspace_2\mcp-crawler\run-crawler-scheduled.bat` (실제 경로로 변경)
- 트리거: 매일, 원하는 시간
- 시작 위치(선택): `D:\workspace_2\mcp-crawler`

### 3) EXE 실행 파일로 만들기 (선택)

이 프로젝트는 Puppeteer(Chromium)를 사용해 EXE 하나로 묶으면 용량이 매우 커집니다.  

- **일반적인 사용**: 위의 **배치 파일 + Node 설치**로 실행하는 방식을 권장합니다.  
- EXE가 꼭 필요하면: [pkg](https://github.com/vercel/pkg), [nexe](https://github.com/nexe/nexe) 등으로 패키징할 수 있으나, Chromium 경로 설정 등 추가 작업이 필요합니다.  

배치 파일만으로도 “실행 프로그램을 배치로 돌린다”는 목적은 충족됩니다.