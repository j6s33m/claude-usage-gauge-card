# Getting this into GitHub and HACS

This folder is a complete, ready-to-push repo. Your v15 card JS, the version
banner, the screenshot, and all HACS files are already in place.

## Layout (already assembled)

```
claude-usage-gauge-card/
├── claude-usage-gauge-card.js   (your card, v15, banner included)
├── hacs.json
├── README.md                    (references images/card-preview.png)
├── LICENSE
├── SETUP-STEPS.md               (this file)
├── .gitignore
├── images/
│   └── card-preview.png
└── .github/
    └── workflows/
        └── release.yml
```

## 1. Create the GitHub repo

- New **public** repo. Suggested name: `claude-usage-gauge-card`.
- Public is required for HACS to read it without a token. A plain, unpromoted
  name keeps it effectively private in practice.

## 2. Push

From inside this folder:

```
git init
git add .
git commit -m "Initial release: v15 card, HACS package, screenshot"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/claude-usage-gauge-card.git
git push -u origin main
```

## 3. Cut the first release

- On GitHub: **Releases** then **Draft a new release**.
- Tag: `1.0.0`. Title: `1.0.0`. Publish.
- The workflow attaches the JS file to the release automatically. HACS pulls
  this release asset, so do not skip this step.

## 4. Add to HACS

- Home Assistant then **HACS** then three-dot menu then **Custom repositories**.
- URL: your repo. Category: **Dashboard**. Add.
- Open the card entry, click **Download**.
- Hard refresh the browser.

## 5. Retire the manual copy

- Delete the hand-placed `/config/www/claude-usage-gauge-card.js`.
- Remove the old manual resource under Settings then Dashboards then Resources
  that pointed at `/local/...`.
- Keep only the HACS-managed resource (it points at `/hacsfiles/...`).
- Your existing card config works unchanged.

## Confirming the version loaded

Open the browser console (F12). You will see a banner reading
`CLAUDE-USAGE-GAUGE-CARD v1.0.0`. Bump that string in the JS on each release.

## Ongoing updates

1. Edit the JS, bump the banner version, commit, push.
2. Draft a new release with a higher tag (`1.1.0`, etc.).
3. HACS shows an update prompt. One click pulls it.
