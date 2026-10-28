#!/usr/bin/env python3
"""Turn a LinkedIn data export into Jekyll posts.

Usage:
    python3 scripts/linkedin_to_posts.py path/to/Complete_LinkedInDataExport.zip [--out _posts] [--min-words 80] [--dry-run]

Reads Shares.csv (your own posts) and Articles/ (long-form articles) from the
archive and writes one Markdown file per item into the output folder as a
*draft* (draft: true), so nothing is published until you review it, pick a
title, and remove the draft flag.

Reposts without commentary and very short posts are skipped; tweak --min-words.
Each generated post carries `linkedin_url` so the layout can link back to
the original.
"""
import argparse
import csv
import datetime as dt
import html
import io
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path


def slugify(text, limit=60):
    text = re.sub(r"[^\w\s-]", "", text.lower(), flags=re.UNICODE)
    text = re.sub(r"[\s_-]+", "-", text).strip("-")
    return text[:limit].rstrip("-") or "post"


def guess_title(body, limit=80):
    first = body.strip().split("\n", 1)[0].strip()
    first = re.sub(r"^[#*\-\s]+", "", first)
    sentence = re.split(r"(?<=[.!?])\s", first, maxsplit=1)[0]
    title = sentence if 12 <= len(sentence) <= limit else first[:limit]
    return title.rstrip(" .:,;").strip() or "Untitled"


def yaml_str(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


class HtmlToMarkdown(HTMLParser):
    """A deliberately small converter: enough for LinkedIn article HTML."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.list_depth = 0
        self.href = None
        self.skip = 0  # inside <head>, <title>, <script> or <style>

    SKIPPED = ("head", "title", "script", "style")

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.SKIPPED:
            self.skip += 1
            return
        if self.skip:
            return
        if tag in ("p", "div"):
            self.out.append("\n\n")
        elif tag in ("h1", "h2", "h3", "h4"):
            self.out.append("\n\n" + "#" * (int(tag[1]) + 1) + " ")
        elif tag == "br":
            self.out.append("  \n")
        elif tag in ("ul", "ol"):
            self.list_depth += 1
            self.out.append("\n")
        elif tag == "li":
            self.out.append("\n" + "  " * (self.list_depth - 1) + "- ")
        elif tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag == "a":
            self.href = a.get("href")
            self.out.append("[")
        elif tag == "img" and a.get("src"):
            self.out.append("\n\n![%s](%s)\n\n" % (a.get("alt", ""), a["src"]))
        elif tag == "blockquote":
            self.out.append("\n\n> ")

    def handle_endtag(self, tag):
        if tag in self.SKIPPED:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ("strong", "b"):
            self.out.append("**")
        elif tag in ("em", "i"):
            self.out.append("*")
        elif tag == "a":
            self.out.append("](%s)" % (self.href or ""))
            self.href = None
        elif tag in ("ul", "ol"):
            self.list_depth -= 1
            self.out.append("\n")
        elif tag in ("p", "div", "h1", "h2", "h3", "h4", "blockquote"):
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(re.sub(r"\s+", " ", data))

    def text(self):
        s = "".join(self.out)
        s = re.sub(r"[ \t]+\n", "\n", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip() + "\n"


def write_post(out_dir, date, title, body, source_url, category, dry_run, kind):
    slug = slugify(title)
    path = out_dir / f"{date:%Y-%m-%d}-{slug}.md"
    n = 2
    while path.exists() and not dry_run:
        path = out_dir / f"{date:%Y-%m-%d}-{slug}-{n}.md"
        n += 1
    front = [
        "---",
        "layout:       post",
        f"title:        {yaml_str(title)}",
        f"date:         {date:%Y-%m-%d %H:%M:%S}",
        f"category:     {category}",
        "author:       pascr",
        "tags:         ",
        f"linkedin_url: {source_url}" if source_url else "linkedin_url: ",
        f"imported:     linkedin-{kind}",
        "draft:        true",
        "---",
        "",
    ]
    content = "\n".join(front) + body.strip() + "\n"
    print(f"{'would write' if dry_run else 'wrote'}  {path.name}  ({len(body.split())} words)")
    if not dry_run:
        path.write_text(content, encoding="utf-8")


def parse_date(value):
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%m/%d/%y, %I:%M %p"):
        try:
            return dt.datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    raise ValueError(f"unrecognised date: {value!r}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archive", help="LinkedIn export .zip (the complete one, with Shares.csv)")
    ap.add_argument("--out", default="_posts", help="output folder (default: _posts)")
    ap.add_argument("--min-words", type=int, default=80, help="skip posts shorter than this (default: 80)")
    ap.add_argument("--category", default="Leadership", help="category for imported items (default: Leadership)")
    ap.add_argument("--dry-run", action="store_true", help="list what would be written, write nothing")
    args = ap.parse_args()

    out_dir = Path(args.out)
    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.archive) as z:
        names = z.namelist()
        shares = [n for n in names if n.endswith("Shares.csv")]
        articles = [n for n in names if "/Articles/" in n and n.lower().endswith(".html")]

        if not shares:
            print("No Shares.csv in this archive. This looks like the Basic export; wait for the complete one.", file=sys.stderr)
        kept = skipped = 0
        for name in shares:
            text = z.read(name).decode("utf-8-sig", errors="replace")
            for row in csv.DictReader(io.StringIO(text)):
                body = (row.get("ShareCommentary") or "").strip()
                words = len(body.split())
                if words < args.min_words:
                    skipped += 1
                    continue
                date = parse_date(row.get("Date", ""))
                body = html.unescape(body)
                # LinkedIn hashtags at the end of a post become tags, not body text.
                hashtags = re.findall(r"(?:^|\s)#(\w+)", body)
                body = re.sub(r"(\s*#\w+)+\s*$", "", body).strip()
                title = guess_title(body)
                write_post(out_dir, date, title, body, row.get("ShareLink", ""), args.category, args.dry_run, "post")
                if hashtags:
                    print(f"           tags to consider: {' '.join(hashtags)}")
                kept += 1

        for name in articles:
            raw = z.read(name).decode("utf-8", errors="replace")
            parser = HtmlToMarkdown()
            parser.feed(raw)
            body = parser.text()
            m = re.search(r"<title>(.*?)</title>", raw, re.S | re.I)
            title = html.unescape(m.group(1)).strip() if m else guess_title(body)
            body = re.sub(r"^#+\s*" + re.escape(title) + r"\s*\n+", "", body)
            m = re.search(r"(\d{4}-\d{2}-\d{2})", Path(name).name)
            date = dt.datetime.strptime(m.group(1), "%Y-%m-%d") if m else dt.datetime.now()
            write_post(out_dir, date, title, body, "", args.category, args.dry_run, "article")
            kept += 1

    print(f"\n{kept} items written as drafts, {skipped} short posts skipped (raise or lower --min-words to change).")
    print("Review each file, set a title and tags, then remove `draft: true` to publish.")


if __name__ == "__main__":
    main()
