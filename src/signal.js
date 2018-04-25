import { encode } from 'bs58';
import { verbose, netPrefix } from './params';

const log = text => {if (verbose) console.log(text)};

/**
 * connect to leofcoin-peernet -> peernet sends peers -> peernet send new connected peer to already connected peers
 */
/**
 * @param {string} network the network to listen on 'default: olivia'
 * @param {method} pubsub
 * @param {method} pubsub.publish pubsub publisher
 */
export default (address, pubsub) => {
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
    publish(encode(Buffer.from(`${netPrefix}peernet-peers`)), Buffer.from(JSON.stringify(Array.from(peerset.entries()))));
    // add the peer to peerset
  	peerset.set(from, data.toString());
    // notice the other peers that a new peer has connected
    publish(encode(Buffer.from(`${netPrefix}peernet-peer-connect`)), data);
  };

  /**
   * removes peer from peerset
   */
  const peerdisconnect = ({ from }) => {
    log(`Peer: ${from} disconnected`);
    peerset.delete(from);
  }
	subscribe(encode(Buffer.from(`${netPrefix}peernet`)), peernet);
  subscribe(encode(Buffer.from(`${netPrefix}peernet-peer-disconnect`)), peerdisconnect);
};
