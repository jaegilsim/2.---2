# LESSON 03 — 변경 전 기준

기준 확인일: 2026-11-26 (KST)  
목적: 2강에서 완성한 견적 관리 프로젝트를 변경하기 전에 현재 앱, 데이터, Git 및 검사 상태를 기록한다.

## 확인한 파일과 실행 구조

- [`package.json`](./package.json): 프로젝트는 비공개 Node.js 앱이며 `start` 명령만 정의한다. 실행 명령은 `node server.js`; 런타임 의존성은 `exceljs`, `nodemailer`, `dotenv`이다.
- [`server.js`](./server.js): Node 기본 HTTP 서버가 `127.0.0.1:3000`에 바인딩된다. 기준정보는 ExcelJS로 읽고, 견적 및 메일 미리보기 저장은 JSON/EML 파일로 처리한다.
- [`public/materials.html`](./public/materials.html): 견적 입력, 저장 목록, 재질 기준정보와 품목·거래처 검색, 삭제 확인, 메일 미리보기 대화상자 구조를 제공한다.
- [`public/materials.css`](./public/materials.css): 화면과 대화상자 스타일 및 좁은 화면용 반응형 스타일을 제공한다.
- [`public/materials.js`](./public/materials.js): 화면 입력·검색·계산·초안 복원·저장·삭제·메일 호출을 처리한다.
- 서버는 HTML과 `/materials.css`, `/materials.js`만 명시적으로 제공한다. 엑셀 파일은 HTTP 정적 파일로 노출하지 않는다.

## 기능 연결 기준

| 사용자 동작 | 브라우저 동작 | 서버/API 및 저장 |
|---|---|---|
| 재질 목록·검색 | 재질 목록 조회, 표 필터링, 계산용 밀도 표시 | `GET /api/materials`; 활성 재질 기준정보를 엑셀에서 읽음 |
| 품목 팝업 | 검색 후 `선택`할 때만 적용; 취소·닫기는 기존 선택 유지 | `GET /api/items?q=검색어`; 활성 품목의 코드·품목명·규격 검색 |
| 거래처 팝업 | 검색 후 `선택`할 때만 적용; 취소·닫기는 기존 선택 유지 | `GET /api/customers?q=검색어`; 활성 거래처의 코드·이름·담당자 검색 |
| 중량 계산 | 입력값 변경 시 실시간 계산; 부피는 양수, 수량은 양의 정수 | 개당 kg = `부피(cm³) × 계산용밀도(g/cm³) ÷ 1000`; 총중량은 반올림 전 개당 중량에 수량을 곱함. 화면 표시는 최대 소수점 4자리 |
| 초안·요청 ID | `localStorage`의 `quote-order-draft-v1`에 입력 초안과 UUID 요청 ID를 보관·복원 | 별도 API 호출 없이 브라우저에 보관 |
| 견적 저장·목록 | 필수 선택과 입력을 확인한 뒤 저장하고 목록 재조회 | `POST /api/orders`가 활성 기준정보와 최신 밀도를 다시 검증하고 중량을 계산. UUID 중복 요청은 중복 행을 만들지 않음. `GET /api/orders`가 저장 목록 반환 |
| 견적 삭제 | 요청 ID를 표시한 확인 대화상자에서 확정 후 목록 재조회 | `DELETE /api/orders/:id`; 엑셀 행 번호가 아닌 UUID로 `storage/orders.json`에서 삭제 |
| 메일 미리보기 | 저장 기록 기반 제목·본문을 조회하고 수신자 한 명을 입력 | `GET /api/orders/:id/mail-preview`; `.eml` 생성은 `POST /api/mail-previews`, 파일 다운로드는 `GET /api/mail-previews/quote-<요청ID>.eml`. 미리보기 생성은 실제 발송이 아님 |
| 실제 메일 | 실제 발송 전 확인 대화상자 표시 | `POST /api/mail`; 저장 기록과 본문을 대조하고 루트 `.env`의 SMTP 설정 사용. 요청 ID로 중복 발송을 막고 결과가 불확실하면 재전송을 잠금 |

## 변경 전 Git 및 저장 데이터

- Git 브랜치: `main`
- 기준 커밋: `56fbbc4` (`second issue`); 직전 커밋은 `999ee96` (`first issue`)
- 노트 작성 직전 `git status --short --branch`: `## main`만 표시되어 작업 트리는 깨끗했다.
- 기준 노트는 새 파일이다. 현재는 `.gitignore` 수정, `excel/user.xlsx`와 `storage/orders.json`의 인덱스 제거(삭제 staged), 이 노트가 변경 상태로 표시된다. 두 데이터 파일의 로컬 사본은 보존되어 있다.
- 루트 `.env`는 Git에서 제외되는 것을 `git check-ignore`로 확인했다. 인덱스에 없고, 현재 브랜치의 커밋 이력 검색에서도 찾지 못했다. 비밀값은 출력하거나 노트에 복사하지 않았다.

### Excel 시트 구조와 기준 레코드 수

레코드 수는 각 업무 시트에서 헤더를 제외하고 첫 번째 식별 열에 값이 있는 행 기준이다. `사용안내` 시트는 업무 레코드 수에 포함하지 않았다.

