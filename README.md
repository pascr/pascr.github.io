# sliceofcode.net

Source of [sliceofcode.net](https://sliceofcode.net), Pascal Rodriguez's personal site: CV, writing and a personal user manual.

Built with [Jekyll](https://jekyllrb.com/) on GitHub Pages, with a custom theme (no external theme dependency).

## Run locally

```bash
bundle install
bundle exec jekyll serve --livereload
```

Then open http://localhost:4000.

## Where things live

| Path | What |
| --- | --- |
| `index.md` | Home page intro text (the "About" section). |
| `_data/experience.yml` | Career timeline rendered on the home page. |
| `_data/authors.yml` | Author profile, links and portrait. |
| `read-me.md` | The personal user manual, served at `/readme/`. |
| `_posts/` | Blog posts, served under `/blog/`. |
| `_layouts/`, `_includes/` | Page skeletons and reusable fragments. |
| `_sass/`, `css/screen.scss` | Styles. Design tokens (colours, fonts) are in `_sass/_tokens.scss`. |
| `js/site.js` | Theme toggle, scroll reveal, reading progress, side table of contents. |
| `js/field.js` | The animated field of streams behind the home page hero. |

## Importing LinkedIn posts

Request your data archive from LinkedIn (Settings, Data privacy, "Get a copy of your data"). The complete archive, the one that includes `Shares.csv` and `Articles/`, is the one to use:

```bash
python3 scripts/linkedin_to_posts.py ~/Downloads/LinkedInDataExport.zip --dry-run   # preview
python3 scripts/linkedin_to_posts.py ~/Downloads/LinkedInDataExport.zip             # write drafts
```

Each post lands in `_drafts/`, which Jekyll does not build, with a guessed title and, when the export has it, a `linkedin_url` back to the original. Review, give it a real title and tags, move it to `_posts/`, and it is live. Preview drafts locally with `bundle exec jekyll serve --drafts`.
