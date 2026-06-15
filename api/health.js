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
    // available: 모델 사용 가능 여부 / byok: 사용자가 본인 키를 입력해야 하는지
    providers: {
      gemini: { available: !!process.env.GEMINI_API_KEY, byok: false },
      solar: { available: true, byok: true },
    },
  });
};