| 파일 | 업무 시트 | 헤더(열 순서) | 전체 행 | 활성/비활성 |
|---|---|---|---:|---:|
| [`excel/거래처내역.xlsx`](./excel/거래처내역.xlsx) | `거래처` | 거래처코드, 거래처명, 담당자, 이메일, 전화번호, 사용여부 | 8 | Y 7 / N 1 |
| [`excel/품목내역.xlsx`](./excel/품목내역.xlsx) | `품목` | 품목코드, 품목명, 규격, 단위, 사용여부 | 8 | Y 7 / N 1 |
| [`excel/재질정보.xlsx`](./excel/재질정보.xlsx) | `재질` | 재질코드, 재질명, 계산용밀도_g_cm3, 사용여부, 비고 | 7 | Y 6 / N 1 |
| [`excel/주문내역.xlsx`](./excel/주문내역.xlsx) | `주문` | 요청ID, 접수일시, 거래처코드, 거래처명, 담당자, 품목코드, 품목명, 규격, 재질코드, 재질명, 적용밀도_g_cm3, 개당부피_cm3, 수량, 개당중량_kg, 총중량_kg | 0 | 해당 없음 |

- 주문 양식은 읽기 기준이며 현재 주문 업무 레코드는 0건이다. API 견적은 이 엑셀 파일에 쓰지 않는다.
- 저장소 [`storage/orders.json`](./storage/orders.json)에는 별도 견적 기록 1건이 있다. 해당 기록의 상세 내용은 이 기준 노트에 복사하지 않았다.
- `storage/mail-previews/`의 `.eml`은 0개이며 `storage/mail-deliveries.json`은 아직 없다.
- 보조 파일 [`excel/user.xlsx`](./excel/user.xlsx)의 `users` 시트는 `id`, `password_hash`, `name`, `active` 열과 2개 데이터 행을 가진다. 현재 서버의 업무 엑셀 목록에는 포함되지 않는다. 사용자 식별자나 해시 값은 출력하거나 기록하지 않았다.
- 각 업무 통합 문서에 `사용안내` 시트가 있다. 통합 문서나 셀 값은 이번 작업에서 수정하지 않았다.

## 기존 명령 및 실제 검사 결과

- `npm run`에서 확인한 프로젝트 스크립트: `start`만 있음 (`node server.js`). `test`, lint, build 스크립트는 정의되어 있지 않다.
- 통과: `node --check server.js`
- 통과: `node --check public/materials.js`
- 통과: ExcelJS로 확인된 업무 통합 문서 읽기와 시트·헤더·레코드 집계
- 로컬 GET 스모크 검사: 임시로 서버를 시작하고 검사가 끝난 뒤 종료했다. 아래 요청은 모두 HTTP `200`이었다.
  - `/api/health`: `status=ok`; 거래처 8, 품목 8, 재질 7, 주문 엑셀 0
  - `/api/materials`: 활성 재질 6
  - `/api/items?q=`: 활성 품목 7
  - `/api/customers?q=`: 활성 거래처 7
  - `/api/orders`: 별도 JSON 견적 기록 1
  - `/`, `/materials`, `/materials.js`, `/materials.css`
- 검사 목적으로 GET만 실행했다. `POST /api/orders`, `DELETE`, `.eml` 생성, SMTP 발송은 저장 데이터를 보존하기 위해 실행하지 않았다. SMTP를 통한 실제 발송은 하지 않았다.
- 이번 기준 확인에서는 코드·엑셀·JSON 파일의 내용을 수정하지 않았다. (기준 노트와 `.gitignore` 제외)

## 브라우저에서 직접 확인할 항목

아래는 자동 검사로 확인하지 않은 화면 동작이다. 로컬 서버를 `npm start`로 실행한 뒤 `http://127.0.0.1:3000/materials`에서 확인한다. 브라우저 확인은 실제 저장소를 변경할 수 있으므로 필요한 경우 임시/시크릿 브라우저 프로필을 사용한다.

1. 페이지가 오류 없이 열리고 재질 목록, 활성 개수, 저장 견적 1건이 표시되는지 확인한다.
2. 품목·거래처 팝업에서 검색 결과와 `선택`을 확인한다. 선택하지 않고 취소·닫기 했을 때 기존 선택이 유지되는지 확인한다.
3. 활성 재질과 입력값으로 실시간 계산을 확인한다. 부피 0 또는 음수, 수량 0 또는 소수 입력 시 오류 안내가 나오고 결과가 비워지는지 확인한다.
4. 새로고침 후 초안이 복원되는 동작은 임시/시크릿 프로필에서 확인한다. 기존 브라우저 초안을 덮어쓰지 않도록 한다.
5. 기존 견적 행의 메일 미리보기 대화상자와 저장 기록 기반 본문을 확인할 수 있다. `.eml` 생성은 파일을 추가하므로 기준 데이터 보존 검사의 일부로 실행하지 않는다.
6. 견적 저장과 삭제 확인은 `storage/orders.json`을 변경한다. 원본 기준 상태를 유지해야 한다면 저장 및 삭제 확정 버튼을 누르지 않는다. SMTP 발송 버튼은 실제 외부 수신자에게 메일을 보낼 수 있으므로 의도적으로 확인·승인한 경우 외에는 누르지 않는다.

