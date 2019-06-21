import ipfsdNode from 'ipfsd-node';
import express from 'express';
import dapnets from '@leofcoin/dapnets';
import { encode } from 'bs58';
import { address } from 'ip';
import { networkPath, network, port, netPrefix } from './params';
import SignalRoom from './room.js';

const api = express()
const store = {
  ip: address()
};



(async () => {  
  const net = await dapnets('leofcoin');
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
  const { ipfs } = await ipfsd.start();
  new SignalRoom(ipfs, `${net.netPrefix}-signal`);
  const { id } = await ipfs.id();
  store.id = id;
  
  if (process.argv.indexOf('--no-front') === -1) {
    api.get('/', async (req, res) => {
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
    });
  
    api.listen(port, () => console.log(`Server ready @ http://localhost:${port}!`));
  }
})();
