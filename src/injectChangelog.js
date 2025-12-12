module.exports = (changelog, version, content) => {
	const changelogArray = changelog.split("\n");
	const newContent = `${content}\n`;
	const mdContent = [`## ${version}`, ...newContent.split("\n")];
	const versionHeader = `## ${version}`;
	let versionFound = false;

	for (let i = 0; i < changelogArray.length; i++) {
		if (changelogArray[i].startsWith(versionHeader)) {
			// バージョンが既に存在する場合、内容を置き換える
			let j = i + 1;
			while (j < changelogArray.length && !changelogArray[j].startsWith("## ")) {
				changelogArray.splice(j, 1); // 古い内容を削除
			}
			changelogArray.splice(i + 1, 0, ...newContent.split("\n")); // 新しい内容を挿入
			versionFound = true;
			break;
		}
	}

	if (!versionFound) {
		// バージョンが存在しない場合、新しいバージョンを追記
		changelogArray.splice(2, 0, ...mdContent);
	}

	return changelogArray.join("\n");
};
