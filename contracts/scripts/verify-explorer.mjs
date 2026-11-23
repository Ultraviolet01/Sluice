// Verifies the deployed contracts on the Aevum explorer (Blockscout) from the exact compiler input Hardhat used.
// Run after `npx hardhat compile`: node scripts/verify-explorer.mjs
import fs from "fs";
const dir = "artifacts/build-info";
const b = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`))).find((x) => x.input.sources["contracts/SluiceVault.sol"] && x.input.sources["contracts/IdentityRegistry.sol"]);
const d = JSON.parse(fs.readFileSync("deployments/aevumTestnet-deploy.json"));
const demo = fs.existsSync("deployments/aevumTestnet-demo.json") ? JSON.parse(fs.readFileSync("deployments/aevumTestnet-demo.json")) : null;
const input = { language: b.input.language, sources: b.input.sources, settings: { ...b.input.settings, outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } } } };
const id = fs.existsSync("deployments/aevumTestnet-identity.json") ? JSON.parse(fs.readFileSync("deployments/aevumTestnet-identity.json")) : null;
const jobs = [
  ...(id ? [[id.registry, "contracts/IdentityRegistry.sol:IdentityRegistry"]] : []),
  [d.factory, "contracts/SluiceFactory.sol:SluiceFactory"],
  [d.vault, "contracts/SluiceVault.sol:SluiceVault"],
  ...(demo ? [[demo.vault, "contracts/SluiceVault.sol:SluiceVault"]] : []),
];
for (const [addr, name] of jobs) {
  const fd = new FormData();
  fd.append("compiler_version", "v" + b.solcLongVersion);
  fd.append("license_type", "mit");
  fd.append("contract_name", name);
  fd.append("autodetect_constructor_args", "true");
  fd.append("files[0]", new Blob([JSON.stringify(input)], { type: "application/json" }), "input.json");
  const r = await fetch(`https://explorer-test.qday.info/api/v2/smart-contracts/${addr}/verification/via/standard-input`, { method: "POST", body: fd });
  console.log(addr, r.status, (await r.text()).slice(0, 200));
}
