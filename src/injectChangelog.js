module.exports = (changelog, version, content) => {
	const changelogArray = changelog.split("\n");
	const mdContent = `## ${version}\n${content}\n`;
	changelogArray.splice(2, 0, mdContent);
	return changelogArray.join("\n");
};
