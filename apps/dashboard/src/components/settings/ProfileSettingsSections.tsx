import { useEffect, useState } from 'react'
import { Building2, CreditCard, UserCircle } from 'lucide-react'
import { Alert } from '../ui/Alert'
import {
  fetchAccountProfile,
  fetchOrgProfile,
  updateAccountProfile,
  updateOrgProfile,
  type AccountProfile,
  type OrgProfile,
} from '../../lib/org-profile'
import { fetchBillingPlanFromSupabase } from '../../lib/billing-supabase'
import type { PlanId } from '../../lib/billing'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  normalizeWebsiteUrl,
} from '../../lib/signup-fields'

type Props = {
  orgId: string
  orgRole: string | undefined
}

function canEditOrg(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function ProfileSettingsSections({ orgId, orgRole }: Props) {
  const [account, setAccount] = useState<AccountProfile | null>(null)
  const [orgProfile, setOrgProfile] = useState<OrgProfile | null>(null)
  const [accountBusy, setAccountBusy] = useState(false)
  const [orgBusy, setOrgBusy] = useState(false)
  const [accountMsg, setAccountMsg] = useState<string | null>(null)
  const [orgMsg, setOrgMsg] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [countryCode, setCountryCode] = useState('')

  const [legalName, setLegalName] = useState('')
  const [website, setWebsite] = useState('')
  const [orgCountry, setOrgCountry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [industry, setIndustry] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactTitle, setContactTitle] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [dbPlanId, setDbPlanId] = useState<PlanId | null>(null)
  const [dbPlanStatus, setDbPlanStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    void fetchBillingPlanFromSupabase(orgId).then((p) => {
      if (p?.plan) {
        setDbPlanId(p.plan.id)
        setDbPlanStatus(p.billing?.creemSubscriptionStatus ?? p.billing?.billingStatus ?? null)
      }
    })
  }, [orgId])

  useEffect(() => {
    void fetchAccountProfile()
      .then((p) => {
        if (!p) return
        setAccount(p)
        setDisplayName(p.display_name ?? '')
        setJobTitle(p.job_title ?? '')
        setCountryCode(p.country_code ?? '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgId) return
    void fetchOrgProfile(orgId)
      .then((p) => {
        if (!p) return
        setOrgProfile(p)
        if (p.is_personal_workspace) {
          setWorkspaceName(p.name)
        } else {
          setLegalName(p.legal_name ?? p.name ?? '')
          setWebsite(p.website ? `https://${p.website}` : '')
          setOrgCountry(p.country_code ?? '')
          setCompanySize(p.company_size ?? '')
          setIndustry(p.industry ?? '')
          setContactName(p.primary_contact_name ?? '')
          setContactEmail(p.primary_contact_email ?? '')
          setContactTitle(p.primary_contact_title ?? '')
        }
      })
      .catch(() => {})
  }, [orgId])

  const saveAccount = async () => {
    setAccountBusy(true)
    setAccountMsg(null)
    try {
      const next = await updateAccountProfile({
        display_name: displayName.trim(),
        job_title: jobTitle.trim() || null,
        country_code: countryCode || undefined,
      })
      setAccount(next)
      setAccountMsg('Account profile saved.')
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setAccountBusy(false)
    }
  }

  const saveOrg = async () => {
    if (!orgId || !orgProfile) return
    setOrgBusy(true)
    setOrgMsg(null)
    try {
      if (orgProfile.is_personal_workspace) {
        const next = await updateOrgProfile(orgId, { workspace_name: workspaceName.trim() })
        setOrgProfile(next)
        setWorkspaceName(next.name)
      } else {
        const host = normalizeWebsiteUrl(website)
        if (!host) throw new Error('Enter a valid company website (e.g. acme.com).')
        const next = await updateOrgProfile(orgId, {
          legal_name: legalName.trim(),
          website,
          country_code: orgCountry,
          company_size: companySize,
          industry,
          primary_contact_name: contactName.trim(),
          primary_contact_email: contactEmail.trim(),
          primary_contact_title: contactTitle.trim(),
        })
        setOrgProfile(next)
        setLegalName(next.legal_name ?? next.name ?? '')
        setWebsite(next.website ? `https://${next.website}` : '')
      }
      setOrgMsg('Organization profile saved.')
    } catch (e) {
      setOrgMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setOrgBusy(false)
    }
  }

  const orgEditable = canEditOrg(orgProfile?.caller_role ?? orgRole)

  return (
    <>
      <section className="section" id="account-profile">
        <div className="section__header">
          <h2>
            <UserCircle size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            Your account
          </h2>
          <p>Identity on file for security, billing, and compliance questionnaires</p>
        </div>
        <div className="section__body">
          {accountMsg && (
            <Alert
              variant={accountMsg.includes('saved') ? 'success' : 'error'}
              onDismiss={() => setAccountMsg(null)}
            >
              {accountMsg}
            </Alert>
          )}
          {(dbPlanId || account?.billing) && (
            <div
              className="stat-tile"
              style={{
                marginBottom: '1rem',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={18} style={{ opacity: 0.7 }} />
                <div>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Subscription
                  </p>
                  <p style={{ margin: '0.1rem 0 0', fontWeight: 600 }}>
                    {account?.billing?.plan_name
                      ?? (dbPlanId === 'personal'
                        ? 'Personal'
                        : dbPlanId === 'operator'
                          ? 'Operator'
                          : dbPlanId === 'team'
                            ? 'Team'
                            : 'Developer')}
                    {(account?.billing?.price_monthly_usd != null || dbPlanId === 'personal') && (
                      <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: '0.35rem' }}>
                        {account?.billing?.price_monthly_usd != null
                          ? `$${account.billing.price_monthly_usd}/mo`
                          : dbPlanId === 'personal'
                            ? '$12/mo'
                            : ''}
                      </span>
                    )}
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {dbPlanStatus || account?.billing?.creem_subscription_status
                      ? `Creem · ${dbPlanStatus ?? account?.billing?.creem_subscription_status}`
                      : (dbPlanId ?? account?.billing?.plan_id) === 'observer'
                        ? 'Free tier — upgrade on Billing for governed actions'
                        : 'Active (from Supabase)'}
                    {account?.billing?.billing_status && account.billing.billing_status !== 'active'
                      ? ` · ${account.billing.billing_status}`
                      : ''}
                  </p>
                </div>
              </div>
              <a href="?page=billing" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                Manage plan
              </a>
            </div>
          )}
          <div className="settings-form-grid">
            <div>
              <label className="settings-label">Email</label>
              <input className="input" type="email" value={account?.email ?? ''} disabled style={{ width: '100%' }} />
            </div>
            <div>
              <label className="settings-label">Full name</label>
              <input
                className="input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label className="settings-label">Job title</label>
              <input
                className="input"
                type="text"
                placeholder="Platform Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label className="settings-label">Country or region</label>
              <select
                className="input auth-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Select country</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {account?.accepted_terms_at && (
            <p className="hint-line" style={{ marginTop: '0.75rem' }}>
              Terms accepted {new Date(account.accepted_terms_at).toLocaleDateString()}
              {account.terms_version ? ` (${account.terms_version})` : ''}.
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            disabled={accountBusy}
            onClick={() => void saveAccount()}
          >
            {accountBusy ? 'Saving…' : 'Save account profile'}
          </button>
        </div>
      </section>

      {orgProfile && (
        <section className="section" id="organization-profile">
          <div className="section__header">
            <h2>
              <Building2 size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
              {orgProfile.is_personal_workspace ? 'Workspace' : 'Organization profile'}
            </h2>
            <p>
              {orgProfile.is_personal_workspace
                ? 'Display name for your personal workspace'
                : 'Legal and vendor details used for SOC 2, billing, and enterprise onboarding'}
            </p>
          </div>
          <div className="section__body">
            {orgMsg && (
              <Alert variant={orgMsg.includes('saved') ? 'success' : 'error'} onDismiss={() => setOrgMsg(null)}>
                {orgMsg}
              </Alert>
            )}
            {!orgEditable && (
              <p className="hint-line" style={{ marginBottom: '1rem' }}>
                View only — contact an organization owner or admin to update these fields.
              </p>
            )}
            {orgProfile.is_personal_workspace ? (
              <div style={{ maxWidth: '28rem' }}>
                <label className="settings-label">Workspace name</label>
                <input
                  className="input"
                  type="text"
                  value={workspaceName}
                  disabled={!orgEditable}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            ) : (
              <div className="settings-form-grid">
                <div className="settings-form-grid__full">
                  <label className="settings-label">Legal business name</label>
                  <input
                    className="input"
                    type="text"
                    value={legalName}
                    disabled={!orgEditable}
                    onChange={(e) => setLegalName(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label className="settings-label">Company website</label>
                  <input
                    className="input"
                    type="url"
                    value={website}
                    disabled={!orgEditable}
                    onChange={(e) => setWebsite(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label className="settings-label">Country or region</label>
                  <select
                    className="input auth-select"
                    value={orgCountry}
                    disabled={!orgEditable}
                    onChange={(e) => setOrgCountry(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select country</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="settings-label">Company size</label>
                  <select
                    className="input auth-select"
                    value={companySize}
                    disabled={!orgEditable}
                    onChange={(e) => setCompanySize(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select size</option>
                    {COMPANY_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="settings-label">Industry</label>
                  <select
                    className="input auth-select"
                    value={industry}
                    disabled={!orgEditable}
                    onChange={(e) => setIndustry(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select industry</option>
                    {INDUSTRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="settings-label">Primary contact name</label>
                  <input
                    className="input"
                    type="text"
                    value={contactName}
                    disabled={!orgEditable}
                    onChange={(e) => setContactName(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label className="settings-label">Primary contact email</label>
                  <input
                    className="input"
                    type="email"
                    value={contactEmail}
                    disabled={!orgEditable}
                    onChange={(e) => setContactEmail(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label className="settings-label">Primary contact title</label>
                  <input
                    className="input"
                    type="text"
                    value={contactTitle}
                    disabled={!orgEditable}
                    onChange={(e) => setContactTitle(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="settings-form-grid__full">
                  <p className="hint-line">
                    Org ID <code className="inline-code">{orgProfile.id}</code>
                    {orgProfile.signup_source ? ` · Registered via ${orgProfile.signup_source}` : ''}
                  </p>
                </div>
              </div>
            )}
            {orgEditable && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                disabled={orgBusy}
                onClick={() => void saveOrg()}
              >
                {orgBusy ? 'Saving…' : orgProfile.is_personal_workspace ? 'Save workspace' : 'Save organization profile'}
              </button>
            )}
          </div>
        </section>
      )}
    </>
  )
}
