# Git Cosita

Runs git CLI commands. Configures HTTPS credentials via `~/.netrc` and SSH via `~/.ssh/id_rsa` at startup.

## Auth

**HTTPS (GitHub/GitLab/Bitbucket):**
- `git/username` — your git username
- `git/token` — personal access token (PAT) or password
- Written to `~/.netrc` for github.com, gitlab.com, and bitbucket.org automatically

**SSH:**
- `git/ssh-key` — PEM private key contents (use `\n` for newlines)
- Written to `~/.ssh/id_rsa`; host key checking is disabled

**Commit identity:**
- `git/user-name` — git config user.name
- `git/user-email` — git config user.email

## Useful commands

```
# Clone
git clone https://github.com/org/repo.git /workspace/repo
git clone git@github.com:org/repo.git /workspace/repo

# Day-to-day operations (use -C to set working directory)
git -C /workspace/repo status
git -C /workspace/repo log --oneline --graph -20
git -C /workspace/repo pull origin main
git -C /workspace/repo fetch --all

# Branches
git -C /workspace/repo branch -a
git -C /workspace/repo checkout -b feature/my-feature
git -C /workspace/repo checkout main

# Staging and committing
git -C /workspace/repo diff
git -C /workspace/repo diff HEAD~1
git -C /workspace/repo add -A
git -C /workspace/repo commit -m "feat: my change"
git -C /workspace/repo push origin HEAD

# History and blame
git -C /workspace/repo log --oneline --since="1 week ago"
git -C /workspace/repo show HEAD
git -C /workspace/repo blame path/to/file.js

# Stash
git -C /workspace/repo stash
git -C /workspace/repo stash pop

# Tags
git -C /workspace/repo tag -l
git -C /workspace/repo tag v1.2.3
git -C /workspace/repo push origin v1.2.3
```
