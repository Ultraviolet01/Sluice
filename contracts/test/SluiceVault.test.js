const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const usd = (n) => ethers.parseUnits(String(n), 6); // tUSD8 = 6 decimals
const DAY = 24 * 3600;
const Band = { RunsAlone: 0n, NeedsApproval: 1n, Blocked: 2n };
const R = {
  Ok: 0n, Paused: 1n, NoSession: 2n, SessionExpired: 3n, NoSuchBill: 4n, BillCancelled: 5n, BadPeriod: 6n,
  NotDueYet: 7n, AlreadySettled: 8n, AlreadyProposed: 9n, Blocklisted: 10n, NotAllowlisted: 11n,
  OverPerPaymentCap: 12n, OverDailyCap: 13n, OverApprovalThreshold: 14n, BelowCashBuffer: 15n,
};

// Buffer 100, approval threshold 500, agent caps 500 per payment / 600 per 24h.
async function deploy() {
  const [owner, agent, payee, newPayee, stranger] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockUSD")).deploy();
  const vault = await (await ethers.getContractFactory("SluiceVault")).deploy(owner.address, await token.getAddress(), usd(100), usd(500));
  await token.mint(await vault.getAddress(), usd(10_000));
  const now = await time.latest();
  const expiry = now + 30 * DAY;
  await vault.grantSession(agent.address, usd(500), usd(600), expiry);
  await vault.setPayeeAllowed(payee.address, true);
  // bill 0: one-off 80 to allowlisted payee, due now
  await vault.addBill(payee.address, usd(80), now, 0, false, "Northwind Hosting");
  // bill 1: monthly-ish (30 days) 200 to allowlisted payee, due now
  await vault.addBill(payee.address, usd(200), now, 30, false, "Payroll");
  // bill 2: 800 to allowlisted payee (over caps), due now
  await vault.addBill(payee.address, usd(800), now, 0, false, "Fund payroll");
  // bill 3: 50 to a payee nobody allowlisted
  await vault.addBill(newPayee.address, usd(50), now, 0, false, "New supplier");
  return { vault, token, owner, agent, payee, newPayee, stranger, now, expiry };
}

const band = async (vault, agent, id, period = 0) => vault.checkPayment(agent.address, id, period);

