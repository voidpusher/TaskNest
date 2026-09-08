const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const outputDirectory = path.join(projectRoot, 'web-dist');
const files = ['index.html', 'styles.css', 'renderer.js', 'service-worker.js', 'manifest.webmanifest'];

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(projectRoot, file), path.join(outputDirectory, file));
}
fs.cpSync(path.join(projectRoot, 'assets'), path.join(outputDirectory, 'assets'), { recursive: true });

console.log(`TaskNest web build created at ${outputDirectory}`);
