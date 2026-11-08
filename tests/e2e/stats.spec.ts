/// <reference lib="dom" />
// Repository Statistics through the real UI, checked against the known fixture and Git itself.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { STATS_EXPECTED, buildBulkHistory, buildStatsFixture } from '../integration/statsFixture'

const root = mkdtempSync(join(tmpdir(), 'spoon-e2e-stats-'))
const gitconfig = join(root, 'gitconfig')
writeFileSync(
  gitconfig,
  '[user]\n\tname = E2E\n\temail = e2e@spoon.invalid\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n'
)
// The fixture builders run git through process.env, so isolate this process's Git config too.
process.env['GIT_CONFIG_GLOBAL'] = gitconfig
process.env['GIT_CONFIG_NOSYSTEM'] = '1'
const env = { ...process.env } as Record<string, string>
const mainEntry = resolve('out/main/index.js')
const Mod = process.platform === 'darwin' ? 'Meta' : 'Control'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    env: { ...env, GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8'
  })

let seq = 0
function dir(name: string): string {
  const d = join(root, `${name}-${++seq}`)
  mkdirSync(d, { recursive: true })
  return d
}

async function stubPicker(app: ElectronApplication, d: string): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    const fake = async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
      canceled: false,
      filePaths: [target]
    })
    ;(dialog as unknown as { showOpenDialog: typeof fake }).showOpenDialog = fake
  }, d)
}

async function launch(
  name: string,
  repo: string
): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env['SPOON_E2E_EXE']
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [mainEntry] }),
    env: { ...env, SPOON_USER_DATA: join(root, `ud-${name}`) }
  })
  await stubPicker(app, repo)
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: /Open\s+An existing repository/ }).click()
  await expect(page.getByRole('toolbar', { name: 'Repository actions' })).toBeVisible()
  return { app, page }
}

async function failShot(page: Page): Promise<void> {
  await page.screenshot({ path: test.info().outputPath('failure.png') }).catch(() => undefined)
}

const openStats = async (page: Page): Promise<void> => {
  await page.getByRole('treeitem', { name: 'Statistics' }).filter({ visible: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Statistics' }).filter({ visible: true })
  ).toBeVisible()
}
// Inactive tabs stay mounted (hidden), so only look at what is visible.
const tile = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true })
const contributorRow = (page: Page, name: string) =>
  page.getByRole('table', { name: 'Contributors' }).getByRole('row').filter({ hasText: name })

test.afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  } catch {
    /* Electron may still hold files briefly */
  }
})

