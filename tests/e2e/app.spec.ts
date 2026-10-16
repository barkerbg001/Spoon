/// <reference lib="dom" />
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

// Every test runs against disposable repositories and an isolated user-data folder.
const root = mkdtempSync(join(tmpdir(), 'spoon-e2e-'))
const gitconfig = join(root, 'gitconfig')
writeFileSync(
  gitconfig,
  '[user]\n\tname = E2E\n\temail = e2e@spoon.invalid\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n'
)
const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1' } as Record<
  string,
  string
>
const mainEntry = resolve('out/main/index.js')
const screenshotDir = process.env['SPOON_SCREENSHOTS']

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8' })

let seq = 0
function makeRepo(): string {
  const dir = join(root, `repo-${++seq}`)
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'README.md'), '# Demo\n\nHello\n')
  writeFileSync(join(dir, 'app.ts'), 'export const answer = 41\nexport const name = "demo"\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Initial commit')
  git(dir, 'checkout', '-q', '-b', 'feature/login')
  writeFileSync(join(dir, 'login.ts'), 'export function login() {\n  return true\n}\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Add login')
  git(dir, 'checkout', '-q', 'main')
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge feature/login', 'feature/login')
  writeFileSync(join(dir, 'app.ts'), 'export const answer = 42\nexport const name = "demo"\n')
  writeFileSync(join(dir, 'notes.txt'), 'untracked\n')
  return dir
}

async function launch(
  userData: string,
  pickDir?: string
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [mainEntry],
    env: { ...env, SPOON_USER_DATA: userData }
  })
  if (pickDir) {
    await app.evaluate(({ dialog }, dir) => {
      const fake = async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
        canceled: false,
        filePaths: [dir]
      })
      ;(dialog as unknown as { showOpenDialog: typeof fake }).showOpenDialog = fake
    }, pickDir)
  }
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

const shot = async (page: Page, name: string): Promise<void> => {
  if (!screenshotDir) return
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(screenshotDir, `${name}.png`) })
}

test.afterAll(() => rmSync(root, { recursive: true, force: true }))

test('welcome screen, theme toggle persists across restarts', async () => {
  const userData = join(root, 'ud-theme')
  let { app, page } = await launch(userData)
  await expect(page.getByRole('button', { name: /Open\s+An existing repository/ })).toBeEnabled()
  const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.keyboard.press('Control+Alt+KeyL')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(!wasDark)
  await page.waitForTimeout(300)
  await app.close()
  ;({ app, page } = await launch(userData))
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(!wasDark)
  await shot(page, wasDark ? 'welcome-light' : 'welcome-dark')
  await app.close()
})

test('open a repository, stage, commit, branch and browse history', async () => {
  const repo = makeRepo()
  const { app, page } = await launch(join(root, 'ud-flow'), repo)
  try {
    await page.getByRole('button', { name: /Open\s+An existing repository/ }).click()
    // Changes are present, so the Changes view opens first.
    const fileRow = page.getByRole('option', { name: /app\.ts/ }).first()
    await expect(fileRow).toBeVisible()
    await fileRow.click()
    await expect(page.getByText('export const answer = 42').first()).toBeVisible()
    await shot(page, 'changes')

    // Stage with the keyboard, then commit with Ctrl+Enter.
    await page.keyboard.press('Space')
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('app.ts')
    const message = page.getByRole('textbox', { name: 'Commit message' })
    await message.fill('Bump the answer')
    await message.press('Control+Enter')
    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('Bump the answer')
    // The untracked file is still there and was not committed.
    expect(git(repo, 'status', '--porcelain')).toContain('?? notes.txt')

    // Create a branch through the keyboard shortcut and dialog.
    await page.keyboard.press('Control+KeyB')
    const dialog = page.getByRole('dialog', { name: 'New branch' })
    await dialog.getByLabel('Branch name').fill('feature/e2e')
    await dialog.getByRole('button', { name: 'Create branch' }).click()
    await expect.poll(() => git(repo, 'branch', '--show-current').trim()).toBe('feature/e2e')

    // History shows the commit graph and details.
    await page.keyboard.press('Control+Digit1')
    const commitRow = page.getByText('Bump the answer').first()
    await expect(commitRow).toBeVisible()
    await expect(page.getByText('Merge feature/login').first()).toBeVisible()
    await commitRow.click()
    await expect(page.getByText(/files \(1\)/i).first()).toBeVisible()
    await page
      .getByRole('option', { name: /app\.ts/ })
      .first()
      .click()
    await expect(page.getByText('export const answer = 42').first()).toBeVisible()
    await page.waitForTimeout(4500) // let toasts fade before the screenshot
    await shot(page, 'history')

    // Command palette opens settings.
    await page.keyboard.press('Control+KeyK')
    await page.getByPlaceholder(/Type a command/).fill('Open settings')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: /Settings/ })).toBeVisible()
    await shot(page, 'settings')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    if (screenshotDir) {
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
      if (!dark) await page.keyboard.press('Control+Alt+KeyL')
      await shot(page, 'history-dark')
    }
  } finally {
    await app.close()
  }
})

