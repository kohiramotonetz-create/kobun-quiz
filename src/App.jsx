import React, { useEffect, useMemo, useRef, useState } from "react";
import wordsCsv from "./words.csv?raw"; // CSV: 問題番号,古文単語,日本語訳（先頭行はヘッダー想定）

/**
 * 要求仕様の統合版 古文単語テスト App.jsx
 * - スタート画面（必須：名前入力／問題数の選択 20 or 40）
 * - 問題画面：英単語アプリと同じフロー（回答→その場で正答と自分の回答表示→「次の問題へ」）
 * - 全問終了：全問題/自分の回答/模範解答の一覧と「回答を送信」ボタン
 * - 送信後のページ：
 *     1) 間違えた問題をもう一度（間違いの中からランダム出題）
 *     2) もう一度最初からスタート（※前回結果の“未送信”があれば、スタート画面から送信可能）
 * - 送信は GAS の /exec に x-www-form-urlencoded + no-cors で投げる（古文アプリ準拠）
 */

// ========= 設定 =========
const DEFAULT_DURATION_SEC = 5 * 60;
const SKIP_HEADER = true; // CSV 先頭行ヘッダーあり
const GAS_URL = import.meta.env.VITE_GAS_URL;
const APP_NAME = import.meta.env.VITE_APP_NAME || "古文単語";

