const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const usd = (n) => ethers.parseUnits(String(n), 6);

async function deploy() {
  const [deployer, founder, other] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockUSD")).deploy();
  const factory = await (await ethers.getContractFactory("SluiceFactory")).deploy(await token.getAddress());
  return { factory, token, deployer, founder, other };
}

describe("SluiceFactory", () => {
  it("creates a vault owned by the caller, with the caller's limits", async () => {
    const { factory, token, founder } = await loadFixture(deploy);
    const tx = await factory.connect(founder).createVault("Kora Supply Group", usd(100), usd(500));
    const ev = (await tx.wait()).logs.map((l) => factory.interface.parseLog(l)).find((e) => e?.name === "VaultCreated");
    const vault = await ethers.getContractAt("SluiceVault", ev.args.vault);
    expect(await vault.owner()).to.equal(founder.address);
    expect(await vault.token()).to.equal(await token.getAddress());
    expect(await vault.cashBuffer()).to.equal(usd(100));
    expect(await vault.approvalThreshold()).to.equal(usd(500));
    expect(await factory.nameOf(ev.args.vault)).to.equal("Kora Supply Group");
    expect(await factory.isVault(ev.args.vault)).to.equal(true);
    expect(await factory.vaultsCreatedBy(founder.address)).to.deep.equal([ev.args.vault]);
    expect(await factory.vaultCount()).to.equal(1);
  });

  it("keeps no rights over the vaults it creates", async () => {
    const { factory, founder } = await loadFixture(deploy);
    await factory.connect(founder).createVault("Acme", 0, usd(10));
    const vault = await ethers.getContractAt("SluiceVault", await factory.vaultAt(0));
    expect(await vault.owner()).to.not.equal(await factory.getAddress());
    // The factory has no function that calls into a vault at all.
    const fns = factory.interface.fragments.filter((f) => f.type === "function").map((f) => f.name).sort();
    expect(fns).to.deep.equal(["MAX_NAME", "MAX_PER_OWNER", "createVault", "isVault", "nameOf", "token", "vaultAt", "vaultCount", "vaultsCreatedBy"]);
  });

  it("validates names and caps vaults per creator", async () => {
    const { factory, founder } = await loadFixture(deploy);
    await expect(factory.connect(founder).createVault("", 0, 0)).to.be.revertedWithCustomError(factory, "InvalidName");
    await expect(factory.connect(founder).createVault("x".repeat(49), 0, 0)).to.be.revertedWithCustomError(factory, "InvalidName");
    for (let i = 0; i < 20; i++) await factory.connect(founder).createVault(`Co ${i}`, 0, 0);
    await expect(factory.connect(founder).createVault("One more", 0, 0)).to.be.revertedWithCustomError(factory, "TooManyVaults");
  });
});
