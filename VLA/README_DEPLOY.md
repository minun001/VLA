# LK_LK100_frame120 Web Exhibit Deployment

이 폴더는 `LK_LK100_frame120` 시각화 전시용 정적 웹사이트의 배포 루트입니다.

## 현재 로컬 배포

- Web root: `C:\Users\user\Desktop\VLA\test_example\LK_LK100_frame120\web`
- Local URL: `http://127.0.0.1:8090/`
- PID file: `.deploy\server.pid`
- Logs: `.deploy\server.out.log`, `.deploy\server.err.log`

## 다시 실행

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

## 공개 배포 준비 상태

이 사이트는 순수 정적 파일로 구성되어 있어 GitHub Pages, Netlify, Vercel, Cloudflare Pages 같은 정적 호스팅에 바로 올릴 수 있습니다.

현재 확인된 상태:

- Vercel CLI: not found
- Netlify CLI: not found
- Cloudflare Wrangler CLI: not found
- GitHub CLI: available and authenticated

공개 배포는 연구 이미지가 외부에 공개될 수 있으므로, 배포 대상과 공개/비공개 정책을 확정한 뒤 진행해야 합니다.
