import { encode } from 'bs58';
import { keccak } from 'leofcoin-hash';
import { join } from 'path';
const argv = process.argv;

export const network = (() => {
  const index = argv.indexOf('--network');
  return process.env.NETWORK || (index > -1) ? argv[index + 1] : 'leofcoin';
})()

export const verbose = Boolean([
  argv.indexOf('-v'),
  argv.indexOf('--verbose'),
  process.env.VERBOSE ? 1 : -1
].reduce((p, c) => {
  if (c > p) return c;
  return Number(p)
}, -1) >= 0);

const netHash = net => encode(keccak(Buffer.from(`${net}-`), 256)).slice(0, 24);

export const mainNethash = netHash('leofcoin');

/**
 * returns the hash for a subnet, prefixed with mainNethash
 */
const subnetHash = net => {
  const prefix = mainNethash.slice(0, 4);
  const hash = netHash(net);
  return `${prefix}${hash.slice(4, hash.length)}`
}
export const testNethash = subnetHash('olivia');

export const netPrefix = (() => network === 'leofcoin' ? mainNethash : testNethash)()

export const networkPath = join(process.cwd(), network === 'olivia' ? '.leofcoin/olivia' : '.leofcoin')

export const port = process.env.PORT || 8080;
