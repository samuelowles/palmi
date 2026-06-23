# Palmi Issue Selection

Use this to find the first open, ready, unblocked child/sub-issue for an epic.

## Fast check

```powershell
gh issue view <EPIC_NUMBER> --repo samuelowles/palmi --json number,title,state,labels,body,url

gh issue list --repo samuelowles/palmi --state open --label ready --json number,title,labels,url
```

Only choose an issue if:

- It is open.
- It has label `ready`.
- Its `## Blocked by` section says none.
- It belongs under the target epic, either directly or as a sub-issue of a child under that epic.

## Parent/sub-issue graph query

```powershell
$EPIC = <EPIC_NUMBER>
$query = @"
query(`$owner: String!, `$name: String!, `$epic: Int!) {
  repository(owner: `$owner, name: `$name) {
    issue(number: `$epic) {
      number
      title
      subIssues(first: 100) {
        nodes {
          number
          title
          state
          labels(first: 20) { nodes { name } }
          bodyText
          subIssues(first: 100) {
            nodes {
              number
              title
              state
              labels(first: 20) { nodes { name } }
              bodyText
            }
          }
        }
      }
    }
  }
}
"@
gh api graphql -f owner=samuelowles -f name=palmi -F epic=$EPIC -f query=$query
```

Pick the lowest-numbered open `ready` issue in dependency order. If multiple issues appear equally ready, pick the lowest issue number and note the tie in the PR; do not ask for user input.
