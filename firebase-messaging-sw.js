// おもいでマップ：通知を受け取るためのサービスワーカー
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD6BurYw0vgcm3vC-z6QJeKeXTnFlBvT-g",
  authDomain: "omoide-map-44499.firebaseapp.com",
  projectId: "omoide-map-44499",
  storageBucket: "omoide-map-44499.firebasestorage.app",
  messagingSenderId: "424450812814",
  appId: "1:424450812814:web:5e41d327cce966184f52df"
});
// 通知の表示とタップ時の移動(撮影画面 ?real=1)は、送信側の webpush.notification と fcmOptions.link に任せる
firebase.messaging();
