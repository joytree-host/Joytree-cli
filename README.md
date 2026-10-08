# 🌳 Joytree CLI

Deploy and manage your Joytree-hosted sites from the terminal.

## Installation

```bash
npm install -g @joytreeapp/joytree
```

Or run without installing:
```bash
npx @joytreeapp/joytree login
```

---

## Quick Start

```bash
# 1. Authenticate
joytree login

# 2. Deploy a GitHub repo
joytree deploy --repo https://github.com/you/my-site --name my-site

# 3. View your projects
joytree projects

# 4. Stream logs
joytree logs my-site --follow
```

---

## Commands

### Account

| Command | Description |
|---|---|
| `joytree login [--api-key <key>]` | Authenticate with your Joytree API key |
| `joytree logout` | Remove saved credentials |
| `joytree whoami` | Show current account info |
| `joytree status` | Show account status and project list |

> Find your API key at: **your-joytree-dashboard → Settings → API Key**

---

### Deploy

| Command | Description |
|---|---|
| `joytree deploy` | Deploy a GitHub repo (interactive) |
| `joytree deploy --repo <url> --name <name>` | Deploy with flags |
| `joytree deploy --static` | Deploy as a static site |
| `joytree redeploy <project-id>` | Trigger a fresh redeployment |
| `joytree deployments [project-id]` | Show recent deployments |
| `joytree open <project-id>` | Open the live URL in your browser |

**Deploy flags:**
```
-r, --repo <url>        GitHub repository URL
-b, --branch <branch>   Branch to deploy (default: main)
-n, --name <name>       Project name / subdomain
--build <cmd>           Build command, e.g. "npm run build"
--start <cmd>           Start command, e.g. "node server.js"
--install <cmd>         Install command
--output <dir>          Output directory (static sites)
--node <version>        Node.js version, e.g. 20
--runtime <name>        Runtime / framework (see the table below)
--runtime-version <v>   Language version for --runtime, e.g. 3.12 (Python), 8.3 (PHP); for Node.js use --node
--workdir <dir>         Build and run from a sub-directory (monorepos)
--static                Deploy as a static site
--worker                Deploy as a Background Worker: long-running process, no public URL (needs --start)
--dockerfile [path]     Build from a Dockerfile (default path: Dockerfile)
--docker-cmd <cmd>      Override the Dockerfile CMD
--port <n>              Port the app listens on inside the container (default 3000)
--pre-deploy <cmd>      Run after the build and before going live, e.g. a migration
-e, --env KEY=VALUE     Environment variable (repeatable)
-y, --yes               Skip every prompt (CI-friendly; needs --repo)
-m, --message <msg>     Deployment message
```

**Runtimes and frameworks**

Leave `--runtime` out to auto-detect: PHP, Python, Go, Ruby, Rust, Java/Kotlin, Elixir, .NET (`*.csproj`/`*.sln`), Bun (`bun.lockb`/`bun.lock`) and Deno (`deno.json`) repos are recognised from their files, and Node.js is the default. The interactive wizard asks for the framework within a language and sets the runtime for you.

| Language | `--runtime` values |
|---|---|
| Node.js | `node`, `node-nextjs`, `node-nestjs` (Vite, CRA, Nuxt, Astro and other front ends use `node` with their build command) |
| Bun / Deno | `bun`, `deno` |
| Python | `python-django`, `python-flask`, `python-fastapi`, `python-generic` |
| Go | `go-generic`, `go-gin`, `go-echo` |
| PHP | `php-laravel`, `php-symfony`, `php-generic` |
| Ruby | `ruby-rails`, `ruby-sinatra` |
| Java / Kotlin | `java-spring`, `java-quarkus`, `kotlin-spring` |
| Rust | `rust-axum`, `rust-actix`, `rust-generic` |
| .NET | `dotnet` |
| Elixir | `elixir-phoenix` |

Plain names such as `django`, `laravel`, `rails`, `python` or `go` are accepted and mapped to these. An unknown value is rejected instead of silently building as Node.js.

Any flag that describes the build skips the interactive wizard. Anything you leave out is auto-detected from the repo.

