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
-r, --repo <url>       GitHub repository URL
-b, --branch <branch>  Branch to deploy (default: main)
-n, --name <name>      Project name / subdomain
--build <cmd>          Build command, e.g. "npm run build"
--start <cmd>          Start command, e.g. "node server.js"
--static               Mark as a static site
-m, --message <msg>    Deployment message
```

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
