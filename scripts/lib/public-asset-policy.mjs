export function verifyPublicAssets(publicAssets, blockedAssets, approval, retiredHashes, releaseMode) {
  if (approval.scope !== "public-web" || !approval.approvedBy || !approval.approvedAt || !approval.approval || !approval.sourceType || !approval.sourceRecord) {
    throw new Error("missing public asset rights approval");
  }
  const blocked = new Map(blockedAssets.map((asset) => [asset.path, asset.sha256]));
  const blockedHashes = new Set(blockedAssets.map((asset) => asset.sha256));
  const approved = new Map(approval.assets.map((asset) => [asset.path, asset.sha256]));
  if (approved.size !== approval.assets.length) throw new Error("duplicate public asset approval");
  for (const asset of publicAssets) {
    if (retiredHashes.has(asset.sha256)) throw new Error(`retired source hash remains public: ${asset.path}`);
    if (releaseMode && (blocked.has(asset.path) || blockedHashes.has(asset.sha256))) throw new Error("blocked-release assets remain in public output");
    const expected = approved.get(asset.path) ?? blocked.get(asset.path);
    if (!expected) throw new Error(`unregistered public asset: ${asset.path}`);
    if (expected !== asset.sha256) throw new Error(`public asset hash mismatch: ${asset.path}`);
  }
}
