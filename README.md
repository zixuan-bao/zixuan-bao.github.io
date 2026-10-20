# Personal website · Zixuan Bao

An English personal website using the **original Hugo Paige theme**, with local layout overrides. Navigation: About → Research → Notes → Thoughts → Writings → Gallery → Resources.

The current contents are illustrative. Stock photographs are not personal travel photographs, and example paper titles, collaborators, dates, and affiliations are not biographical claims. The GitHub profile link and avatar use the public account supplied for this project.

## Form-based editing (recommended)

Double-click **Edit-Website.cmd** in Windows File Explorer to open the local content editor at **http://localhost:1314/**. Keep its window open while editing. VBS is optional. Edit the profile, homepage, fonts, navigation, About blocks, categories, entries, and galleries through forms. Save to preview, then click **发布到网站** to publish. The editor runs on this computer only and is not deployed as a public admin endpoint.

See [编辑器使用指南.md](编辑器使用指南.md) for the complete nontechnical guide. Existing Markdown and JSON files remain the source of truth. A fresh checkout initializes its editor dependencies automatically on first launch.

## Preview

On this computer, double-click `Start-Preview.cmd`, then open **http://localhost:1313/**. Keep the preview window open. If a preview is already running, simply open that address.

Alternatively, from this folder:

```text
npm run dev
```

No GitHub Desktop is required. The editor launcher installs its locked parser dependencies when needed; for manual setup run `npm ci --ignore-scripts`. Node.js and the project-local Hugo executable are used. On a new Windows computer, run `powershell -File scripts/setup.ps1` once to download Hugo Extended from its official release, or install Hugo Extended 0.168.0 yourself. On macOS/Linux, install Hugo Extended 0.168.0 and use the same npm commands.

```text
npm run build
npm run check
```

Generated files are written to `public/`; edit the source files instead.

## Where to edit

| Change | File or folder |
| --- | --- |
| Name, university, program, email, avatar, external profiles | `data/profile.json` |
| Menu labels, order, website address | `hugo.toml` |
| Biography | `content/about/_index.md` |
| Research → field → entry | `content/research/<field>/<entry>.md` |
| Notes → subject → entry | `content/notes/<subject>/<entry>.md` |
| Thoughts / Writings → topic → entry | `content/thoughts/` / `content/writings/` |
| Resources → topic → entry | `content/resources/` |
| City albums and individual photo captions | `content/gallery/<city>.md` |
| Photographs and avatar | `static/images/` |
| Comment, analytics, and email subscription settings | `data/integrations.json` |
| Home layout | `layouts/home.html` |
| Colors, typography, responsive layouts | `assets/css/site.css` |

Each topic has an `_index.md` file. Change its title/description or add a folder with a new `_index.md`. Topic pages and filters are generated from the folders. `weight` controls display order (smaller values come first). The home page follows the menu order, with dedicated layouts for About, Gallery, and Resources, and entry previews for other sections. If a section is renamed or added, update its home layout rule as needed.

## Example entry

Create a Markdown file inside a field or topic folder:

```yaml
---
title: "Your title"
description: "A short introduction or abstract."
authors: ["Your name", "A collaborator"]
date: "2026-10-01"
lastmod: "2026-10-12"
weight: 10
link: "https://your-public-document-url"
link_label: "Open manuscript"
tags: ["Cities", "Methods"]
series: ["A longer project"]
status: "Working paper"
image: "/images/your-image.jpg"
image_alt: "A useful description of the image"
---

Optional short description for the entry details page.
```

Titles with a `link` open the destination directly. “Entry details” retains authors, publication/update dates, tags, and optional comments on your website. No complete article needs to be uploaded. Full documents can remain on Dropbox, Google Drive, a journal site, or another external service; use a share link that is readable by the intended audience. Nothing on this website grants access to a private external document.

For research without a manuscript, use `status: "In progress"` and **omit `link`**. No fake download button will appear. Optional `attachments` can contain a list of `{label, url}` values for PDFs, slides, code, data, or supplementary material. Add an entry without `image` if a thumbnail is not needed. You can omit `authors`, `series`, or `tags` where irrelevant. When deleting or moving content during development, restart the preview if stale output remains.

The sample `/link-preview/` destinations are deliberately local explanatory pages. Replace them with your actual external share URLs; they are not real manuscripts.

## City galleries

