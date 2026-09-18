import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, Eye, EyeOff, LockKeyhole, Mail, UserRound, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import students from '../../assets/students-study.jpg'
import '../../pages/LoginPage.css'

function Brand() {
  return <div className="auth-brand"><span className="auth-brand-icon"><BookOpen aria-hidden="true" /></span><div><strong>StudyMate</strong><small>AI STUDY COMPANION</small></div></div>
}

function Leaves({ className = '' }) {
  return <svg className={`auth-leaves ${className}`} viewBox="0 0 140 220" fill="none" aria-hidden="true"><path d="M15 220Q85 130 91 10" stroke="currentColor" strokeWidth="2" />{[0,1,2,3,4].map((n) => <g key={n} transform={`translate(${n * 12},${180 - n * 36})`}><path d="M0 0Q-30-7-23-39Q5-32 0 0Z" fill="currentColor"/><path d="M5-8Q20-42 49-29Q38-4 5-8Z" fill="currentColor"/></g>)}</svg>
}

function Field({ id, label, icon: Icon, password = false, ...props }) {
  const [visible, setVisible] = useState(false)
  return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-input"><Icon aria-hidden="true" /><input id={id} name={id} {...props} type={password ? (visible ? 'text' : 'password') : props.type || 'text'} />{password && <button type="button" className="auth-eye" onClick={() => setVisible(!visible)} disabled={props.disabled} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <EyeOff /> : <Eye />}</button>}</div></div>
}

export default function AuthPage({ mode = 'login' }) {
  const isSignup = mode === 'signup'
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const update = (key) => (event) => { setValues({ ...values, [key]: event.target.value }); setError('') }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (isSignup && !values.name.trim()) { setError('Please enter your full name.'); return }
    if (isSignup && values.password !== values.confirm) { setError('Passwords do not match. Please confirm your password.'); return }
    setBusy(true)
    try {
      if (isSignup) await signup(values.name, values.email, values.password)
      else await login(values.email, values.password)
      navigate(location.state?.from?.pathname || '/home', { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to continue. Please try again.')
    } finally { setBusy(false) }
  }

  return <main className={`auth-page ${isSignup ? 'auth-signup' : 'auth-login'}`}>
    <Leaves className="auth-corner-bottom" /><Leaves className="auth-corner-top" />
    <div className="auth-layout">
      <section className="auth-intro" aria-label="StudyMate AI study companion">
        <Link to="/" className="auth-home" aria-label="StudyMate home"><Brand /></Link>
        <div className="auth-intro-copy"><span className="auth-rule" /><h1>{isSignup ? <>Build your<br />learning journey.</> : <>Know exactly<br />what you know.</>}</h1>
          <p>{isSignup ? 'Create your account and get personalized support, track your progress, and study smarter with AI.' : 'Track mastery, close gaps, and study smarter with an AI tutor grounded in your own material.'}</p>
          {!isSignup && <img className="auth-students" src={students} alt="Students learning together with books and laptops" />}
          <div className="auth-benefits">{['Learn', 'Practice', 'Master'].map((item) => <span key={item}><Check aria-hidden="true" />{item}</span>)}</div>
        </div>
      </section>
      <div className="auth-book">
        <div className="auth-book-left" aria-hidden="true"><Leaves className="auth-leaf-left" /><div className="auth-book-brand"><Brand /><span className="auth-rule" /><p>Better Learning<br />Ahead</p><span className="auth-underline" /></div>{!isSignup && <div className="auth-book-stack"><i /><i /><i /></div>}</div>
        <section className="auth-book-right" aria-labelledby="auth-title">
          <div className="auth-ribbon" aria-hidden="true" /><Leaves className="auth-leaf-right" />
          <div className="auth-form-content"><header><h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2><p>{isSignup ? 'Join StudyMate and start your learning journey.' : 'Continue your learning journey'}</p></header>
            <form onSubmit={submit} aria-busy={busy}>
              {isSignup && <Field id="full-name" label="Full name" icon={UserRound} value={values.name} onChange={update('name')} autoComplete="name" placeholder="Enter your full name" required maxLength={100} disabled={busy} />}
              <Field id="email" label="Email address" icon={Mail} value={values.email} onChange={update('email')} type="email" autoComplete="email" placeholder="Enter your email" required maxLength={320} disabled={busy} />
              <Field id="password" label="Password" icon={LockKeyhole} password value={values.password} onChange={update('password')} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? 'Create a password' : 'Enter your password'} required minLength={isSignup ? 6 : 1} disabled={busy} />
              {isSignup && <Field id="confirm-password" label="Confirm password" icon={LockKeyhole} password value={values.confirm} onChange={update('confirm')} autoComplete="new-password" placeholder="Confirm your password" required minLength={6} disabled={busy} />}
              {!isSignup && <button className="auth-forgot" type="button" onClick={() => setResetOpen(true)}>Forgot password?</button>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? (isSignup ? 'Creating account…' : 'Logging in…') : (isSignup ? 'Create account' : 'Log in')}{!busy && <ArrowRight aria-hidden="true" />}</button>
            </form>
            <div className="auth-switch"><span>{isSignup ? 'Already have an account?' : "Don’t have an account?"} <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Log in' : 'Sign up'}</Link></span></div>
          </div>
        </section>
      </div>
    </div>
    {resetOpen && <div className="auth-dialog-backdrop" onClick={() => setResetOpen(false)}><div className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setResetOpen(false) }}><button autoFocus className="auth-dialog-close" type="button" onClick={() => setResetOpen(false)} aria-label="Close password help"><X /></button><h2 id="reset-title">Password help</h2><p>Password reset is not available yet. Contact your StudyMate administrator for help accessing your account.</p><button className="auth-submit" type="button" onClick={() => setResetOpen(false)}>Back to login</button></div></div>}
  </main>
}
