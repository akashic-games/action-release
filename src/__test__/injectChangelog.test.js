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
} catch(e) {
	console.log(e);
	process.exit(1);
}
