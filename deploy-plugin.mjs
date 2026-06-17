import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.resolve('.env.local');

if (existsSync(envPath)) {
	const envFile = await readFile(envPath, 'utf8');
	for (const line of envFile.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const separatorIndex = trimmed.indexOf('=');
		if (separatorIndex === -1) continue;

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

const pluginsDir = process.env.OBSIDIAN_PLUGINS_DIR;

if (!pluginsDir) {
	console.error('Missing OBSIDIAN_PLUGINS_DIR. Add it to .env.local.');
	process.exit(1);
}

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pluginId = manifest.id;
const targetDir = path.join(pluginsDir, pluginId);
const files = ['main.js', 'manifest.json', 'styles.css'];

await mkdir(targetDir, { recursive: true });

const copied = [];
for (const file of files) {
	const source = path.resolve(file);
	const destination = path.join(targetDir, file);
	await copyFile(source, destination);
	const fileStat = await stat(destination);
	copied.push({ file, bytes: fileStat.size });
}

const now = new Date().toLocaleString();

console.log(`Deployed ${pluginId} to ${targetDir}`);
for (const item of copied) {
	console.log(`- ${item.file} (${item.bytes} bytes)`);
}
console.log(`Completed at ${now}`);
