'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var bs58 = require('bs58');
var REPO = require('ipfs-repo');
var IPFSFactory = require('ipfsd-ctl');
var fs = require('crypto-io-fs');
var fs$1 = require('fs');
var path = require('path');
var repoConfigs = require('repo-configs');
var chalk = _interopDefault(require('chalk'));
var express = _interopDefault(require('express'));
var leofcoinHash = require('leofcoin-hash');
var ip = require('ip');

function __async(g){return new Promise(function(s,j){function c(a,x){try{var r=g[x?"throw":"next"](a);}catch(e){j(e);return}r.done?s(r.value):Promise.resolve(r.value).then(c,d);}function d(e){c(e,1);}c();})}

/**
 * connect to leofcoin-peernet -> peernet sends peers -> peernet send new connected peer to already connected peers
 */
/**
 * @param {method} options.subscribe pubsub subscriber
 * @param {method} options.publish pubsub publisher
 */
var star = (address, pubsub) => {
  if (!pubsub && !global.ipfs) throw Error('pubsub client not found');
  else if (!pubsub && global.ipfs) pubsub = global.ipfs.pubsub;
  const {subscribe, publish} = pubsub;
  const prefix = process.env.network === 'leofcoin' ? 'leofcoin-' : 'leofcoin-olivia-';
  const peerset = new Map();

  const peernet = message => {
    // send current peerset to the connected peer
    publish(bs58.encode(Buffer.from(`${prefix}peernet-peers`)), Buffer.from(JSON.stringify(Array.from(peerset.entries()))));
    // add the peer to peerset
  	peerset.set(message.from, message.data.toString());
    // notice the other peers that a new peer has connected
    publish(bs58.encode(Buffer.from(`${prefix}peernet-peer-connect`)), message.data);
  };

  /**
   * removes peer from peerset
   */
  const peerdisconnect = message => {
    peerset.delete(message.from);
  };
	subscribe(bs58.encode(Buffer.from(`${prefix}peernet`)), peernet);
  subscribe(bs58.encode(Buffer.from(`${prefix}peernet-peer-disconnect`)), peerdisconnect);
};

const { exists, write } = fs;
const networkPath = path.join(process.cwd(), process.env.network === 'olivia' ? '.leofcoin/olivia' : '.leofcoin');
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
  const { repo, spec } = yield repoConfigs.config();
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

const start = (ipfsd, flags) => new Promise((resolve, reject) => {
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
});

const IPFSNode = (flags = ['--enable-pubsub-experiment']) => new Promise((resolve, reject) => __async(function*(){
  const ipfstStartTime = Date.now();
  try {
    yield prepareRepo();
    const ipfsd = yield spawn({init: false, repoPath: networkPath, disposable: false});
    yield start(ipfsd, flags);
    process.on('SIGINT', () => __async(function*(){
      yield ipfsd.stop();
      setTimeout(() => __async(function*(){
        process.exit();
      }()), 50);
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


if (process.argv.indexOf('olivia') !== -1) process.env.network = 'olivia';
else process.env.network = 'leofcoin';
process.env.PORT = process.env.PORT || 5555;
if (process.argv.indexOf('--no-front') === -1) {
  api.get('/', (req, res) => __async(function*(){
    const netAddressHex = `${Buffer.from(process.env.network).toString('hex')}`;
    const relaynethash = leofcoinHash.keccak(netAddressHex, 256).toString('hex');
    const template = `
      <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
        <h1>Leofcoin relay node</h1>
        <p>This node is meant for nodes with restricted network access</p>
        <br>      
        <p><strong>network: </strong>${process.env.network}</p>
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
          <p><strong>network: </strong>${process.env.network}</p>
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
  
  api.listen(process.env.PORT, () => console.log(`Server ready @ http://localhost:${process.env.PORT}!`));
}

(() => __async(function*(){
  const ipfsd = yield IPFSNode();
  const { id } = yield ipfsd.api.id();
  store.id = id;
  store.address = `/ip4/${ip.address()}/tcp/4001/ipfs/${id}`;
}()))();
