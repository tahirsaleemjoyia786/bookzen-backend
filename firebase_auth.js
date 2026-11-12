// Firebase Admin — verifies the ID token the Flutter app sends after OTP.
// Phase 3 Stage B. Needs the service-account JSON in the env var
// FIREBASE_SERVICE_ACCOUNT (whole JSON, one variable). Never commit
// the JSON file to GitHub and never paste it in chat.
// Free: creating a service-account key costs nothing, no card needed.

let admin = null;
let initError = null;

function getAdmin() {
  if (admin || initError) return admin;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      initError = new Error('FIREBASE_SERVICE_ACCOUNT is not set');
      return null;
    }
    const serviceAccount = JSON.parse(raw);
    admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    initError = e;
    admin = null;
  }
  return admin;
}

async function verifyIdToken(idToken) {
  const a = getAdmin();
  if (!a) {
    const err = new Error(initError ? initError.message : 'Firebase Admin is not configured');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const decoded = await a.auth().verifyIdToken(idToken);
  return { uid: decoded.uid, phone: decoded.phone_number || null };
}

function isConfigured() {
  return getAdmin() !== null;
}

module.exports = { verifyIdToken, isConfigured };