// ---- minimal CSS ----
const S = {
  page: { minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", padding: 16, background: "#f7fafc", color: "#111827" },
  container: { width: "100%" },
  card: { background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.06)", padding: 16, width: "min(840px, 94vw)" },
  header: { fontSize: 24, fontWeight: 800, marginBottom: 8 },
  row: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12 },
  label: { fontWeight: 600, minWidth: 90 },
  input: { flex: 1, border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 16 },
  select: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 16 },
  primaryBtn: { padding: "10px 14px", borderRadius: 10, border: 0, background: "#111827", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  secBtn: { padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontSize: 16, cursor: "pointer" },
  muted: { fontSize: 13, color: "#6b7280" },
  badge: (ok) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: ok ? "#065f46" : "#991b1b", background: ok ? "#d1fae5" : "#fee2e2", border: `1px solid ${ok ? "#10b981" : "#fca5a5"}` }),
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14 },
  th: { textAlign: "left", padding: "8px 10px", position: "sticky", top: 0, background: "#f9fafb", borderBottom: "1px solid #e5e7eb" },
  td: { padding: "8px 10px", borderBottom: "1px solid #f3f4f6" },
  list: { marginTop: 12, maxHeight: 240, overflow: "auto", padding: 0, listStyle: "none" },
  li: (ok) => ({ padding: 12, borderRadius: 10, border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`, background: ok ? "#ecfdf5" : "#fef2f2", marginBottom: 8 }),
};

// ========= ユーティリティ =========
function parseCsvRaw(csvText) {
  const rows = []; let i = 0, field = "", row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < csvText.length) {
    const c = csvText[i];
    if (inQuotes) {
      if (c === '"') { if (csvText[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") pushField();
      else if (c === "\n" || c === "\r") { if (field !== "" || row.length > 0) pushField(); if (row.length) pushRow(); if (c === "\r" && csvText[i + 1] === "\n") i++; }
      else field += c;
    }
    i++;
  }
  if (field !== "" || row.length > 0) { pushField(); pushRow(); }
  return rows;
}
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function stripPunctSpaces(s) { return String(s || "").replace(/[\s　]/g, "").replace(/[、。,.．]/g, ""); }
function kataToHira(s) { return String(s || "").replace(/[ァ-ン]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)); }
function normalize(s) { return stripPunctSpaces(kataToHira(s || "")).toLowerCase(); }
function toJSTISOString(date) { const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000); return jst.toISOString().replace("T", " ").substring(0, 19); }

export default function App() {
  // フェーズ: start | quiz | summary | postSubmit
  const [phase, setPhase] = useState("start");

  // スタート画面
  const [studentName, setStudentName] = useState("");
  const [questionCount, setQuestionCount] = useState(20); // 20 or 40

  // 問題関連
  const [allPool, setAllPool] = useState([]); // { no, q, a }
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]); // [{ no, q, expected, given, ok }]

  // 1問ごとのレビュー表示
  const [review, setReview] = useState({ visible: false, rec: null });

  // タイマー
  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION_SEC);
  const [remainSec, setRemainSec] = useState(DEFAULT_DURATION_SEC);
  const timerRef = useRef(null);

  // 送信
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [sendProgress, setSendProgress] = useState(0);

  // 「前回結果の未送信」を保持（再スタート後でも送信可能に）
  const [lastPendingPayload, setLastPendingPayload] = useState(null); // {payload, sent:boolean}

  // CSV 初期読み込み
  useEffect(() => {
    try {
      let rows = parseCsvRaw(wordsCsv);
      if (SKIP_HEADER && rows.length) rows = rows.slice(1);
      const parsed = rows
        .filter((r) => r.length >= 3 && r[1] && r[2])
        .map((r, i) => ({ no: r[0] || String(i + 1), q: String(r[1]).trim(), a: String(r[2]).trim() }));
      setAllPool(parsed);
    } catch (e) { console.error("CSV 読み込みエラー:", e); }
  }, []);

  // タイマー（quiz 中のみ進行）
  useEffect(() => {
  // 0秒判定は常に優先
  if (remainSec <= 0) {
    if (phase === "quiz") {
      setReview({ visible: false, rec: null });
      setPhase("summary");
    }
    return;
  }

  // 一時停止中は動かさない
  if (isPaused) return;

  // ★setIntervalで安定駆動（functional updateで最新値を参照）
  const id = setInterval(() => {
    setRemainSec((r) => (r > 0 ? r - 1 : 0));
  }, 1000);

  // クリーンアップ
  return () => clearInterval(id);
}, [isPaused, remainSec, phase]);  // ★ポイント：pause状態とremainSecを監視


  // スタート可能か
  const canStart = useMemo(() => studentName.trim().length > 0 && allPool.length > 0, [studentName, allPool.length]);

  // スタート
  const startQuiz = () => {
    if (!canStart) return;
    const picked = shuffle(allPool).slice(0, Math.min(questionCount, allPool.length));
    setQuestions(picked);
    setCurrent(0);
    setInput("");
    setHistory([]);
    setReview({ visible: false, rec: null });
    setRemainSec(durationSec);
    setPhase("quiz");
  };

  // 判定用
  const expectedListOf = (a) => (a ? a.split(/[・、,／/]/).map((t) => normalize(t)).filter(Boolean) : []);
  const judge = (expected, user) => {
    const expectedList = expectedListOf(expected);
    const u = normalize(user);
    if (u.length === 0) return false;
    return expectedList.some((e) => e.length > 0 && (u.includes(e) || e.includes(u)));
  };

  // 回答→レビュー表示
  const submitAnswer = () => {
    const q = questions[current];
    if (!q) return;
    const ok = judge(q.a, input);
    const rec = { no: q.no, q: q.q, expected: q.a, given: input, ok };
    setHistory((prev) => [...prev, rec]);
    setReview({ visible: true, rec });
  };

  // 次の問題へ
  const nextQuestion = () => {
    setReview({ visible: false, rec: null });
    const isLast = current + 1 >= questions.length;
    if (isLast) {
      setPhase("summary");
    } else {
      setCurrent((c) => c + 1);
      setInput("");
    }
  };

  // 一覧から送信（次ページへ遷移）
  const handleSendFromSummary = async () => {
    const payload = buildPayload();
    // 送信中でも“次ページ”へ遷移する仕様に合わせる
    setLastPendingPayload({ payload, sent: false });
    sendToSheet(payload).catch(() => {});
    setPhase("postSubmit");
  };

  // 間違いだけでもう一度（ランダム）
  const reviewWrong = () => {
    const wrong = history.filter((h) => !h.ok).map((h) => ({ no: h.no, q: h.q, a: h.expected }));
    if (!wrong.length) return; // 何もしない
    setQuestions(shuffle(wrong));
    setCurrent(0);
    setInput("");
    setHistory([]);
    setReview({ visible: false, rec: null });
    setRemainSec(durationSec);
    setPhase("quiz");
  };

  // 最初の画面へ戻る（※前回結果が未送信なら、スタート画面に送信ボタンを出す）
  const backToStart = () => {
    setCurrent(0);
    setInput("");
    setQuestions([]);
    setHistory([]);
    setReview({ visible: false, rec: null });
    setRemainSec(durationSec);
    setPhase("start");
  };

  // payload 構築
  const buildPayload = () => {
    const correct = history.filter((h) => h.ok).length;
    return {
      subject: APP_NAME,
      timestamp: toJSTISOString(new Date()),
      user_name: studentName,
      total: questions.length,
      correct,
      percent: Math.round((correct / Math.max(questions.length, 1)) * 100),
      history,
      device_info: navigator.userAgent,
    };
  };

  // GAS 送信
  async function sendToSheet(payload) {
    if (!GAS_URL) { setSendStatus("VITE_GAS_URL が設定されていません"); return; }
    setSending(true); setSendStatus("送信中... "); setSendProgress(0);
    let p = 0; const timerId = setInterval(() => { p = Math.min(p + 5, 90); setSendProgress(p); }, 200);
    try {
      const body = new URLSearchParams({ payload: JSON.stringify(payload) });
      fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body, mode: "no-cors", keepalive: true });
      clearInterval(timerId); setSendProgress(100); setSendStatus("送信完了！（no-cors）");
      setLastPendingPayload({ payload, sent: true });
    } catch (e) {
      clearInterval(timerId); setSendStatus("送信失敗：" + e.message);
    } finally {
      setTimeout(() => setSending(false), 600);
    }
  }

  // 進捗・ヘッダー
  const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
  const ss = String(Math.floor(remainSec % 60)).padStart(2, "0");
  const progress = phase !== "quiz" || questions.length === 0 ? 100 : Math.floor((current / questions.length) * 100);

  return (
    <div style={S.page}>
      <div style={S.container}>
        {phase === "start" && (
          <div style={S.card}>
            <h1 style={S.header}>古文単語テスト</h1>
            <div style={S.row}>
              <label style={S.label}>名前<span style={{ color: "#e11d48" }}>*</span></label>
              <input style={S.input} value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="例：山田 太郎" />
            </div>
            <div style={S.row}>
              <label style={S.label}>問題数</label>
              <select style={S.select} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
                <option value={20}>20問</option>
                <option value={40}>40問</option>
              </select>
            </div>
            {/* 任意: タイマー長（必要なら表示） */}
            <div style={{ ...S.row, display: "none" }}>
              <label style={S.label}>制限時間</label>
              <select style={S.select} value={durationSec} onChange={(e) => { const v = Number(e.target.value); setDurationSec(v); setRemainSec(v); }}>
                <option value={3 * 60}>3分</option>
                <option value={5 * 60}>5分</option>
                <option value={10 * 60}>10分</option>
              </select>
            </div>

            <div className="actions" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <button style={{ ...S.primaryBtn, opacity: canStart ? 1 : 0.5, cursor: canStart ? "pointer" : "not-allowed" }} disabled={!canStart} onClick={startQuiz}>
                スタート（{questionCount}問）
              </button>

              {/* 前回結果が未送信なら送信ボタンを表示 */}
              {lastPendingPayload && !lastPendingPayload.sent && (
                <button style={S.secBtn} onClick={() => sendToSheet(lastPendingPayload.payload)}>前回の結果を送信</button>
              )}
            </div>
            {!canStart && <div style={{ ...S.muted, marginTop: 8 }}>※ 名前を入力してください。</div>}
          </div>
        )}

        {phase === "quiz" && (
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div className="left">
                <div style={{ fontSize: 12, color: "#6b7280" }}>受験者：{studentName}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>タイマー：{mm}:{ss}</div>
              </div>
              <div style={{ width: 160 }}>
                <div style={{ width: "100%", height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: "#10b981" }} />
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", textAlign: "right" }}>{current + 1} / {questions.length} 問</div>
              </div>
            </div>

            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{questions[current]?.q}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.input }} placeholder="意味を入力" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAnswer()} />
              <button style={S.primaryBtn} onClick={submitAnswer}>答え合わせ</button>
            </div>

            {review.visible && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>答え合わせ</div>
                <ul style={S.list}>
                  <li style={S.li(review.rec.ok)}>
                    <div><span style={{ color: "#6b7280" }}>問題：</span>{review.rec.q}</div>
                    <div><span style={{ color: "#6b7280" }}>あなた：</span>{review.rec.given || "（無回答）"}</div>
                    <div><span style={{ color: "#6b7280" }}>正解：</span>{review.rec.expected}</div>
                    <div style={{ marginTop: 6 }}><span style={S.badge(review.rec.ok)}>{review.rec.ok ? "正解" : "不正解"}</span></div>
                  </li>
                </ul>
                <button style={{ ...S.primaryBtn, width: "100%" }} onClick={nextQuestion}>次の問題へ</button>
              </div>
            )}
          </div>
        )}

        {phase === "summary" && (
          <div style={S.card}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>全{questions.length}問の一覧</div>
            <div style={{ overflow: "auto", maxHeight: 400 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>問題</th>
                    <th style={S.th}>あなたの解答</th>
                    <th style={S.th}>正解</th>
                    <th style={S.th}>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.td}>{h.q}</td>
                      <td style={S.td}>{h.given}</td>
                      <td style={S.td}>{h.expected}</td>
                      <td style={S.td}><span style={S.badge(h.ok)}>{h.ok ? "○" : "×"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={{ ...S.primaryBtn, flex: 1 }} onClick={handleSendFromSummary}>回答を送信</button>
              <button style={{ ...S.secBtn }} onClick={reviewWrong}>間違いだけ復習</button>
            </div>

            {(sending || sendProgress > 0 || sendStatus) && (
              <div style={{ marginTop: 8 }}>
                <div className="status" style={S.muted}>送信進捗：{sendProgress}%</div>
                {sendStatus && <div className="status" style={S.muted}>{sendStatus}</div>}
              </div>
            )}
          </div>
        )}

        {phase === "postSubmit" && (
          <div style={S.card}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>送信ページ</div>
            <div style={{ ...S.muted, marginBottom: 12 }}>結果は送信されました（no-cors のため応答は未確認）。必要に応じて下の学習を続けてください。</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button style={{ ...S.primaryBtn, background: "#3B82F6" }} onClick={reviewWrong}>間違えた問題をもう一度</button>
              <button style={S.secBtn} onClick={backToStart}>もう一度最初からスタート</button>
            </div>

            {/* 送信が未完了の場合に個別送信も可（再保険） */}
            {lastPendingPayload && !lastPendingPayload.sent && (
              <div style={{ marginTop: 12 }}>
                <button style={S.secBtn} onClick={() => sendToSheet(lastPendingPayload.payload)}>未送信の結果を送信</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
