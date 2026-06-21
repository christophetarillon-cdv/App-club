importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDpKbSvSu5CM3wdoBhCyaZyEAGGbtPs9dQ',
  authDomain: 'clubvoiron-dev.firebaseapp.com',
  projectId: 'clubvoiron-dev',
  storageBucket: 'clubvoiron-dev.firebasestorage.app',
  messagingSenderId: '959510245510',
  appId: '1:959510245510:web:44e18876571434366aa107',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Nouveau message';
  const body = payload.notification?.body ?? '';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    data: payload.data ?? {},
  });
});