describe("SluiceVault", () => {
  describe("bills", () => {
    it("agent pays a listed bill to its own payee for its exact amount, with a receipt", async () => {
      const { vault, token, agent, payee } = await loadFixture(deploy);
      await expect(vault.connect(agent).pay(0, 0))
        .to.emit(vault, "BillPaid").withArgs(0, 0, payee.address, usd(80), agent.address, false);
      expect(await token.balanceOf(payee.address)).to.equal(usd(80));
      expect(await vault.spentInWindow(agent.address)).to.equal(usd(80));
    });

    it("each bill period settles at most once", async () => {
      const { vault, agent } = await loadFixture(deploy);
      await vault.connect(agent).pay(0, 0);
      await expect(vault.connect(agent).pay(0, 0)).to.be.revertedWithCustomError(vault, "NotAgentPayable").withArgs(R.AlreadySettled);
    });

    it("recurring bills settle once per period, never ahead of schedule", async () => {
      const { vault, agent } = await loadFixture(deploy);
      await vault.connect(agent).pay(1, 0);
      expect(await band(vault, agent, 1, 1)).to.deep.equal([Band.Blocked, R.NotDueYet]);
      await time.increase(27 * DAY); // 3 days before period 1 is due
      await expect(vault.connect(agent).pay(1, 1)).to.emit(vault, "BillPaid");
      await expect(vault.connect(agent).pay(1, 2)).to.be.revertedWithCustomError(vault, "NotAgentPayable").withArgs(R.NotDueYet);
    });

    it("one-off bills have only period 0", async () => {
      const { vault, agent } = await loadFixture(deploy);
      expect(await band(vault, agent, 0, 1)).to.deep.equal([Band.Blocked, R.BadPeriod]);
    });

    it("cancelled bills cannot be paid, proposed or approved", async () => {
      const { vault, agent } = await loadFixture(deploy);
      await vault.connect(agent).propose(2, 0, "over cap");
      await vault.cancelBill(2);
      await expect(vault.approve(2, 0)).to.be.revertedWithCustomError(vault, "Refused").withArgs(R.BillCancelled);
      await vault.cancelBill(0);
      await expect(vault.connect(agent).pay(0, 0)).to.be.revertedWithCustomError(vault, "NotAgentPayable").withArgs(R.BillCancelled);
    });

    it("lists many bills in one signature, with the critical flag kept", async () => {
      const { vault, payee } = await loadFixture(deploy);
      const now = await time.latest();
      const rows = [
        { payee: payee.address, amount: usd(10), firstDue: now, intervalDays: 0, critical: false, label: "a" },
        { payee: payee.address, amount: usd(20), firstDue: now, intervalDays: 30, critical: true, label: "payroll" },
      ];
      await expect(vault.addBills(rows)).to.emit(vault, "BillAdded").withArgs(5, payee.address, usd(20), now, 30, true, "payroll");
      expect(await vault.billCount()).to.equal(6);
      expect((await vault.getBill(5)).critical).to.equal(true);
      await expect(vault.addBills([])).to.be.revertedWithCustomError(vault, "InvalidBill");
      await expect(vault.addBills(Array(51).fill(rows[0]))).to.be.revertedWithCustomError(vault, "InvalidBill");
      await expect(vault.addBills([{ ...rows[0], payee: ethers.ZeroAddress }])).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("validates bills", async () => {
      const { vault, payee } = await loadFixture(deploy);
      await expect(vault.addBill(ethers.ZeroAddress, 1, 1, 0, false, "x")).to.be.revertedWithCustomError(vault, "ZeroAddress");
      await expect(vault.addBill(payee.address, 0, 1, 0, false, "x")).to.be.revertedWithCustomError(vault, "InvalidBill");
      await expect(vault.addBill(payee.address, 1, 1, 0, false, "x".repeat(65))).to.be.revertedWithCustomError(vault, "TooLong");
    });
  });

  describe("check_payment bands", () => {
    it("reports why a bill needs the owner", async () => {
      const { vault, agent } = await loadFixture(deploy);
      expect(await band(vault, agent, 0)).to.deep.equal([Band.RunsAlone, R.Ok]);
      expect(await band(vault, agent, 2)).to.deep.equal([Band.NeedsApproval, R.OverPerPaymentCap]);
      expect(await band(vault, agent, 3)).to.deep.equal([Band.NeedsApproval, R.NotAllowlisted]);
    });

    it("approval threshold below the per-payment cap sends larger bills to the owner", async () => {
      const { vault, agent } = await loadFixture(deploy);
      await vault.setApprovalThreshold(usd(150));
      expect(await band(vault, agent, 1)).to.deep.equal([Band.NeedsApproval, R.OverApprovalThreshold]);
    });

    it("the 24h cap is rolling, not a fixed window", async () => {
      const { vault, payee, agent } = await loadFixture(deploy);
      const now = await time.latest();
      await vault.addBill(payee.address, usd(300), now, 0, false, "a"); // 4
      await vault.addBill(payee.address, usd(300), now, 0, false, "b"); // 5
      await vault.connect(agent).pay(4, 0); // t0: 300
      await time.increase(12 * 3600);
      await vault.connect(agent).pay(0, 0); // t0+12h: 80 -> 380
      expect(await band(vault, agent, 5)).to.deep.equal([Band.NeedsApproval, R.OverDailyCap]);
      await time.increase(12 * 3600 + 1); // first payment left the window, 80 remains
      expect(await vault.spentInWindow(agent.address)).to.equal(usd(80));
      await expect(vault.connect(agent).pay(5, 0)).to.emit(vault, "BillPaid");
    });

    it("the cash buffer holds for agent payments", async () => {
      const { vault, owner, agent } = await loadFixture(deploy);
      await vault.withdraw(owner.address, usd(9_850)); // leaves 150; paying 80 would leave 70 < 100
      expect(await band(vault, agent, 0)).to.deep.equal([Band.NeedsApproval, R.BelowCashBuffer]);
    });

    it("unknown bills, missing sessions and pause are blocked", async () => {
      const { vault, agent, stranger } = await loadFixture(deploy);
      expect(await band(vault, agent, 99)).to.deep.equal([Band.Blocked, R.NoSuchBill]);
      expect(await band(vault, stranger, 0)).to.deep.equal([Band.Blocked, R.NoSession]);
      await vault.pause();
      expect(await band(vault, agent, 0)).to.deep.equal([Band.Blocked, R.Paused]);
    });
  });

  describe("proposals", () => {
    it("agent proposes a bill outside its limits; the owner approves and it pays once", async () => {
      const { vault, token, agent, payee } = await loadFixture(deploy);
      await expect(vault.connect(agent).propose(2, 0, "Payroll short for Friday"))
        .to.emit(vault, "PaymentProposed").withArgs(2, 0, agent.address, usd(800), R.OverPerPaymentCap, "Payroll short for Friday");
      await expect(vault.approve(2, 0)).to.emit(vault, "BillPaid").withArgs(2, 0, payee.address, usd(800), agent.address, true);
      expect(await token.balanceOf(payee.address)).to.equal(usd(800));
      expect(await vault.spentInWindow(agent.address)).to.equal(0); // owner-approved, not agent budget
      await expect(vault.approve(2, 0)).to.be.revertedWithCustomError(vault, "NotPending");
    });

    it("the agent may choose caution: a bill inside its limits can be proposed instead of paid", async () => {
      const { vault, agent } = await loadFixture(deploy);
      await expect(vault.connect(agent).propose(0, 0, "lookalike payee name"))
        .to.emit(vault, "PaymentProposed").withArgs(0, 0, agent.address, usd(80), R.Ok, "lookalike payee name");
      await expect(vault.connect(agent).pay(0, 0)).to.be.revertedWithCustomError(vault, "NotAgentPayable").withArgs(R.AlreadyProposed);
    });

    it("rejected periods stay closed until the owner releases them", async () => {
      const { vault, agent } = await loadFixture(deploy);
      await vault.connect(agent).propose(3, 0, "new supplier");
      await expect(vault.reject(3, 0)).to.emit(vault, "PaymentRejected");
      await expect(vault.connect(agent).propose(3, 0, "again")).to.be.revertedWithCustomError(vault, "Refused").withArgs(R.AlreadySettled);
      await expect(vault.releaseBill(3, 0)).to.emit(vault, "BillReleased");
      await expect(vault.connect(agent).propose(3, 0, "again")).to.emit(vault, "PaymentProposed");
    });

    it("cannot be proposed twice, and approval re-checks the blocklist", async () => {
      const { vault, agent, payee } = await loadFixture(deploy);
      await vault.connect(agent).propose(2, 0, "x");
      await expect(vault.connect(agent).propose(2, 0, "y")).to.be.revertedWithCustomError(vault, "Refused").withArgs(R.AlreadyProposed);
      await vault.setPayeeBlocked(payee.address, true);
      await expect(vault.approve(2, 0)).to.be.revertedWithCustomError(vault, "Refused").withArgs(R.Blocklisted);
    });

    it("limits the note length", async () => {
      const { vault, agent } = await loadFixture(deploy);
      await expect(vault.connect(agent).propose(2, 0, "x".repeat(281))).to.be.revertedWithCustomError(vault, "TooLong");
    });
  });

  describe("owner controls", () => {
    it("pause halts agent payments but not owner withdrawals", async () => {
      const { vault, owner, agent } = await loadFixture(deploy);
      await vault.pause();
      await expect(vault.connect(agent).pay(0, 0)).to.be.revertedWithCustomError(vault, "NotAgentPayable").withArgs(R.Paused);
      await expect(vault.withdraw(owner.address, usd(1))).to.emit(vault, "Withdrawn");
    });

    it("rotating the agent revokes the old key at once; re-granting the same agent just updates it", async () => {
      const { vault, agent, stranger } = await loadFixture(deploy);
      expect(await vault.agent()).to.equal(agent.address);
      const exp = (await time.latest()) + 10 * DAY;
      await expect(vault.grantSession(agent.address, usd(200), usd(300), exp)).to.not.emit(vault, "SessionRevoked");
      expect((await vault.sessions(agent.address)).perPaymentCap).to.equal(usd(200));
      await expect(vault.grantSession(stranger.address, usd(100), usd(200), exp))
        .to.emit(vault, "SessionRevoked").withArgs(agent.address)
        .and.to.emit(vault, "SessionGranted");
      expect(await vault.agent()).to.equal(stranger.address);
      expect((await vault.sessions(agent.address)).active).to.equal(false);
      await expect(vault.connect(agent).pay(0, 0)).to.be.revertedWithCustomError(vault, "NotAgentPayable").withArgs(R.NoSession);
      await expect(vault.connect(stranger).pay(0, 0)).to.emit(vault, "BillPaid");
      await vault.revokeSession(stranger.address);
      expect(await vault.agent()).to.equal(ethers.ZeroAddress);
    });

    it("logs every policy change with old and new values", async () => {
      const { vault } = await loadFixture(deploy);
      await expect(vault.setCashBuffer(usd(250))).to.emit(vault, "PolicyChanged").withArgs(ethers.encodeBytes32String("cashBuffer"), usd(100), usd(250));
    });

    it("rejects invalid sessions and uses two-step ownership", async () => {
      const { vault, stranger } = await loadFixture(deploy);
      const future = (await time.latest()) + 1000;
      await expect(vault.grantSession(stranger.address, 0, 1, future)).to.be.revertedWithCustomError(vault, "InvalidSession");
      await expect(vault.grantSession(stranger.address, 10, 5, future)).to.be.revertedWithCustomError(vault, "InvalidSession");
      await expect(vault.grantSession(stranger.address, 1, 1, 1)).to.be.revertedWithCustomError(vault, "InvalidSession");
      await vault.transferOwnership(stranger.address);
      expect(await vault.owner()).to.not.equal(stranger.address);
      await vault.connect(stranger).acceptOwnership();
      expect(await vault.owner()).to.equal(stranger.address);
    });
  });
});
