import { encode } from 'bs58';
/**
 * connect to leofcoin-peernet -> peernet sends peers -> peernet send new connected peer to already connected peers
 */
/**
 * @param {method} options.subscribe pubsub subscriber
 * @param {method} options.publish pubsub publisher
 */
export default (address, pubsub) => {
  if (!pubsub && !global.ipfs) throw Error('pubsub client not found');
  else if (!pubsub && global.ipfs) pubsub = global.ipfs.pubsub;
  const {subscribe, publish} = pubsub;
  const prefix = process.env.network === 'leofcoin' ? 'leofcoin-' : 'leofcoin-olivia-';
  const peerset = new Map();

  const peernet = message => {
    // send current peerset to the connected peer
    publish(encode(Buffer.from(`${prefix}peernet-peers`)), Buffer.from(JSON.stringify(Array.from(peerset.entries()))));
    // add the peer to peerset
  	peerset.set(message.from, message.data.toString());
    // notice the other peers that a new peer has connected
    publish(encode(Buffer.from(`${prefix}peernet-peer-connect`)), message.data);
  };

  /**
   * removes peer from peerset
   */
  const peerdisconnect = message => {
    peerset.delete(message.from);
  }
	subscribe(encode(Buffer.from(`${prefix}peernet`)), peernet);
  subscribe(encode(Buffer.from(`${prefix}peernet-peer-disconnect`)), peerdisconnect);
};
