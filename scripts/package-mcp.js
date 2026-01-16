#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const packageDir = path.join(rootDir, 'mcp-package');
const outputFile = path.join(rootDir, 'jean-claude.mcpb');

async function packageMCP() {
  console.log('📦 Packaging Jean-Claude MCP extension...\n');

  // Clean up any existing package directory and output file
  await fs.remove(packageDir);
  await fs.remove(outputFile);

  // Create package directory
  await fs.ensureDir(packageDir);

  // Copy necessary files
  console.log('📋 Copying files...');

  // Copy dist directory
  await fs.copy(distDir, path.join(packageDir, 'dist'));
  console.log('  ✓ dist/');

  // Copy manifest.json
  await fs.copy(
    path.join(rootDir, 'manifest.json'),
    path.join(packageDir, 'manifest.json')
  );
  console.log('  ✓ manifest.json');

  // Copy package.json (needed for node_modules resolution)
  await fs.copy(
    path.join(rootDir, 'package.json'),
    path.join(packageDir, 'package.json')
  );
  console.log('  ✓ package.json');

  // Copy node_modules (only production dependencies)
  console.log('  ⏳ Copying node_modules...');
  await fs.copy(
    path.join(rootDir, 'node_modules'),
    path.join(packageDir, 'node_modules')
  );
  console.log('  ✓ node_modules/');

  // Copy README and LICENSE if they exist
  if (await fs.pathExists(path.join(rootDir, 'README.md'))) {
    await fs.copy(
      path.join(rootDir, 'README.md'),
      path.join(packageDir, 'README.md')
    );
    console.log('  ✓ README.md');
  }

  if (await fs.pathExists(path.join(rootDir, 'LICENSE'))) {
    await fs.copy(
      path.join(rootDir, 'LICENSE'),
      path.join(packageDir, 'LICENSE')
    );
    console.log('  ✓ LICENSE');
  }

  // Create .mcpb archive
  console.log('\n📦 Creating .mcpb archive...');

  await new Promise((resolve, reject) => {
    const output = createWriteStream(outputFile);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', () => {
      console.log(`  ✓ Created ${path.basename(outputFile)} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(packageDir, false);
    archive.finalize();
  });

  // Clean up temporary package directory
  await fs.remove(packageDir);

  console.log('\n✨ MCP extension packaged successfully!');
  console.log(`\n📍 Output: ${outputFile}`);
  console.log('\nTo install:');
  console.log('  1. Open Claude Desktop');
  console.log('  2. Go to Settings > Extensions');
  console.log('  3. Click "Install Extension"');
  console.log('  4. Select jean-claude.mcpb');
}

packageMCP().catch((error) => {
  console.error('❌ Error packaging MCP extension:', error);
  process.exit(1);
});
