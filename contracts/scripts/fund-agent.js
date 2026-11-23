// Sends the agent's address some tQDAY for gas, from the signer (the deploy wallet).
//
//   AGENT_ADDRESS=0x... [AMOUNT=1] npx hardhat run scripts/fund-agent.js --network aevumTestnet
const { ethers, network, explorerTx } = require("./lib/common.js");

async function main() {
  const to = process.env.AGENT_ADDRESS;
  if (!to || !ethers.isAddress(to)) throw new Error("Set AGENT_ADDRESS to the agent's 0x address");
  const amount = ethers.parseEther(process.env.AMOUNT || "1");
  const [from] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(from.address);
  if (bal < amount) throw new Error(`${from.address} has ${ethers.formatEther(bal)} gas tokens; claim more at faucet.qday.info`);
  const r = await (await from.sendTransaction({ to, value: amount })).wait();
  const now = await ethers.provider.getBalance(to);
  console.log(`Sent ${ethers.formatEther(amount)} to ${to} on ${network.name}: ${explorerTx(r.hash)}`);
  console.log(`The agent now holds ${ethers.formatEther(now)}. A round costs a small fraction of that.`);
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
