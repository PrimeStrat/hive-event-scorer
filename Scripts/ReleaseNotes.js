'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMMIT_RE = /^(CREATE|UPDATE|FIX|REMOVE)(?:\s*\(\w+\))?\s*\|\s*(.+)$/;
const SECTIONS = [
    ['CREATE', "What's New"],
    ['UPDATE', 'Changes'],
    ['FIX', 'Fixes'],
    ['REMOVE', 'Removed']
];
const SKIP_RE = /^Version \d|^(?:initial commit|init)$|claude|anthropic|generated with/i;

/**
 * @typedef {Object} ParsedCommit
 * @property {string} type CREATE, UPDATE, FIX or REMOVE.
 * @property {string} summary Commit title summary.
 * @property {string[]} details Body bullet lines.
 * @property {string} author Commit author name.
 */

/**
 * Builds release notes in Markdown from the commits between two tags.
 */
class ReleaseNotes {
    /**
     * Run a git command in the project root.
     * @param {string[]} args Git arguments.
     * @returns {string} Trimmed stdout, or '' on failure.
     */
    static git(args) {
        try {
            return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        } catch (err) {
            return '';
        }
    }

    /**
     * Parse one raw commit record.
     * @param {string} record Fields split by \x1f: author, message.
     * @returns {ParsedCommit|null} Parsed commit, or null when it is skipped.
     */
    static parse(record) {
        const [author, message] = record.split('\x1f');
        const lines = String(message || '').trim().split(/\r?\n/);
        const subject = lines[0].trim();
        const m = subject.match(COMMIT_RE);
        const type = m ? m[1] : 'UPDATE';
        const summary = (m ? m[2] : subject).trim();
        if (!summary || SKIP_RE.test(summary)) return null;
        const details = lines.slice(1)
            .map(l => l.trim())
            .filter(l => l.startsWith('- ') && !SKIP_RE.test(l) && !/^co-authored-by/i.test(l))
            .map(l => l.slice(2).trim());
        return { type, summary, details, author: (author || '').trim() };
    }

    /**
     * Build the notes for a tag.
     * @param {string} tag Release tag, e.g. v1.2.0.
     * @returns {string} Markdown notes.
     */
    static build(tag) {
        const previous = ReleaseNotes.git(['describe', '--tags', '--abbrev=0', `${tag}^`]);
        const range = previous ? `${previous}..${tag}` : tag;
        const raw = ReleaseNotes.git(['log', range, '--reverse', '--format=%an%x1f%B%x1e']);
        const commits = raw.split('\x1e').map(r => r.trim()).filter(Boolean).map(r => ReleaseNotes.parse(r)).filter(Boolean);

        const out = [];
        for (const [type, heading] of SECTIONS) {
            const entries = commits.filter(c => c.type === type);
            if (entries.length === 0) continue;
            out.push(`## ${heading}`, '');
            for (const c of entries) {
                out.push(`- ${c.summary}`);
                for (const d of c.details) out.push(`  - ${d}`);
            }
            out.push('');
        }
        if (out.length === 0) out.push('Maintenance release with no user-facing changes.', '');

        const owner = ReleaseNotes.git(['for-each-ref', '--format=%(taggername)', `refs/tags/${tag}`]) ||
            ReleaseNotes.git(['log', '-1', '--format=%an', tag]);
        const others = [...new Set(commits.map(c => c.author))].filter(a => a && a !== owner && !SKIP_RE.test(a) && !/\[bot\]$/.test(a));
        if (others.length > 0) out.push('## Contributors', '', `Thanks to ${others.join(', ')} for their work on this release.`, '');

        const repo = process.env.GITHUB_REPOSITORY;
        if (repo) {
            const link = previous
                ? `https://github.com/${repo}/compare/${previous}...${tag}`
                : `https://github.com/${repo}/commits/${tag}`;
            out.push(`**Full changelog:** ${link}`);
        }
        return out.join('\n').trim() + '\n';
    }
}

if (require.main === module) {
    const tag = process.argv[2];
    if (!tag) {
        console.error('Usage: node Scripts/ReleaseNotes.js <tag>');
        process.exitCode = 1;
    } else {
        process.stdout.write(ReleaseNotes.build(tag));
    }
}

module.exports = ReleaseNotes;
