/* global hexo */

"use strict";

function stripMarkdown(raw) {
  return String(raw || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

hexo.extend.generator.register("kurisu-index", function (locals) {
  const MAX_TEXT_LEN = 1500;
  const posts = locals.posts
    .sort("-date")
    .filter(function (post) {
      return post.published !== false;
    })
    .map(function (post) {
      const text = stripMarkdown(post.content).slice(0, MAX_TEXT_LEN);
      const categoryList = post.categories && typeof post.categories.toArray === "function" ? post.categories.toArray() : [];
      const tagList = post.tags && typeof post.tags.toArray === "function" ? post.tags.toArray() : [];
      return {
        title: post.title || "",
        url: post.permalink || post.path || "",
        date: post.date ? post.date.toISOString() : "",
        updated: post.updated ? post.updated.toISOString() : "",
        category: categoryList.length ? categoryList[0].name : "",
        tags: tagList.map(function (tag) { return tag.name; }),
        text: text,
      };
    });

  return {
    path: "kurisu-index.json",
    data: JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: posts.length,
        posts: posts,
      },
      null,
      2
    ),
  };
});
