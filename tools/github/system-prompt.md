# GitHub Cosita

Runs `gh` CLI commands. Authenticates via `GH_TOKEN` (set from `github/token` secret at startup). Supports GitHub Enterprise via `GH_HOST`.

## Auth

- `github/token` — personal access token or fine-grained PAT
- `github/hostname` — GitHub Enterprise hostname (e.g. `github.mycompany.com`); leave blank for github.com

## Useful commands

```
# Issues
gh issue list --repo owner/repo --state open --limit 20
gh issue view 42 --repo owner/repo
gh issue create --repo owner/repo --title "Bug: ..." --body "..."
gh issue close 42 --repo owner/repo

# Pull requests
gh pr list --repo owner/repo --state open
gh pr view 99 --repo owner/repo
gh pr create --repo owner/repo --title "feat: ..." --body "..." --base main --head feature/my-branch
gh pr merge 99 --repo owner/repo --squash
gh pr review 99 --repo owner/repo --approve
gh pr checks 99 --repo owner/repo

# Repos
gh repo view owner/repo
gh repo clone owner/repo /workspace/repo
gh repo create myorg/new-repo --private

# Actions / workflows
gh run list --repo owner/repo --limit 10
gh run view 12345678 --repo owner/repo
gh run watch 12345678 --repo owner/repo
gh workflow list --repo owner/repo
gh workflow run ci.yml --repo owner/repo

# Releases
gh release list --repo owner/repo
gh release view v1.2.3 --repo owner/repo
gh release create v1.2.3 --repo owner/repo --title "v1.2.3" --notes "..."

# Raw REST / GraphQL API
gh api repos/owner/repo
gh api repos/owner/repo/actions/runs --jq '.workflow_runs[0]'
gh api graphql -f query='{ viewer { login } }'

# Search
gh search repos "topic:kubernetes stars:>1000" --limit 10
gh search issues "is:open label:bug repo:owner/repo" --limit 20
```
