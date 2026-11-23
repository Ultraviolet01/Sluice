const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const usd = (n) => ethers.parseUnits(String(n), 6); // tUSD8 = 6 decimals
const id = (s) => ethers.id(s);
const MEMO = ethers.id("memo");

async function deploy() {
  const [owner, agent, payee, stranger, other] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockUSD")).deploy();
  // buffer 100, approval threshold 500
  const vault = await (await ethers.getContractFactory("SluiceVault")).deploy(
    owner.address, await token.getAddress(), usd(100), usd(500)
  );
  await token.mint(await vault.getAddress(), usd(10_000));
  const expiry = (await time.latest()) + 7 * 24 * 3600;
  await vault.grantSession(agent.address, usd(1_000), usd(1_500), expiry);
  await vault.setPayeeAllowed(payee.address, true);
  return { vault, token, owner, agent, payee, stranger, other, expiry };
}

describe("SluiceVault", () => {
  describe("happy path", () => {
    it("agent pays an allowlisted payee and emits a receipt", async () => {
      const { vault, token, agent, payee } = await loadFixture(deploy);
      await expect(vault.connect(agent).pay(id("inv-1"), payee.address, usd(200), MEMO))
        .to.emit(vault, "InvoicePaid")
        .withArgs(id("inv-1"), payee.address, usd(200), agent.address, MEMO, false);
      expect(await token.balanceOf(payee.address)).to.equal(usd(200));
      expect(await vault.remainingDailyBudget(agent.address)).to.equal(usd(1_300));
    });
  });

  describe("guardrails", () => {
    it("rejects non-agents", async () => {
      const { vault, stranger, payee } = await loadFixture(deploy);
      await expect(vault.connect(stranger).pay(id("x"), payee.address, usd(1), MEMO))
        .to.be.revertedWithCustomError(vault, "NotActiveAgent");
    });

    it("rejects payees not on the allowlist", async () => {
      const { vault, agent, other } = await loadFixture(deploy);
      await expect(vault.connect(agent).pay(id("x"), other.address, usd(1), MEMO))
        .to.be.revertedWithCustomError(vault, "PayeeNotAllowed");
    });

    it("blocklist overrides allowlist", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      await vault.setPayeeBlocked(payee.address, true);
      await expect(vault.connect(agent).pay(id("x"), payee.address, usd(1), MEMO))
        .to.be.revertedWithCustomError(vault, "PayeeIsBlocked");
    });

    it("enforces per-payment cap", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      await expect(vault.connect(agent).pay(id("x"), payee.address, usd(1_001), MEMO))
        .to.be.revertedWithCustomError(vault, "ExceedsPerPaymentCap");
    });

    it("enforces the 24h budget and resets after the window", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      for (let i = 0; i < 3; i++) await vault.connect(agent).pay(id(`d${i}`), payee.address, usd(500), MEMO);
      await expect(vault.connect(agent).pay(id("d3"), payee.address, usd(1), MEMO))
        .to.be.revertedWithCustomError(vault, "ExceedsDailyCap");
      await time.increase(24 * 3600);
      await expect(vault.connect(agent).pay(id("d3"), payee.address, usd(500), MEMO)).to.emit(vault, "InvoicePaid");
    });

    it("never lets balance drop below the cash buffer", async () => {
      const { vault, owner, agent, payee } = await loadFixture(deploy);
      await vault.connect(owner).withdraw(owner.address, usd(9_500)); // leaves 500
      await expect(vault.connect(agent).pay(id("x"), payee.address, usd(401), MEMO))
        .to.be.revertedWithCustomError(vault, "BreachesCashBuffer");
      await expect(vault.connect(agent).pay(id("y"), payee.address, usd(400), MEMO)).to.emit(vault, "InvoicePaid");
    });

    it("is idempotent: the same invoice id can never pay twice", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      await vault.connect(agent).pay(id("dup"), payee.address, usd(10), MEMO);
      await expect(vault.connect(agent).pay(id("dup"), payee.address, usd(10), MEMO))
        .to.be.revertedWithCustomError(vault, "InvoiceAlreadyUsed");
    });

    it("expired sessions cannot pay", async () => {
      const { vault, agent, payee, expiry } = await loadFixture(deploy);
      await time.increaseTo(expiry);
      await expect(vault.connect(agent).pay(id("x"), payee.address, usd(1), MEMO))
        .to.be.revertedWithCustomError(vault, "SessionExpired");
      expect(await vault.remainingDailyBudget(agent.address)).to.equal(0);
    });

    it("revocation takes effect immediately", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      await expect(vault.revokeSession(agent.address)).to.emit(vault, "SessionRevoked");
      await expect(vault.connect(agent).pay(id("x"), payee.address, usd(1), MEMO))
        .to.be.revertedWithCustomError(vault, "NotActiveAgent");
    });

    it("pause halts agent payments but not owner withdrawals", async () => {
      const { vault, owner, agent, payee } = await loadFixture(deploy);
      await vault.pause();
      await expect(vault.connect(agent).pay(id("x"), payee.address, usd(1), MEMO))
        .to.be.revertedWithCustomError(vault, "EnforcedPause");
      await expect(vault.withdraw(owner.address, usd(1))).to.emit(vault, "Withdrawn");
    });

    it("only owner can administer", async () => {
      const { vault, agent, stranger } = await loadFixture(deploy);
      await expect(vault.connect(agent).grantSession(agent.address, 1, 1, 9e9))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(vault.connect(agent).setPayeeAllowed(stranger.address, true))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(vault.connect(agent).withdraw(agent.address, 1))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("rejects invalid sessions", async () => {
      const { vault, stranger } = await loadFixture(deploy);
      const future = (await time.latest()) + 1000;
      await expect(vault.grantSession(stranger.address, 0, 1, future)).to.be.revertedWithCustomError(vault, "InvalidSession");
      await expect(vault.grantSession(stranger.address, 10, 5, future)).to.be.revertedWithCustomError(vault, "InvalidSession");
      await expect(vault.grantSession(stranger.address, 1, 1, 1)).to.be.revertedWithCustomError(vault, "InvalidSession");
    });
  });

  describe("approval queue", () => {
    it("queues payments above the threshold without spending budget", async () => {
      const { vault, token, agent, payee } = await loadFixture(deploy);
      await expect(vault.connect(agent).pay(id("big"), payee.address, usd(800), MEMO))
        .to.emit(vault, "PaymentQueued");
      expect(await token.balanceOf(payee.address)).to.equal(0);
      expect(await vault.remainingDailyBudget(agent.address)).to.equal(usd(1_500));
    });

    it("owner approval pays and emits an approved receipt", async () => {
      const { vault, token, agent, payee } = await loadFixture(deploy);
      await vault.connect(agent).pay(id("big"), payee.address, usd(800), MEMO);
      await expect(vault.approve(id("big")))
        .to.emit(vault, "InvoicePaid")
        .withArgs(id("big"), payee.address, usd(800), agent.address, MEMO, true);
      expect(await token.balanceOf(payee.address)).to.equal(usd(800));
      await expect(vault.approve(id("big"))).to.be.revertedWithCustomError(vault, "InvoiceNotPending");
    });

    it("rejected invoices cannot be paid or resubmitted", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      await vault.connect(agent).pay(id("big"), payee.address, usd(800), MEMO);
      await expect(vault.reject(id("big"))).to.emit(vault, "PaymentRejected");
      await expect(vault.approve(id("big"))).to.be.revertedWithCustomError(vault, "InvoiceNotPending");
      await expect(vault.connect(agent).pay(id("big"), payee.address, usd(10), MEMO))
        .to.be.revertedWithCustomError(vault, "InvoiceAlreadyUsed");
    });

    it("approval re-checks the blocklist", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      await vault.connect(agent).pay(id("big"), payee.address, usd(800), MEMO);
      await vault.setPayeeBlocked(payee.address, true);
      await expect(vault.approve(id("big"))).to.be.revertedWithCustomError(vault, "PayeeIsBlocked");
    });
  });

  describe("ownership", () => {
    it("uses two-step ownership transfer", async () => {
      const { vault, stranger } = await loadFixture(deploy);
      await vault.transferOwnership(stranger.address);
      expect(await vault.owner()).to.not.equal(stranger.address);
      await vault.connect(stranger).acceptOwnership();
      expect(await vault.owner()).to.equal(stranger.address);
    });
  });
});
