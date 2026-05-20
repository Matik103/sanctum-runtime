import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

let app: FirebaseApp | null = null
let messaging: Messaging | null = null

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) return null
  if (app) return app
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
  return app
}

export function getFirebaseMessaging(): Messaging | null {
  if (messaging) return messaging
  const fbApp = getFirebaseApp()
  if (!fbApp) return null
  try {
    messaging = getMessaging(fbApp)
  } catch {
    return null
  }
  return messaging
}

export async function requestFcmToken(): Promise<string | null> {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) return null

  const m = getFirebaseMessaging()
  if (!m) return null

  let swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
  if (!swReg) {
    swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
    await swReg.update()
  }

  // Send Firebase config to the SW so it can initialise messaging for background push
  const sw = swReg.installing ?? swReg.waiting ?? swReg.active
  sw?.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig })

  try {
    return await getToken(m, { vapidKey, serviceWorkerRegistration: swReg })
  } catch (e) {
    console.warn('[firebase] getToken failed:', e)
    return null
  }
}

export { onMessage, getFirebaseMessaging as messaging }
