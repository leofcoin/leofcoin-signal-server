'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var bs58 = require('bs58');
var leofcoinHash = require('leofcoin-hash');
var path = require('path');
var REPO = require('ipfs-repo');
var IPFSFactory = require('ipfsd-ctl');
var fs = require('crypto-io-fs');
var fs$1 = require('fs');
var repoConfigs = require('repo-configs');
var chalk = _interopDefault(require('chalk'));
var express = _interopDefault(require('express'));
var ip = require('ip');

function __async(g){return new Promise(function(s,j){function c(a,x){try{var r=g[x?"throw":"next"](a);}catch(e){j(e);return}r.done?s(r.value):Promise.resolve(r.value).then(c,d);}function d(e){c(e,1);}c();})}

const argv = process.argv;

const network = (() => {
  const index = argv.indexOf('--network');
  return process.env.NETWORK || (index > -1) ? argv[index + 1] : 'leofcoin';
})();
console.log(network);
const verbose = Boolean([
  argv.indexOf('-v'),
  argv.indexOf('--verbose'),
  process.env.VERBOSE ? 1 : -1
].reduce((p, c) => {
  if (c > p) return c;
  return Number(p)
}, -1) >= 0);

const netHash = net => bs58.encode(leofcoinHash.keccak(Buffer.from(`${net}-`), 256)).slice(0, 24);

const mainNethash = netHash('leofcoin');

/**
 * returns the hash for a subnet, prefixed with mainNethash
 */
const subnetHash = net => {
  const prefix = mainNethash.slice(0, 4);
  const hash = netHash(net);
  return `${prefix}${hash.slice(4, hash.length)}`
};
const testNethash = subnetHash('olivia');

const netPrefix = (net => net === 'leofcoin' ? mainNethash : testNethash)();

const networkPath = path.join(process.cwd(), network === 'olivia' ? '.leofcoin/olivia' : '.leofcoin');

const port = process.env.PORT || 8080;

const log = text => {if (verbose) console.log(text);};

/**
 * connect to leofcoin-peernet -> peernet sends peers -> peernet send new connected peer to already connected peers
 */
/**
 * @param {string} network the network to listen on 'default: olivia'
 * @param {method} pubsub
 * @param {method} pubsub.publish pubsub publisher
 */
var star = (address, pubsub) => {
  if (!pubsub && !global.ipfs) throw Error('pubsub client not found');
  else if (!pubsub && global.ipfs) pubsub = global.ipfs.pubsub;
  const {subscribe, publish} = pubsub;
  const peerset = new Map();

  /**
   * A new peer has connected, send current connected peers & notify the new peer to current ones.
   */
  const peernet = ({ from, data }) => {
    log(`Peer: ${from} connected`);
    // send current peerset to the connected peer
    publish(bs58.encode(Buffer.from(`${netPrefix}peernet-peers`)), Buffer.from(JSON.stringify(Array.from(peerset.entries()))));
    // add the peer to peerset
  	peerset.set(from, data.toString());
    // notice the other peers that a new peer has connected
    publish(bs58.encode(Buffer.from(`${netPrefix}peernet-peer-connect`)), data);
  };

  /**
   * removes peer from peerset
   */
  const peerdisconnect = ({ from }) => {
    log(`Peer: ${from} disconnected`);
    peerset.delete(from);
  };
	subscribe(bs58.encode(Buffer.from(`${netPrefix}peernet`)), peernet);
  subscribe(bs58.encode(Buffer.from(`${netPrefix}peernet-peer-disconnect`)), peerdisconnect);
};

const { exists, write } = fs;
const ipfsRepo = new REPO(networkPath);
const factory = IPFSFactory.create({type: 'go'});

if (process.platform === 'win32') {
  const readLine = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readLine.on('SIGINT', () => {
    process.emit('SIGINT');
  });
}
const initRepo = () => new Promise((resolve, reject) => __async(function*(){
  const { repo, spec } = yield repoConfigs.config({
    bootstrapFor: 'earth',
    sharding: true
  });
  repo.Addresses.Swarm = [
    '/ip4/0.0.0.0/tcp/4002',
    '/ip6/::/tcp/4002'
  ];
  repo.Addresses.Gateway = '/ip4/127.0.0.1/tcp/9090';
  const dataSpecPath = path.join(networkPath, 'datastore_spec');
  ipfsRepo.init(repo, error => __async(function*(){
    if (error) reject(error);
    yield write(dataSpecPath, JSON.stringify(spec));
    resolve();
  }()));
}()));

