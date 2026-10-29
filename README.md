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
| `_posts/` | Blog posts, served at `/blog/<slug>/`. Front matter: title, date, category, tags, excerpt, optional `linkedin_url`. |
| `_layouts/`, `_includes/` | Page skeletons and reusable fragments. `default.html` is the shared shell. |
| `_sass/_strip.scss` | The design: colours, type, the strip, the column and the pieces. |
| `js/field.js` | The live seismograph strip at the bottom of every page. |
| `js/site.js` | Theme toggle, scroll reveal, table of contents. |

## Importing LinkedIn posts

Request your data archive from LinkedIn (Settings, Data privacy, "Get a copy of your data"). The complete archive, the one that includes `Shares.csv` and `Articles/`, is the one to use:

```bash
python3 scripts/linkedin_to_posts.py ~/Downloads/LinkedInDataExport.zip --dry-run   # preview
python3 scripts/linkedin_to_posts.py ~/Downloads/LinkedInDataExport.zip             # write drafts
```

Each post lands in `_drafts/`, which Jekyll does not build, with a guessed title and, when the export has it, a `linkedin_url` back to the original. Review, give it a real title and tags, move it to `_posts/`, and it is live. Preview drafts locally with `bundle exec jekyll serve --drafts`.
