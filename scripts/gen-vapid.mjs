#!/usr/bin/env node
/**
 * Generate a fresh VAPID keypair for web-push notifications.
 *
 * Usage:
 *   npm run gen:vapid
 *
 * Then paste the printed values into Render → sanctum-api → Environment:
 *   VAPID_PUBLIC_KEY=<public>
 *   VAPID_PRIVATE_KEY=<private>
 *   VAPID_SUBJECT=mailto:ops@yourdomain.com   (already defaulted)
 *
 * Keys are durable — once set, do NOT rotate without coordinating with
 * existing subscriptions; rotating invalidates every browser subscription.
 */
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

const banner = '━'.repeat(72)
console.log(`\n${banner}`)
console.log('  VAPID keypair generated. Paste into Render → sanctum-api → Environment')
console.log(banner)
console.log(`\n  VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log(`  VAPID_SUBJECT=mailto:ops@sanctumruntime.com\n`)
console.log(`${banner}`)
console.log('  Store the private key in a password manager. Once rotated,')
console.log('  every existing browser subscription is invalidated.')
console.log(`${banner}\n`)
