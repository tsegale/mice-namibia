"use strict";

// Team page pieces: real team member slides and the CEO message. Only ever
// given published members with consent (repositories/team.js); the
// placeholder slides stay in the template and are never mixed with these.

const { escapeHtml: esc } = require("../../lib/text");
const { picture } = require("../../lib/picture");

const SLIDE_SIZES = "(max-width: 720px) 80vw, 360px";
const LINKEDIN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';

function slide(m) {
  const linkedin = m.linkedin_url
    ? `<a class="team-slide-link" href="${esc(m.linkedin_url)}" target="_blank" rel="noopener" aria-label="${esc(m.name)} on LinkedIn (opens in a new tab)">${LINKEDIN}</a>`
    : "";
  return `      <li class="venue-slide">
        <article class="team-slide-card">
          <div class="team-slide-media">${picture(m.photo, { sizes: SLIDE_SIZES, alt: `Portrait of ${m.name}` })}</div>
          <div class="team-slide-body">
            <h3 class="team-slide-name">${esc(m.name)}</h3>
            ${m.role ? `<p class="team-slide-role">${esc(m.role)}</p>` : ""}
            ${linkedin}
          </div>
        </article>
      </li>`;
}

function slides(members) {
  return members.map(slide).join("\n");
}

// The CEO's message as paragraphs: a blank line starts a new one.
function paragraphs(text) {
  return String(text || "")
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n      ");
}

module.exports = { slide, slides, paragraphs };
