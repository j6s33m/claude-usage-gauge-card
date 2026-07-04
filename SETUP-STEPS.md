# Getting this into GitHub and HACS

## 1. Assemble the repo folder

Copy your current `claude-usage-gauge-card.js` (v14, from your workspace) into
this scaffold folder so it sits at the root next to `hacs.json`. Final layout:

```
claude-usage-gauge-card/
├── claude-usage-gauge-card.js   <- your v14 file
├── hacs.json
├── README.md
├── LICENSE
├── .gitignore
└── .github/
    └── workflows/
        └── release.yml
```

## 2. Add the version banner (optional but recommended)

Paste the contents of `version-banner-snippet.js` at the very bottom of your
JS file. It just logs the version to the browser console.

## 3. Create the GitHub repo

- New **public** repo. Suggested name: `claude-usage-gauge-card`.
- Public is required for HACS to read it without a token. A plain,
  unpromoted name keeps it effectively private in practice.

## 4. Push

From inside the repo folder:

```
git init
git add .
git commit -m "Initial release: v14 card, HACS scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/claude-usage-gauge-card.git
git push -u origin main
```

## 5. Cut the first release

- On GitHub: **Releases → Draft a new release**.
- Tag: `1.0.0`. Title: `1.0.0`. Publish.
- The workflow attaches the JS file to the release automatically.

## 6. Add to HACS

- Home Assistant → **HACS** → three-dot menu → **Custom repositories**.
- URL: your repo. Category: **Dashboard**. Add.
- Open the card entry, click **Download**.

## 7. Retire the manual copy

- Delete the hand-placed `/config/www/claude-usage-gauge-card.js`.
- Remove the old manual resource under
  Settings → Dashboards → Resources that pointed at `/local/...`.
- Keep only the HACS-managed resource (it points at `/hacsfiles/...`).
- Hard refresh. Your existing card config works unchanged.

## Ongoing updates

1. Edit the JS, bump the banner version, commit, push.
2. Draft a new release with a higher tag (`1.1.0`, etc.).
3. HACS shows an update prompt. One click pulls it.