## GitHub 게시 전 추적 파일 점검

2026-11-26 점검 결과:

- 현재 브랜치는 `main`이며 원격(remote)과 upstream은 설정되어 있지 않다. `private_data/user.xlsx` 경로의 파일은 없고, `.env`는 무추적이며 제외 규칙에 포함되어 있다.
- `excel/user.xlsx`와 `storage/orders.json`은 추적 파일이었다. 첫 파일의 시트 헤더에 `password_hash`가 있고, 두 번째에는 저장 견적 1건이 있다. `excel/user.xlsx`는 현재 서버에서 참조하지 않는다. `storage/orders.json`은 앱의 운영 저장 데이터이므로 로컬 사본은 유지하고 Git 게시 대상에서만 제외한다.
- 이 두 파일은 로컬에서 보존한 채 Git 인덱스에서 제거했고, 삭제가 staged 상태다. 제거 변경을 커밋해야 새 기준으로 Git 추적에서 빠진다. 아래 `.gitignore` 규칙도 추가했다.
- 거래처·품목·재질·주문 업무 통합 문서 4개도 추적 중이다. 프로젝트 안내는 이를 교육용 샘플로 규정하지만, 거래처 통합 문서에는 이메일·전화번호 열이 있다. 파일명·헤더만으로 모든 셀 값이 허구인지 입증할 수 없으므로 원격 게시 전에 각 파일과 포함할 커밋의 내용을 직접 대조한다.
- `excel/user.xlsx`와 `storage/orders.json`은 이전 커밋 `f795ee2`, `999ee96`에도 존재한다. 현재 인덱스에서 제거해도 이전 커밋의 내용은 남는다. 실제 자격 정보나 비공개 업무자료가 포함됐다면 이 이력을 GitHub에 게시하지 말고, 먼저 안전한 이력 정리 또는 민감 자료가 없는 새 저장소를 사용한다. 이력은 이 작업에서 재작성하지 않았다.
- `.gitignore`에 추가한 규칙:
  - `.env` (기존 규칙)
  - `private_data/user.xlsx`, `excel/user.xlsx`
  - `storage/orders.json`, `storage/mail-deliveries.json`
  - `storage/mail-previews/*.eml`

### 파일·커밋 대조 체크리스트

Publish 또는 push를 직접 실행하기 전에:

1. `git status --short --branch`로 현재 브랜치와 staged/unstaged/untracked 항목을 확인한다. `excel/user.xlsx`와 `storage/orders.json`은 로컬에서 존재하는지 확인하고 Git 인덱스에서는 제거됐는지 확인한다.
2. `git diff --cached --name-status`와 `git diff --name-status`를 비교한다. 의도한 변경은 `.gitignore`, 이 노트, 로컬 전용 두 파일의 추적 제거뿐인지 확인하고 엑셀·앱 파일의 우발적 수정/삭제가 없는지 확인한다.
3. 현재 포함할 커밋의 파일 목록을 `git show --name-status --format=oneline HEAD`로 확인한다. `.env`, `excel/user.xlsx`, `private_data/user.xlsx`, `storage/orders.json`, 생성된 EML/메일 기록이 새 커밋에 포함되지 않는지 확인한다.
4. 원격에 올릴 전체 이력도 확인한다. `git log --all --name-status`에서 과거 커밋에 민감 파일이 있었는지 확인한다. 새 커밋에서 삭제하는 것만으로 과거 내용이 지워지지 않는다.
5. 실제 게시 전에 업무 통합 문서 4개에 실사용 연락처·고객 정보가 아닌 교육용 샘플만 들어 있는지 확인한다. 확실하지 않으면 게시를 중단한다.
6. 게시 후 VS Code의 원격 표시와 GitHub 저장소 페이지에서 저장소 이름 `taewoong-ai-pbl-03`, 공개 범위 `Private`, 기본 브랜치 `main`, 파일 목록을 대조한다. 사용자 인증과 Publish는 사용자가 직접 수행한다.

### 원격이 없을 때 VS Code 순서

현재는 원격이 없으므로, 위 체크리스트와 민감 자료 검토를 끝낸 뒤 사용자가 직접 진행한다.

1. Source Control에서 변경 파일을 검토하고 의도한 제외 규칙·추적 제거·노트만 커밋한다.
2. Source Control의 `Publish to GitHub` 또는 `Publish Branch`를 선택하고, 본인 계정으로 VS Code 및 브라우저 인증을 완료한다.
3. 저장소 이름을 `taewoong-ai-pbl-03`으로 입력하고 공개 범위에서 `Private`를 선택해 게시한다.
4. 게시 후 원격 주소와 GitHub 저장소 페이지의 파일·커밋을 위 체크리스트와 대조한다.

이 작업에서는 인증, 원격 생성, 이력 재작성, commit, push 또는 Publish를 수행하지 않는다.
