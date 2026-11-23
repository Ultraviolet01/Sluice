import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmPayee, describe, nameFromURI, sameBusiness, type Identity } from "./payee.ts";

const ids: Identity[] = [
  { agentId: 1, name: "Northwind Hosting Ltd", wallet: "0xf7C00584EaeD46d4F2D7f305469A5c047972D23C" },
  { agentId: 3, name: "Figma", wallet: "0x631c4eca071367870Bd8cf94B68d46AfDF68AcB6" },
];
const scam = "0x1111111111111111111111111111111111111111";

test("names match ignoring case, punctuation, suffixes and extra words", () => {
  assert.ok(sameBusiness("Figma subscription", "Figma"));
  assert.ok(sameBusiness("northwind hosting", "Northwind Hosting Ltd"));
  assert.ok(!sameBusiness("Northwlnd Hosting", "Northwind Hosting Ltd"));
  assert.ok(!sameBusiness("Atlas Freight", "Figma"));
});

test("confirms the registered wallet under its own name", () => {
  assert.equal(confirmPayee("0xf7c00584eaed46d4f2d7f305469a5c047972d23c", "Northwind Hosting", ids).status, "confirmed");
});

test("catches a bill naming a registered business at another address", () => {
  const c = confirmPayee(scam, "Northwind Hosting, new bank details", ids);
  assert.equal(c.status, "impostor");
  assert.match(describe(c, scam)!, /Northwind Hosting Ltd is registered/);
});

test("catches a registered address under someone else's name", () => {
  assert.equal(confirmPayee(ids[1].wallet, "Northwind Hosting", ids).status, "mismatch");
});

test("an unknown name at an unknown address is just unregistered", () => {
  const c = confirmPayee(scam, "Contractor payroll", ids);
  assert.equal(c.status, "unregistered");
  assert.equal(describe(c, scam), null);
});

test("reads the name from a data: registration file, and nothing from junk", () => {
  const uri = "data:application/json;base64," + Buffer.from(JSON.stringify({ name: "Figma" })).toString("base64");
  assert.equal(nameFromURI(uri), "Figma");
  assert.equal(nameFromURI("https://x"), "");
  assert.equal(nameFromURI("data:application/json;base64,!!"), "");
});