const prepareRepo = () => new Promise((resolve, reject) => {
  ipfsRepo.exists((error, exists) => __async(function*(){
    if (error) reject(error);
    else if (exists) resolve();
    else yield initRepo();
    resolve();
  }()));
});

const cleanRepo = () => new Promise((resolve, reject) => __async(function*(){
  console.log(`cleaning repo`);
  try {
    const arr = [
      path.join(networkPath, 'api'),
      path.join(networkPath, 'repo.lock')
    ];
    let count = 0;
    for (const path$$1 of arr) {
      count++;
      const fileExists = yield exists(path$$1);
      if (fileExists) fs$1.unlinkSync(path$$1);
      if (count === arr.length) {        
        resolve();
      }
    }
  } catch (error) {
    reject(error);
  }
}()));

const spawn = options => new Promise((resolve, reject) => {
  factory.spawn(options, (error, ipfsd) => {
    if (error) reject(error);
    resolve(ipfsd);    
  });
});

const start = (ipfsd, flags) => new Promise((resolve, reject) => __async(function*(){
  ipfsd.start(flags, error => {
    if (error) reject(error);
    ipfsd.api.id().then(({addresses}) => {
      console.group(chalk.green('ipfs daemon started and listening on'));
      addresses.forEach(address => console.log(chalk.cyan(address)));
      console.groupEnd();
      star(addresses[0], ipfsd.api.pubsub);
    }).catch(error => reject(error));
    resolve();
  });
}()));

const IPFSNode = (flags = ['--enable-pubsub-experiment']) => new Promise((resolve, reject) => __async(function*(){
  const ipfstStartTime = Date.now();
  try {
    yield prepareRepo();
    const ipfsd = yield spawn({init: false, repoPath: networkPath, disposable: false});
    yield start(ipfsd, flags);
    process.on('SIGINT', () => __async(function*(){
      yield ipfsd.stop();
      setTimeout(() => __async(function*(){
        yield cleanRepo();
        process.exit();
      }()), 100);
    }()));
    console.log(`Daemon startup time: ${(Date.now() - ipfstStartTime) / 1000}s`);
    resolve(ipfsd);
      
  } catch (error) {
    console.log(error);
    if (error.message.includes('cannot acquire lock')) {      
      yield cleanRepo();
    }
    return IPFSNode();
    // errorHandler(error);
  }
}()));

const api = express();
const store = {};

if (process.argv.indexOf('--no-front') === -1) {
  api.get('/', (req, res) => __async(function*(){
    const netAddressHex = `${Buffer.from(network).toString('hex')}`;
    const relaynethash = leofcoinHash.keccak(netAddressHex, 256).toString('hex');
    const template = `
      <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
        <h1>Leofcoin relay node</h1>
        <p>This node is meant for nodes with restricted network access</p>
        <br>      
        <p><strong>network: </strong>${network}</p>
        <p><strong>peerID: </strong>${store.id}</p>
        <p><strong>relaynethash: </strong> ${bs58.encode(relaynethash)}</p>
        <br>
        <p>Connect to '${store.address}' to join the network
      </div>
    `;
    const timeoutUntilAddress = () => {
      if (store.address) res.status(200).send(`
        <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
          <h1>Leofcoin relay node</h1>
          <p>This node is meant for nodes with restricted network access</p>
          <br>      
          <p><strong>network: </strong>${network}</p>
          <p><strong>peerID: </strong>${store.id}</p>
          <p><strong>relaynethash: </strong> ${bs58.encode(relaynethash)}</p>
          <br>
          <p>Connect to '${store.address}' to join the network
        </div>
      `);
      else setTimeout(() => {
        timeoutUntilAddress();
      }, 500);
    };
    timeoutUntilAddress();      
  }()));
  
  api.listen(port, () => console.log(`Server ready @ http://localhost:${port}!`));
}

(() => __async(function*(){
  const ipfsd = yield IPFSNode();
  const { id } = yield ipfsd.api.id();
  store.id = id;
  store.address = `/ip4/${ip.address()}/tcp/4001/ipfs/${id}`;
}()))();
