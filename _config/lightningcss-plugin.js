import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import browserslist from "browserslist";
import { bundle, browserslistToTargets, composeVisitors } from "lightningcss";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set default transpiling targets
let browserslistTargets = "> 0.2% and not dead";

// Check for user's browserslist
try {
  const packagePath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  if (packageJson.browserslist) {
    browserslistTargets = packageJson.browserslist;
  } else {
    try {
      const browserslistrcPath = path.resolve(process.cwd(), ".browserslistrc");
      const data = fs.readFileSync(browserslistrcPath, "utf8");

      if (data.length) {
        browserslistTargets = [];
      }

      data.split(/\r?\n/).forEach((line) => {
        if (line.length && !line.startsWith("#")) {
          browserslistTargets.push(line);
        }
      });
    } catch (err) {
      // no .browserslistrc
    }
  }
} catch (err) {
  // no package browserslist
}

export default function (eleventyConfig, options = {}) {
  const defaults = {
    importPrefix: "_",
    nesting: false,
    customMedia: false,
    minify: false,
    sourceMap: false,
    visitors: [],
    customAtRules: {},
  };

  const {
    importPrefix,
    nesting,
    customMedia,
    minify,
    sourceMap,
    visitors,
    customAtRules,
  } = {
    ...defaults,
    ...options,
  };

  // Recognize CSS as a "template language"
  eleventyConfig.addTemplateFormats("css");

  // Process CSS with LightningCSS
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: async function (_inputContent, inputPath) {
      let parsed = path.parse(inputPath);
      if (parsed.name.startsWith(importPrefix)) {
        return;
      }

      // Support @import triggering regeneration for incremental builds
      if (_inputContent.includes("@import")) {
        // for each file create a list of files to look at
        const fileList = [];

        // get a list of import on the file your reading
        const importRuleRegex =
          /@import\s+(?:url\()?['"]?([^'"\);]+)['"]?\)?.*;/g;

        let match;
        while ((match = importRuleRegex.exec(_inputContent))) {
          fileList.push(parsed.dir + "/" + match[1]);
        }

        this.addDependencies(inputPath, fileList);
      }

      let targets = browserslistToTargets(browserslist(browserslistTargets));

      return async () => {
        let { code } = await bundle({
          filename: inputPath,
          minify,
          sourceMap,
          targets,
          drafts: {
            nesting,
            customMedia,
          },
          customAtRules,
          visitor: composeVisitors(visitors),
        });
        return code;
      };
    },
  });
}
