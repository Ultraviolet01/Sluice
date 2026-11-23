const { expect } = require("chai");
const { ethers } = require("hardhat");

const uri = (name) => "data:application/json;base64," + Buffer.from(JSON.stringify({
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name, description: "", services: [], active: true,
})).toString("base64");

describe("IdentityRegistry (ERC-8004)", () => {
  let reg, a, b, c;
  beforeEach(async () => {
    [a, b, c] = await ethers.getSigners();
    reg = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
  });

  async function sign(signer, agentId, wallet, deadline) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = { name: "ERC8004IdentityRegistry", version: "1", chainId, verifyingContract: await reg.getAddress() };
    const types = { SetAgentWallet: [
      { name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" },
      { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
    return signer.signTypedData(domain, types, { agentId, newWallet: wallet, nonce: await reg.walletNonce(agentId), deadline });
  }

  it("registers an identity whose wallet starts as the owner", async () => {
    await expect(reg.connect(a)["register(string)"](uri("Northwind Hosting")))
      .to.emit(reg, "Registered").withArgs(1, uri("Northwind Hosting"), a.address);
    expect(await reg.ownerOf(1)).to.equal(a.address);
    expect(await reg.tokenURI(1)).to.equal(uri("Northwind Hosting"));
    expect(await reg.getAgentWallet(1)).to.equal(a.address);
    expect(await reg.agentOfWallet(a.address)).to.equal(1);
  });

  it("refuses agentWallet through setMetadata and register", async () => {
    await reg["register(string)"]("x");
    await expect(reg.setMetadata(1, "agentWallet", "0x01")).to.be.revertedWithCustomError(reg, "ReservedKey");
    await expect(reg.connect(b)["register(string,(string,bytes)[])"]("x", [["agentWallet", "0x01"]])).to.be.revertedWithCustomError(reg, "ReservedKey");
    await reg.setMetadata(1, "domain", ethers.toUtf8Bytes("northwind.example"));
    expect(ethers.toUtf8String(await reg.getMetadata(1, "domain"))).to.equal("northwind.example");
  });

  it("moves the wallet only with the new wallet's signature", async () => {
    await reg.connect(a)["register(string)"]("x");
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 600;
    const bad = await sign(c, 1, b.address, deadline);
    await expect(reg.setAgentWallet(1, b.address, deadline, bad)).to.be.revertedWithCustomError(reg, "BadSignature");
    const good = await sign(b, 1, b.address, deadline);
    await reg.setAgentWallet(1, b.address, deadline, good);
    expect(await reg.getAgentWallet(1)).to.equal(b.address);
    expect(await reg.agentOfWallet(b.address)).to.equal(1);
    expect(await reg.agentOfWallet(a.address)).to.equal(0);
    await expect(reg.setAgentWallet(1, b.address, deadline, good)).to.be.revertedWithCustomError(reg, "BadSignature"); // nonce used
    await expect(reg.setAgentWallet(1, b.address, deadline - 10_000, await sign(b, 1, b.address, deadline - 10_000))).to.be.revertedWithCustomError(reg, "Expired");
  });

  it("lets only the owner change an identity, and one wallet answers for one identity", async () => {
    await reg.connect(a)["register(string)"]("x");
    await expect(reg.connect(b).setAgentURI(1, "y")).to.be.revertedWithCustomError(reg, "NotAuthorized");
    await expect(reg.connect(b).unsetAgentWallet(1)).to.be.revertedWithCustomError(reg, "NotAuthorized");
    await expect(reg.connect(a)["register(string)"]("dup")).to.be.revertedWithCustomError(reg, "WalletTaken");
  });

  it("clears the wallet on transfer", async () => {
    await reg.connect(a)["register(string)"]("x");
    await reg.connect(a).transferFrom(a.address, b.address, 1);
    expect(await reg.getAgentWallet(1)).to.equal(ethers.ZeroAddress);
    expect(await reg.agentOfWallet(a.address)).to.equal(0);
  });
});
