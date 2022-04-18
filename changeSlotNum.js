// SPDX-License-Identifier: BUSL-1.1
/*
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */
const assert = require("assert");
const { open } = require("fs/promises");

const myArgs = process.argv.slice(2);
if (myArgs.length !== 1) {
  throw Error("arguments error");
}
let slotNum;
try {
  slotNum = Math.round(+myArgs[0]);
  assert.equal(slotNum.toString(), myArgs[0]);
} catch {
  throw Error("arguments error");
}
console.log("set SLOT_NUM to ", slotNum);

async function streamToString(stream) {
  // lets have a ReadableStream as a stream variable
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

(async () => {
  const solFile = "contracts/SlotNum.sol";
  const fd = await open(solFile, "r"); // Abort the request before the promise settles.
  const text = await streamToString(fd.createReadStream());
  const toText = text.replace(/SLOT_NUM[^;]+;/, `SLOT_NUM = ${slotNum};`);
  await fd.close();
  const fdw = await open(solFile, "w"); // Abort the request before the promise settles.
  const writeStream = await fdw.createWriteStream();
  await writeStream.write(toText);
  await fdw.close();
})();

(async () => {
  const jsFile = "slotNum.js";
  const fd = await open(jsFile, "r"); // Abort the request before the promise settles.
  const text = await streamToString(fd.createReadStream());
  const toText = text.replace(/SLOT_NUM[^,]+,/, `SLOT_NUM: ${slotNum},`);
  await fd.close();
  const fdw = await open(jsFile, "w"); // Abort the request before the promise settles.
  const writeStream = await fdw.createWriteStream();
  await writeStream.write(toText);
  await fdw.close();
})();
