/**
 * Email layout primitives shared by transactional emails (verify-action,
 * alerts, billing).
 *
 * Email rendering across clients is hostile: Gmail strips <style> tags,
 * Outlook ignores `display:flex` and `gap`, iOS Mail collapses adjacent
 * whitespace. The only universally reliable layout primitive is
 * <table cellpadding cellspacing border="0">. These helpers produce
 * bulletproof markup that renders identically on Gmail, Outlook (incl.
 * 2016+ desktop), Apple Mail, Yahoo, and mobile clients.
 *
 * Design language matches the dashboard: dark surface, single accent,
 * clear hierarchy. Each builder accepts a small typed shape; callers
 * compose them into a section list and pass to `wrapEmail`.
 */

export type EmailButtonVariant = 'primary' | 'success' | 'danger' | 'ghost'

interface ButtonStyle {
  bg: string
  fg: string
  border: string
}

const BUTTON_STYLES: Record<EmailButtonVariant, ButtonStyle> = {
  primary: { bg: '#2563eb', fg: '#ffffff', border: '#1d4ed8' },
  success: { bg: '#059669', fg: '#ffffff', border: '#047857' },
  danger:  { bg: '#dc2626', fg: '#ffffff', border: '#b91c1c' },
  ghost:   { bg: '#1f2937', fg: '#f9fafb', border: '#374151' },
}

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Bulletproof single-button cell — uses padding on the <a> instead of <button>
 * so it renders as a clickable rectangle even when CSS is stripped.
 * 44×44px hit area meets WCAG 2.1 AA target size for touch.
 */
export function button(opts: {
  text: string
  href: string
  variant?: EmailButtonVariant
  fullWidth?: boolean
}): string {
  const v = BUTTON_STYLES[opts.variant ?? 'primary']
  const widthAttr = opts.fullWidth ? ' width="100%"' : ''
  const align = opts.fullWidth ? 'center' : 'left'
  return (
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0"${widthAttr} style="border-collapse:separate;">` +
    `<tr><td align="${align}" bgcolor="${v.bg}" ` +
    `style="background:${v.bg};border:1px solid ${v.border};border-radius:8px;padding:14px 28px;mso-padding-alt:14px 28px;">` +
    `<a href="${escapeHtml(opts.href)}" target="_blank" ` +
    `style="display:inline-block;color:${v.fg};font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;text-decoration:none;">` +
    `${escapeHtml(opts.text)}</a></td></tr></table>`
  )
}

/**
 * Two-button row with a hard-coded 16px spacer cell. This is the spacing fix —
 * Gmail/Outlook ignore `display:flex` and `gap`, so we use a 3-column table
 * (button | 16px spacer | button) which renders identically everywhere.
 *
 * On narrow viewports the spacer remains because we don't try to stack
 * (stacking requires `@media` which Gmail strips). Two buttons at 28px
 * horizontal padding each fit a 320px viewport without overlap.
 */
export function buttonRow(
  buttons: Array<{ text: string; href: string; variant?: EmailButtonVariant }>,
  opts: { gap?: number } = {},
): string {
  const gap = opts.gap ?? 16
  const cells = buttons
    .map((b, i) => {
      const buttonCell = `<td valign="middle">${button(b)}</td>`
      const spacerCell =
        i < buttons.length - 1
          ? `<td width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td>`
          : ''
      return buttonCell + spacerCell
    })
    .join('')
  return (
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" ` +
    `style="border-collapse:separate;margin:0 auto;"><tr>${cells}</tr></table>`
  )
}

/** Key/value rows used for context and metadata. */
export function detailsTable(rows: Array<[string, string]>): string {
  if (rows.length === 0) return ''
  const body = rows
    .map(
      ([k, v]) =>
        `<tr>` +
        `<td style="padding:6px 16px 6px 0;color:#9ca3af;font-size:13px;font-family:${FONT_STACK};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#f3f4f6;font-size:13px;font-family:${FONT_STACK};word-break:break-word;">${escapeHtml(v)}</td>` +
        `</tr>`,
    )
    .join('')
  return (
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" ` +
    `style="border-collapse:collapse;">${body}</table>`
  )
}

