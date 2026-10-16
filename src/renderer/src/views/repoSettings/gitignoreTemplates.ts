// Small, original starter templates. Users can edit the result freely before saving.
export const GITIGNORE_TEMPLATES: Record<string, string> = {
  'Operating system files': [
    '# OS files',
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    'ehthumbs.db',
    '$RECYCLE.BIN/'
  ].join('\n'),
  Editors: [
    '# Editors',
    '.vscode/*',
    '!.vscode/extensions.json',
    '.idea/',
    '*.swp',
    '*~',
    '*.sublime-workspace'
  ].join('\n'),
  Node: [
    '# Node',
    'node_modules/',
    'npm-debug.log*',
    'yarn-error.log*',
    'pnpm-debug.log*',
    '.npm/',
    'dist/',
    'coverage/',
    '.env',
    '.env.*',
    '!.env.example'
  ].join('\n'),
  Python: [
    '# Python',
    '__pycache__/',
    '*.py[cod]',
    '.venv/',
    'venv/',
    '.pytest_cache/',
    '.mypy_cache/',
    'build/',
    'dist/',
    '*.egg-info/'
  ].join('\n'),
  Java: ['# Java', '*.class', '*.jar', 'target/', 'build/', '.gradle/', 'out/'].join('\n'),
  '.NET': ['# .NET', 'bin/', 'obj/', '*.user', '*.suo', '.vs/', 'TestResults/'].join('\n'),
  Go: ['# Go', '/bin/', '*.test', '*.out', 'vendor/'].join('\n'),
  'C / C++': [
    '# C/C++',
    '*.o',
    '*.obj',
    '*.a',
    '*.lib',
    '*.so',
    '*.dll',
    '*.exe',
    'build/',
    'cmake-build-*/'
  ].join('\n'),
  Logs: ['# Logs and temp files', '*.log', '*.tmp', 'tmp/'].join('\n')
}
