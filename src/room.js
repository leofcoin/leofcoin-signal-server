import Channel from 'ipfs-pubsub-1on1';
import PeerMonitor from 'ipfs-pubsub-peer-monitor';

export default class SpaceRoom extends PeerMonitor {
  /**
   * @param {object} ipfs - ipfs api
   * @param {array} space - ['directory', 'multihash', 'label']
   * @param {string} id - optional
   */
  constructor(ipfs, topic) {
    super(ipfs.pubsub, topic)
    this.ipfs = ipfs;
    ipfs.pubsub.subscribe(topic, (message) => {
      message.data = message.data.toString();
      super.emit('message', message);
    }, (err, res) => {})

    this.topic = topic;
    this.peer = [];

    this._peerJoined = this._peerJoined.bind(this);
    this._peerLeft = this._peerLeft.bind(this);
    this._subscribed = this._subscribed.bind(this);
    this.on('join', this._peerJoined);
    this.on('leave', this._peerLeft);
    this.on('error', error => console.error(error))
    this.on('subscribed', this._subscribed);
  }

  async broadcast(data) {
    await this.ipfs.pubsub.publish(this.topic, Buffer.from(data))
  }

  _subscribed() {
    this.subscribed = true;
  }

  _peerJoined(peer) {
    console.log(peer);
    if (this.peers.indexOf(peer) === -1) this.peers.push(peer);
    // this.whisper(peer)
  }

  _peerLeft(peer) {
    this.peers.slice(this.peers.indexOf(peer), 1)
  }

  async whisper(peerID) {
    const channel = await Channel.open(ipfs, peerID);
    await channel.connect();
    channel.on('message', (message) => {
      console.log("Message from", message.from, message)
    })

    channel.emit('message', 'hello there')
  }
}
