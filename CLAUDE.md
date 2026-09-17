# GuganPick

네이버 카페에 게시된 SOOP 영상 링크와 시간 구간을 모아 스트리머의 시청을 돕는 단일 Chrome Manifest V3 확장 프로그램이다. 서버·빌드 단계·외부 패키지 없이 압축해제 확장으로 실행한다.

## 프로젝트 구조

```text
.
├── CLAUDE.md                    ← Claude Code 작업 기준
├── AGENTS.md                    ← Codex 작업 기준 겸 단일 모듈 경계
├── README.md                    ← 사용자의 설치·사용 안내
├── manifest.json                ← 권한, 서비스 워커, 콘텐츠 스크립트 등록
├── core.js                      ← URL·시간 파싱과 중복 판별 공용 로직
├── content.js                   ← 카페 수집 UI와 SOOP 재생 제어
├── background.js                ← 확장 아이콘 및 탭 이동 중계
├── test_core.js                 ← 공용 로직의 Node 자체 검사
└── docs/
    ├── architecture.md          ← 구성 요소와 전체 흐름
    ├── business-rules.md        ← 영상 수집·구간 재생 규칙
    ├── security.md              ← 권한과 데이터 보호 정책
    ├── standards.md             ← 변경 시 지켜야 할 규칙
    ├── engineering-notes.md     ← 외부 페이지 연동 시 주의점
    ├── operations.md            ← 설치·검증 절차
    ├── contracts.md             ← 사용자 입력과 동작 계약
    └── tracking/
        ├── status.md            ← 구현·검증 현황과 남은 작업
        ├── findings.md          ← 해결되지 않은 문제
        └── decisions/
            ├── index.md         ← 제품 결정 목록
            ├── 0001-local-only-extension.md
            └── 0002-segment-end-option.md
```

## 반드시 지킬 기준

- SOOP URL은 허용된 두 호스트와 `/player/{숫자}` 경로를 모두 만족해야 한다. 이름에 `sooplive`가 포함됐다는 이유만으로 허용하지 않는다.
- 카페의 본문·댓글은 신뢰하지 않는 입력이다. HTML이나 코드를 실행하지 않고 텍스트, URL, 숫자로만 처리한다.
- 수집한 댓글·작성자·영상 상태는 브라우저 로컬 저장소 밖으로 보내지 않는다. 서버, 분석 도구, 원격 로그를 추가하려면 먼저 사용자 승인을 받는다.
- 광고 영상은 본편 시간으로 계산하지 않으며 광고 제거·건너뛰기 자동화나 접근 제한 우회 기능을 넣지 않는다.
- `core.js`는 브라우저 전역, 서비스 워커의 `importScripts`, Node 테스트에서 함께 동작해야 한다.

## 작업 전 확인

- 모든 변경 전 `docs/standards.md`, `docs/engineering-notes.md`, 이 파일을 읽는다.
- URL·시간·중복 규칙 변경 전 `core.js`와 `test_core.js`를 함께 읽고 `node .\test_core.js`를 통과시킨다.
- 카페 DOM 탐색 변경 전 본문 프레임, 현재 로드된 댓글, 링크 카드 중복 사례를 확인한다.
- SOOP 재생 변경 전 광고용 `#adVideo`와 본편 `#video`를 구분하고, 자동재생 거부·버퍼링·영상 길이 초과 경로를 확인한다.
- 권한 변경 전 `manifest.json`의 권한이 실제 읽기·재생 범위를 넘지 않는지 확인한다.

## 문제 처리

허용 호스트 확대, 카페 데이터 외부 전송, 광고 또는 접근 제한 우회 가능성은 즉시 사용자에게 보고한다. 그 밖에 현재 작업에서 해결할 수 없는 외부 DOM 변경, 재현 불가 재생 오류, 검증 공백은 `docs/tracking/findings.md`에 조건과 영향 범위를 기록한다.