```bash
# A queue consumer with no public URL
joytree deploy -r https://github.com/me/jobs -n jobs --worker --start "node worker.js" -e QUEUE=emails -y

# A Dockerfile build listening on 8080, running a migration before going live
joytree deploy -r https://github.com/me/api -n api --dockerfile docker/Dockerfile --port 8080 --pre-deploy "npm run migrate" -y
```

`--worker` and `--dockerfile` cannot be combined in one deploy. `joytree redeploy` keeps a project's worker, Dockerfile and runtime settings.

`joytree deployments` prints each deployment's id and commit. Use the id with `joytree rollback`.

---

### Watch a folder (auto-deploy)

Pick one folder once. Every new or updated archive or HTML file that lands in it is uploaded and redeployed for you - no more re-uploading by hand. Works with upload (non-git) projects.

```bash
joytree watch                     # watches ~/Joytree-Deploys (created if missing)
joytree watch ~/Downloads/sites   # or any folder you like
joytree watch --create            # also create a project when none matches the file name
joytree watch --project my-site   # send every file to one project
joytree watch --once              # deploy what is in the folder right now, then exit (CI)
```

`my-site.zip` deploys to the project **my-site**. Copies such as `my-site (1).zip` update the same project. Accepted: `.zip`, `.tar.gz`, `.tgz`, `.html` (up to 250 MB).

| Flag | Description |
|---|---|
| `-p, --project <name>` | Send every file to this project instead of naming it from the file |
| `--create` | Create a new project when no project matches the file name (off by default) |
| `--deploy-existing` | Also deploy files already in the folder when watching starts |
| `--interval <sec>` | How often to check the folder (default 3) |
| `--stable <sec>` | Wait until a file stops changing this long, so unfinished downloads are never picked up (default 3) |
| `--once` | Deploy the folder's current contents, then exit |
| `--no-wait` | Do not follow the build result after each deploy |

Safe by default: files already in the folder when you start are left alone, partial downloads (`.crdownload`, `.part`, ...) are ignored, a GitHub-sourced project is never overwritten by a file, and an unknown name is skipped unless you pass `--create`.

### Blueprints

A Blueprint is a `joytree.joy` file that describes a whole stack (web, worker, static and Dockerfile services plus databases) so it deploys in one go. Run these inside a git clone, or pass `--repo`.

| Command | Description |
|---|---|
| `joytree blueprint plan` | Read and validate the Blueprint and show what it would create. Nothing is created. |
| `joytree blueprint deploy` | Show the plan, ask for any missing values, confirm, then deploy everything |
| `joytree blueprint browse [dir]` | List repo files to find a Blueprint that is not at the root |

```
-r, --repo <url>                     GitHub repo (default: this folder's git remote)
-b, --branch <branch>                Branch (default: current branch)
-f, --file <path>                    Blueprint path if it is not joytree.joy at the repo root
-e, --env SERVICE.KEY=VALUE          Value for a required env var (repeatable)
    --rename-service old=new         Deploy a service under a different name (repeatable)
    --rename-db old=new              Create a database under a different name (repeatable)
-y, --yes                            No prompts; fails if required values are missing
    --json                           Print the raw JSON response
```

---

### Firewall

Per-project firewall (Pro plan and above). `joytree fw` is a shorthand for `joytree firewall`. `<project>` is an id, subdomain or name; `<rule>` is a rule id or its exact name.

| Command | Description |
|---|---|
| `joytree firewall show <project>` | Rules with hit counts, blocked and bypass IPs, protections, Attack Mode |
| `joytree firewall rule add <project> ...` | Add a rule (see below) |
| `joytree firewall rule enable\|disable\|delete <project> <rule>` | Manage a rule |
| `joytree firewall rule move <project> <rule> --to <n>\|--top\|--bottom` | Change evaluation order |
| `joytree firewall block <project> <ips...>` | Block IPs or CIDRs (`--expires 1h\|24h\|7d\|30d`, `--note`, `--host`) |
| `joytree firewall unblock <project> <ips...>` | Remove addresses from the block list |
| `joytree firewall bypass add\|remove <project> <ips...>` | Manage the bypass (allow-through) list |
| `joytree firewall set <project> <section> key=value ...` | Update `bots`, `ddos`, `owasp`, `headers` or `responses` |
| `joytree firewall attack <project> on\|off [--minutes 15\|60\|360\|1440]` | Toggle Attack Mode |
| `joytree firewall test <project> --path /admin --ip 1.2.3.4` | Dry-run a request against the live rules, or an unsaved one with `--rule-json` |
| `joytree firewall events <project>` | Recent firewall events (`--action`, `--source`, `--q`, `--limit`) |
| `joytree firewall analytics <project> [--range 7d]` | Allowed / blocked counts and top offenders |
| `joytree firewall insights <project>` | Automatic hardening recommendations |

