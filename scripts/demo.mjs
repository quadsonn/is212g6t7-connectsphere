#!/usr/bin/env node
/**
 * W10 demo runner — keeps the Playwright MCP demo on a LOCAL database.
 *
 *   npm run demo:reset   wipe the local demo database and refill it with the
 *                        fixed demo data (prisma/seed-demo.ts)
 *   npm run dev:demo     start the API + web app against that database
 *
 * Why this exists: the normal `.env` points at the team's shared Supabase.
 * These commands never use its database or storage settings. Everything the
 * demo needs is set here, and process settings take precedence over `.env`
 * for Nest, Prisma and Vite alike, so `.env` is never consulted for them.
 *
 * Safety guard: both commands refuse to run unless the database is on this
 * machine (localhost) AND its name contains "demo". The second check stops a
 * reset from wiping connectsphere_test or any other local database by mistake.
 *
 * Per-machine setting: DEMO_DATABASE_URL, read from the environment or from a
 * git-ignored `.env.demo` file (see `.env.demo.example`). If unset, it defaults
 * to postgresql://<your OS username>@localhost:5432/connectsphere_demo, which
 * is right for a Homebrew / Postgres.app install.
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

function demoDatabaseUrl() {
  const file = join(ROOT, '.env.demo');
  const fromFile = existsSync(file) ? parse(readFileSync(file)).DEMO_DATABASE_URL : undefined;

  return (
    process.env.DEMO_DATABASE_URL ||
    fromFile ||
    `postgresql://${userInfo().username}@localhost:5432/connectsphere_demo?schema=public`
  );
}

function assertSafe(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`DEMO_DATABASE_URL is not a valid URL: ${raw}`);
  }

  const database = url.pathname.replace(/^\//, '');

  if (!LOCAL_HOSTS.includes(url.hostname)) {
    fail(`refusing to run: the demo database must be on localhost, not "${url.hostname}".`);
  }
  if (!database.includes('demo')) {
    fail(`refusing to run: the database name must contain "demo" (got "${database}").`);
  }

  return { database, display: `${url.hostname}:${url.port || 5432}/${database}` };
}

function fail(message) {
  console.error(`\n[demo] ${message}\n`);
  process.exit(1);
}

/** Every setting the app needs, all local. Supabase is never reachable. */
function demoEnv(databaseUrl) {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    // Prisma migrates through DIRECT_URL — it must point here too.
    DIRECT_URL: databaseUrl,
    // Venue photo uploads go to Supabase Storage. A dead local address makes
    // an upload fail instead of writing to the team's bucket.
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'demo-not-a-real-key',
    JWT_SECRET: 'w10-demo-only-secret',
    JWT_EXPIRES_IN: '8h',
    BCRYPT_SALT_ROUNDS: '10',
    PORT: '3000',
    WEB_ORIGIN: 'http://localhost:5173',
    // Where the Vite dev proxy forwards /api — matches PORT above.
    VITE_API_URL: 'http://localhost:3000',
  };
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    fail(`"${command} ${args.join(' ')}" failed (exit ${result.status}).`);
  }
}

const databaseUrl = demoDatabaseUrl();
const { display } = assertSafe(databaseUrl);
const env = demoEnv(databaseUrl);

switch (process.argv[2]) {
  case 'reset': {
    console.log(`\n[demo] Resetting LOCAL database ${display}\n`);
    // Drops and recreates everything in the demo database (creating the
    // database itself if it does not exist yet), then applies all migrations.
    run('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate'], env);
    // Compiler option via env var rather than a CLI flag: no shell quoting,
    // so it behaves the same on macOS, Linux and Windows.
    run('npx', ['ts-node', 'prisma/seed-demo.ts'], {
      ...env,
      TS_NODE_COMPILER_OPTIONS: '{"module":"commonjs"}',
    });
    console.log(`\n[demo] Done. Start the app with: npm run dev:demo\n`);
    break;
  }

  case 'dev': {
    console.log(`\n[demo] Starting against LOCAL database ${display}`);
    console.log('[demo] App: http://localhost:5173  (API on :3000)\n');
    const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, env, stdio: 'inherit', shell: true });
    child.on('exit', (code) => process.exit(code ?? 0));
    break;
  }

  default:
    fail('usage: node scripts/demo.mjs <reset|dev>');
}