test('resolve a merge conflict in the conflict workspace and continue', async () => {
  const dir = join(root, `conflict-${++seq}`)
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'config.txt'), 'name = base\nport = 80\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  git(dir, 'checkout', '-q', '-b', 'other')
  writeFileSync(join(dir, 'config.txt'), 'name = theirs\nport = 80\n')
  git(dir, 'commit', '-q', '-am', 'theirs')
  git(dir, 'checkout', '-q', 'main')
  writeFileSync(join(dir, 'config.txt'), 'name = ours\nport = 80\n')
  git(dir, 'commit', '-q', '-am', 'ours')
  try {
    git(dir, 'merge', 'other')
  } catch {
    // expected: conflict
  }
  const { app, page } = await launch(join(root, 'ud-conflict'), dir)
  try {
    await page.getByRole('button', { name: /Open\s+An existing repository/ }).click()
    await expect(page.getByText(/merge in progress/i).first()).toBeVisible()
    await page
      .getByRole('option', { name: /config\.txt/ })
      .first()
      .click()
    const conflict = page.getByRole('region', { name: 'Conflict 1' })
    await expect(conflict).toContainText('name = ours')
    await expect(conflict).toContainText('name = theirs')
    await shot(page, 'conflict')
    await conflict.getByRole('button', { name: 'Theirs', exact: true }).click()
    await page.getByRole('button', { name: 'Save and mark resolved' }).click()
    await expect.poll(() => git(dir, 'diff', '--name-only', '--diff-filter=U').trim()).toBe('')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    const confirmDialog = page.getByRole('dialog')
    if (await confirmDialog.isVisible().catch(() => false))
      await confirmDialog.getByRole('button').last().click()
    await expect.poll(() => git(dir, 'log', '-1', '--format=%P').trim().split(' ').length).toBe(2)
    expect(git(dir, 'show', 'HEAD:config.txt')).toBe('name = theirs\nport = 80\n')
  } finally {
    await app.close()
  }
})

test('discarding requires explicit confirmation', async () => {
  const repo = makeRepo()
  const { app, page } = await launch(join(root, 'ud-discard'), repo)
  try {
    await page.getByRole('button', { name: /Open\s+An existing repository/ }).click()
    const fileRow = page.getByRole('option', { name: /app\.ts/ }).first()
    await fileRow.click()
    await page.keyboard.press('Delete')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('app.ts')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(git(repo, 'status', '--porcelain')).toContain(' M app.ts')
    await page.keyboard.press('Delete')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Discard/ })
      .click()
    await expect.poll(() => git(repo, 'status', '--porcelain')).not.toContain('app.ts')
  } finally {
    await app.close()
  }
})
