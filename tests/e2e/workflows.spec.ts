/// <reference lib="dom" />
// End-to-end checks of daily workflows through the real UI. Each test drives Spoon and then
// verifies the resulting Git state independently with the git CLI.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'

const root = mkdtempSync(join(tmpdir(), 'spoon-e2e-wf-'))
const gitconfig = join(root, 'gitconfig')
writeFileSync(
  gitconfig,
  '[user]\n\tname = E2E\n\temail = e2e@spoon.invalid\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n[core]\n\tautocrlf = false\n\tquotepath = false\n'
)
const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1' } as Record<
  string,
  string
>
const mainEntry = resolve('out/main/index.js')
const Mod = process.platform === 'darwin' ? 'Meta' : 'Control'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    // Read-only checks must not take index.lock: a `git status` that refreshes the index while
    // Spoon runs a command makes that command fail (a race in the test, not in the app).
    env: { ...env, GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8'
  })
const subjects = (cwd: string, rev = 'HEAD'): string[] =>
  git(cwd, 'log', '--format=%s', rev).trim().split('\n')

let seq = 0
function dir(name: string): string {
  const d = join(root, `${name}-${++seq}`)
  mkdirSync(d, { recursive: true })
  return d
}
function commitFile(cwd: string, file: string, content: string, msg: string): void {
  writeFileSync(join(cwd, file), content)
  git(cwd, 'add', '--', file)
  git(cwd, 'commit', '-q', '-m', msg)
}
/** A repository with an upstream on a local bare remote, plus a second clone ("other"). */
function withRemote(): { repo: string; bare: string; other: string } {
  const bare = dir('remote')
  git(bare, 'init', '-q', '--bare', '-b', 'main')
  const repo = dir('repo')
  git(repo, 'init', '-q', '-b', 'main')
  commitFile(repo, 'f.txt', 'base\n', 'initial')
  git(repo, 'remote', 'add', 'origin', bare)
  git(repo, 'push', '-q', '-u', 'origin', 'main')
  const parent = dir('other')
  git(parent, 'clone', '-q', bare, 'o')
  return { repo, bare, other: join(parent, 'o') }
}

/** Electron traces carry no screenshots; keep one of the window when a step fails. */
async function failShot(page: Page): Promise<void> {
  await page.screenshot({ path: test.info().outputPath('failure.png') }).catch(() => undefined)
}

async function launch(
  name: string,
  pickDir: string
): Promise<{ app: ElectronApplication; page: Page }> {
  // SPOON_E2E_EXE runs the same checks against a packaged build (e.g. dist/win-unpacked/Spoon.exe).
  const exe = process.env['SPOON_E2E_EXE']
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [mainEntry] }),
    env: { ...env, SPOON_USER_DATA: join(root, `ud-${name}`) }
  })
  await app.evaluate(({ dialog }, d) => {
    const fake = async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
      canceled: false,
      filePaths: [d]
    })
    ;(dialog as unknown as { showOpenDialog: typeof fake }).showOpenDialog = fake
  }, pickDir)
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: /Open\s+An existing repository/ }).click()
  await expect(page.getByRole('toolbar', { name: 'Repository actions' })).toBeVisible()
  // Wait until status and refs are loaded (the current branch is marked in the sidebar).
  await expect(
    page.getByRole('group', { name: 'Branches' }).getByRole('treeitem').first()
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Push', exact: true })).toBeEnabled()
  await page.waitForTimeout(500)
  return { app, page }
}

test.afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  } catch {
    /* Electron may still hold files in a user-data folder briefly; the OS temp cleaner gets it */
  }
})

