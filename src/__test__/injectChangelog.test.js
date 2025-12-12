const assert = require("assert");
const injectChangelog = require("../injectChangelog");

try {
	assert.strictEqual(
		injectChangelog(
			"# CHANGELOG\n\n## 1.0.1\n* content",
			"1.1.0",
			"* release 1.1.0"
		),
		"# CHANGELOG\n\n## 1.1.0\n* release 1.1.0\n\n## 1.0.1\n* content"
	);
	assert.strictEqual(
		injectChangelog(
			"# CHANGELOG\n\n## 1.1.0\n* release 1.1.0\n\n## 1.0.1\n* content",
			"1.1.0",
			"* new content!! for 1.1.0"
		),
		"# CHANGELOG\n\n## 1.1.0\n* new content!! for 1.1.0\n\n## 1.0.1\n* content"
	);
	assert.strictEqual(
		injectChangelog(
			"# CHANGELOG\n\n## 1.1.0\n* release 1.1.0\n* new content!!\n\n## 1.0.1\n* release 1.0.1\n\n## 1.0.0\n* content",
			"1.1.0",
			"* update modules"
		),
		"# CHANGELOG\n\n## 1.1.0\n* update modules\n\n## 1.0.1\n* release 1.0.1\n\n## 1.0.0\n* content"
	);
	assert.strictEqual(
		injectChangelog(
			"# CHANGELOG\n\n## 1.0.1\n* release 1.0.1\n\n## 1.0.0\n* content",
			"1.0.0",
			"* first release\n* content for 1.0.0"
		),
		"# CHANGELOG\n\n## 1.0.1\n* release 1.0.1\n\n## 1.0.0\n* first release\n* content for 1.0.0\n"
	);
} catch(e) {
	console.log(e);
	process.exit(1);
}
