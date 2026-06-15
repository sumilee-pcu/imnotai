// iamnotai — 프록시 헬스체크.
// 프런트(index.html)가 이 엔드포인트를 GET 해서 프록시 배포 여부를 자동 감지한다.
// 응답이 ok 이면 프록시 모드(키 입력 UI 숨김), 실패하면 BYO-키 직접호출 모드로 폴백.
// 어떤 모델 키가 서버에 설정돼 있는지도 알려, 프런트에서 사용 불가 모델을 비활성화한다.

module.exports = async (req, res) => {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    proxy: true,
    providers: {
      solar: !!process.env.UPSTAGE_API_KEY,
      opus: !!process.env.ANTHROPIC_API_KEY,
      sonnet: !!process.env.ANTHROPIC_API_KEY,
    },
  });
};
