'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PACKAGE_FILE = path.join(ROOT, 'package.json');
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
const USAGE = 'Usage: npm run release -- <patch|minor|major|x.y.z> "<Theme>"';

/**
 * Bumps the version, commits it, creates the annotated release tag and pushes
 * both, which starts the Release GitHub Action.
 */
class Release {
    /**
     * Run a git command in the project root.
     * @param {string[]} args Git arguments.
     * @returns {string} Trimmed stdout.
     */
    static git(args) {
        return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
    }

    /**
     * Run a git command, returning null instead of throwing on failure.
     * @param {string[]} args Git arguments.
     * @returns {string|null} Trimmed stdout or null.
     */
    static tryGit(args) {
        try {
            return Release.git(args);
        } catch (err) {
            return null;
        }
    }

    /**
     * Next version from the current one and a bump keyword or explicit version.
     * @param {string} current Current package version.
     * @param {string} bump 'patch', 'minor', 'major' or an explicit x.y.z.
     * @returns {string} Next version.
     */
    static nextVersion(current, bump) {
        const explicit = String(bump).replace(/^v/, '');
        if (SEMVER.test(explicit)) return explicit;
        const m = String(current).match(/^(\d+)\.(\d+)\.(\d+)/);
        if (!m || !SEMVER.test(current)) {
            throw new Error(`Current version "${current}" is not valid semver; pass an explicit version like 1.2.0`);
        }
        const [major, minor, patch] = m.slice(1).map(Number);
        const stable = !current.includes('-');
        if (bump === 'major') return `${major + 1}.0.0`;
        if (bump === 'minor') return `${major}.${minor + 1}.0`;
        if (bump === 'patch') return stable ? `${major}.${minor}.${patch + 1}` : `${major}.${minor}.${patch}`;
        throw new Error(USAGE);
    }

    /**
     * Stop with a message when the tree is dirty, out of sync or the tag exists.
     * @param {string} tag Tag about to be created.
     * @returns {void}
     */
    static checkReady(tag) {
        if (Release.git(['status', '--porcelain'])) throw new Error('Commit or stash your changes first');
        Release.git(['fetch', 'origin', '--tags']);
        const behind = Release.tryGit(['rev-list', '--count', 'HEAD..@{u}']);
        if (behind === null) throw new Error('The current branch has no upstream on origin');
        if (Number(behind) > 0) throw new Error('The branch is behind origin; pull first');
        if (Release.tryGit(['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) throw new Error(`Tag ${tag} already exists`);
    }

    /**
     * Write the new version into package.json, keeping its 4-space layout.
     * @param {string} version New version.
     * @returns {void}
     */
    static writeVersion(version) {
        const pkg = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8'));
        pkg.version = version;
        fs.writeFileSync(PACKAGE_FILE, JSON.stringify(pkg, null, 4) + '\n');
    }

    /**
     * Cut the release.
     * @param {string} bump 'patch', 'minor', 'major' or an explicit x.y.z.
     * @param {string} theme Short theme for the release title.
     * @returns {void}
     */
    static run(bump, theme) {
        if (!bump || !theme) throw new Error(USAGE);
        const current = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8')).version;
        const version = Release.nextVersion(current, bump);
        const tag = `v${version}`;
        const title = `${tag} - ${theme}`;
        Release.checkReady(tag);

        Release.writeVersion(version);
        Release.git(['add', 'package.json']);
        Release.git(['commit', '-m', `UPDATE | Version ${version}`]);
        Release.git(['tag', '-a', tag, '-m', title]);
        Release.git(['push', 'origin', 'HEAD']);
        Release.git(['push', 'origin', tag]);
        console.log(`Pushed ${tag} (${title}). The Release workflow will build and publish it.`);
    }
}

if (require.main === module) {
    try {
        Release.run(process.argv[2], process.argv.slice(3).join(' ').trim());
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    }
}

module.exports = Release;
