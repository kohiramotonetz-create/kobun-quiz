import React, { useEffect, useRef, useState } from "react";

/**
 * 古文単語テスト（全面リファクタ版）
 * - フェーズ: quiz → lastFeedback → summaryList → result
 * - 20問ランダム（非復元）/ ゆるい判定（部分一致）/ タイマー
 * - 送信: Apps Script（/exec）へ x-www-form-urlencoded で POST、擬似進捗→100% で完了
 * - iPad最適化 & 全幅対応
 */

// ← あなたの /exec URL を貼る
const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbzdh8p-5hceAPcJcixVKMQhgnHDZ8MjlCIEXYCbqXODJap-NqhsVfOZW7Y7PCx7z-7XKQ/exec";

// 80語（必要に応じて差し替え可）
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
20,めでたし,すばらしい
21,かなし,いとおしい・かわいい
22,かたし,難しい
23,かぎりなし,この上ない
24,けしき,様子・態度
25,さま,様子
26,さらば,そうならば
27,さりとて,そうかといって
28,しのぶ,がまんする・思い出す
29,す,する
30,ず,〜ない
31,すべ,方法・手段
32,ためし,例・手本
33,つきづきし,ふさわしい
34,つとめて,早朝
35,つれづれ,退屈だ・所在ない
36,としごろ,長年
37,とて,〜といって
38,ども,〜けれども
39,なり,〜にいる・ある・〜である
40,なんぢ,おまえ
41,にあらず,〜ではない
42,にはか,急に
43,はなはだ,とても
44,ひさし(久し),長い
45,ふみ,手紙・文書
46,む(ん),〜だろう・〜しよう
47,よし,理由・方法
48,よろづ,すべて・いろいろ
49,ありがたし,めったにない
50,いとほし,気の毒だ
51,あな,ああ・あら
52,あまた,たくさん
53,あやなし,筋が通らない
54,あし,悪い
55,あり,存在する
56,口惜し,残念だ
57,けり,〜た（過去）
58,ごとし,〜のようだ
59,ことわり(理),道理
60,かく,このように
61,かかる,このような
62,いはく(曰く),言うことには
63,いとど,ますます
64,おのれ,自分・お前
65,おのづから,自然に・ひとりで
66,おきな,おじいさん
67,いかで,どうして・なんとかして
68,いかなる,どういう
69,いかに,なぜ・どのように
70,いざ,さあ
71,をかし,趣がある・風情がある
72,あした,早朝・朝
73,ゆゑ,〜のため・理由
74,さま,様子
75,かなし,かわいい
76,ありがたし,めったにない
77,うつくし,かわいい
78,いと,とても
79,けしき,様子・態度
80,しのぶ,がまんする`;

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

function parseCSV(text) {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","))
    .filter((c) => c[1] && c[2])
    .map((c, i) => ({ no: c[0] || i + 1, q: c[1], a: c[2] }));
}

// カタカナ→ひらがな、空白・句読点除去、英数は小文字化
function normalize(s) {
  if (!s) return "";
  const z = s
    .replace(/[\s　]/g, "")
    .replace(/[、。,.．]/g, "")
    .replace(/[ァ-ン]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x60)
    )
    .toLowerCase();
  return z;
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

const TEST_SIZE = 20;
const DEFAULT_DURATION_SEC = 5 * 60;

export default function App() {
  const [phase, setPhase] = useState("quiz"); // quiz | lastFeedback | summaryList | result
  const [questions, setQuestions] = useState([]);
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

  // 初期読み込み（非復元抽選）
  useEffect(() => {
    const parsed = parseCSV(DEFAULT_CSV);
    const size = Math.min(TEST_SIZE, parsed.length);
    setQuestions(shuffle(parsed).slice(0, size));
  }, []);

  // タイマー（quiz 中のみ動作）
  useEffect(() => {
    if (phase !== "quiz") return;
    if (remainSec <= 0) {
      // 時間切れでも最終の結果表示を優先したい：直近問題の表示へ
      // もしまだ履歴が無ければ、そのまま summaryList へ
      setPhase(history.length > 0 ? "lastFeedback" : "summaryList");
      return;
    }
    timerRef.current = setTimeout(() => setRemainSec((r) => r - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [remainSec, phase, history.length]);

  const expectedListOf = (a) =>
    normalize(a).split(/[・、,／/]/).filter(Boolean);

  const check = () => {
    const q = questions[current];
    if (!q) return;
    const expectedList = expectedListOf(q.a);
    const user = normalize(input);
    let isCorrect = false;
    if (user.length > 0)
      isCorrect = expectedList.some(
        (e) => e.length > 0 && (user.includes(e) || e.includes(user))
      );

    if (isCorrect) setCorrect((c) => c + 1);
    const rec = { no: q.no, q: q.q, expected: q.a, given: input, ok: isCorrect };
    setHistory((prev) => [...prev, rec]);

    const isLast = current + 1 >= questions.length;
    if (isLast) {
      // 最終問題の直後は必ず「lastFeedback」を表示
      setPhase("lastFeedback");
    } else {
      setCurrent((c) => c + 1);
      setInput("");
    }
  };

  const goSummaryFromLastFeedback = () => {
    setPhase("summaryList");
  };

  const restart = () => {
    const parsed = parseCSV(DEFAULT_CSV);
    const size = Math.min(TEST_SIZE, parsed.length);
    setQuestions(shuffle(parsed).slice(0, size));
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

  // 送信（プリフライト回避・読めるCORS）＋擬似進捗
  const sendToSheet = async () => {
    if (sending) return;
    setSending(true);
    setSendStatus("送信中...");
    setSendProgress(0);

    // 擬似プログレス：0→90% を一定間隔で進行、応答で100%
    let p = 0;
    const tick = () => {
      p = Math.min(p + 5, 90);
      setSendProgress(p);
    };
    const timerId = setInterval(tick, 200);

    const payload = {
      timestamp: toJSTISOString(new Date()),
      name: studentName || "",
      total: questions.length,
      correct,
      percent: Math.round((correct / questions.length) * 100),
      history,
    };

    try {
      const body = new URLSearchParams({ payload: JSON.stringify(payload) });
      const res = await fetch(SHEETS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      });

      let json = null;
      try {
        json = await res.json();
      } catch (e) {
        throw new Error("サーバからのJSONを解析できません");
      }
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json && json.error ? json.error : "サーバがエラーを返しました");
      }

      clearInterval(timerId);
      setSendProgress(100);
      setSendStatus("送信完了！");
    } catch (e) {
      clearInterval(timerId);
      setSendStatus("送信失敗：" + e.message);
    } finally {
      setTimeout(() => setSending(false), 800);
    }
  };

  const mm = Math.floor(remainSec / 60).toString().padStart(2, "0");
  const ss = Math.floor(remainSec % 60).toString().padStart(2, "0");
  const progress =
    phase !== "quiz" || questions.length === 0
      ? 100
      : Math.floor((current / questions.length) * 100);

  // 最終問題のレコード（lastFeedbackで表示）
  const lastRec = history[history.length - 1];

  return (
    <div style={S.page} data-kobun-app>
      <div style={S.container} className="kobun-container">
        <h1 style={S.header}>古文単語テスト</h1>

        {/* 共通ヘッダー（quiz中のみタイマー進行） */}
        <div style={S.timer}>
          タイマー：{mm}:{ss}
        </div>
        <div style={S.barWrap}>
          <div style={S.bar(progress)} />
        </div>

        {/* ヘッダー操作（持ち時間・氏名） */}
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
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  直近の結果
                </div>
                <ul style={S.list}>
                  {history
                    .slice(-5) // 直近だけ簡易表示
                    .reverse()
                    .map((h, i) => (
                      <li key={i} style={S.li(h.ok)}>
                        <div>
                          <span style={{ color: "#6b7280" }}>問題：</span>
                          {h.q}
                        </div>
                        <div>
                          <span style={{ color: "#6b7280" }}>正解：</span>
                          {h.expected}
                        </div>
                        <div>
                          <span style={{ color: "#6b7280" }}>
                            あなたの解答：
                          </span>
                          {h.given}
                        </div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: h.ok ? "#047857" : "#b91c1c",
                          }}
                        >
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
                  <span style={{ color: "#6b7280" }}>問題：</span>
                  {lastRec.q}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>あなたの解答：</span>
                  {lastRec.given}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>正解：</span>
                  {lastRec.expected}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={S.badge(lastRec.ok)}>
                    {lastRec.ok ? "正解" : "不正解"}
                  </span>
                </div>
              </div>
            ) : (
              <div>データが見つかりません。</div>
            )}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={goSummaryFromLastFeedback}
                style={{ ...S.primaryBtn, width: "100%" }}
              >
                全体の結果を見る
              </button>
            </div>
          </div>
        )}

        {phase === "summaryList" && (
          <div style={S.card}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              全20問の一覧
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
                        <span style={S.badge(h.ok)}>
                          {h.ok ? "○" : "×"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...S.footerBtnsCol, marginTop: 16 }}>
              {/* 変更①：間違いだけ復習（青背景＋白文字） */}
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
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
              テスト終了！
            </div>
            <div style={{ fontSize: 18, marginBottom: 12 }}>
              正解数：{correct} / {questions.length} 問（
              {Math.round((correct / questions.length) * 100)}%）
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
              所要時間：{mm}:{ss}
            </div>

            <div style={S.footerBtnsCol}>
              {/* 変更②：もう一度（青背景＋白文字） */}
              <button
                onClick={restart}
                style={{ ...S.primaryBtn, width: "100%", background: "#3B82F6", color: "#FFFFFF" }}
              >
                もう一度（新しい20問）
              </button>

              {/* 変更③：間違いだけ復習（青背景＋白文字） */}
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

              {/* 進捗％とステータス */}
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
  // normalize: カタカナ→ひらがな, 空白/句読点除去
  console.assert(normalize("  ア  ") === "あ", "normalize: カナ→ひらがな/空白除去");
  console.assert(normalize("あ 。,。") === "あ", "normalize: 句読点除去");

  // 複数意味の一部一致
  const expectedList = "趣がある・風情がある";
  const user1 = "趣がある";
  const user2 = "風情";
  const list = expectedList.split(/[・、,／/]/).filter(Boolean).map((t) => normalize(t));
  console.assert(
    list.some((e) => normalize(user1).includes(e) || e.includes(normalize(user1))),
    "partial match 1"
  );
  console.assert(
    list.some((e) => normalize(user2).includes(e) || e.includes(normalize(user2))),
    "partial match 2"
  );
})();
