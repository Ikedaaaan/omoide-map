// おもいでタイムの通知を送るスクリプト(GitHub Actions から10分おきに呼ばれる)
// 日付ごとに決まった「ランダムな時刻」(日本時間12:00〜20:50)を過ぎたら、その日1回だけ全員に通知する
const crypto = require("crypto");
const admin = require("firebase-admin");

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.error("FIREBASE_SERVICE_ACCOUNT がありません(GitHubのSecretsに登録してね)"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();

const JST = 9 * 3600 * 1000;
const nowJ = new Date(Date.now() + JST);
const date = nowJ.toISOString().slice(0, 10);              // 例: 2026-11-14
const minutesNow = nowJ.getUTCHours() * 60 + nowJ.getUTCMinutes();

// 日付から決まる今日の時刻(12:00〜20:50の間)。同じ日なら何度計算しても同じ
const h = crypto.createHash("sha256").update("omoide-time:" + date).digest();
const target = 12 * 60 + (h.readUInt32BE(0) % (9 * 60 - 10));
const force = String(process.env.FORCE) === "true";

(async () => {
  console.log(`date=${date} now=${Math.floor(minutesNow/60)}:${String(minutesNow%60).padStart(2,"0")} target=${Math.floor(target/60)}:${String(target%60).padStart(2,"0")} force=${force}`);
  if (!force && minutesNow < target) { console.log("まだ時間前"); return; }

  const ref = db.doc(`daily/${date}`);
  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { date, at: Date.now() });
    return true;
  });
  if (!created) { console.log("今日はもう送信済み"); return; }

  const tokens = await db.collectionGroup("push").get();
  console.log(`送信先: ${tokens.size}件`);
  let ok = 0, ng = 0;
  for (const d of tokens.docs) {
    const token = d.get("token");
    if (!token) continue;
    try {
      await admin.messaging().send({
        token,
        webpush: {
          notification: {
            title: "⚡ おもいでタイム！",
            body: "2分以内に、今いる場所の写真を撮ろう📸",
            icon: "https://ikedaaaan.github.io/omoide-map/icons/icon-192.png",
          },
          fcmOptions: { link: "https://ikedaaaan.github.io/omoide-map/?real=1" },
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
  console.log(`完了: 成功${ok} 失敗${ng}`);
})().catch((e) => { console.error(e); process.exit(1); });
