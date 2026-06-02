/**
 * pages/api/auth.js — ID + 비밀번호 인증
 * 환경변수: DASHBOARD_ID, DASHBOARD_PASSWORD
 */
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id, password } = req.body;
  const correctId = process.env.DASHBOARD_ID;
  const correctPw = process.env.DASHBOARD_PASSWORD;

  if (!correctId || !correctPw)
    return res.status(500).json({ error: 'Vercel 환경변수에 DASHBOARD_ID와 DASHBOARD_PASSWORD를 설정해주세요.' });

  if (id === correctId && password === correctPw) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' });
  }
}
