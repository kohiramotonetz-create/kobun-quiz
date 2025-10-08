import React, { useEffect, useRef, useState } from "react";

// 古文単語テスト（片方一致OK・20問ランダム・直近の結果・タイマー・スプレッドシート送信・日本時間対応）

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

function parseCSV(text) {
  return text.split(/\r?\n/).slice(1).map(line => line.split(',')).filter(c => c[1] && c[2]).map((c, i) => ({ no: c[0] || i + 1, q: c[1], a: c[2] }));
}

function normalize(s) {
  if (!s) return "";
  return s.replace(/[\s　]/g, '').replace(/[、。,.．]/g, '').replace(/[ぁ-ん]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).toLowerCase();
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
  return jstDate.toISOString().replace('T', ' ').substring(0, 19);
}

export default function App() {
  const TEST_SIZE = 20;
  const DEFAULT_DURATION_SEC = 5 * 60;
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [input, setInput] = useState('');
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [history, setHistory] = useState([]);
  const [studentName, setStudentName] = useState('');
  const [sendStatus, setSendStatus] = useState('');
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
    if (remainSec <= 0) { setFinished(true); return; }
    timerRef.current = setTimeout(() => setRemainSec(r => r - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [remainSec, finished]);

  const expectedListOf = (a) => normalize(a).split(/[・、,／/]/).filter(Boolean);

  const check = () => {
    const q = questions[current];
    if (!q) return;
    const expectedList = expectedListOf(q.a);
    const user = normalize(input);
    let isCorrect = false;
    if (user.length > 0) isCorrect = expectedList.some(e => e.length > 0 && (user.includes(e) || e.includes(user)));
    if (isCorrect) setCorrect(c => c + 1);
    setHistory(prev => [...prev, { no: q.no, q: q.q, expected: q.a, given: input, ok: isCorrect }]);
    if (current + 1 >= questions.length) setFinished(true);
    else { setCurrent(c => c + 1); setInput(''); }
  };

  const restart = () => {
    const parsed = parseCSV(DEFAULT_CSV);
    const size = Math.min(TEST_SIZE, parsed.length);
    setQuestions(shuffle(parsed).slice(0, size));
    setCurrent(0);
    setInput('');
    setCorrect(0);
    setFinished(false);
    setHistory([]);
    setRemainSec(durationSec);
  };

  const reviewWrong = () => {
    const wrong = history.filter(h => !h.ok).map(h => ({ no: h.no, q: h.q, a: h.expected }));
    if (!wrong.length) return;
    setQuestions(shuffle(wrong));
    setCurrent(0);
    setInput('');
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
      name: studentName || '',
      total: questions.length,
      correct,
      percent: Math.round((correct / questions.length) * 100),
      history
    };
    setSendStatus('送信中...');
    try {
      await fetch(SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      setSendStatus('送信完了！（日本時間で送信）');
    } catch (e) {
      setSendStatus('送信失敗：' + e.message);
    } finally {
      setTimeout(() => setSending(false), 1500);
    }
  };

  const mm = Math.floor(remainSec / 60).toString().padStart(2, '0');
  const ss = Math.floor(remainSec % 60).toString().padStart(2, '0');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-6 text-gray-900">
      <h1 className="text-2xl font-bold mb-2">古文単語テスト（日本時間対応）</h1>
      <div className="mb-4 text-sm text-gray-600">タイマー：{mm}:{ss}</div>
      <div className="w-full max-w-md mb-4 flex items-center gap-2">
        <input className="flex-1 border rounded-lg p-2" placeholder="受験者名（任意）" value={studentName} onChange={e => setStudentName(e.target.value)} />
        <select className="border rounded-lg p-2" value={durationSec} onChange={e => { const v = Number(e.target.value); setDurationSec(v); setRemainSec(v); }}>
          <option value={3 * 60}>3分</option>
          <option value={5 * 60}>5分</option>
          <option value={10 * 60}>10分</option>
        </select>
      </div>
      {!finished ? (
        <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow space-y-4">
          <div className="text-sm text-gray-500">{current + 1} / {questions.length} 問</div>
          <div className="text-xl font-semibold">{questions[current]?.q}</div>
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()} placeholder="意味を入力" className="w-full border rounded-lg p-2" />
          <button onClick={check} className="w-full bg-gray-900 text-white py-2 rounded-xl hover:bg-gray-800">答え合わせ</button>
          <div className="text-sm text-gray-600">正解 {correct} / {current} 問</div>
          {history.length > 0 && (
            <div className="text-sm mt-4">
              <div className="font-medium mb-1">直近の結果</div>
              <ul className="space-y-1 max-h-40 overflow-auto">
                {history.slice().reverse().map((h, i) => (
                  <li key={i} className={`p-2 rounded-lg border ${h.ok ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                    <div><span className="text-gray-500">問題：</span>{h.q}</div>
                    <div><span className="text-gray-500">正解：</span>{h.expected}</div>
                    <div><span className="text-gray-500">あなたの解答：</span>{h.given}</div>
                    <div className={`font-semibold ${h.ok ? 'text-green-700' : 'text-red-700'}`}>{h.ok ? '正解' : '不正解'}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow text-center">
          <div className="text-xl font-bold mb-2">テスト終了！</div>
          <div className="text-lg mb-4">正解数：{correct} / {questions.length} 問（{Math.round((correct / questions.length) * 100)}%）</div>
          <div className="flex flex-col gap-2 items-stretch">
            <button onClick={restart} className="px-4 py-2 rounded-xl bg-gray-900 text-white hover:bg-gray-800">もう一度（新しい20問）</button>
            <button onClick={reviewWrong} className="px-4 py-2 rounded-xl bg-white border hover:bg-gray-100">誤答だけ復習</button>
            <button onClick={sendToSheet} disabled={sending} className={`px-4 py-2 rounded-xl text-white ${sending ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {sending ? '送信中…' : 'スプレッドシートに送信（日本時間）'}
            </button>
            {sendStatus && <div className="text-sm text-gray-600">{sendStatus}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
