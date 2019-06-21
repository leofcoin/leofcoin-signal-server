'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var bs58 = require('bs58');
var leofcoinHash = require('leofcoin-hash');
var path = require('path');
var Channel = _interopDefault(require('ipfs-pubsub-1on1'));
var PeerMonitor = _interopDefault(require('ipfs-pubsub-peer-monitor'));
var ipfsdNode = _interopDefault(require('ipfsd-node'));
var express = _interopDefault(require('express'));
var dapnets = _interopDefault(require('@leofcoin/dapnets'));
var ip = require('ip');

function __async(g){return new Promise(function(s,j){function c(a,x){try{var r=g[x?"throw":"next"](a);}catch(e){j(e);return}r.done?s(r.value):Promise.resolve(r.value).then(c,d);}function d(e){c(e,1);}c();})}

const argv = process.argv;

const network = (() => {
  const index = argv.indexOf('--network');
  return process.env.NETWORK || (index > -1) ? argv[index + 1] : 'leofcoin';
})();

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

const networkPath = path.join(process.cwd(), network === 'olivia' ? '.leofcoin/olivia' : '.leofcoin');

const port = process.env.PORT || process.argv[process.argv.indexOf('--port') + 1] || 8080;

class SpaceRoom extends PeerMonitor {
  /**
   * @param {object} ipfs - ipfs api
   * @param {array} space - ['directory', 'multihash', 'label']
   * @param {string} id - optional
   */
  constructor(ipfs, topic) {
    super(ipfs.pubsub, topic);
    this.ipfs = ipfs;

    this.topic = topic;
    this.peers = [];    
    
    ipfs.pubsub.subscribe(topic, (message) => {
      message.data = message.data.toString();
      console.log(message);
      super.emit('message', message);
    }, (err, res) => {});
    
    this._peerJoined = this._peerJoined.bind(this);
    this._peerLeft = this._peerLeft.bind(this);
    this._subscribed = this._subscribed.bind(this);
    
    this._init();
    
    // this.ipfs.id().then(({ id }) => {
    // this.broadcast(JSON.stringify({type: 'joining', from: id}))  
    // })
    
  }
  
  _init() {return __async(function*(){  
    const { id } = yield this.ipfs.id();
    this.id = id;
    
    this.on('join', this._peerJoined);
    this.on('leave', this._peerLeft);
    this.on('error', error => console.error(error));
    this.on('subscribed', this._subscribed);
  }.call(this))}


  broadcast(data) {return __async(function*(){
    yield this.ipfs.pubsub.publish(this.topic, Buffer.from(data));
  }.call(this))}

  _subscribed() {
    this.subscribed = true;
  }

  _peerJoined(peer) {
    console.log(peer);
    this.whisper(peer, {type: 'connect', data: this.peers});
    if (this.peers.indexOf(peer) === -1) this.peers.push(peer);
    
    // this.whisper(peer)
  }

  _peerLeft(peer) {
    this.peers.splice(this.peers.indexOf(peer), 1);
  }

  whisper(peerID, event) {return __async(function*(){
    const channel = yield Channel.open(this.ipfs, peerID);
    yield channel.connect();
    channel.on('message', (message) => __async(function*(){
      if (message.from !== this.id) {
        if (message.type === 'join') {
          const index = message.data.indexOf(this.id);
          if (index !== -1) message.data.splice(index, 1);
          this.ipfs.swarm.connect(message.data);
          channel.close();
        } else {
          yield this.whisper(message.from, { type: 'join', from: this.id, data: this.peers});
          channel.close();
        }
      }
    }.call(this)));
    event.from = peerID;
    return channel.emit('message', event)
  }.call(this))}
}

const api = express();
const store = {
  ip: ip.address()
};



(() => __async(function*(){  
  const net = yield dapnets('leofcoin');
  const ipfsd = yield ipfsdNode({
    bootstrap: 'earth',
    network,
    sharding: true,
    relayHop: true,
    flags: ['--enable-namesys-pubsub', '--enable-pubsub-experiment'],
    repoPath: networkPath,
    cleanup: false,
    ports: {
      swarm: 4002,
      gateway: 9090,
      api: 5002
    },
    ws: true
  });
  const { ipfs } = yield ipfsd.start();
  new SpaceRoom(ipfs, `${net.netPrefix}-signal`);
  const { id } = yield ipfs.id();
  store.id = id;
  
  if (process.argv.indexOf('--no-front') === -1) {
    api.get('/', (req, res) => __async(function*(){
      res.status(200).send(`
        <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
          <h1>Leofcoin relay node</h1>
          <p>This node is meant for peer discovery and nodes with restricted network access.</p>
          <br>
          
          <p><strong>network: </strong>${network}</p>
          <p><strong>peerID: </strong>${store.id}</p>
          <p><strong>relaynethash: </strong> ${net.netPrefix}</p>
          <br>
          
          <strong>addresses</strong>
          <p>'/ip4/${store.ip}/tcp/4002/ipfs/${id}'</p>
          <p>'/ip4/${store.ip}/tcp/4005/ws/ipfs/${id}'</p>
        </div>
      `);
    }()));
  
    api.listen(port, () => console.log(`Server ready @ http://localhost:${port}!`));
  }
}()))();
