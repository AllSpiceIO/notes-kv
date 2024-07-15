# Notes-KV

A GitHub/Gitea/AllSpice Hub action to use git-notes as a Key/Value store.

## Usage

```yaml
jobs:
  save-metadata:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Configure git user
        run: |
          git config --global user.email "<your email here>"
          git config --global user.name "<your name here>"
      - name: Save metadata to git notes
        uses: AllSpiceIO/notes-kv@v0.1
        with:
          values: |
            build_number=${{ github.run_number }}
            commit_sha=${{ github.sha }}
            author=${{ github.actor }}
```

This action automatically pulls notes from the `origin` remote and pushes them
back after changes. If there are already key/values stored in the notes, they
will be merged with the new values.

This action uses a custom ref, `notes-kv` to avoid conflicts with other notes.
If you want to use your own ref, you can set it using `custom_ref`:

```yaml
- name: Save metadata to git notes
  uses: AllSpiceIO/notes-kv@v0.1
  with:
    custom_ref: my-notes
    values: |
      build_number=${{ github.run_number }}
      commit_sha=${{ github.sha }}
      author=${{ github.actor }}
```

For more information on git notes, refer to the [Git documentation](https://git-scm.com/docs/git-notes).

## Caveats

- The git user should be configured _before_ this action is run:

  ```sh
  git config --global user.email "demo@example.org"
  git config --global user.name "Demo"
  ```

- You should be able to push to the repository without entering a password.
- If you have multiple runs at the same time, this action has a potential race
  condition where the notes could be overwritten by another run.
