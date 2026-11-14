// 足あとタイムの通知を送るスクリプト(GitHub Actions から10分おきに呼ばれる)
// ・1日5回、決まった時間帯の中のランダムな時刻に「👣 足あとタイム」を送る
// ・21時に「🎨 今日の足あとアート」の完成を知らせる
// 時刻は日付から決まるので、同じ日なら何度計算しても同じ。送ったかどうかは daily/{日付} に記録する
const crypto = require("crypto");
const admin = require("firebase-admin");

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error("FIREBASE_SERVICE_ACCOUNT がありません(GitHubのSecretsに登録してね)"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();

const JST = 9 * 3600 * 1000;
const nowJ = new Date(Date.now() + JST);
const date = nowJ.toISOString().slice(0, 10);              // 例: 2026-11-15
const minutesNow = nowJ.getUTCHours() * 60 + nowJ.getUTCMinutes();
const force = String(process.env.FORCE) === "true";

// 5回分の時間帯(日本時間・分)。この中のランダムな時刻に送る
const WINDOWS = [[8*60, 10*60], [11*60, 13*60], [14*60, 16*60], [17*60, 18*60+30], [19*60, 20*60+40]];
const ART_AT = 21 * 60;
const target = (i) => {
  const h = crypto.createHash("sha256").update(`ashiato:${date}:${i}`).digest();
  const [a, b] = WINDOWS[i];
  return a + (h.readUInt32BE(0) % (b - a));
};
const hm = (m) => `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`;

async function sendAll(title, body, link) {
  const tokens = await db.collectionGroup("push").get();
  let ok = 0, ng = 0;
  for (const d of tokens.docs) {
    const token = d.get("token");
    if (!token) continue;
    try {
      await admin.messaging().send({
        token,
        webpush: {
          notification: { title, body, icon: "https://ikedaaaan.github.io/omoide-map/icons/icon-192.png" },
          fcmOptions: { link },
        },
      });
      ok++;
    } catch (e) {
      ng++;
      const code = e && e.code;
      console.log("送信失敗:", code);
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        await d.ref.delete(); // 使われなくなった通知先は消す
      }
    }
  }
  console.log(`「${title}」送信: 成功${ok} 失敗${ng}`);
}

(async () => {
  console.log(`date=${date} now=${hm(minutesNow)} slots=${WINDOWS.map((_, i) => hm(target(i))).join(",")} art=${hm(ART_AT)} force=${force}`);
  const ref = db.doc(`daily/${date}`);

  // 送るものを1つだけ決めて記録する(同時に動いても二重に送らないよう、トランザクションで)
  const job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : { date };
    const slots = { ...(d.slots || {}) };
    if (!d.art && (minutesNow >= ART_AT || (force && Object.keys(slots).length >= WINDOWS.length))) {
      tx.set(ref, { date, slots, art: Date.now() }, { merge: true });
      return { kind: "art" };
    }
    // 時刻を過ぎた回のうち、まだ送っていない一番新しい回を送る(遅れて取りこぼした古い回は飛ばす)
    let due = -1;
    for (let i = 0; i < WINDOWS.length; i++) if (!slots[i + 1] && (minutesNow >= target(i))) due = i;
    if (force && due < 0) { for (let i = 0; i < WINDOWS.length; i++) if (!slots[i + 1]) { due = i; break; } }
    if (due < 0) return null;
    const now = Date.now();
    for (let i = 0; i < due; i++) if (!slots[i + 1]) slots[i + 1] = -1;   // 飛ばした回の印
    slots[due + 1] = now;
    tx.set(ref, { date, slots }, { merge: true });
    return { kind: "slot", n: due + 1 };
  });

  if (!job) { console.log("今は送るものなし"); return; }
  if (job.kind === "art") {
    await sendAll("🎨 今日の足あとアートができたよ", "みんなの今日の足あとが1枚の絵になりました👣", "https://ikedaaaan.github.io/omoide-map/?art=1");
  } else {
    await sendAll(`👣 足あとタイム！(${job.n}/${WINDOWS.length})`, "今いる場所で1枚撮ろう📸 撮れなかったら飛ばしてもOK", "https://ikedaaaan.github.io/omoide-map/?real=1");
  }
})().catch((e) => { console.error(e); process.exit(1); });
