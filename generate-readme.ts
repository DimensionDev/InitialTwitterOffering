import path from "path";
import fs from "fs/promises";
import { format } from "prettier";
import { getAllBrowserPath } from "./SmartContractProjectConfig/chains";
import { parse } from "csv-parse/sync";

const README_PATH = path.resolve(__dirname, "README.md");
const ADDRESS_TABLE_PATH = path.resolve(__dirname, "contract-addresses.csv");
let contractAddressPath: Record<string, string>;
let contractBlockPath: Record<string, string>;
type DeployedAddressRow = {
  Chain: string;
  HappyTokenPool: string;
  Qualification: string;
  v1Block: string;
  v2Block: string;
};

async function main() {
  let content = await fs.readFile(README_PATH, "utf-8");
  contractAddressPath = await getAllBrowserPath("address");
  contractBlockPath = await getAllBrowserPath("block");
  const rows: DeployedAddressRow[] = await loadDeployedAddressRows();
  content = replace(content, "address", Array.from(makeAddressTable(rows)).filter(Boolean).join("\n"));
  content = replace(content, "block", Array.from(makeBlockTable(rows)).filter(Boolean).join("\n"));
  const formatted = format(content, {
    parser: "markdown",
    printWidth: 160,
  });
  await fs.writeFile(README_PATH, formatted, "utf-8");
}

main();

function* makeAddressTable(rows: DeployedAddressRow[]) {
  yield "| Chain | ITO | Dummy Qualification |";
  yield "| - | - | - |";
  for (const { Chain, HappyTokenPool, Qualification } of rows) {
    const itoElement = formElement(HappyTokenPool, `ito-${Chain}`);
    const qlfElement = formElement(Qualification, `qlf-${Chain}`);
    yield `| ${Chain} | ${itoElement} | ${qlfElement} |`;
  }
  yield "";
  yield* rows.map(({ Chain, HappyTokenPool }) => formLink(HappyTokenPool, Chain, "ito"));
  yield* rows.map(({ Chain, Qualification }) => formLink(Qualification, Chain, "qlf"));
}

function* makeBlockTable(rows: DeployedAddressRow[]) {
  yield "| Chain | v1.0 | v2.0 |";
  yield "| - | - | - |";
  for (const { Chain, v1Block, v2Block } of rows) {
    const v1Element = formElement(v1Block, `v1-${Chain}`);
    const v2Element = formElement(v2Block, `v2-${Chain}`);
    yield `| ${Chain} | ${v1Element} | ${v2Element} |`;
  }
  yield "";
  for (const { Chain, v1Block, v2Block } of rows) {
    yield formLink(v1Block, Chain, "v1");
    yield formLink(v2Block, Chain, "v2");
  }
}

async function loadDeployedAddressRows(): Promise<DeployedAddressRow[]> {
  const data = await fs.readFile(ADDRESS_TABLE_PATH, "utf-8");
  const columns = ["Chain", "HappyTokenPool", "Qualification", "v1Block", "v2Block"];
  return parse(data, { delimiter: ",", columns, from: 2 });
}

function formElement(address: string, linkTag: string) {
  if (address == "") {
    return "";
  }
  return `[\`${address.slice(0, 10)}\`][${linkTag}]`;
}

function formLink(param: string, chain: string, contract: string) {
  if (param == "") {
    return null;
  }
  let baseUrl: string;
  if (param.startsWith("0x")) {
    baseUrl = contractAddressPath[chain];
  } else {
    baseUrl = contractBlockPath[chain];
  }
  const browserPath = `${baseUrl}${param}`;
  return `[${contract}-${chain}]:${browserPath}`;
}

function replace(content: string, name: string, replace: string) {
  const pattern = new RegExp(`(<!-- begin ${name} -->)(.+)(<!-- end ${name} -->)`, "gs");
  return content.replace(pattern, `$1\n${replace}\n$3`);
}
