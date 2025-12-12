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
		const remoteBranch = `github-actions/update-changelog/${currentBranch}`;
		const octokit = github.getOctokit(inputs.githubToken);
		if (fs.existsSync(changelogPath)) {
			const changelog = fs.readFileSync(changelogPath).toString();
			body = generateReleaseNote(changelog, version);

			// CHANGELOG に差分が存在しない場合は独自に書き込みを行う。さらに publish せず Pull Request を作成する
			if (body === "") {
				// 作業用ブランチにチェックアウト
				let branchExists = true;
				try {
					await octokit.rest.repos.getBranch({
						owner: ownerName,
						repo: repositoryName,
						branch: remoteBranch,
					});
				} catch (error) {
					if (error.status === 404) {
						branchExists = false;
					} else {
						throw error;
					}
				}
				if (!branchExists) {
					await git.checkoutLocalBranch(remoteBranch);
				} else {
					await git.checkout(remoteBranch);
				}
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
				await git.push("origin", remoteBranch, { "--force": null });
				const { data: pullRequests } = await octokit.rest.pulls.list({
					owner: ownerName,
					repo: repositoryName,
					head: `${ownerName}:${remoteBranch}`,
				});
				if (pullRequests.length === 0) {
					const prTitle = `Update CHANGELOG for ${currentBranch}`;
					const prBody = `CHANGELOG.md was updated for ${currentBranch}.\n\n`
						+ "Please check the contents and merge this Pull Request to proceed with the release.";
					await octokit.rest.pulls.create({
						owner: ownerName,
						repo: repositoryName,
						title: prTitle,
						body: prBody,
						head: remoteBranch,
						base: currentBranch
					});
				}
				return;
			}
		} else {
			// TODO: 文言の修正 (もう少し機械的に抽出できそう?)
			body = "* その他の更新";
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
