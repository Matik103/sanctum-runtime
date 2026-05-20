/**
 * Firebase Cloud Messaging (FCM) — server-side push delivery.
 *
 * Env vars required (all set in Render):
 *   FIREBASE_PROJECT_ID      – Firebase project ID
 *   FIREBASE_CLIENT_EMAIL    – service account client_email
 *   FIREBASE_PRIVATE_KEY     – service account private_key (incl. \n escapes)
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import type { NotificationEvent, NotificationSeverity } from './notifications.js'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

let adminApp: App | null = null

function getAdminApp(): App | null {
  if (adminApp) return adminApp
  const projectId   = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[fcm] Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY — push disabled')
    return null
  }

  try {
    if (getApps().length > 0) {
      adminApp = getApps()[0]
    } else {
      adminApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
    }
  } catch (e) {
    console.warn('[fcm] Firebase Admin init failed:', e)
    return null
  }
  return adminApp
}

function severityIcon(severity: NotificationSeverity): string {
  switch (severity) {
    case 'emergency': return '🚨'
    case 'critical':  return '🔴'
    case 'warning':   return '⚠️'
    default:          return 'ℹ️'
  }
}

export async function sendFcmToOrg(
  event: NotificationEvent,
  cfg: SupabaseAuthConfig,
): Promise<void> {
  const app = getAdminApp()
  if (!app) return

  const db = createSupabaseAdmin(cfg)
  const { data: rows, error } = await db
    .from('push_subscriptions')
    .select('fcm_token')
    .eq('org_id', event.orgId)

  if (error) {
    console.warn('[fcm] Failed to fetch push tokens:', error.message)
    return
  }
  const tokens = (rows ?? []).map((r: { fcm_token: string }) => r.fcm_token).filter(Boolean)
  if (tokens.length === 0) return

  const sev = event.severity ?? 'info'
  const icon = severityIcon(sev)
  const messaging = getMessaging(app)

  const { responses } = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `${icon} ${event.title}`,
      body: event.body,
    },
    webpush: {
      notification: {
        icon: '/favicon-512.png',
        badge: '/favicon.png',
        tag: `${event.orgId}:${event.type}`,
        renotify: true,
      },
      fcmOptions: { link: process.env.DASHBOARD_URL ?? 'https://app.sanctumruntime.com' },
    },
    data: {
      type: event.type,
      orgId: event.orgId,
      severity: sev,
    },
  })

  const failed = responses.filter((r) => !r.success)
  if (failed.length > 0) {
    console.warn(`[fcm] ${failed.length}/${tokens.length} push(es) failed`)
    // Remove stale tokens (NotRegistered / InvalidRegistration)
    const staleTokens: string[] = []
    responses.forEach((r, i) => {
      const code = r.error?.code
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token') {
        staleTokens.push(tokens[i])
      }
    })
    if (staleTokens.length > 0) {
      void db.from('push_subscriptions').delete().in('fcm_token', staleTokens)
        .then(() => console.log(`[fcm] Removed ${staleTokens.length} stale token(s)`))
    }
  }
}