test('stage individual lines, commit, then undo the commit', async () => {
  const repo = dir('lines')
  git(repo, 'init', '-q', '-b', 'main')
  const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`)
  commitFile(repo, 'list.txt', lines.join('\n') + '\n', 'initial')
  const changed = [...lines]
  changed[1] = 'line 2 EDITED'
  changed[9] = 'line 10 EDITED'
  writeFileSync(join(repo, 'list.txt'), changed.join('\n') + '\n')

  const { app, page } = await launch('lines', repo)
  try {
    await page
      .getByRole('option', { name: /list\.txt/ })
      .first()
      .click()
    await expect(page.getByText('line 2 EDITED').first()).toBeVisible()
    // Select both the removed and the added version of line 2 (old and new line number 2).
    const line2 = page.getByRole('checkbox', { name: 'Select line 2' })
    await expect(line2).toHaveCount(2)
    await line2.nth(0).dispatchEvent('mousedown', { button: 0 })
    await line2.nth(1).dispatchEvent('mousedown', { button: 0 })
    await page
      .getByRole('toolbar', { name: 'Selected lines' })
      .getByRole('button', { name: 'Stage lines' })
      .click()

    await expect.poll(() => git(repo, 'diff', '--cached')).toContain('+line 2 EDITED')
    const cached = git(repo, 'diff', '--cached')
    expect(cached).toContain('-line 2\n')
    expect(cached).not.toContain('line 10 EDITED')
    const unstaged = git(repo, 'diff')
    expect(unstaged).toContain('+line 10 EDITED')
    expect(unstaged).not.toContain('line 2 EDITED')

    const message = page.getByRole('textbox', { name: 'Commit message' })
    await message.fill('Edit line 2 only')
    await message.press(`${Mod}+Enter`)
    await expect.poll(() => subjects(repo)[0]).toBe('Edit line 2 only')
    expect(git(repo, 'show', 'HEAD:list.txt')).toContain('line 2 EDITED')
    expect(git(repo, 'show', 'HEAD:list.txt')).not.toContain('line 10 EDITED')

    // Undo from the toolbar: confirmation lists the branch move; changes come back staged.
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    const dlg = page.getByRole('dialog', { name: /Undo "Commit"/ })
    await expect(dlg).toContainText(/Move main from [0-9a-f]{7} back to [0-9a-f]{7}/)
    await dlg.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(() => subjects(repo)).toEqual(['initial'])
    expect(git(repo, 'diff', '--cached')).toContain('+line 2 EDITED')
    expect(git(repo, 'diff')).toContain('+line 10 EDITED')

    // Redo from the toolbar puts the commit back; line 10 stays an unstaged edit.
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    const redoDlg = page.getByRole('dialog', { name: /Redo "Commit"/ })
    await expect(redoDlg).toContainText(/Move main from [0-9a-f]{7} to [0-9a-f]{7}/)
    await redoDlg.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect.poll(() => subjects(repo)).toEqual(['Edit line 2 only', 'initial'])
    expect(git(repo, 'diff', '--cached')).toBe('')
    expect(git(repo, 'diff')).toContain('+line 10 EDITED')
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('interactive rebase drops and fixes up commits; Ctrl/Cmd+Z undoes it', async () => {
  const repo = dir('irebase')
  git(repo, 'init', '-q', '-b', 'main')
  commitFile(repo, 'base.txt', 'base\n', 'initial')
  commitFile(repo, 'c1.txt', '1\n', 'c1')
  commitFile(repo, 'c2.txt', '2\n', 'c2')
  commitFile(repo, 'c3.txt', '3\n', 'c3')
  const original = git(repo, 'rev-parse', 'HEAD').trim()
  const c2 = git(repo, 'rev-parse', '--short=7', 'HEAD~1').trim()
  const c3 = git(repo, 'rev-parse', '--short=7', 'HEAD').trim()

  const { app, page } = await launch('irebase', repo)
  try {
    await page.keyboard.press(`${Mod}+Digit1`)
    await page.getByText('initial', { exact: true }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Interactive rebase from here/ }).click()
    const dlg = page.getByRole('dialog', { name: /Interactive rebase of main/ })
    await dlg.getByLabel(`Action for ${c2}`).selectOption('drop')
    await dlg.getByLabel(`Action for ${c3}`).selectOption('fixup')
    await dlg.getByRole('button', { name: 'Start rebase' }).click()

    // Wait for the whole rebase: mid-way (after "pick c1", before the fixup) the log already reads
    // c1, initial.
    await expect
      .poll(
        () => existsSync(join(repo, '.git', 'rebase-merge')) || !existsSync(join(repo, 'c3.txt'))
      )
      .toBe(false)
    await expect(page.getByText('Interactive rebase complete').first()).toBeVisible()
    expect(subjects(repo)).toEqual(['c1', 'initial'])
    expect(existsSync(join(repo, 'c2.txt'))).toBe(false)
    expect(git(repo, 'show', 'HEAD:c3.txt')).toBe('3\n')
    expect(git(repo, 'status', '--porcelain').trim()).toBe('')

    // Keyboard undo (focus outside text fields).
    await page
      .locator('body')
      .click({ position: { x: 5, y: 5 } })
      .catch(() => undefined)
    await page.keyboard.press(`${Mod}+KeyZ`)
    const undo = page.getByRole('dialog', { name: /Undo "Interactive rebase"/ })
    await undo.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(() => git(repo, 'rev-parse', 'HEAD').trim()).toBe(original)
    expect(subjects(repo)).toEqual(['c3', 'c2', 'c1', 'initial'])
    expect(existsSync(join(repo, 'c2.txt'))).toBe(true)
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('a rejected push offers fetch + rebase, then pushes', async () => {
  const { repo, bare, other } = withRemote()
  commitFile(other, 'other.txt', 'o\n', 'from other clone')
  git(other, 'push', '-q')
  commitFile(repo, 'mine file.txt', 'm\n', 'mine')

  const { app, page } = await launch('rejected', repo)
  try {
    await page.getByRole('button', { name: 'Push', exact: true }).click()
    const pushDlg = page.getByRole('dialog', { name: 'Push' })
    await pushDlg.getByRole('button', { name: 'Push', exact: true }).click()
    const rejected = page.getByRole('dialog', { name: 'Push rejected' })
    await expect(rejected).toBeVisible()
    await expect(rejected).toContainText('origin/main has commits that main does not have')
    await rejected.getByRole('button', { name: 'Continue' }).click()
    await expect
      .poll(() => subjects(bare, 'main'), { timeout: 20_000 })
      .toEqual(['mine', 'from other clone', 'initial'])
    expect(git(repo, 'status', '--porcelain').trim()).toBe('')
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('a force push whose lease is stale is refused and explained', async () => {
  const { repo, bare, other } = withRemote()
  commitFile(other, 'other.txt', 'o\n', 'pushed by someone else')
  git(other, 'push', '-q')
  const remoteTip = git(bare, 'rev-parse', 'main').trim()
  // Rewrite local history; Spoon has not fetched the other clone's commit.
  writeFileSync(join(repo, 'f.txt'), 'rewritten\n')
  git(repo, 'commit', '-q', '--amend', '-am', 'rewritten')

  const { app, page } = await launch('lease', repo)
  try {
    await page.getByRole('button', { name: 'Push', exact: true }).click()
    const pushDlg = page.getByRole('dialog', { name: 'Push' })
    await pushDlg.getByLabel(/Force push with lease/).check()
    await pushDlg.getByRole('button', { name: 'Push', exact: true }).click()
    const confirmDlg = page.getByRole('dialog', { name: 'Force push?' })
    await expect(confirmDlg).toContainText('pinned to that commit')
    await confirmDlg.getByRole('button', { name: 'Force push' }).click()
    const refused = page.getByRole('dialog', { name: 'Force push refused' })
    await expect(refused).toBeVisible()
    expect(git(bare, 'rev-parse', 'main').trim()).toBe(remoteTip)
    await refused.getByRole('button', { name: 'Fetch origin' }).click()
    await expect
      .poll(() => git(repo, 'rev-parse', 'refs/remotes/origin/main').trim())
      .toBe(remoteTip)
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('rebase conflict, then abort restores the branch', async () => {
  const repo = dir('rebase-conflict')
  git(repo, 'init', '-q', '-b', 'main')
  commitFile(repo, 'c.txt', 'base\n', 'initial')
  git(repo, 'checkout', '-q', '-b', 'other')
  commitFile(repo, 'c.txt', 'theirs\n', 'theirs')
  git(repo, 'checkout', '-q', 'main')
  commitFile(repo, 'c.txt', 'ours\n', 'ours')
  const before = git(repo, 'rev-parse', 'HEAD').trim()

  const { app, page } = await launch('rebase-conflict', repo)
  try {
    await page.getByRole('treeitem', { name: 'other', exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Rebase main onto other/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Rebase', exact: true }).click()
    await expect(page.getByText(/rebase in progress/i).first()).toBeVisible({ timeout: 20_000 })
    expect(git(repo, 'diff', '--name-only', '--diff-filter=U').trim()).toBe('c.txt')
    await page.getByRole('button', { name: 'Abort', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Abort', exact: true }).click()
    await expect.poll(() => git(repo, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(git(repo, 'status', '--porcelain').trim()).toBe('')
    expect(git(repo, 'branch', '--show-current').trim()).toBe('main')
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('removing a dirty worktree lists its changes and needs explicit discard', async () => {
  const repo = dir('wt-main')
  git(repo, 'init', '-q', '-b', 'main')
  commitFile(repo, 'a.txt', 'a\n', 'initial')
  const wt = join(dir('wt'), 'feature tree')
  git(repo, 'worktree', 'add', '-q', '-b', 'feature', wt)
  writeFileSync(join(wt, 'a.txt'), 'dirty\n')

  const { app, page } = await launch('worktree', repo)
  try {
    const item = page.getByRole('treeitem', { name: 'feature', exact: true }).last()
    await item.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Remove…' }).click()
    let dlg = page.getByRole('dialog', { name: /Remove worktree for feature/ })
    await expect(dlg).toContainText('modified   a.txt')
    await dlg.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByText(/uncommitted changes, so Git refused/).first()).toBeVisible()
    expect(existsSync(join(wt, 'a.txt'))).toBe(true)

    await item.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Remove…' }).click()
    dlg = page.getByRole('dialog', { name: /Remove worktree for feature/ })
    await dlg.getByLabel(/Discard these 1 change/).check()
    await dlg.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect.poll(() => existsSync(wt)).toBe(false)
    expect(git(repo, 'worktree', 'list')).not.toContain('feature tree')
    expect(git(repo, 'branch', '--list', 'feature').trim()).toBe('feature')
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})

test('compare shows commits on both sides', async () => {
  const repo = dir('compare')
  git(repo, 'init', '-q', '-b', 'main')
  commitFile(repo, 'a.txt', 'a\n', 'initial')
  git(repo, 'checkout', '-q', '-b', 'topic')
  commitFile(repo, 't1.txt', '1\n', 'topic one')
  commitFile(repo, 't2.txt', '2\n', 'topic two')
  git(repo, 'checkout', '-q', 'main')
  commitFile(repo, 'm.txt', 'm\n', 'main only')

  const { app, page } = await launch('compare', repo)
  try {
    await page.getByRole('treeitem', { name: 'topic', exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Compare with current branch' }).click()
    await expect(page.getByTestId('compare-only-to')).toContainText(
      '2 commit(s) in topic that are not in main'
    )
    await expect(page.getByTestId('compare-only-from')).toContainText(
      '1 commit(s) in main that are not in topic'
    )
    await page.getByTestId('compare-only-from').locator('summary').click()
    await expect(page.getByTestId('compare-only-from')).toContainText('main only')
  } catch (e) {
    await failShot(page)
    throw e
  } finally {
    await app.close()
  }
})
