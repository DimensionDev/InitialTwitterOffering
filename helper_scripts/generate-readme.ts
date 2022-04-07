import path from "path";
import fs from "fs/promises";
import { format } from "prettier";
import { ChainId, BlockExplorer, DeployedAddressRow } from "./types";
import { parse } from "csv-parse/sync";

const README_PATH = path.resolve(__dirname, "..", "README.md");
const ADDRESS_TABLE_PATH = path.resolve(__dirname, "contract-addresses.csv");

async function main() {
  let content = await fs.readFile(README_PATH, "utf-8");
  const rows: DeployedAddressRow[] = await loadDeployedAddressRows();
  content = replace(
    content,
    "address",
    Array.from(makeAddressTable(rows)).filter(Boolean).join("\n")
  );
  content = replace(
    content,
    "block",
    Array.from(makeBlockTable(rows)).filter(Boolean).join("\n")
  );
  const formatted = format(content, {
    parser: "markdown",
    printWidth: 160,
  });
  await fs.writeFile(README_PATH, formatted, "utf-8");
}

main();

function* makeAddressTable(rows: DeployedAddressRow[]) {
  yield "| Chain | ITO | Qualification |";
  yield "| - | - | - |";
  for (const { Chain, HappyTokenPool, Qualification } of rows) {
    const itoElement = formElement(HappyTokenPool, `ito-${Chain}`);
    const qlfElement = formElement(Qualification, `qlf-${Chain}`);
    yield `| ${Chain} | ${itoElement} | ${qlfElement} |`;
  }
  yield "";
  yield* rows.map(({ Chain, HappyTokenPool }) => formLink(HappyTokenPool, Chain, "ito"))
  yield* rows.map(({ Chain, Qualification }) => formLink(Qualification, Chain, "qlf"))
}

function* makeBlockTable(rows: DeployedAddressRow[]) {
  yield "| Chain | v1.0 | v1.01 |";
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
  const columns = ['Chain', 'HappyTokenPool', 'Qualification', 'v1Block', 'v2Block'];
  return parse(data, { delimiter: ',', columns, from: 2 });
}

function formElement(param: string, linkTag: string) {
  if (param == '') return '';
  if (!param.includes("0x")) return `[${param}][${linkTag}]`;
  return `[\`${param.slice(0, 10)}\`][${linkTag}]`;
}

function formLink(param: string, chain: string, tag: string) {
  if (param == '') return null;
  let browserPath;
  const requiredChainId = getEnumAsMap(ChainId).get(chain);
  if (param.includes("0x")) {
    browserPath = BlockExplorer[requiredChainId as ChainId](param, "address");
  } else {
    browserPath = BlockExplorer[requiredChainId as ChainId](param, "block");
  }
  return `[${tag}-${chain}]: ${browserPath}`;
}

function replace(content: string, name: string, replace: string) {
  const pattern = new RegExp(
    `(<!-- begin ${name} -->)(.+)(<!-- end ${name} -->)`,
    "gs"
  );
  return content.replace(pattern, `$1\n${replace}\n$3`);
}

function getEnumAsMap<T extends object>(enumObject: T) {
  const pairs = new Map<string, T[keyof T]>();
  for (const key of Object.keys(enumObject)) {
    if (Number.isNaN(Number.parseInt(key))) {
      pairs.set(key, enumObject[key as keyof T]);
    }
  }
  return pairs;
}

