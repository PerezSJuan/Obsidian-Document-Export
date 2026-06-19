function toForwardSlashes(path: string): string {
	return path.replace(/\\/g, '/');
}

function normalizePath(path: string): string {
	return toForwardSlashes(path)
		.replace(/\/+/g, '/')
		.replace(/\/+$/, '');
}

function trimTrailingSlashes(path: string): string {
	return path.replace(/\/+$/, '');
}

export function normalizeVaultRelativePath(path: string, basePath = ''): string {
	const normalizedPath = trimTrailingSlashes(toForwardSlashes(path.trim()));
	if (!normalizedPath) return '';

	const normalizedBase = trimTrailingSlashes(toForwardSlashes(basePath.trim()));
	if (normalizedBase) {
		if (normalizedPath === normalizedBase) return '';
		if (normalizedPath.startsWith(`${normalizedBase}/`)) {
			return normalizePath(normalizedPath.slice(normalizedBase.length + 1));
		}
	}

	return normalizePath(normalizedPath.replace(/^\/+/, ''));
}

export function joinVaultPath(folder: string, leaf: string): string {
	const normalizedFolder = normalizeVaultRelativePath(folder);
	const normalizedLeaf = normalizePath(leaf.replace(/^\/+/, ''));
	if (!normalizedFolder) return normalizedLeaf;
	return normalizePath(`${normalizedFolder}/${normalizedLeaf}`);
}
