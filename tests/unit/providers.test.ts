import { afterEach, describe, expect, it } from 'vitest'
import { github, gitlab, setFetcher } from '../../src/main/hosting/providers'

type Call = { url: string; headers: Record<string, string> }

function mockFetch(
  routes: Record<string, { status?: number; body: unknown; headers?: Record<string, string> }>
): Call[] {
  const calls: Call[] = []
  setFetcher((async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const key = Object.keys(routes).find((k) => url.includes(k))
    const r = key ? routes[key]! : { status: 404, body: {} }
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers })
  }) as typeof fetch)
  return calls
}

afterEach(() => setFetcher((...a) => fetch(...a)))

describe('GitHub provider', () => {
  it('maps remotes to repositories', () => {
    expect(github.toRef('git@github.com:octo/hello.git', 'https://github.com')).toMatchObject({
      owner: 'octo',
      name: 'hello',
      webUrl: 'https://github.com/octo/hello'
    })
    expect(github.toRef('https://gitlab.com/octo/hello.git', 'https://github.com')).toBeNull()
  })

  it('lists pull requests through the REST API with a bearer token', async () => {
    const calls = mockFetch({
      '/repos/octo/hello/pulls?': {
        body: [
          {
            number: 7,
            title: 'Add feature',
            user: { login: 'mona' },
            state: 'open',
            draft: true,
            head: { ref: 'feat', sha: 'abc' },
            base: { ref: 'main' },
            html_url: 'https://github.com/octo/hello/pull/7',
            updated_at: '2026-10-01T00:00:00Z',
            body: '<script>x</script>'
          },
          {
            number: 6,
            title: 'Merged',
            user: null,
            state: 'closed',
            merged_at: '2026-09-01T00:00:00Z',
            head: { ref: 'old', sha: 'def' },
            base: { ref: 'main' },
            html_url: 'u',
            updated_at: '2026-09-01T00:00:00Z'
          }
        ]
      }
    })
    const ref = github.toRef('https://github.com/octo/hello', 'https://github.com')!
    const prs = await github.pullRequests(ref, 'https://github.com', 'tok123', 'all')
    expect(calls[0]!.url).toMatch(
      /^https:\/\/api\.github\.com\/repos\/octo\/hello\/pulls\?state=all/
    )
    expect(calls[0]!.headers['Authorization']).toBe('Bearer tok123')
    expect(prs.map((p) => [p.number, p.state, p.draft, p.author])).toEqual([
      [7, 'open', true, 'mona'],
      [6, 'merged', false, 'unknown']
    ])
    expect(prs[0]!.body).toBe('<script>x</script>')
  })

  it('reports invalid tokens and rate limits clearly', async () => {
    mockFetch({ '/user': { status: 401, body: {} } })
    await expect(github.whoami('https://github.com', 'bad')).rejects.toMatchObject({ code: 'AUTH' })
    mockFetch({
      '/user': {
        status: 403,
        body: {},
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '60' }
      }
    })
    await expect(github.whoami('https://github.com', 'tok')).rejects.toMatchObject({
      code: 'NETWORK',
      message: expect.stringMatching(/rate limit/i)
    })
  })

  it('uses the Enterprise API path for self-hosted servers', async () => {
    const calls = mockFetch({ '/api/v3/user': { body: { login: 'me' } } })
    expect(await github.whoami('https://ghe.example.com', 't')).toBe('me')
    expect(calls[0]!.url).toBe('https://ghe.example.com/api/v3/user')
  })
})

describe('GitLab provider', () => {
  it('supports nested groups', () => {
    expect(gitlab.toRef('git@gitlab.com:group/sub/proj.git', 'https://gitlab.com')).toMatchObject({
      owner: 'group/sub',
      name: 'proj'
    })
  })
})
