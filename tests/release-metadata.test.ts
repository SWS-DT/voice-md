import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface PackageMetadata {
	version: string;
}

interface ManifestMetadata {
	version: string;
	minAppVersion: string;
}

interface PackageLockMetadata {
	version: string;
	packages: Record<string, PackageMetadata>;
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf8')) as T;
}

void test('release metadata versions and compatibility mapping agree', () => {
	const packageMetadata = readJson<PackageMetadata>('package.json');
	const packageLock = readJson<PackageLockMetadata>('package-lock.json');
	const manifest = readJson<ManifestMetadata>('manifest.json');
	const versions = readJson<Record<string, string>>('versions.json');

	assert.equal(packageMetadata.version, manifest.version);
	assert.equal(packageLock.version, manifest.version);
	assert.equal(packageLock.packages['']?.version, manifest.version);
	assert.equal(versions[manifest.version], manifest.minAppVersion);
});
