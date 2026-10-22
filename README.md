# Moor Lab website

Plain HTML and CSS, no frameworks, no build step. The public page uses no JavaScript.
A built-in editor in `admin/` lets you change the text in your browser.

## Folder structure

```
website/
├── index.html        the website (one page, nine sections)
├── 404.html          shown by GitHub Pages for unknown addresses
├── .nojekyll         tells GitHub Pages to serve the files as they are
├── README.md         this file
├── assets/
│   ├── styles.css    all styling, including dark mode
│   └── favicon.svg   browser tab icon
└── admin/
    ├── index.html    the editor
    ├── editor.css
    └── editor.js
```

All paths are relative, so the site works at `https://USERNAME.github.io/` and at
`https://USERNAME.github.io/REPO-NAME/`.

## Publish on GitHub Pages (first time)

1. Create a repository on GitHub called `website`.
2. Upload the *contents* of this folder to the root of the repository, keeping the
   `assets` and `admin` folders. Make sure `.nojekyll` is included.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`,
   folder `/ (root)`, and save.
5. After a minute the site is live at `https://USERNAME.github.io/website/`.

To use `https://USERNAME.github.io/` instead, name the repository `USERNAME.github.io`.

## Editing the website

1. Open the editor at `https://USERNAME.github.io/website/admin/`.
2. Click any text and type. Hover a publication, person, CV line or link to move it
   (↑ ↓), **Duplicate** it (to add a new entry) or **Delete** it.
3. To post news, click **+ Add news item**. A new entry with this month’s date
   appears at the top of the News feed on Home; type over the text. Delete old
   news by hovering it and clicking **Delete**.
4. Click a link to change its address in the toolbar; select text and use
   **Add link** to create one. **B** and **I** make text bold or italic.
5. Click **Download index.html** (or press Ctrl/⌘+S).
6. On GitHub: **Add file → Upload files**, drop the downloaded `index.html`, and
   **Commit changes**. The site updates within a minute or two.

Edits are kept as a draft in your browser until you discard them, so closing the tab
doesn’t lose work. Pasted text is inserted without outside formatting.

The editor only changes files on your own computer; nobody can change the live site
through it. Publishing always goes through your GitHub account. It is marked
`noindex` so search engines skip it.

### Editing on your own computer

Browsers block the editor from reading files directly from disk. Either click
**Open file…** in the editor and choose `index.html`, or start a small local server
in this folder and open `http://localhost:8000/admin/`:

```
python3 -m http.server 8000
```

## Editing by hand

You can also edit `index.html` directly in any text editor, or on GitHub with the
pencil icon. Each section starts with a comment such as `<!-- PEOPLE -->`.
Styling lives in `assets/styles.css`.

## Custom domain (optional)

Add the domain under **Settings → Pages → Custom domain**. GitHub creates a `CNAME`
file in the repository; keep it there.
