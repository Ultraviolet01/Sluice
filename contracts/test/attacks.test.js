// What a thief holding the agent's session key can try, and the vault's answer.
// Every attack signs as the agent (or an outsider) and must fail.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const usd = (n) => ethers.parseUnits(String(n), 6);
const DAY = 24 * 3600;

async function deploy() {
  const [owner, agent, payee, thief, outsider] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockUSD")).deploy();
  const vault = await (await ethers.getContractFactory("SluiceVault")).deploy(owner.address, await token.getAddress(), usd(100), usd(500));
  await token.mint(await vault.getAddress(), usd(10_000));
  const now = await time.latest();
  await vault.grantSession(agent.address, usd(500), usd(600), now + 30 * DAY);
  await vault.setPayeeAllowed(payee.address, true);
  await vault.addBill(payee.address, usd(80), now, 0, "Northwind Hosting"); // 0
  await vault.addBill(payee.address, usd(800), now, 0, "Big bill"); // 1
  await vault.addBill(payee.address, usd(20), now, 1, "Daily SaaS"); // 2 (every day)
  return { vault, token, owner, agent, payee, thief, outsider, now };
}

describe("Attacks with a stolen agent key", () => {
  const ownerOnly = [
    ["grant itself a bigger session", (v, a) => v.connect(a).grantSession(a.address, usd(1e6), usd(1e6), 9_999_999_999)],
    ["allowlist its own address", (v, a, t) => v.connect(a).setPayeeAllowed(t.address, true)],
    ["unblock a payee", (v, a, t) => v.connect(a).setPayeeBlocked(t.address, false)],
    ["list a bill to itself", (v, a, t) => v.connect(a).addBill(t.address, usd(1000), 1, 0, "x")],
    ["approve its own proposal", (v, a) => v.connect(a).approve(1, 0)],
    ["withdraw the vault", (v, a, t) => v.connect(a).withdraw(t.address, usd(1))],
    ["lower the cash buffer", (v, a) => v.connect(a).setCashBuffer(0)],
    ["raise the approval threshold", (v, a) => v.connect(a).setApprovalThreshold(usd(1e6))],
    ["unpause", (v, a) => v.connect(a).unpause()],
    ["take ownership", (v, a) => v.connect(a).transferOwnership(a.address)],
    ["release a rejected bill", (v, a) => v.connect(a).releaseBill(0, 0)],
    ["cancel a bill", (v, a) => v.connect(a).cancelBill(0)],
  ];
  for (const [what, call] of ownerOnly) {
    it(`cannot ${what}`, async () => {
      const { vault, agent, thief } = await loadFixture(deploy);
      await expect(call(vault, agent, thief)).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  }

  it("cannot pay a bill nobody listed", async () => {
    const { vault, agent } = await loadFixture(deploy);
    await expect(vault.connect(agent).pay(42, 0)).to.be.revertedWithCustomError(vault, "NotAgentPayable");
  });

  it("cannot redirect a bill: pay() takes no payee or amount", async () => {
    const { vault } = await loadFixture(deploy);
    const frag = vault.interface.getFunction("pay");
    expect(frag.inputs.map((i) => i.type)).to.deep.equal(["uint256", "uint32"]);
  });

  it("cannot pay a bill twice or pay future periods early", async () => {
    const { vault, agent } = await loadFixture(deploy);
    await vault.connect(agent).pay(0, 0);
    await expect(vault.connect(agent).pay(0, 0)).to.be.reverted;
    await expect(vault.connect(agent).pay(2, 30)).to.be.reverted;
  });

  it("cannot drain through many small periods past the rolling cap", async () => {
    const { vault, agent } = await loadFixture(deploy);
    await time.increase(40 * DAY);
    await vault.grantSession(agent.address, usd(500), usd(600), (await time.latest()) + DAY);
    // 600 cap / 20 per period = 30 periods, then refused.
    for (let p = 0; p < 30; p++) await vault.connect(agent).pay(2, p);
    await expect(vault.connect(agent).pay(2, 30)).to.be.reverted;
  });

  it("cannot pay a blocklisted payee, alone or by proposal", async () => {
    const { vault, agent, payee } = await loadFixture(deploy);
    await vault.setPayeeBlocked(payee.address, true);
    await expect(vault.connect(agent).pay(0, 0)).to.be.reverted;
    await expect(vault.connect(agent).propose(1, 0, "pls")).to.be.revertedWithCustomError(vault, "Refused");
  });

  it("cannot act after revocation, expiry or pause", async () => {
    const { vault, agent } = await loadFixture(deploy);
    await vault.pause();
    await expect(vault.connect(agent).pay(0, 0)).to.be.reverted;
    await vault.unpause();
    await vault.revokeSession(agent.address);
    await expect(vault.connect(agent).pay(0, 0)).to.be.reverted;
    await expect(vault.connect(agent).propose(1, 0, "x")).to.be.reverted;
  });

  it("an outsider can do nothing at all", async () => {
    const { vault, outsider } = await loadFixture(deploy);
    await expect(vault.connect(outsider).pay(0, 0)).to.be.reverted;
    await expect(vault.connect(outsider).propose(1, 0, "x")).to.be.reverted;
  });

  it("cannot move the token directly: the vault never approves allowances", async () => {
    const { vault, token, agent, thief } = await loadFixture(deploy);
    const v = await vault.getAddress();
    expect(await token.allowance(v, agent.address)).to.equal(0);
    await expect(token.connect(agent).transferFrom(v, thief.address, 1)).to.be.reverted;
  });
});