test('statistics match the fixture: scope, ranges, contributors, files, external refresh', async () => {
  const repo = dir('fixture')
  buildStatsFixture(repo)
  const { app, page } = await launch('fixture', repo)
  try {
    await openStats(page)
    await expect(tile(page, 'stats-scope')).toContainText('main · all time')
    await expect(tile(page, 'stat-total')).toContainText(String(STATS_EXPECTED.head.total))
    await expect(tile(page, 'stat-total')).toContainText('5 regular, 1 merge')
    await expect(tile(page, 'stat-contributors')).toContainText(
      String(STATS_EXPECTED.head.contributors)
    )
    // .mailmap merged "alice <alice@old.example>" into Alice: 2 commits + 1 merge.
    const alice = contributorRow(page, 'alice@example.com')
    await expect(alice.getByRole('cell').nth(1)).toHaveText('2')
    await expect(alice.getByRole('cell').nth(2)).toHaveText('1')
    await expect(alice.getByRole('cell').nth(4)).toHaveText('5') // lines added
    await expect(page.getByText('alice@old.example')).toHaveCount(0)
    // File statistics load separately.
    await expect(tile(page, 'stat-files-changed')).toContainText('4')
    await expect(tile(page, 'stat-files-changed')).toContainText('7 file changes')
    await expect(tile(page, 'stat-lines')).toContainText('+9')
    await expect(tile(page, 'stat-lines')).toContainText('−1')
    const files = page.getByRole('table', { name: 'Most changed files' })
    await expect(files.getByRole('row').nth(1)).toContainText('README.md')
    await expect(files).toContainText('src/app.ts')
    await expect(files).toContainText('(binary)')

    const shots = process.env['SPOON_SCREENSHOTS']
    if (shots) {
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(shots, 'statistics.png') })
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
      await page.keyboard.press(`${Mod}+Alt+KeyL`)
      await page.waitForTimeout(500)
      await page.screenshot({
        path: join(shots, dark ? 'statistics-light.png' : 'statistics-dark.png')
      })
      await page.keyboard.press(`${Mod}+Alt+KeyL`)
    }

    // Sorting the contributor table by author name.
    await page.getByRole('button', { name: /^Author/ }).click()
    await expect(
      page.getByRole('table', { name: 'Contributors' }).getByRole('row').nth(1)
    ).toContainText('Alice')

    // All local branches: the commit reachable from three branches is counted once.
    await page.getByLabel('Branches counted').selectOption('local')
    await expect(tile(page, 'stats-scope')).toContainText('All local branches (3)')
    await expect(tile(page, 'stat-total')).toContainText(String(STATS_EXPECTED.local.total))
    await expect(tile(page, 'stat-contributors')).toContainText(
      String(STATS_EXPECTED.local.contributors)
    )
    expect(Number(git(repo, 'rev-list', '--count', '--branches').trim())).toBe(
      STATS_EXPECTED.local.total
    )

    // Custom range: February 2026 on the current branch.
    await page.getByLabel('Branches counted').selectOption('head')
    await page.getByRole('button', { name: 'Custom' }).click()
    await page.getByLabel('From date').fill('2026-02-01')
    await page.getByLabel('To date').fill('2026-02-28')
    await expect(tile(page, 'stats-scope')).toContainText('2026-02-01 to 2026-02-28')
    await expect(tile(page, 'stat-total')).toContainText('3')
    await expect(tile(page, 'stat-contributors')).toContainText('2')
    // An inverted range is explained, not queried.
    await page.getByLabel('From date').fill('2026-03-01')
    await expect(page.getByText('The start date is after the end date.')).toBeVisible()

    // An external commit today refreshes the view through the file watcher.
    await page.getByRole('button', { name: 'All time' }).click()
    await expect(tile(page, 'stat-total')).toContainText(String(STATS_EXPECTED.head.total))
    writeFileSync(join(repo, 'later.txt'), 'later\n')
    git(repo, 'add', 'later.txt')
    git(repo, 'commit', '-q', '-m', 'external commit')
    await expect(tile(page, 'stat-total')).toContainText(String(STATS_EXPECTED.head.total + 1), {
      timeout: 15_000
    })
    await page.getByRole('button', { name: 'Last 30 days' }).click()
    await expect(tile(page, 'stat-total')).toContainText('1')
    await expect(contributorRow(page, 'e2e@spoon.invalid')).toBeVisible()
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('statistics for a detached HEAD and for an empty repository', async () => {
  const repo = dir('detached')
  buildStatsFixture(repo)
  git(repo, 'checkout', '-q', '--detach', 'HEAD~1')
  const expected = git(repo, 'rev-list', '--count', 'HEAD').trim()
  const { app, page } = await launch('detached', repo)
  try {
    await openStats(page)
    await expect(tile(page, 'stats-scope')).toContainText(/Detached HEAD at [0-9a-f]{7}/)
    await expect(tile(page, 'stat-total')).toContainText(expected)

    const empty = dir('empty')
    git(empty, 'init', '-q')
    await stubPicker(app, empty)
    await page.keyboard.press(`${Mod}+KeyT`)
    await page.getByRole('button', { name: /Open\s+An existing repository/ }).click()
    await openStats(page)
    await expect(page.getByText('No history yet')).toBeVisible()
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('changing filters or repositories while statistics load never shows stale numbers', async () => {
  const big = dir('bulk')
  buildBulkHistory(big, 4000)
  const small = dir('small')
  buildStatsFixture(small)
  const { app, page } = await launch('stale', big)
  try {
    await openStats(page)
    // Immediately narrow the range while the all-time queries (4000 commits) are still running.
    await page.getByRole('button', { name: 'Last 30 days' }).click()
    await expect(page.getByText('No commits in this range').filter({ visible: true })).toBeVisible()
    // Give the superseded all-time file analysis time to finish; its late result must not appear.
    await page.waitForTimeout(4000)
    await expect(page.getByText('No commits in this range').filter({ visible: true })).toBeVisible()
    await expect(tile(page, 'stat-total')).toHaveCount(0)

    // Start the slow all-time query again and switch to another repository tab while it runs.
    await page.getByRole('button', { name: 'All time' }).click()
    await stubPicker(app, small)
    await page.keyboard.press(`${Mod}+KeyT`)
    await page.getByRole('button', { name: /Open\s+An existing repository/ }).click()
    await openStats(page)
    await expect(tile(page, 'stat-total')).toContainText(String(STATS_EXPECTED.head.total))
    await page.waitForTimeout(3000)
    await expect(tile(page, 'stat-total')).toContainText(String(STATS_EXPECTED.head.total))
    await expect(tile(page, 'stats-scope')).toContainText('main · all time')

    // Back on the first tab, its own numbers are shown.
    await page.getByRole('tab', { name: /bulk/ }).click()
    await expect(tile(page, 'stat-total')).toContainText('4,000')
    await expect(tile(page, 'stat-contributors')).toContainText('4')
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})
