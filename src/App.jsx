import React, { useEffect, useRef, useState } from "react";
import wordsCsv from "./words.csv?raw"; // ① src/words.csv から読み込み（Vite想定）

/**
 * 古文単語テスト（送信機能あり・形態素解析なし）
 * 変更点：
 *  - ① 問題データを src/words.csv から読み込み
 *  - ② 結果送信を "x-www-form-urlencoded" + no-cors（GASの /exec）方式に変更
 *
 * CSV 期待フォーマット（例）：
 *   問題番号,古文単語,日本語訳
 *   1,をかし,趣がある・風情がある
 *   2,いみじ,とても・すばらしい
 *   ...
 * 先頭行にヘッダーがある場合は SKIP_HEADER=true にしてください。
 */

// ========= 設定 =========
const TEST_SIZE = 20;
const DEFAULT_DURATION_SEC = 5 * 60;
const SKIP_HEADER = true; // ← 先頭行がヘッダーの CSV のとき true

// あなたの GAS /exec URL は .env から与える（例：VITE_GAS_URL="https://script.google.com/.../exec"）
const GAS_URL = import.meta.env.VITE_GAS_URL;
const APP_NAME = import.meta.env.VITE_APP_NAME;

// ---- minimal CSS (mobile first, full-width) ----
const S = {
  page: {
    minHeight: "100svh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 16,
    background: "#f7fafc",
    color: "#111827",
  },
  container: { width: "100%" },
  header: { fontSize: 22, fontWeight: 800, marginBottom: 8 },
  timer: { marginBottom: 12, fontSize: 14, color: "#374151" },
  controlsRow: { display: "flex", gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 16,
  },
  select: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 16,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    padding: 16,
    minHeight: 360,
  },
  counter: { fontSize: 12, color: "#6b7280", marginBottom: 8 },
  question: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  inputRow: { display: "flex", gap: 8, alignItems: "center" },
  answerInput: {
    flex: 1,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 16,
  },
  primaryBtn: {
    width: 120,
    background: "#111827",
    color: "#fff",
    border: 0,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  muted: { fontSize: 13, color: "#6b7280", marginTop: 8 },
  list: {
    marginTop: 12,
    maxHeight: 180,
    minHeight: 60,
    overflow: "auto",
    padding: 0,
    listStyle: "none",
  },
  li: (ok) => ({
    padding: 12,
    borderRadius: 10,
    border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`,
    background: ok ? "#ecfdf5" : "#fef2f2",
    marginBottom: 8,
  }),
  footerCard: {
    textAlign: "center",
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    padding: 16,
    minHeight: 360,
  },
  footerBtnsCol: { display: "flex", flexDirection: "column", gap: 8 },
  secBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 16,
    background: "#fff",
    cursor: "pointer",
  },
  sendBtn: (disabled) => ({
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 700,
    border: 0,
    color: "#fff",
    background: disabled ? "#86efac" : "#059669",
    cursor: disabled ? "default" : "pointer",
  }),
  status: { fontSize: 13, color: "#374151" },
  barWrap: {
    width: "100%",
    height: 8,
    background: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
    margin: "4px 0 8px",
  },
  bar: (p) => ({ width: `${p}%`, height: "100%", background: "#10b981" }),
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    position: "sticky",
    top: 0,
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
  },
  td: { padding: "8px 10px", borderBottom: "1px solid #f3f4f6" },
  badge: (ok) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    color: ok ? "#065f46" : "#991b1b",
    background: ok ? "#d1fae5" : "#fee2e2",
    border: `1px solid ${ok ? "#10b981" : "#fca5a5"}`,
  }),
};

// ========= ユーティリティ =========
// （引用符対応の簡易CSVパーサ）
function parseCsvRaw(csvText) {
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < csvText.length) {
    const c = csvText[i];
    if (inQuotes) {
      if (c === '"') {
        if (csvText[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") pushField();
      else if (c === "\n" || c === "\r") {
        if (field !== "" || row.length > 0) pushField();
        if (row.length) pushRow();
        if (c === "\r" && csvText[i + 1] === "\n") i++;
      } else field += c;
    }
    i++;
  }
  if (field !== "" || row.length > 0) { pushField(); pushRow(); }
  return rows;
}

function stripPunctSpaces(s) {
  if (!s) return "";
  return s.replace(/[\s　]/g, "").replace(/[、。,.．]/g, "");
}
function kataToHira(s) {
  return s.replace(/[ァ-ン]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}
function normalize(s) {
  return stripPunctSpaces(kataToHira(s || "")).toLowerCase();
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
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace("T", " ").substring(0, 19);
}

export default function App() {
  const [phase, setPhase] = useState("quiz"); // quiz | lastFeedback | summaryList | result
  const [questions, setQuestions] = useState([]); // { no, q, a }
  const [current, setCurrent] = useState(0);
  const [input, setInput] = useState("");
  const [correct, setCorrect] = useState(0);
  const [history, setHistory] = useState([]); // [{ no, q, expected, given, ok }]
  const [studentName, setStudentName] = useState("");

  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION_SEC);
  const [remainSec, setRemainSec] = useState(DEFAULT_DURATION_SEC);
  const timerRef = useRef(null);

  // 送信UI
  const [sendStatus, setSendStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);

  // iOSズーム抑止 & 全幅メディアクエリ
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "viewport");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1"
    );

    const styleEl = document.createElement("style");
    styleEl.textContent = `
      body { -webkit-text-size-adjust: 100%; }
      @media (min-width: 768px) {
        [data-kobun-app] .kobun-container { max-width: 100% !important; }
      }
    `;
    document.head.appendChild(styleEl);
    return () => {
      if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    };
  }, []);

  // ① 初期読み込み：CSV からロード（非復元抽選）
  useEffect(() => {
    try {
      let rows = parseCsvRaw(wordsCsv);
      if (SKIP_HEADER && rows.length) rows = rows.slice(1);
      // 期待列順： [問題番号, 古文単語, 日本語訳]
      const parsed = rows
        .filter((r) => r.length >= 3 && r[1] && r[2])
        .map((r, i) => ({
          no: r[0] || String(i + 1),
          q: String(r[1]).trim(),
          a: String(r[2]).trim(),
        }));
      const size = Math.min(TEST_SIZE, parsed.length);
      setQuestions(shuffle(parsed).slice(0, size));
    } catch (e) {
      console.error("CSV 読み込みエラー:", e);
    }
  }, []);

  // タイマー（quiz 中のみ）
  useEffect(() => {
    if (phase !== "quiz") return;
    if (remainSec <= 0) {
      setPhase(history.length > 0 ? "lastFeedback" : "summaryList");
      return;
    }
    timerRef.current = setTimeout(() => setRemainSec((r) => r - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [remainSec, phase, history.length]);

  // 判定用
  const expectedListOf = (a) =>
    a ? a.split(/[・、,／/]/).map((t) => normalize(t)).filter(Boolean) : [];

  const check = () => {
    const q = questions[current];
    if (!q) return;

    const expectedList = expectedListOf(q.a);
    const user = normalize(input);

    let isCorrect = false;
    if (user.length > 0) {
      // ゆるい部分一致（従来仕様）
      isCorrect = expectedList.some(
        (e) => e.length > 0 && (user.includes(e) || e.includes(user))
      );
    }

    if (isCorrect) setCorrect((c) => c + 1);
    const rec = { no: q.no, q: q.q, expected: q.a, given: input, ok: isCorrect };
    setHistory((prev) => [...prev, rec]);

    const isLast = current + 1 >= questions.length;
    if (isLast) {
      setPhase("lastFeedback");
    } else {
      setCurrent((c) => c + 1);
      setInput("");
    }
  };

  const goSummaryFromLastFeedback = () => setPhase("summaryList");

  const restart = () => {
    try {
      let rows = parseCsvRaw(wordsCsv);
      if (SKIP_HEADER && rows.length) rows = rows.slice(1);
      const parsed = rows
        .filter((r) => r.length >= 3 && r[1] && r[2])
        .map((r, i) => ({
          no: r[0] || String(i + 1),
          q: String(r[1]).trim(),
          a: String(r[2]).trim(),
        }));
      const size = Math.min(TEST_SIZE, parsed.length);
      setQuestions(shuffle(parsed).slice(0, size));
    } catch (e) {
      console.error(e);
    }
    setCurrent(0);
    setInput("");
    setCorrect(0);
    setHistory([]);
    setRemainSec(durationSec);
    setPhase("quiz");
  };

  const reviewWrong = () => {
    const wrong = history
      .filter((h) => !h.ok)
      .map((h) => ({ no: h.no, q: h.q, a: h.expected }));
    if (!wrong.length) return;
    setQuestions(shuffle(wrong));
    setCurrent(0);
    setInput("");
    setCorrect(0);
    setHistory([]);
    setRemainSec(durationSec);
    setPhase("quiz");
  };

  // ② 送信（x-www-form-urlencoded + no-cors）＋擬似進捗
  const sendToSheet = async () => {
    if (sending) return;
    if (!GAS_URL) {
      setSendStatus("VITE_GAS_URL が設定されていません");
      return;
    }

    setSending(true);
    setSendStatus("送信中...");
    setSendProgress(0);

    // 擬似プログレス：0→90% を一定間隔で進行、応答は読まないため最後に100%
    let p = 0;
    const tick = () => {
      p = Math.min(p + 5, 90);
      setSendProgress(p);
    };
    const timerId = setInterval(tick, 200);

    const payload = {
      subject: APP_NAME,      //← 追加：タブ名（= VITE_APP_NAME）
      timestamp: toJSTISOString(new Date()),
      user_name: studentName || "",
      total: questions.length,
      correct,
      percent: Math.round((correct / Math.max(questions.length, 1)) * 100),
      history,
      device_info: navigator.userAgent,
    };

    try {
      const body = new URLSearchParams({ payload: JSON.stringify(payload) });
      // 応答は読まず、CORS を避ける
      fetch(GAS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        mode: "no-cors",
        keepalive: true,
      });

      clearInterval(timerId);
      setSendProgress(100);
      setSendStatus("送信完了！（no-corsのため応答は未確認）");
    } catch (e) {
      clearInterval(timerId);
      setSendStatus("送信失敗：" + e.message);
    } finally {
      setTimeout(() => setSending(false), 600);
    }
  };

  const mm = Math.floor(remainSec / 60).toString().padStart(2, "0");
  const ss = Math.floor(remainSec % 60).toString().padStart(2, "0");
  const progress =
    phase !== "quiz" || questions.length === 0
      ? 100
      : Math.floor((current / questions.length) * 100);

  const lastRec = history[history.length - 1];

  return (
    <div style={S.page} data-kobun-app>
      <div style={S.container} className="kobun-container">
        <h1 style={S.header}>古文単語テスト</h1>

        {/* 共通ヘッダー */}
        <div style={S.timer}>タイマー：{mm}:{ss}</div>
        <div style={S.barWrap}><div style={S.bar(progress)} /></div>

        {/* ヘッダー操作 */}
        <div style={S.controlsRow}>
          <input
            style={S.input}
            placeholder="受験者名（任意）"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
          <select
            style={S.select}
            value={durationSec}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDurationSec(v);
              setRemainSec(v);
            }}
          >
            <option value={3 * 60}>3分</option>
            <option value={5 * 60}>5分</option>
            <option value={10 * 60}>10分</option>
          </select>
        </div>

        {/* フェーズごとの表示 */}
        {phase === "quiz" && (
          <div style={S.card}>
            <div style={S.counter}>
              {current + 1} / {questions.length} 問
            </div>
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
              <button onClick={check} style={S.primaryBtn}>
                答え合わせ
              </button>
            </div>
            <div style={S.muted}>
              正解 {correct} / {current} 問
            </div>

            {history.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>直近の結果</div>
                <ul style={S.list}>
                  {history
                    .slice(-5)
                    .reverse()
                    .map((h, i) => (
                      <li key={i} style={S.li(h.ok)}>
                        <div><span style={{ color: "#6b7280" }}>問題：</span>{h.q}</div>
                        <div><span style={{ color: "#6b7280" }}>正解：</span>{h.expected}</div>
                        <div><span style={{ color: "#6b7280" }}>あなたの解答：</span>{h.given}</div>
                        <div style={{ fontWeight: 700, color: h.ok ? "#047857" : "#b91c1c" }}>
                          {h.ok ? "正解" : "不正解"}
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {phase === "lastFeedback" && (
          <div style={S.card}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              最終問題の結果
            </div>
            {lastRec ? (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>問題：</span>{lastRec.q}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>あなたの解答：</span>{lastRec.given}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>正解：</span>{lastRec.expected}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={S.badge(lastRec.ok)}>{lastRec.ok ? "正解" : "不正解"}</span>
                </div>
              </div>
            ) : (
              <div>データが見つかりません。</div>
            )}
            <div style={{ marginTop: 16 }}>
              <button onClick={() => setPhase("summaryList")} style={{ ...S.primaryBtn, width: "100%" }}>
                全体の結果を見る
              </button>
            </div>
          </div>
        )}

        {phase === "summaryList" && (
          <div style={S.card}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              全{questions.length}問の一覧
            </div>
            <div style={{ overflow: "auto", maxHeight: 360 }}>
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
                  {history.map((h, idx) => (
                    <tr key={idx}>
                      <td style={S.td}>{idx + 1}</td>
                      <td style={S.td}>{h.q}</td>
                      <td style={S.td}>{h.given}</td>
                      <td style={S.td}>{h.expected}</td>
                      <td style={S.td}>
                        <span style={S.badge(h.ok)}>{h.ok ? "○" : "×"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...S.footerBtnsCol, marginTop: 16 }}>
              {/* 青背景＋白文字（指定どおり） */}
              <button
                onClick={reviewWrong}
                style={{ ...S.secBtn, background: "#3B82F6", color: "#FFFFFF", border: 0, fontWeight: 700 }}
              >
                間違いだけ復習
              </button>
              <button
                onClick={() => setPhase("result")}
                style={{ ...S.primaryBtn, width: "100%" }}
              >
                結果へ進む
              </button>
            </div>
          </div>
        )}

        {phase === "result" && (
          <div style={S.footerCard}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>テスト終了！</div>
            <div style={{ fontSize: 18, marginBottom: 12 }}>
              正解数：{correct} / {questions.length} 問（{Math.round((correct / Math.max(questions.length, 1)) * 100)}%）
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
              所要時間：{mm}:{ss}
            </div>

            <div style={S.footerBtnsCol}>
              {/* 青背景＋白文字（指定どおり） */}
              <button
                onClick={restart}
                style={{ ...S.primaryBtn, width: "100%", background: "#3B82F6", color: "#FFFFFF" }}
              >
                もう一度（新しい20問）
              </button>
              <button
                onClick={reviewWrong}
                style={{ ...S.secBtn, background: "#3B82F6", color: "#FFFFFF", border: 0, fontWeight: 700 }}
              >
                間違いだけ復習
              </button>

              <button
                onClick={sendToSheet}
                disabled={sending}
                style={{ ...S.sendBtn(sending) }}
              >
                {sending ? "送信中…" : "結果を送信"}
              </button>

              {(sending || sendProgress > 0 || sendStatus) && (
                <div style={{ marginTop: 8 }}>
                  <div style={S.status}>送信進捗：{sendProgress}%</div>
                  {sendStatus && <div style={S.status}>{sendStatus}</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- 簡易テスト ---
(function devTests() {
  console.assert(stripPunctSpaces(" あ 。,.。") === "あ", "strip/句読点");
  console.assert(kataToHira("オマエ") === "おまえ", "カタ→ひら");
  console.assert(normalize("  ア  ") === "あ", "normalize basic");
})();
