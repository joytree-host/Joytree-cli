'use strict';

// Runtime / framework values the JoyTree server builds from (the same list as
// the dashboard's Runtime dropdown), the plain names it maps onto them, and the
// framework variants offered by the deploy wizard.

const RUNTIMES = [
  'node', 'node-nextjs', 'node-nestjs', 'bun', 'deno',
  'python-django', 'python-flask', 'python-fastapi', 'python-generic',
  'go-generic', 'go-gin', 'go-echo',
  'php-laravel', 'php-symfony', 'php-generic',
  'ruby-rails', 'ruby-sinatra',
  'java-spring', 'java-quarkus', 'kotlin-spring',
  'rust-axum', 'rust-actix', 'rust-generic',
  'dotnet', 'elixir-phoenix',
];

const ALIASES = {
  nodejs: 'node', 'node.js': 'node', next: 'node-nextjs', nextjs: 'node-nextjs', nest: 'node-nestjs', nestjs: 'node-nestjs',
  python: 'python-generic', django: 'python-django', flask: 'python-flask', fastapi: 'python-fastapi',
  go: 'go-generic', golang: 'go-generic', gin: 'go-gin', echo: 'go-echo',
  php: 'php-generic', laravel: 'php-laravel', symfony: 'php-symfony',
  ruby: 'ruby-rails', rails: 'ruby-rails', sinatra: 'ruby-sinatra',
  java: 'java-spring', spring: 'java-spring', springboot: 'java-spring', 'spring-boot': 'java-spring', quarkus: 'java-quarkus',
  kotlin: 'kotlin-spring',
  rust: 'rust-generic', axum: 'rust-axum', actix: 'rust-actix', 'actix-web': 'rust-actix',
  csharp: 'dotnet', 'c#': 'dotnet', aspnet: 'dotnet', '.net': 'dotnet', 'asp.net': 'dotnet',
  elixir: 'elixir-phoenix', phoenix: 'elixir-phoenix',
};

// Wizard step 2: which framework within a language. The first entry is the default.
const VARIANTS = {
  python: [
    { label: 'Django', val: 'python-django' }, { label: 'Flask', val: 'python-flask' },
    { label: 'FastAPI', val: 'python-fastapi' }, { label: 'Generic / other', val: 'python-generic' },
  ],
  go: [
    { label: 'Generic (net/http, Chi, Fiber ...)', val: 'go-generic' }, { label: 'Gin', val: 'go-gin' }, { label: 'Echo', val: 'go-echo' },
  ],
  php: [
    { label: 'Laravel', val: 'php-laravel' }, { label: 'Symfony', val: 'php-symfony' }, { label: 'Generic / plain PHP', val: 'php-generic' },
  ],
  ruby: [{ label: 'Rails', val: 'ruby-rails' }, { label: 'Sinatra', val: 'ruby-sinatra' }],
  java: [
    { label: 'Spring Boot', val: 'java-spring' }, { label: 'Quarkus', val: 'java-quarkus' }, { label: 'Kotlin (Spring Boot)', val: 'kotlin-spring' },
  ],
  rust: [
    { label: 'Axum', val: 'rust-axum' }, { label: 'Actix-web', val: 'rust-actix' }, { label: 'Generic', val: 'rust-generic' },
  ],
  elixir: [{ label: 'Phoenix', val: 'elixir-phoenix' }],
};

// Runtime recorded for each wizard preset, mirroring the dashboard. Bun, Deno and
// .NET are sent explicitly when picked (the server also detects them from repo
// files when Runtime is left blank, so Auto-detect works for them too).
const PRESET_RUNTIME = {
  static: '', vite: 'node', 'react-cra': 'node', nextjs: 'node-nextjs', nuxt: 'node', node: 'node', 'node-nestjs': 'node-nestjs',
  bun: 'bun', deno: 'deno', dotnet: 'dotnet',
};

// Returns the canonical runtime for a canonical value or a plain name; throws
// with the list of valid values otherwise (an unknown value would silently
// fall through to the Node.js pipeline on the server).
function normalizeRuntime(input) {
  const v = String(input || '').trim().toLowerCase();
  if (!v) return '';
  if (RUNTIMES.includes(v)) return v;
  if (ALIASES[v]) return ALIASES[v];
  throw new Error(`Unknown runtime "${input}". Use one of: ${RUNTIMES.join(', ')} (plain names like django, laravel, rails, python or go also work).`);
}

// Which server field pins the language version for a runtime, or '' if none.
function versionField(runtime) {
  const r = String(runtime || '');
  if (r.startsWith('python')) return 'pythonVer';
  if (r.startsWith('go')) return 'goVer';
  if (r.startsWith('php')) return 'phpVer';
  if (r.startsWith('ruby')) return 'rubyVer';
  if (r.startsWith('java') || r.startsWith('kotlin')) return 'javaVer';
  if (r === 'dotnet') return 'dotnetVer';
  return '';
}

module.exports = { RUNTIMES, ALIASES, VARIANTS, PRESET_RUNTIME, normalizeRuntime, versionField };