/** Severity-coloured pill used in the header. */
export function severityBadge(label: string, color: string): string {
  return (
    `<span style="display:inline-block;background:${color}22;color:${color};` +
    `font-family:${FONT_STACK};font-size:11px;font-weight:600;padding:4px 10px;` +
    `border-radius:4px;border:1px solid ${color}44;text-transform:uppercase;letter-spacing:0.05em;">` +
    `${escapeHtml(label)}</span>`
  )
}

/** Vertical spacer — used between sections. */
export function spacer(height = 24): string {
  return `<div style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</div>`
}

/**
 * Outer wrapper. Pure-table layout, no media queries, no flex. Renders
 * identically on Gmail, Outlook 2016+ (incl. Windows desktop), Apple Mail,
 * Yahoo, mobile clients.
 *
 * `preheader` is the snippet shown in the inbox preview line — critical for
 * open rates. Hidden in-body but read by clients before the user opens.
 */
export function wrapEmail(opts: {
  /** Title shown in browser tab when viewing as web. Doubles as the subject summary. */
  title: string
  /** Inbox-preview text — hidden in-body but shown alongside subject in Gmail/Apple Mail. */
  preheader: string
  /** Right-aligned label in the header (e.g. severity pill). */
  headerAccent?: string
  /** Top accent bar colour. Default neutral. */
  accentColor?: string
  /** Main content sections, already-rendered HTML. */
  sections: string[]
  /** Footer body — typically dashboard link + manage prefs. */
  footer?: string
}): string {
  const accent = opts.accentColor ?? '#2563eb'
  const content = opts.sections.join('\n')
  const footer = opts.footer ?? ''
  return (
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">` +
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="en">` +
    `<head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `<meta http-equiv="X-UA-Compatible" content="IE=edge">` +
    `<meta name="color-scheme" content="dark light">` +
    `<meta name="supported-color-schemes" content="dark light">` +
    `<title>${escapeHtml(opts.title)}</title>` +
    `<style>` +
    // Strip Outlook's default 1.5x line-height and Gmail's link auto-detection.
    `body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}` +
    `table,td{mso-table-lspace:0;mso-table-rspace:0;}` +
    `img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}` +
    `a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}` +
    `</style>` +
    `</head>` +
    `<body style="margin:0;padding:0;background:#09090b;font-family:${FONT_STACK};">` +
    // Preheader — hidden but read by clients
    `<div style="display:none;font-size:1px;color:#09090b;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>` +
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#09090b" style="background:#09090b;padding:32px 16px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#111113;border:1px solid #27272a;border-top:3px solid ${accent};border-radius:8px;overflow:hidden;">` +
    // Header
    `<tr><td style="padding:20px 32px;background:#0f0f11;border-bottom:1px solid #27272a;">` +
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>` +
    `<td valign="middle" style="font-family:${FONT_STACK};">` +
    `<span style="font-size:15px;font-weight:600;color:#f4f4f5;letter-spacing:-0.01em;">Sanctum Runtime</span>` +
    `</td>` +
    `<td valign="middle" align="right">${opts.headerAccent ?? ''}</td>` +
    `</tr></table>` +
    `</td></tr>` +
    // Body
    `<tr><td style="padding:32px;font-family:${FONT_STACK};">${content}</td></tr>` +
    // Footer
    (footer
      ? `<tr><td style="padding:16px 32px;border-top:1px solid #27272a;font-family:${FONT_STACK};font-size:12px;color:#52525b;line-height:1.5;">${footer}</td></tr>`
      : '') +
    `</table>` +
    `</td></tr></table>` +
    `</body></html>`
  )
}

/**
 * Render a plain-text version of an email for the `text` field — improves
 * deliverability (anti-spam scoring) and is shown to plain-text-only clients.
 */
export function plainText(opts: {
  title: string
  body: string
  details?: Array<[string, string]>
  actions?: Array<{ text: string; href: string }>
  footer?: string
}): string {
  const parts = [opts.title, '='.repeat(Math.min(opts.title.length, 60)), '', opts.body]
  if (opts.details?.length) {
    parts.push('')
    for (const [k, v] of opts.details) parts.push(`${k}: ${v}`)
  }
  if (opts.actions?.length) {
    parts.push('')
    for (const a of opts.actions) parts.push(`${a.text}: ${a.href}`)
  }
  if (opts.footer) {
    parts.push('', '—', opts.footer)
  }
  return parts.join('\n')
}
