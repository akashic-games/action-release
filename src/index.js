const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const github = require("@actions/github");
const canNpmPublish = require("can-npm-publish").canNpmPublish;
const simpleGit = require("simple-git");

const generateReleaseNote = require("./generateReleaseNote");
const injectChangelog = require("./injectChangelog");
const inputs = {
	githubToken: core.getInput("github_token"),
	targetTag: core.getInput("target_tag"),
	suppressReleaseCreation: core.getInput("suppress_release_creation"),
	gitName: core.getInput("git_name"),
	gitEmail: core.getInput("git_email"),
};

const targetDirPath = process.env.GITHUB_WORKSPACE;
const packageJsonPath = path.join(targetDirPath, "package.json");
const changelogPath = path.join(targetDirPath, "CHANGELOG.md");
const unreleasedChangesPath = path.join(targetDirPath, "UNRELEASED_CHANGES.md");

// GITHUB_REPOSITORYのフォーマットは オーナー名/リポジトリ名 となっているのでそれぞれ抽出する
const [ownerName, repositoryName] = process.env.GITHUB_REPOSITORY.split("/");
const gitCommitHash = process.env.GITHUB_SHA;
const currentBranch = process.env.GITHUB_REF_NAME;

(async () => {
	try {
		await canNpmPublish(packageJsonPath);
	} catch (error) {
		// すでに publish 済みの場合は正常終了とする
		console.log(error.message);
		return;
	}
	try {
		const packageJson = require(packageJsonPath);
		const version = packageJson["version"];
		const git = simpleGit();

		await git
			.addConfig("user.name", inputs.gitName, undefined, "global")
			.addConfig("user.email", inputs.gitEmail, undefined, "global");

		let body = "";
		let hasUpdateChangeLog = false;
		if (fs.existsSync(changelogPath)) {
			const changelog = fs.readFileSync(changelogPath).toString();
			body = generateReleaseNote(changelog, version);

			// CHANGELOG に差分が存在しない場合は独自に書き込む
			if (body === "") {
				// UNRELEASED_CHANGES.md が存在したらそれを読み込む
				if (fs.existsSync(unreleasedChangesPath)) {
					body = fs.readFileSync(unreleasedChangesPath).toString().trim();
				}
				if (body !== "") {
					fs.writeFileSync(unreleasedChangesPath, "");
					await git.add(unreleasedChangesPath);
				} else {
					// TODO: 変更内容の修正
					body = "* 内部モジュールの更新";
				}
				const newChangelog = injectChangelog(changelog, version, body);
				fs.writeFileSync(changelogPath, newChangelog);
				await git.add(changelogPath);
				await git.commit("Update CHANGELOG.md");
				hasUpdateChangeLog = true;
			}
		} else {
			// TODO: 文言の修正 (もう少し機械的に抽出できそう?)
			body = "* その他の更新";
		}

		const octokit = github.getOctokit(inputs.githubToken);

		// CHANGELOG を更新する場合は、publish せず Pull Request を作成する
		if (hasUpdateChangeLog) {
			const branchName = `update-changelog-for-v${version}-${Date.now()}`;
			await git.checkoutLocalBranch(branchName);
			await git.push("origin", branchName);
			const prTitle = `Update CHANGELOG for v${version}`;
			const prBody = `CHANGELOG.md was updated for v${version}.\n\nPlease check the contents and merge this Pull Request to proceed with the release.`;
			await octokit.rest.pulls.create({
				owner: ownerName,
				repo: repositoryName,
				title: prTitle,
				body: prBody,
				head: branchName,
				base: currentBranch
			});
			return;
		}

		execSync(`npm publish --tag ${inputs.targetTag}`, { cwd: targetDirPath, encoding: "utf-8" });

		if (inputs.suppressReleaseCreation !== "true") {
			await octokit.rest.repos.createRelease({
				owner: ownerName,
				repo: repositoryName,
				tag_name: "v" + version,
				name: "Release v" + version,
				body: body,
				target_commitish: gitCommitHash
			});
		}
	} catch(error) {
		core.setFailed(error.message);
	}
})();
