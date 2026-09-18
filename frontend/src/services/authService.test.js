import assert from 'node:assert/strict'
import { beforeEach, afterEach, test } from 'node:test'
import { authService, AUTH_TIMEOUT_MS } from './authService.js'

const originalFetch = globalThis.fetch
beforeEach(() => {
  const data = new Map()
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
})
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.localStorage })

test('login normalizes email and restores the server session', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/auth/login')
    assert.deepEqual(JSON.parse(options.body), { email: 'student@example.com', password: 'secret' })
    return Response.json({ user: { id: 'u1', role: 'student', is_demo: false }, token: 'tok_test' })
  }
  const result = await authService.login(' Student@Example.com ', 'secret')
  assert.equal(result.token, 'tok_test')
  assert.equal(authService.getCurrentUser().id, 'u1')
})

test('invalid credentials do not create a local session', async () => {
  globalThis.fetch = async () => Response.json({ detail: 'Invalid email or password.' }, { status: 401 })
  await assert.rejects(authService.login('a@b.com', 'bad'), /Invalid email or password/)
  assert.equal(authService.getCurrentUser(), null)
})

test('network failure does not fall back to browser-only authentication', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(authService.signup('Test', 'a@b.com', 'secret'), /backend is running/)
  assert.equal(authService.isAuthenticated(), false)
})

test('stalled login times out and a retry can succeed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })
  const pending = assert.rejects(authService.login('a@b.com', 'secret'), /too long/)
  t.mock.timers.tick(AUTH_TIMEOUT_MS)
  await pending
  assert.equal(authService.isAuthenticated(), false)
  globalThis.fetch = async () => Response.json({ user: { id: 'u1' }, token: 'tok_retry' })
  await authService.login('a@b.com', 'secret')
  assert.equal(authService.isAuthenticated(), true)
})

test('invalid API responses and validation errors are readable', async () => {
  globalThis.fetch = async () => Response.json({ detail: [{ msg: 'Invalid email' }] }, { status: 422 })
  await assert.rejects(authService.login('bad', 'secret'), /Invalid email/)
  globalThis.fetch = async () => Response.json({})
  await assert.rejects(authService.login('a@b.com', 'secret'), /invalid response/)
})
