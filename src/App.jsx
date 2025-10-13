import React, { useEffect, useRef, useState } from "react";

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzht7VwuVCntcM-5sq7IFlJx5_U88z7e7tpKsW6Bj3MssUFe8_JFXlawxQ9qXvb4lmH/exec";

const DEFAULT_CSV = `問題番号,古文単語,日本語訳
1,をかし,趣がある・風情がある
2,いみじ,とても・すばらしい
3,あはれ,しみじみとした情趣がある・しみじみ
4,あやし,不思議だ・身分が低い
5,ありがたし,めったにない
6,うつくし,かわいい
7,うし(憂し),つらい
8,あさまし,驚きあきれる
9,いと,とても
10,いにしへ,昔
11,いづ,出る
12,いづこ,どこ
13,いづれ,どちら
14,おはす,いらっしゃる
15,おぼす,お思いになる
16,のたまふ,おっしゃる
17,侍り,ございます（丁寧語）
18,やがて,すぐに・そのまま
19,やうやう,だんだん
20,めでたし,すばらしい`;

const S = {
  page: { minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px", background: "#f7fafc", color: "#111827" },
  container: { width: "100%" },
  header: { fontSize: 22, fontWeight: 800, marginBottom: 8 },
  timer: { marginBottom: 12, fontSize: 14, color: "#374151" },
  controlsRow: { display: "flex", gap: 8, marginBottom: 12 },
  input: { flex: 1, border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 16 },
  select: { border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 16 },
  card: { background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.06)", padding: 16, minHeight: 360 },
  counter: { fontSize: 12, color: "#6b7280", marginBottom: 8 },
  question: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  inputRow: { display: "flex", gap: 8, alignItems: "center" },
  answerInput: { flex: 1, border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 16 },

  // ✅ 修正版ボタン（青背景＋白文字）
  primaryBtn: {
    width: "120px",
    background: "#3B82F6",
    color: "#FFFFFF",
    border: 0,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.2s ease",
  },
  secBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: 0,
    fontSize: 16,
    background: "#3B82F6",
    color: "#FFFFFF",
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.2s ease",
  },

  muted: { fontSize: 13, color: "#6b7280", marginTop: 8 },
  list: { marginTop: 12, maxHeight: 180, minHeight: 60, overflow: "auto", padding: 0, listStyle: "none" },
  li: (ok) => ({
    padding: 12,
    borderRadius: 10,
    border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`,
    background: ok ? "#ecfdf5" : "#fef2f2",
    marginBottom: 8,
  }),
  footerCard: { textAlign: "center", background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.06)", padding: 16, minHeight: 360 },
  footerBtnsCol: { display: "flex", flexDirection: "column", gap: 8 },
  sendBtn: (disabled) => ({
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 700,
    border: 0,
    color: "#fff",
    background: disabled ? "#86efac" : "#059669",
  }),
  status: { fontSize: 13, color: "#374151" },
  barWrap: { width: "100%", height: 8, background: "#e5e7eb", borderRadius: 999, overflow: "hidden", margin: "4px 0 8px" },
  bar: (p) => ({ width: `${p}%`, height: "100%", background: "#10b981" }),
};

function parseCSV(text) {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","))
    .filter((c) => c[1] && c[2])
    .map((c, i) => ({ no: c[0] || i + 1, q: c[1], a: c[2] }));
}

function normalize(s) {
  if (!s) return "";
  return s.replace(/[\s　]/g, "").replace(/[、。,.．]/g, "").replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).toLowerCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toJSTISOString(date) {
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jstDate.toISOString().replace("T", " ").substring(0, 19);
}

export default function App() {
  const TEST_SIZE = 20;
  const DEFAULT_DURATION_SEC = 5 * 60;
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [input, setInput] = useState("");
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState([]);
  const [studentName, setStudentName] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION_SEC);
  const [remainSec, setRemainSec] = useState(DEFAULT_DURATION_SEC);
  const timerRef = useRef(null);

  useEffect(() => {
    const parsed = parseCSV(DEFAULT_CSV);
    const size = Math.min(TEST_SIZE, parsed.length);
    setQuestions(shuffle(parsed).slice(0, size));
  }, []);

  useEffect(() => {
    if (finished) return;
    if (remainSec <= 0) {
      setFinished(true);
      return;
    }
    timerRef.current = setTimeout(() => setRemainSec((r) => r - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [remainSec, finished]);

  const expectedListOf = (a) => normalize(a).split(/[・、,／/]/).filter(Boolean);

  const check = () => {
    const q = questions[current];
    if (!q) return;
    const expectedList = expectedListOf(q.a);
    const user = normalize(input);
    let isCorrect = false;
    if (user.length > 0) isCorrect = expectedList.some((e) => e.length > 0 && (user.includes(e) || e.includes(user)));
    if (isCorrect) setCorrect((c) => c + 1);
    setHistory((prev) => [...prev, { no: q.no, q: q.q, expected: q.a, given: input, ok: isCorrect }]);
    if (current + 1 >= questions.length) setFinished(true);
    else {
      setCurrent((c) => c + 1);
      setInput("");
    }
  };

  const restart = () => {
    const parsed = parseCSV(DEFAULT_CSV);
    const size = Math.min(TEST_SIZE, parsed.length);
    setQuestions(shuffle(parsed).slice(0, size));
    setCurrent(0);
    setInput("");
    setCorrect(0);
    setFinished(false);
    setHistory([]);
    setRemainSec(durationSec);
  };

  const reviewWrong = () => {
    const wrong = history.filter((h) => !h.ok).map((h) => ({ no: h.no, q: h.q, a: h.expected }));
    if (!wrong.length) return;
    setQuestions(shuffle(wrong));
    setCurrent(0);
    setInput("");
    setCorrect(0);
    setFinished(false);
    setHistory([]);
    setRemainSec(durationSec);
  };

  const sendToSheet = async () => {
    if (sending) return;
    setSending(true);
    const payload = {
      timestamp: toJSTISOString(new Date()),
      name: studentName || "",
      total: questions.length,
      correct,
      percent: Math.round((correct / questions.length) * 100),
      history,
    };
    setSendStatus("送信中...");
    try {
      await fetch(SHEETS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      setSendStatus("送信完了！");
    } catch (e) {
      setSendStatus("送信失敗：" + e.message);
    } finally {
      setTimeout(() => setSending(false), 1500);
    }
  };

  const mm = Math.floor(remainSec / 60).toString().padStart(2, "0");
  const ss = Math.floor(remainSec % 60).toString().padStart(2, "0");
  const progress = finished || questions.length === 0 ? 100 : Math.floor((current / questions.length) * 100);

  return (
    <div style={S.page}>
      <div style={S.container}>
        <h1 style={S.header}>古文単語テスト</h1>
        <div style={S.timer}>タイマー：{mm}:{ss}</div>
        <div style={S.barWrap}>
          <div style={S.bar(progress)} />
        </div>

        <div style={S.controlsRow}>
          <input style={S.input} placeholder="受験者名（任意）" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
          <select style={S.select} value={durationSec} onChange={(e) => { const v = Number(e.target.value); setDurationSec(v); setRemainSec(v); }}>
            <option value={3 * 60}>3分</option>
            <option value={5 * 60}>5分</option>
            <option value={10 * 60}>10分</option>
          </select>
        </div>

        {!finished ? (
          <div style={S.card}>
            <div style={S.counter}>{current + 1} / {questions.length} 問</div>
            <div style={S.question}>{questions[current]?.q}</div>
            <div style={S.inputRow}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && check()}
                placeholder="意味を入力"
                style={S.answerInput}
              />
              <button onClick={check} style={S.primaryBtn}>答え合わせ</button>
            </div>
            <div style={S.muted}>正解 {correct} / {current} 問</div>

            {history.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>直近の結果</div>
                <ul style={S.list}>
                  {history.slice().reverse().map((h, i) => (
                    <li key={i} style={S.li(h.ok)}>
                      <div><span style={{ color: "#6b7280" }}>問題：</span>{h.q}</div>
                      <div><span style={{ color: "#6b7280" }}>正解：</span>{h.expected}</div>
                      <div><span style={{ color: "#6b7280" }}>あなたの解答：</span>{h.given}</div>
                      <div style={{ fontWeight: 700, color: h.ok ? "#047857" : "#b91c1c" }}>{h.ok ? "正解" : "不正解"}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div style={S.footerCard}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>テスト終了！</div>
            <div style={{ fontSize: 18, marginBottom: 12 }}>
              正解数：{correct} / {questions.length} 問（{Math.round((correct / questions.length) * 100)}%）
            </div>
            <div style={S.footerBtnsCol}>
              <button onClick={restart} style={{ ...S.primaryBtn, width: "100%" }}>もう一度（新しい20問）</button>
              <button onClick={reviewWrong} style={{ ...S.secBtn }}>間違いだけ復習</button>
              <button onClick={sendToSheet} disabled={sending} style={{ ...S.sendBtn(sending) }}>
                {sending ? "送信中…" : "結果を送信"}
              </button>
              {sendStatus && <div style={S.status}>{sendStatus}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