```bash
# Deny /admin for everyone outside the US and GB. All --if conditions must match.
joytree fw rule add my-app --name "Lock admin" --action deny --status 403 \
  --if "path starts_with /admin" --if "country not_in US,GB"

# Rate limit logins: 10 requests per 60 seconds per IP, then challenge
joytree fw rule add my-app --name "Login limit" --action rate_limit --requests 10 --window 60 \
  --by ip --on-exceed challenge --if "path eq /login"

# Tune DDoS protection (dotted keys set nested values; values are parsed as JSON when possible)
joytree fw set my-app ddos sensitivity=high autoAttack.enabled=true autoAttack.rps=250
```

Conditions are written `<field> <op> <value>`. Fields: `path`, `query`, `query_param:<name>`, `method`, `host`, `ip`, `country`, `user_agent`, `referer`, `header:<name>`, `cookie:<name>`, `scheme`, `client`. Operators: `eq`, `neq`, `contains`, `not_contains`, `starts_with`, `ends_with`, `matches`, `in`, `not_in`, `exists`, `not_exists` (`in` / `not_in` take a comma-separated list). For OR-groups pass the whole rule with `--rule '<json>'` or `--rule @rule.json`.

A deny or challenge rule can lock real visitors out. Try it with `joytree firewall test`, or start with `--action log`.

---

### Observability

| Command | Description |
|---|---|
| `joytree observe summary` | Traffic, errors and latency, with a per-project table |
| `joytree observe resources` | Live CPU, memory and uptime for every project and database |
| `joytree observe series <metric>` | One metric over time with a chart and min / avg / max / last |
| `joytree observe requests` | Search recent requests; `--group-by path --metric errors` ranks endpoints |
| `joytree observe cache` | CDN cache hit rate and the assets that miss most |
| `joytree observe alerts` | Alert rules, current state and history |
| `joytree observe alert add\|update\|delete` | Manage alert rules |
| `joytree metrics <project>` | Live container metrics for one project |

Common options: `--range 15m\|1h\|6h\|24h\|7d\|30d`, `--project <id-or-subdomain>`, `--json`.

Request metrics: `requests`, `errors`, `client_errors`, `error_rate`, `latency_avg`, `latency_p50`, `latency_p95`, `latency_p99`, `bytes_out`, `cache_hit_rate`. Resource metrics (need `--resource <key>` from `observe resources`): `cpu`, `mem_pct`, `mem_bytes`, `net_rx`, `net_tx`.

```bash
joytree observe requests --status 5xx --min-ms 500        # slow failures
joytree observe series latency_p95 --range 6h
joytree observe series cpu --resource project:abc123
joytree observe alert add --name "High errors" --metric error_rate --threshold 5 --severity critical --webhook https://hooks.example.com/x
joytree observe alert update "High errors" --threshold 10   # other fields, including the webhook, are kept
```

---

### Rollback & CDN

| Command | Description |
|---|---|
| `joytree rollback <deployment-id>` | Redeploy the exact commit of an earlier successful build (GitHub-connected projects only). Asks first; `-y` skips. |
| `joytree cdn <project> status\|on\|off` | Check or toggle the CDN |
| `joytree cdn <project> purge` | Clear cached copies so visitors get fresh content |

Find deployment ids with `joytree deployments <project>`.

---

### Projects

| Command | Description |
|---|---|
| `joytree projects` | List all projects |
| `joytree projects --json` | Output raw JSON |
| `joytree inspect <project-id>` | Show full project details |
| `joytree delete <project-id>` | Delete a project |

---

### Logs

