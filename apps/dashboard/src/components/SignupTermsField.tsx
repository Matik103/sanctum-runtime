import { privacyUrl, termsUrl } from '../lib/site-links'
import { TERMS_VERSION } from '../lib/signup-fields'

type Props = {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function SignupTermsField({ id, checked, onChange, disabled }: Props) {
  return (
    <div className="auth-field auth-field--checkbox">
      <label htmlFor={id} className="auth-checkbox-label">
        <input
          id={id}
          type="checkbox"
          className="auth-checkbox"
          checked={checked}
          disabled={disabled}
          required
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          I agree to the{' '}
          <a href={termsUrl} target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          {TERMS_VERSION ? ` (version ${TERMS_VERSION})` : null}.
        </span>
      </label>
    </div>
  )
}
