/**
 * pages/api/auth.js — 대시보드 로그인 인증
 * 환경변수: DASHBOARD_PASSWORD
 */
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { password } = req.body;
  const correct = process.env.DASHBOARD_PASSWORD;
  if (!correct) return res.status(500).json({ error: '비밀번호가 설정되지 않았습니다. Vercel 환경변수에 DASHBOARD_PASSWORD를 추가해주세요.' });
  if (password === correct) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
}
