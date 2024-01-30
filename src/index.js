const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const github = require("@actions/github");
const { npmPublish } = require("@jsdevtools/npm-publish");
const canNpmPublish = require("can-npm-publish").canNpmPublish;
const simpleGit = require("simple-git");

const generateReleaseNote = require("./generateReleaseNote");
const injectChangelog = require("./injectChangelog");
const inputs = {
	githubToken: core.getInput("github_token"),
	npmToken: core.getInput("npm_token"),
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
			}
		} else {
			// TODO: 文言の修正 (もう少し機械的に抽出できそう?)
			body = "* その他の更新";
		}

		await git.push("origin", currentBranch);

		await npmPublish({
			package: packageJsonPath,
			token: inputs.npmToken
		});

		const octokit = github.getOctokit(inputs.githubToken);
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