A gallery file includes a city title, country, cover image, and `photos` list. Each photograph supports `src`, `alt`, `title`, `date`, `location`, and `caption`. Dates and places are independently editable per photograph. The lightbox supports Escape, arrow keys, previous/next buttons, focus return, and the system color preference. If a real date is known, use `YYYY-MM-DD` in `date`.

## Features included

- Seven editable navigation sections, home previews, and “More” links.
- Research fields, subject/topic directories, filters, and optional manuscript links.
- Collaborators, publication/update dates, tags, series, and an annual archive.
- Static site search over titles, descriptions, topic names, collaborators, and tags. Search indexes the website's entry information, not the contents of externally hosted documents.
- City galleries, metadata captions, image lightbox, mobile navigation, system light/dark mode, blue accent, reduced-motion and print styles.
- RSS and Atom feeds. RSS is the subscription option that works immediately without a third-party account.
- No public visit counters, live analytics tracking, comment scripts, or email subscription service enabled by default.

Hugo supports code blocks and mathematical content. This website is designed around external documents, so no full-article reader, PDF annotation service, or private-file viewer is implemented. Paige's advanced image shortcodes remain available; the template's own images use normal local paths for easier editing. The project uses a pinned precompiled Bootstrap stylesheet instead of building the upstream Bootstrap Sass, so Dart Sass and theme npm dependencies are not required for this customization.

## Optional comments and private analytics

These connections are prepared, but need valid service settings before they can operate:

**Comments:** Giscus uses GitHub Discussions. Enable Discussions in the intended public repository, obtain the configuration from https://giscus.app/, and fill `giscus.repo`, `repo_id`, `category`, and `category_id` in `data/integrations.json`. Set `enabled` to `true` only after filling the values. Comments display on entry detail pages. Existing GitHub credentials are sufficient for Giscus; posting visitors sign in with GitHub. No secrets belong in these public configuration files.

**Analytics:** A private Plausible dashboard can collect visits without showing a count on the website. It needs a separately configured Plausible service/account, which may be paid. Set `provider` to `plausible`, supply the domain and exact script URL from that service, and enable it. This template neither creates nor subscribes to that service. Keep this disabled until requested.

**Email subscription:** Set `newsletter_url` to an existing subscription page to show its link. This is an external link integration, not a mailing backend. RSS is already available.

Update `content/privacy.md` when enabling any external service.

## Publish to GitHub Pages

The build workflow publishes to **https://zixuan-bao.github.io/** from the **zixuan-bao** organization. Your personal GitHub account remains **zixuanb3** and manages the organization; keep signing in with that account. Normal updates can use the editor’s Publish button. The following steps describe first-time repository setup only.

1. Create or use the organization repository `zixuan-bao/zixuan-bao.github.io` without overwriting an existing website.
2. Add the contents of this project to its `main` branch. Keep the vendored `themes/paige/` folder; exclude `.tools/`, `public/`, `resources/_gen/`, and any private files.
3. Open repository **Settings → Pages → Source → GitHub Actions**.
4. The included `.github/workflows/pages.yml` builds with pinned Hugo Extended 0.168.0 and deploys the output. It reads the configured Pages base URL.
5. After the workflow succeeds, visit https://zixuan-bao.github.io/.

The illustrative content can remain visibly marked while previewing the template publicly. After replacing it, turn off “显示模板示例提示” in the editor’s Personal Profile page, or set `demo = false` in `hugo.toml`. Demo mode adds an explanatory footer and `noindex` meta tags. Keeping demo mode on does not make files private; it only asks search engines not to index them.

For a project subdirectory rather than the root personal site, also check hand-written absolute links in your biography and content. This project targets the root address above.

## Upstream theme and assets

The vendored theme is unchanged, pinned to Paige commit `f0b9fdd2a1ea2253c6e77018bf82550ef9f7e149`. Its original LICENSE and COPYRIGHT files are retained in `themes/paige/`. The Hugo theme catalog and repository license labels do not agree; refer to the vendored license for this exact revision rather than the catalog's badge. Overrides are in this project's `layouts/` and `assets/`, so theme updates can be reviewed separately.

Bootstrap 5.3.8's precompiled CSS and license header are included in `assets/vendor/bootstrap.min.css`. Stock-photo sources and the public avatar source are listed in `ASSETS.md`. Replace demo images with your own photographs before presenting the gallery as your personal collection.
