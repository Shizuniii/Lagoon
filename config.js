// config.js – die Verbindung zu deinem Firebase-Projekt.
//
// So kommst du an die Werte: Firebase Console → Zahnrad → Project settings → General →
// "Your apps" → deine Web-App → "SDK setup and configuration" → "Config".
// Kopier die Werte von dort hier hinein (die Anführungszeichen bleiben stehen).
//
// Diese Werte sind nicht geheim – sie stehen in jeder Firebase-Web-App öffentlich im Code.
// Wer reinkommt, entscheiden der Gruppencode und die Datenbank-Regeln (database.rules.json).

export const firebaseConfig = {
  apiKey: 'DEIN_API_KEY',
  authDomain: 'DEIN-PROJEKT.firebaseapp.com',
  databaseURL: 'https://DEIN-PROJEKT-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'DEIN-PROJEKT',
  storageBucket: 'DEIN-PROJEKT.firebasestorage.app',
  messagingSenderId: 'DEINE_SENDER_ID',
  appId: 'DEINE_APP_ID',
};
