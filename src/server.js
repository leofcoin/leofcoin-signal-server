import ipfsdNode from 'ipfsd-node';
import express from 'express';
import { keccak } from 'leofcoin-hash';
import { encode } from 'bs58';
import { address } from 'ip';
import { networkPath, network, port, netPrefix } from './params';
import SignalRoom from './room.js';

const api = express()
const store = {};

if (process.argv.indexOf('--no-front') === -1) {
  api.get('/', async (req, res) => {
    const netAddressHex = `${Buffer.from(network).toString('hex')}`
    const relaynethash = keccak(netAddressHex, 256).toString('hex');
    const template = `
      <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
        <h1>Leofcoin relay node</h1>
        <p>This node is meant for nodes with restricted network access</p>
        <br>
        <p><strong>network: </strong>${network}</p>
        <p><strong>peerID: </strong>${store.id}</p>
        <p><strong>relaynethash: </strong> ${encode(relaynethash)}</p>
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
          <p><strong>relaynethash: </strong> ${encode(relaynethash)}</p>
          <br>
          <p>Connect to '${store.address}' to join the network
        </div>
      `);
      else setTimeout(() => {
        timeoutUntilAddress();
      }, 500);
    }
    timeoutUntilAddress()
  });

  api.listen(port, () => console.log(`Server ready @ http://localhost:${port}!`));
}

(async () => {
  const ipfsd = await ipfsdNode({
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
  const { ipfs, addresses } = await ipfsd.start();
  const { id } = await ipfs.id();
  new SignalRoom(ipfs, `${netPrefix}-signal`);
  console.log(id);
  store.id = id;
  store.address = `/ip4/${address()}/tcp/4002/ipfs/${id}`;
})();