| Command | Description |
|---|---|
| `joytree logs <project-id>` | Fetch recent runtime logs |
| `joytree logs <project-id> --lines 100` | Fetch last 100 lines |
| `joytree logs <project-id> --follow` | Stream live logs (poll every 3s) |

---

### Environment Variables

| Command | Description |
|---|---|
| `joytree env list <project-id>` | List all env var keys |
| `joytree env set <project-id> KEY=VALUE` | Set one or more env vars |
| `joytree env delete <project-id> KEY` | Delete an env var |
| `joytree env push <project-id>` | Push a local `.env` file |
| `joytree env push <project-id> --file prod.env --force` | Push & overwrite all |

```bash
# Set multiple at once
joytree env set my-site DATABASE_URL=postgres://... SECRET_KEY=abc123

# Push your .env file
joytree env push my-site
```

---

### Domains

| Command | Description |
|---|---|
| `joytree domains list` | List your custom domains |
| `joytree domains attach <domain> <project-id>` | Attach a domain to a project |
| `joytree domains verify <domain>` | Trigger DNS verification |
| `joytree domains remove <domain>` | Remove a custom domain |
| `joytree domains check <domain>` | Check domain availability |

---

### Databases

| Command | Description |
|---|---|
| `joytree db list` | List all databases |
| `joytree db create --type postgres --name mydb` | Create a database |
| `joytree db start <db-id>` | Start a stopped database |
| `joytree db stop <db-id>` | Stop a running database |
| `joytree db restart <db-id>` | Restart a database |
| `joytree db logs <db-id>` | Fetch recent database logs |
| `joytree db delete <db-id>` | Delete a database |

---

### Data Migration

Moves data between databases regardless of engine (Mongo to MySQL, Firebase
to Postgres, Redis to MariaDB, etc — translation between data models is
handled automatically). The destination is always one of your own JoyTree
databases; the source can be another JoyTree database, or an external
MongoDB/Atlas cluster, Firebase Realtime Database, MySQL/PostgreSQL/MariaDB
server, or Redis instance reached by connection string.

| Command | Description |
|---|---|
| `joytree migrate start` | Start a migration — interactive wizard if no flags given |
| `joytree migrate start --source-kind joytree --source-database-id <id> --destination-id <id>` | Migrate from another JoyTree database |
| `joytree migrate start --source-kind mongo --connection-string <uri> --destination-id <id>` | Migrate from an external MongoDB/Atlas cluster |
| `joytree migrate start --source-kind firebase --firebase-url <url> --destination-id <id>` | Migrate from a Firebase Realtime Database |
| `joytree migrate start --source-kind sql --sql-engine mysql --connection-string <uri> --destination-id <id>` | Migrate from an external MySQL/PostgreSQL/MariaDB server |
| `joytree migrate start --source-kind redis --connection-string <uri> --destination-id <id>` | Migrate from an external Redis instance |
| `joytree migrate start ... --wait` | Block and poll until the migration finishes instead of returning immediately |
| `joytree migrate list` | List all migrations, most recent first |
| `joytree migrate status <job-id>` | Check a migration's progress, result, and logs |
| `joytree migrate delete <job-id>` | Delete one migration from history |
| `joytree migrate clear` | Delete ALL migration history (irreversible) |

A MongoDB connection string **must include a database name** (the part
after the last `/` before any `?`) — Atlas's default "Copy connection
string" button omits it, which would otherwise silently migrate from
MongoDB's own default `test` database instead of the one you meant. Both
the interactive wizard and `--source-kind mongo` catch this and ask again
rather than running the migration against the wrong data.

---

## Configuration

Credentials are stored at `~/.joytree/credentials.json` (mode 600).

You can also use environment variables:
```bash
export JOYTREE_API_KEY=jtk_your_key_here
export JOYTREE_BASE_URL=https://joytree.site
```

---

## Publishing to npm

To publish this CLI so users can `npm install -g @joytreeapp/joytree`:

```bash
cd joytree-cli
npm login    # login to npm as @joytreeapp
npm publish --access public
```

Then users install with:
```bash
npm install -g @joytreeapp/joytree
# or
npx @joytreeapp/joytree login
```
